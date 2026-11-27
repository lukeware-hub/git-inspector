import type { On } from 'claude-code'
import { expect, mock, test, type TestBody } from 'claude-code/testing'

import { PLUGIN, TOOL, orderRows } from './register'

type Engine = Parameters<TestBody>[0]

const ROOT = '/work/app'
const CWD = '/work/app/web'

const BAND = {
  plugin: PLUGIN,
  component: 'AbovePrompt',
  props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 8, bodyColumns: 120, scroll: { offset: 0, bodyRows: 6 }, view: {} },
} as const

const BEFORE_FETCH = '# branch.oid abc\n# branch.head main\n# branch.upstream origin/main\n# branch.ab +1 -0\n1 M. N... a b c d e f.ts\n? new.md\n'
const AFTER_FETCH = BEFORE_FETCH.replace('-0', '-2')

type Host = { isRepo: boolean; isFetchFailing?: boolean; status?: string; diff?: string; log?: string }

const LOCAL_READS = ['git rev-parse', 'git diff', 'git log', 'git status']

const complete = (turnId: string) => ({ answer: '', durationMs: 1000, isAborted: false, turnId, reason: 'answer' as const })

// Stands for the engine: the session folder, its repository and the git commands' answers.
function stubEngine(on: On, host: Host) {
  const clock = mock.clock(on, { now: Date.UTC(2026, 10, 19, 17, 2, 11) })
  const ran: string[] = []
  let hasFetched = false
  on('session.cwd', () => ({ value: CWD }))
  on('session.repo', () => ({ value: host.isRepo ? { root: ROOT, remote: null, internal: false, name: 'app' } : null }))
  on('process.run', (_, e) => {
    const command = e.argv.slice(0, 2).join(' ')
    ran.push(command)
    if (command === 'git fetch') hasFetched = !host.isFetchFailing
    const stdout: Record<string, string | undefined> = {
      'git rev-parse': `${ROOT}/.git\n`,
      'git diff': host.diff ?? ' 3 files changed, 12 insertions(+), 4 deletions(-)\n',
      'git log': host.log ?? '3fa92b1\0fix bug #21\n',
      'git status': host.status ?? (hasFetched ? AFTER_FETCH : BEFORE_FETCH),
      'git fetch': host.isFetchFailing ? undefined : '',
    }
    const out = stdout[command]
    return { value: { exitCode: out === undefined ? 128 : 0, stdout: out ?? '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('tool.register', (_, e) => ({ value: { tool: `mcp__git-inspector__${e.name}` } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  return { ran, clock }
}

async function bandLines($: Engine, surface: 'terminal' | 'desktop' = 'terminal', props: { bodyColumns?: number; maxRows?: number } = {}) {
  const band = await $.ui.mount({ ...BAND, props: { ...BAND.props, ...props }, surface })
  const lines = (await band.findAll({ type: 'Text' })).map(found => found.text.trim())
  await band.unmount()
  return lines
}

// Background readings settle over a few event-loop turns; waits until the band shows no reading in progress.
async function settled($: Engine): Promise<string[]> {
  let lines: string[] = []
  for (let tries = 0; tries < 30; tries++) {
    lines = await bandLines($)
    if (!lines.some(line => line === '○ reading' || line === '○ waiting')) return lines
  }
  return lines
}

async function start($: Engine) {
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  return settled($)
}

// The value painted right after a dim cell label, such as "pull" then "2".
function cellAfter(lines: string[], label: string) {
  return lines[lines.indexOf(label) + 1]
}

async function runTool($: Engine) {
  const answer = await $.tool.call({ tool: TOOL })
  return JSON.parse(String(answer.result))
}

test('the session start reads and fetches, and the tool answers the same data', async ($, on) => {
  const { ran } = stubEngine(on, { isRepo: true })
  await start($)
  expect(ran).toEqual([...LOCAL_READS, 'git fetch', 'git status'])
  expect(await runTool($)).toMatchObject({
    cwd: CWD,
    hasGit: true,
    root: ROOT,
    gitDir: `${ROOT}/.git`,
    branch: 'main',
    upstream: 'origin/main',
    toPull: 2,
    toPush: 1,
    staged: 1,
    unstaged: 0,
    untracked: 1,
    fetch: 'done',
    diff: { files: 3, added: 12, removed: 4 },
    lastCommit: { hash: '3fa92b1', subject: 'fix bug #21' },
  })
})

test('the band shows the repository, sync, last commit, diff and changes, on every surface', async ($, on) => {
  stubEngine(on, { isRepo: true })
  await start($)
  for (const surface of ['terminal', 'desktop'] as const) {
    const lines = await bandLines($, surface, { maxRows: 16 })
    for (const text of ['Git Inspector', 'main', 'remote origin/main', 'Repo', 'app', ROOT, ', session in web', 'Sync', 'diverged', 'Changes', 'Next']) {
      expect(lines).toContain(text)
    }
    expect(lines).toContain('pull 2 commits, commit 2 files, then push')
    expect(lines).not.toContain('found')
    expect(lines.some(line => /^● fetched \d\d:\d\d$/.test(line))).toBe(true)
    expect(cellAfter(lines, 'to pull')).toBe('2')
    expect(cellAfter(lines, 'to push')).toBe('1')
    expect(cellAfter(lines, 'staged')).toBe('1')
    expect(cellAfter(lines, 'modified')).toBe('0')
    expect(cellAfter(lines, 'new files')).toBe('1')
    for (const text of ['Commit', 'last:', '3fa92b1', '"fix bug #21"', 'Diff', '−4']) expect(lines).toContain(text)
    expect(cellAfter(lines, 'files')).toBe('3')
    expect(cellAfter(lines, 'lines')).toBe('+12')
  }
})

test('after a turn the band reads again, fetching only once five minutes have passed', async ($, on) => {
  const { ran, clock } = stubEngine(on, { isRepo: true })
  await start($)
  ran.length = 0
  await clock.advance(60_000)
  await $.turn.complete(complete('t1'))
  await settled($)
  expect(ran).toEqual(LOCAL_READS)
  expect((await bandLines($)).some(line => /^● fetched/.test(line))).toBe(true)

  ran.length = 0
  await clock.advance(5 * 60_000)
  await $.turn.complete(complete('t2'))
  await settled($)
  expect(ran).toContain('git fetch')
})

test('/git fetches now and refreshes the band', async ($, on) => {
  const { ran } = stubEngine(on, { isRepo: true })
  await start($)
  ran.length = 0
  const answer = await $.command.run({ command: 'git', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })
  expect(answer.text).toBe('Fetching from remote and refreshing the Git band.')
  await settled($)
  expect(ran).toContain('git fetch')
})

test('a failed fetch keeps the last pull count and says so', async ($, on) => {
  stubEngine(on, { isRepo: true, isFetchFailing: true })
  const lines = await start($)
  expect(lines.some(line => /^● fetch failed \d\d:\d\d$/.test(line))).toBe(true)
  expect(lines).toContain('Fetch')
  expect(lines).toContain('failed, the pull count is from the last fetch')
  expect(await runTool($)).toMatchObject({ fetch: 'failed', toPull: 0, toPush: 1 })
})

test('a branch with no remote branch skips the fetch', async ($, on) => {
  const { ran } = stubEngine(on, { isRepo: true, status: '# branch.oid abc\n# branch.head local\n' })
  const lines = await start($)
  expect(ran).not.toContain('git fetch')
  expect(lines).toContain('no remote branch, nothing to pull or push')
  expect(lines.some(line => /^○ local only/.test(line))).toBe(true)
})

test('a detached HEAD shows its commit', async ($, on) => {
  stubEngine(on, { isRepo: true, status: '# branch.oid 4f9c2a1d8e7b\n# branch.head (detached)\n' })
  expect(await start($)).toContain('detached at 4f9c2a1')
})

test('a folder outside git says the .git folder is not found', async ($, on) => {
  const { ran } = stubEngine(on, { isRepo: false })
  const lines = await start($)
  expect(ran).toEqual([])
  expect(lines).toContain('not found')
  expect(lines.some(line => /^○ no repository/.test(line))).toBe(true)
  expect(await runTool($)).toMatchObject({ cwd: CWD, hasGit: false })
})

test('an 80-column band keeps every column', async ($, on) => {
  stubEngine(on, { isRepo: true })
  await start($)
  const lines = await bandLines($, 'terminal', { bodyColumns: 80 })
  for (const label of ['to pull', 'to push', 'status', 'staged', 'modified', 'new files']) expect(lines).toContain(label)
})

test('a terminal band with the height for it draws one bordered table, like Session Inspector', async ($, on) => {
  stubEngine(on, { isRepo: true })
  await start($)
  const lines = await bandLines($, 'terminal', { maxRows: 12 })
  expect(lines.some(line => /^╭─+╮$/.test(line))).toBe(true)
  expect(lines.some(line => /^╰─+╯$/.test(line))).toBe(true)
  expect(lines.some(line => /^├─+┬.*┤$/.test(line))).toBe(true)
  for (const text of ['Repo', 'Sync', 'Changes', 'Next', 'to pull', 'new files']) expect(lines).toContain(text)
})

test('a table short of room leaves out Commit and Diff before any other row', async ($, on) => {
  stubEngine(on, { isRepo: true })
  await start($)
  const full = await bandLines($, 'terminal', { maxRows: 16 })
  expect(full).toContain('Commit')
  expect(full).toContain('Diff')
  const short = await bandLines($, 'terminal', { maxRows: 12 })
  expect(short.some(line => /^╭─+╮$/.test(line))).toBe(true)
  expect(short).not.toContain('Commit')
  expect(short).not.toContain('Diff')
  expect(short).toContain('Next')
})

test('a repository with no commits and no changes says so', async ($, on) => {
  stubEngine(on, { isRepo: true, diff: '', log: '' })
  await start($)
  const after = await bandLines($, 'terminal', { maxRows: 16 })
  expect(after).toContain('no commits yet')
  expect(cellAfter(after, 'files')).toBe('0')
})

test('on the desktop every row, a message row too, sits in a bordered card', async ($, on) => {
  stubEngine(on, { isRepo: false })
  await start($)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const boxes = await band.findAll({ type: 'Box' })
  const bordered = boxes.filter(found => (found.props as { borderStyle?: string }).borderStyle === 'round')
  await band.unmount()
  // The frame, then the Folder card.
  expect(bordered.length).toBe(2)
})

test('a branch already in sync says there is nothing to do', async ($, on) => {
  stubEngine(on, { isRepo: true, status: '# branch.oid abc\n# branch.head main\n# branch.upstream origin/main\n# branch.ab +0 -0\n' })
  expect(await start($)).toContain('nothing to do, all in sync')
})

test('a band with under five rows of room drops the frame and keeps the rows', async ($, on) => {
  stubEngine(on, { isRepo: true })
  await start($)
  const lines = await bandLines($, 'terminal', { maxRows: 3 })
  expect(lines).not.toContain('Git Inspector')
  expect(lines).toContain('Repo')
  expect(lines).toContain('Changes')
})

test('the Git row moves right above the Session Inspector row', () => {
  const row = (plugin: string) => ({ plugin })
  expect(orderRows([row('bugs'), row('session-inspector'), row('git-inspector')]).map(one => one.plugin)).toEqual([
    'bugs',
    'git-inspector',
    'session-inspector',
  ])
  expect(orderRows([row('git-inspector'), row('bugs')]).map(one => one.plugin)).toEqual(['git-inspector', 'bugs'])
})
