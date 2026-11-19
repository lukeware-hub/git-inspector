import type { EngineInterface } from 'claude-code'

import type { FetchResult, GitStatus } from '../types'

const STATUS = ['git', 'status', '--porcelain=v2', '--branch']
const FETCH = ['git', 'fetch', '--quiet']
const GIT_DIR = ['git', 'rev-parse', '--absolute-git-dir']
const TIMEOUT_MS = 20_000
// Git never stops to ask for a password: a fetch that needs one fails instead.
const NO_PROMPT = { GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' }

export type StatusCounts = Pick<GitStatus, 'branch' | 'isDetached' | 'upstream' | 'toPull' | 'toPush' | 'staged' | 'unstaged' | 'untracked'>

// Reads `git status --porcelain=v2 --branch`: branch, remote branch, commits ahead and behind, and file counts.
export function parseStatus(output: string): StatusCounts {
  const counts: StatusCounts = { staged: 0, unstaged: 0, untracked: 0 }
  let commit = ''
  for (const line of output.split(/\r?\n/)) {
    const [kind, key = '', ...rest] = line.split(' ')
    if (kind === '#' && key === 'branch.oid') commit = rest[0] ?? ''
    else if (kind === '#' && key === 'branch.head') counts.branch = rest.join(' ')
    else if (kind === '#' && key === 'branch.upstream') counts.upstream = rest.join(' ')
    else if (kind === '#' && key === 'branch.ab') {
      counts.toPush = Math.abs(Number(rest[0]))
      counts.toPull = Math.abs(Number(rest[1]))
    } else if (kind === '1' || kind === '2') {
      if (key[0] !== '.') counts.staged++
      if (key[1] !== '.') counts.unstaged++
    } else if (kind === 'u') counts.unstaged++
    else if (kind === '?') counts.untracked++
  }
  if (counts.branch === '(detached)') return { ...counts, branch: commit.slice(0, 7), isDetached: true }
  return counts
}

// Runs a git command in the session's folder; undefined when it fails or times out.
async function git($: EngineInterface, argv: readonly string[]): Promise<string | undefined> {
  try {
    const done = await $.process.run(argv, { env: NO_PROMPT, timeoutMs: TIMEOUT_MS })
    return done.exitCode === 0 ? done.stdout : undefined
  } catch {
    return undefined
  }
}

async function readCounts($: EngineInterface): Promise<StatusCounts> {
  const output = await git($, STATUS)
  if (output === undefined) throw new Error('git status failed')
  return parseStatus(output)
}

// Reads the session's repository; with shouldFetch, fetches first when the branch tracks a remote one, so the pull count is current.
export async function readGitStatus($: EngineInterface, shouldFetch: boolean): Promise<GitStatus> {
  const [cwd, repo] = await Promise.all([$.session.cwd(), $.session.repo()])
  if (!repo) return { cwd, hasGit: false, staged: 0, unstaged: 0, untracked: 0, checkedAt: await $.clock.now() }
  const gitDir = (await git($, GIT_DIR))?.trim()
  let counts = await readCounts($)
  if (!counts.upstream) return { cwd, hasGit: true, root: repo.root, gitDir, ...counts, fetch: 'no upstream', checkedAt: await $.clock.now() }
  if (!shouldFetch) return { cwd, hasGit: true, root: repo.root, gitDir, ...counts, checkedAt: await $.clock.now() }
  const fetchedAt = await $.clock.now()
  const fetch: FetchResult = (await git($, FETCH)) === undefined ? 'failed' : 'done'
  if (fetch === 'done') counts = await readCounts($)
  return { cwd, hasGit: true, root: repo.root, gitDir, ...counts, fetch, fetchedAt, checkedAt: await $.clock.now() }
}
