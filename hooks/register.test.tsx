import type { On } from 'claude-code'
import { expect, mock, test, type TestBody } from 'claude-code/testing'

import { PANE_ID, TOOL } from './register'

const ROOT = '/work/app'
const CWD = '/work/app/web'

const PANE = {
  plugin: 'git-inspector',
  component: 'Pane',
  requestId: PANE_ID,
  props: { title: 'Git', isFocused: false, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

const BEFORE_FETCH = '# branch.oid abc\n# branch.head main\n# branch.upstream origin/main\n# branch.ab +1 -0\n1 M. N... a b c d e f.ts\n? new.md\n'
const AFTER_FETCH = BEFORE_FETCH.replace('-0', '-2')

type Host = { isRepo: boolean; isFetchFailing?: boolean; status?: string }

// Stands for the engine: the session folder, its repository and the git commands' answers.
function stubEngine(on: On, host: Host) {
  mock.clock(on, { now: Date.UTC(2026, 10, 19, 17, 2, 11) })
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
      'git status': host.status ?? (hasFetched ? AFTER_FETCH : BEFORE_FETCH),
      'git fetch': host.isFetchFailing ? undefined : '',
    }
    const out = stdout[command]
    return { value: { exitCode: out === undefined ? 128 : 0, stdout: out ?? '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('tool.register', (_, e) => ({ value: { tool: `mcp__git-inspector__${e.name}` } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  return { ran }
}

async function runTool($: Parameters<TestBody>[0]) {
  const answer = await $.tool.call({ tool: TOOL })
  return JSON.parse(String(answer.result))
}

// The value painted right after a dim cell label, such as "pull" then "2".
async function cellAfter($: Parameters<TestBody>[0], surface: 'terminal' | 'desktop', label: string) {
  const lines = await paneLines($, surface)
  return lines[lines.indexOf(label) + 1]
}

async function paneLines($: Parameters<TestBody>[0], surface: 'terminal' | 'desktop' = 'terminal') {
  const pane = await $.ui.mount({ ...PANE, surface })
  const lines = (await pane.findAll({ type: 'Text' })).map(found => found.text.trim())
  await pane.unmount()
  return lines
}

test('the tool fetches, then answers the repository, branch and counts', async ($, on) => {
  const { ran } = stubEngine(on, { isRepo: true })
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  const status = await runTool($)
  expect(ran).toEqual(['git rev-parse', 'git status', 'git fetch', 'git status'])
  expect(status).toMatchObject({
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
  })
})

test('the pane shows what the tool read, on every surface', async ($, on) => {
  stubEngine(on, { isRepo: true })
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  await runTool($)
  for (const surface of ['terminal', 'desktop'] as const) {
    const lines = await paneLines($, surface)
    for (const text of ['Git Inspector', 'main', 'remote origin/main', '● fetched', 'Repo', `${ROOT}, session in web`, 'found', 'Sync', 'diverged', 'Changes', 'Checked', 'at']) {
      expect(lines).toContain(text)
    }
    expect(await cellAfter($, surface, 'pull')).toBe('2')
    expect(await cellAfter($, surface, 'push')).toBe('1')
    expect(await cellAfter($, surface, 'staged')).toBe('1')
    expect(await cellAfter($, surface, 'changed')).toBe('0')
    expect(await cellAfter($, surface, 'untracked')).toBe('1')
  }
})

test('/git opens the pane and reads the repository', async ($, on) => {
  const { ran } = stubEngine(on, { isRepo: true })
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  const answer = await $.command.run({ command: 'git', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })
  expect(answer.text).toBe('Git pane opened.')
  // The reading runs beside the command; the pane fills in once it ends.
  let lines: string[] = []
  for (let tries = 0; tries < 20 && !lines.includes('main'); tries++) lines = await paneLines($)
  expect(lines).toContain('main')
  expect(ran).toContain('git fetch')
})

test('a failed fetch keeps the last pull count and says so', async ($, on) => {
  stubEngine(on, { isRepo: true, isFetchFailing: true })
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  expect(await runTool($)).toMatchObject({ fetch: 'failed', toPull: 0, toPush: 1 })
  const lines = await paneLines($)
  expect(lines).toContain('● fetch failed')
  expect(lines).toContain('failed, the pull count is from the last fetch')
})

test('a branch with no remote branch skips the fetch', async ($, on) => {
  const { ran } = stubEngine(on, { isRepo: true, status: '# branch.oid abc\n# branch.head local\n' })
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  expect(await runTool($)).toMatchObject({ branch: 'local', fetch: 'no upstream' })
  expect(ran).not.toContain('git fetch')
  const lines = await paneLines($)
  expect(lines).toContain('no remote branch, nothing to pull or push')
})

test('a detached HEAD shows its commit', async ($, on) => {
  stubEngine(on, { isRepo: true, status: '# branch.oid 4f9c2a1d8e7b\n# branch.head (detached)\n' })
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  await runTool($)
  expect(await paneLines($)).toContain('detached at 4f9c2a1')
})

test('a folder outside git says the .git folder is not found', async ($, on) => {
  const { ran } = stubEngine(on, { isRepo: false })
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  expect(await runTool($)).toMatchObject({ cwd: CWD, hasGit: false })
  expect(ran).toEqual([])
  const lines = await paneLines($)
  expect(lines).toContain('not found')
  expect(lines).toContain('○ no repository')
})

test('an 80-column pane keeps every column', async ($, on) => {
  stubEngine(on, { isRepo: true })
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  await runTool($)
  const pane = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 80 }, surface: 'terminal' })
  const lines = (await pane.findAll({ type: 'Text' })).map(found => found.text.trim())
  await pane.unmount()
  for (const label of ['pull', 'push', 'state', 'staged', 'changed', 'untracked', '.git']) expect(lines).toContain(label)
})
