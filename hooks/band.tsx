import type { ThemeKey } from 'claude-code'

import type { GitStatus, GitView } from '../types'
import { gridLine, layoutGrid, type GridRow, type Part, type Segment, type Ui } from './grid'

const LABEL_WIDTH = 9
const PATH_WIDTH = 70

// Local time as HH:MM.
export function clock(at: number): string {
  return new Date(at).toTimeString().slice(0, 5)
}

// Long text keeps both ends: "C:/Users/…/workspace/app".
export function middle(text: string, max: number): string {
  if (text.length <= max) return text
  const head = Math.ceil((max - 1) / 2)
  return `${text.slice(0, head)}…${text.slice(text.length - (max - 1 - head))}`
}

const slashes = (path: string) => path.replace(/\\/g, '/')

// The session folder inside the repository, "." at its root; the whole path when it lies outside.
export function relativeFolder(root: string, cwd: string): string {
  const [base, folder] = [slashes(root), slashes(cwd)]
  if (folder.toLowerCase() === base.toLowerCase()) return '.'
  return folder.toLowerCase().startsWith(`${base.toLowerCase()}/`) ? folder.slice(base.length + 1) : folder
}

// A count that stands out only when it is not zero.
function count(label: string, value: number | undefined, color?: ThemeKey): Segment {
  const text = String(value ?? 0)
  return value ? { label, text, color } : { label, text, dim: true }
}

// Git's own words for how the branch stands against its remote branch.
function syncState(toPull: number, toPush: number): Segment {
  if (toPull && toPush) return { label: 'state', text: 'diverged', color: 'warning', bold: true }
  if (toPull) return { label: 'state', text: 'behind', color: 'warning' }
  if (toPush) return { label: 'state', text: 'ahead' }
  return { label: 'state', text: 'up to date', color: 'success' }
}

function syncRow(status: GitStatus): GridRow {
  if (!status.upstream) return { label: 'Sync', cells: [], span: { text: 'no remote branch, nothing to pull or push', dim: true } }
  const toPull = status.toPull ?? 0
  const toPush = status.toPush ?? 0
  return { label: 'Sync', cells: [count('pull', toPull, 'warning'), count('push', toPush, 'warning'), syncState(toPull, toPush)] }
}

// The ".git found" or ".git not found" mark after the folder.
function gitMark(hasGit: boolean): Part[] {
  return [{ text: '   ' }, { text: '.git ', dim: true }, hasGit ? { text: 'found', dim: true } : { text: 'not found', color: 'warning', bold: true }]
}

// The repository root, then the session folder inside it when the session is not at the root.
function repoRow(status: GitStatus): GridRow {
  const root = status.root ?? status.cwd
  const folder = relativeFolder(root, status.cwd)
  const text = folder === '.' ? slashes(root) : `${slashes(root)}, session in ${folder}`
  return { label: 'Repo', cells: [], span: { text: middle(text, PATH_WIDTH), more: gitMark(true) } }
}

// A failure gets a red row of its own, across the whole width.
function failureRow(view: GitView, status: GitStatus): GridRow | undefined {
  if (view.error) return { label: 'Error', cells: [], span: { text: view.error, color: 'error' } }
  if (status.fetch === 'failed') return { label: 'Fetch', cells: [], span: { text: 'failed, the pull count is from the last fetch', color: 'error' } }
  return undefined
}

// The rows under the title: short figures in aligned columns, messages across the row.
export function bandRows(view: GitView): GridRow[] {
  const { status } = view
  if (!status) {
    if (view.error) return [{ label: 'Error', cells: [], span: { text: `could not read the repository: ${view.error}`, color: 'error' } }]
    return [{ label: 'Repo', cells: [], span: { text: 'reading the repository', dim: true } }]
  }
  if (!status.hasGit) return [{ label: 'Folder', cells: [], span: { text: middle(slashes(status.cwd), PATH_WIDTH), more: gitMark(false) } }]
  return [
    repoRow(status),
    syncRow(status),
    { label: 'Changes', cells: [count('staged', status.staged), count('changed', status.unstaged), count('untracked', status.untracked)] },
    failureRow(view, status),
  ].filter((row): row is GridRow => row !== undefined)
}

type Mark = { text: string; color?: ThemeKey }

// The title row's status: how the last fetch went and when, or that a reading runs now.
export function fetchMark(view: GitView): Mark {
  const { status } = view
  if (view.isRefreshing) return { text: '○ reading' }
  if (!status) return { text: view.error ? '● failed' : '○ waiting', color: view.error ? 'error' : undefined }
  if (!status.hasGit) return { text: `○ no repository ${clock(status.checkedAt)}` }
  const at = clock(status.fetchedAt ?? status.checkedAt)
  if (status.fetch === 'done') return { text: `● fetched ${at}`, color: 'success' }
  if (status.fetch === 'failed') return { text: `● fetch failed ${at}`, color: 'error' }
  if (status.fetch === 'no upstream') return { text: `○ local only ${at}` }
  return { text: `○ not fetched yet ${at}` }
}

// The frame and title need five rows of room; below that the rows stay bare.
export function isFramed(maxRows: number): boolean {
  return maxRows >= 5
}

// The band above the prompt: framed like Session Inspector's, title on the left, branch and fetch state on the right.
export function gitBand(ui: Ui, view: GitView, columns: number, maxRows: number) {
  const { Box, Text } = ui
  const framed = isFramed(maxRows)
  const rows = bandRows(view).slice(0, framed ? maxRows - 3 : Math.max(1, maxRows))
  const lines = layoutGrid(rows, columns - (framed ? 4 : 0), LABEL_WIDTH).map(parts => gridLine(ui, parts))
  if (!framed) return <Box flexDirection="column">{lines}</Box>

  const { status } = view
  const mark = fetchMark(view)
  const branch = status?.hasGit ? (status.isDetached ? `detached at ${status.branch}` : status.branch) : undefined
  return (
    <Box flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
      <Box flexDirection="row" justifyContent="space-between">
        <Text bold color="claude">
          Git Inspector
        </Text>
        <Box flexDirection="row" columnGap={3}>
          {branch && <Text color={status?.isDetached ? 'warning' : undefined}>{branch}</Text>}
          {status?.upstream && <Text dimColor>{`remote ${status.upstream}`}</Text>}
          <Text color={mark.color} dimColor={!mark.color}>
            {mark.text}
          </Text>
        </Box>
      </Box>
      {lines}
    </Box>
  )
}
