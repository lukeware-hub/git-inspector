import type { ThemeKey } from 'claude-code'

import type { GitStatus, GitView } from '../types'
import { gridLine, layoutGrid, type GridRow, type Segment, type Ui } from './grid'

const LABEL_WIDTH = 9
const PATH_WIDTH = 70

// Local time as HH:MM:SS.
export function clock(at: number): string {
  return new Date(at).toTimeString().slice(0, 8)
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

// The repository root, then the session folder inside it when the session is not at the root.
function repoRow(status: GitStatus): GridRow {
  const root = status.root ?? status.cwd
  const folder = relativeFolder(root, status.cwd)
  const text = folder === '.' ? slashes(root) : `${slashes(root)}, session in ${folder}`
  return { label: 'Repo', cells: [], span: { text: middle(text, PATH_WIDTH) } }
}

// A failure gets a red row of its own, across the whole width.
function failureRow(view: GitView, status: GitStatus): GridRow | undefined {
  if (view.error) return { label: 'Error', cells: [], span: { text: view.error, color: 'error' } }
  if (status.fetch === 'failed') return { label: 'Fetch', cells: [], span: { text: 'failed, the pull count is from the last fetch', color: 'error' } }
  return undefined
}

// The rows under the title: short figures in aligned columns, messages across the row.
export function paneRows(view: GitView): GridRow[] {
  const { status } = view
  if (!status) {
    if (view.error) return [{ label: 'Error', cells: [], span: { text: `could not read the repository: ${view.error}`, color: 'error' } }]
    return [{ label: 'Repo', cells: [], span: { text: 'reading the repository and fetching from remote', dim: true } }]
  }
  const at: Segment = { label: 'at', text: clock(status.checkedAt) }
  if (!status.hasGit) {
    return [
      { label: 'Folder', cells: [], span: { text: middle(slashes(status.cwd), PATH_WIDTH) } },
      { label: 'Checked', cells: [at, { label: '.git', text: 'not found', color: 'warning', bold: true }] },
    ]
  }
  return [
    repoRow(status),
    syncRow(status),
    { label: 'Changes', cells: [count('staged', status.staged), count('changed', status.unstaged), count('untracked', status.untracked)] },
    failureRow(view, status),
    { label: 'Checked', cells: [at, { label: '.git', text: 'found', dim: true }] },
  ].filter((row): row is GridRow => row !== undefined)
}

type Mark = { text: string; color?: ThemeKey }

// The title row's status: how the last fetch went, or that one runs now.
export function fetchMark(view: GitView): Mark {
  const { status } = view
  if (view.isRefreshing) return { text: '○ fetching' }
  if (!status) return { text: view.error ? '● failed' : '○ waiting', color: view.error ? 'error' : undefined }
  if (!status.hasGit) return { text: '○ no repository' }
  if (status.fetch === 'done') return { text: '● fetched', color: 'success' }
  if (status.fetch === 'failed') return { text: '● fetch failed', color: 'error' }
  return { text: '○ local only' }
}

// The whole pane: a framed band like Session Inspector's, title on the left, branch and fetch state on the right.
export function gitPane(ui: Ui, view: GitView, columns: number) {
  const { Box, Text } = ui
  const { status } = view
  const mark = fetchMark(view)
  const lines = layoutGrid(paneRows(view), columns - 4, LABEL_WIDTH).map(parts => gridLine(ui, parts))
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
