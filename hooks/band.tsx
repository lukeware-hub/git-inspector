import type { ThemeKey } from 'claude-code'

import type { GitStatus, GitView } from '../types'
import { cardRows, gridLine, layoutGrid, middle, tableFits, tableLines, type GridRow, type Part, type Segment, type Ui } from './grid'

const LABEL_WIDTH = 9
const PATH_WIDTH = 70

// Local time as HH:MM.
export function clock(at: number): string {
  return new Date(at).toTimeString().slice(0, 5)
}

export { middle }

const slashes = (path: string) => path.replace(/\\/g, '/')

// The session folder inside the repository, "." at its root; the whole path when it lies outside.
export function relativeFolder(root: string, cwd: string): string {
  const [base, folder] = [slashes(root), slashes(cwd)]
  if (folder.toLowerCase() === base.toLowerCase()) return '.'
  return folder.toLowerCase().startsWith(`${base.toLowerCase()}/`) ? folder.slice(base.length + 1) : folder
}

// The last folder of a path: the repository's name.
export function folderName(path: string): string {
  return slashes(path).replace(/\/+$/, '').split('/').pop() || path
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

// A count that stands out only when it is not zero.
function count(label: string, value: number | undefined, color?: ThemeKey): Segment {
  const text = String(value ?? 0)
  return value ? { label, text, color } : { label, text, dim: true }
}

// Git's own words for how the branch stands against its remote branch.
function syncState(toPull: number, toPush: number): Segment {
  if (toPull && toPush) return { label: 'status', text: 'diverged', color: 'warning', bold: true }
  if (toPull) return { label: 'status', text: 'behind', color: 'warning' }
  if (toPush) return { label: 'status', text: 'ahead' }
  return { label: 'status', text: 'up to date', color: 'success' }
}

function syncRow(status: GitStatus): GridRow {
  if (!status.upstream) return { label: 'Sync', cells: [], span: { text: 'no remote branch, nothing to pull or push', dim: true } }
  const toPull = status.toPull ?? 0
  const toPush = status.toPush ?? 0
  return { label: 'Sync', cells: [count('to pull', toPull, 'warning'), count('to push', toPush, 'warning'), syncState(toPull, toPush)] }
}

// The repository's name, then its path cut in the middle, then the session folder when the session is not at the root.
function repoRow(status: GitStatus): GridRow {
  const root = status.root ?? status.cwd
  const folder = relativeFolder(root, status.cwd)
  const more: Part[] = [{ text: '   ' }, { text: middle(slashes(root), PATH_WIDTH), dim: true }]
  if (folder !== '.') more.push({ text: `, session in ${folder}`, dim: true })
  return { label: 'Repo', cells: [], span: { text: folderName(root), bold: true, more } }
}

// The commit HEAD points at: its short hash, then its subject.
function commitRow(status: GitStatus): GridRow {
  const last = status.lastCommit
  if (!last) return { label: 'Commit', cells: [], span: { text: 'no commits yet', dim: true } }
  return { label: 'Commit', cells: [], span: { text: 'last:', dim: true, more: [{ text: ` ${last.hash}`, bold: true }, { text: ` "${last.subject}"` }] } }
}

// How big the tracked changes since the last commit are, like Session Inspector's "lines": files, then lines added
// in green and removed in red.
function diffRow(status: GitStatus): GridRow {
  const diff = status.diff
  if (!diff?.files) return { label: 'Diff', cells: [{ label: 'files', text: '0', dim: true }, { label: 'lines', text: '—', dim: true }] }
  return {
    label: 'Diff',
    cells: [
      { label: 'files', text: String(diff.files) },
      { label: 'lines', text: `+${diff.added}`, color: 'diffAdded', more: [{ text: ` −${diff.removed}`, color: 'diffRemoved' }] },
    ],
  }
}

// Rows that leave first, in this order, when the band is too short for every row.
const DROP_FIRST = ['Commit', 'Diff']

// Keeps at most `limit` rows: the rows in DROP_FIRST leave before the rest, then rows leave from the bottom.
export function fitRows(rows: readonly GridRow[], limit: number): GridRow[] {
  let kept = [...rows]
  for (const label of DROP_FIRST) if (kept.length > limit) kept = kept.filter(row => row.label !== label)
  return kept.slice(0, Math.max(1, limit))
}

// What to do next, in plain words: pull first, then commit, then push.
export function nextStep(status: GitStatus): Segment {
  const files = status.staged + status.unstaged + status.untracked
  const toPull = status.upstream ? (status.toPull ?? 0) : 0
  const toPush = status.upstream ? (status.toPush ?? 0) : 0
  const steps: string[] = []
  if (toPull) steps.push(`pull ${plural(toPull, 'commit')}`)
  if (files) steps.push(`commit ${plural(files, 'file')}`)
  if (toPush) steps.push(files ? 'push' : `push ${plural(toPush, 'commit')}`)
  if (!steps.length) {
    return status.upstream ? { text: 'nothing to do, all in sync', color: 'success' } : { text: 'nothing to commit, the branch has no remote', dim: true }
  }
  const text = steps.length === 1 ? steps[0]! : `${steps.slice(0, -1).join(', ')}, then ${steps.at(-1)}`
  return { text, color: toPull ? 'warning' : undefined }
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
  if (!status.hasGit) {
    const more: Part[] = [{ text: '   ' }, { text: '.git ', dim: true }, { text: 'not found', color: 'warning', bold: true }]
    return [{ label: 'Folder', cells: [], span: { text: middle(slashes(status.cwd), PATH_WIDTH), more } }]
  }
  return [
    repoRow(status),
    syncRow(status),
    commitRow(status),
    diffRow(status),
    { label: 'Changes', cells: [count('staged', status.staged), count('modified', status.unstaged), count('new files', status.untracked)] },
    { label: 'Next', cells: [], span: nextStep(status) },
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

// The band above the prompt, drawn like Session Inspector's: cards on the desktop; on the terminal one bordered table
// when the band has the height for it, the one-line grid otherwise. Title on the left, branch and fetch state on the right.
export function gitBand(ui: Ui, view: GitView, columns: number, maxRows: number, surface: string = 'terminal') {
  const { Box, Text } = ui
  const allRows = bandRows(view)
  const isDesktop = surface === 'desktop'
  // The table may leave out Commit and Diff to fit; it is drawn only when every other row still fits.
  const tableRows = fitRows(allRows, Math.floor((maxRows - 4) / 2))
  const coreRows = allRows.filter(row => !DROP_FIRST.includes(row.label)).length
  const isTable = !isDesktop && tableFits(maxRows, tableRows.length) && tableRows.length >= coreRows
  const isCards = isDesktop || isTable
  const framed = isTable || isFramed(maxRows)
  const rows = isDesktop ? allRows : isTable ? tableRows : fitRows(allRows, framed ? maxRows - 3 : maxRows)
  const width = columns - (framed ? 4 : 0)
  const lines = isDesktop
    ? cardRows(ui, rows, width, LABEL_WIDTH)
    : (isTable ? tableLines(rows, width, LABEL_WIDTH) : layoutGrid(rows, width, LABEL_WIDTH)).map(parts => gridLine(ui, parts))
  if (!framed) return <Box flexDirection="column">{lines}</Box>

  const { status } = view
  const mark = fetchMark(view)
  const branch = status?.hasGit ? (status.isDetached ? `detached at ${status.branch}` : status.branch) : undefined
  const wrap = isCards ? 'wrap' : undefined
  return (
    <Box flexDirection="column" borderStyle="round" borderDimColor paddingX={1} gap={0}>
      <Box flexDirection="row" justifyContent="space-between" flexWrap={wrap}>
        <Text bold color="claude">
          Git Inspector
        </Text>
        <Box flexDirection="row" columnGap={3} flexWrap={wrap}>
          {branch && (
            <Text bold color={status?.isDetached ? 'warning' : undefined}>
              {branch}
            </Text>
          )}
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
