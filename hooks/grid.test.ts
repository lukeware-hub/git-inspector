import { expect, test } from 'claude-code/testing'

import { tableLines, type GridRow } from './grid'

const ROWS: GridRow[] = [
  { label: 'Repo', cells: [], span: { text: 'app', bold: true, more: [{ text: '   ' }, { text: '/work/app', dim: true }] } },
  { label: 'Sync', cells: [{ label: 'to pull', text: '2' }, { label: 'to push', text: '1' }, { label: 'status', text: 'diverged' }] },
  { label: 'Changes', cells: [{ label: 'staged', text: '1' }, { label: 'modified', text: '0' }, { label: 'new files', text: '1', optional: true }] },
  { label: 'Next', cells: [], span: { text: 'pull 2 commits, commit 2 files, then push' } },
]

const text = (line: { text: string }[]) => line.map(part => part.text).join('')

test('the table fills the width exactly, two lines a row plus its bottom line', () => {
  const lines = tableLines(ROWS, 120, 9)
  expect(lines).toHaveLength(2 * ROWS.length + 1)
  for (const line of lines) expect(text(line)).toHaveLength(120)
})

test('neighbouring cells share one line, and a span row closes the junctions around it', () => {
  const lines = tableLines(ROWS, 120, 9).map(text)
  expect(lines[0]?.trim()).toMatch(/^╭─+╮$/)
  expect(lines[1]).toMatch(/^Repo     │ app   \/work\/app\s+│$/)
  expect(lines[2]?.trim()).toMatch(/^├─+┬.*┤$/)
  expect(lines[3]).toMatch(/^Sync     │ to pull 2\s+│ to push 1\s+│ status diverged\s+│$/)
  expect(lines[4]?.trim()).toMatch(/^├─+┼.*┤$/)
  expect(lines[6]?.trim()).toMatch(/^├─+┴.*┤$/)
  expect(lines[8]?.trim()).toMatch(/^╰─+╯$/)
})

test('every row puts its column lines at the same place', () => {
  const lines = tableLines(ROWS, 120, 9).map(text)
  const bars = (line: string) => [...line].flatMap((char, index) => ('│┼┬┴'.includes(char) ? [index] : []))
  expect(bars(lines[3] ?? '')).toEqual(bars(lines[5] ?? ''))
  expect(bars(lines[2] ?? '').slice(0, 2)).toEqual(bars(lines[3] ?? '').slice(1, 3))
})

test('a long path after the span text is cut in the middle, not dropped', () => {
  const path = 'C:/Users/Administrator/workspace/mods-claude/git-inspector'
  const rows: GridRow[] = [{ label: 'Repo', cells: [], span: { text: 'git-inspector', bold: true, more: [{ text: '   ' }, { text: path, dim: true }] } }]
  const line = text(tableLines(rows, 76, 9)[1] ?? [])
  expect(line).toHaveLength(76)
  expect(line).toMatch(/git-inspector {3}C:\/Users.*….*git-inspector/)
})

test('a narrow band drops optional figures and cuts a long span without passing the edge', () => {
  const narrow = tableLines(ROWS, 50, 9).map(text)
  expect(narrow.join('\n')).not.toContain('new files')
  for (const line of narrow) expect(line.length).toBeLessThanOrEqual(50)
  expect(narrow[7]).toContain('…')
})
