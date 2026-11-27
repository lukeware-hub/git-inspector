import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { GitStatus, GitView } from '../types'
import { gitBand } from './band'
import { readGitStatus } from './git'

export const PLUGIN = 'git-inspector'
export const TOOL = 'mcp__git-inspector__git_status'
// The band sits right above this mod's band.
const ANCHOR = 'session-inspector'
const FETCH_EVERY_MS = 5 * 60_000
// How often the band reads the repository on its own, with no answer needed; the fetch keeps its own five minutes.
const POLL_EVERY_MS = 10_000

const view = atom({ plugin: 'git-inspector', key: 'view' } as const, { isRefreshing: false } as GitView, { shape: 'view-2' })

const DESCRIPTION =
  "Reads the git repository the session runs in: its root and .git folder, the current branch, the remote branch it tracks, how many commits there are to pull (after a git fetch) and to push, how many files are staged, changed but not staged, and untracked, the files and lines changed since the last commit (diff), and the last commit's short hash and subject (lastCommit). hasGit is false when the session folder is not a git repository. Takes no input."

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

let isReading = false

// The band shows the fetch time when there is one, so then a newer check time alone is no change worth a redraw.
function isSame(a: GitStatus | undefined, b: GitStatus): boolean {
  if (!a) return false
  const key = (status: GitStatus) => JSON.stringify(status.fetchedAt === undefined ? status : { ...status, checkedAt: 0 })
  return key(a) === key(b)
}

// Reads the repository again for the band; fetches when asked to or when the last fetch is five minutes old.
// A quiet reading (the timer's) does not flash "reading" and does not redraw when nothing changed.
async function refresh($: EngineInterface, isForced: boolean, isQuiet = false): Promise<GitStatus> {
  const previous = (await read($, view)).status
  const shouldFetch = isForced || (await $.clock.now()) - (previous?.fetchedAt ?? 0) >= FETCH_EVERY_MS
  isReading = true
  if (!isQuiet || shouldFetch) await update($, view, current => ({ ...current, isRefreshing: true }))
  try {
    const reading = await readGitStatus($, shouldFetch)
    // A reading without a fetch keeps how the last fetch went.
    const status = reading.fetch ? reading : { ...reading, fetch: previous?.fetch, fetchedAt: previous?.fetchedAt }
    const current = await read($, view)
    const isUnchanged = isQuiet && !current.isRefreshing && !current.error && isSame(current.status, status)
    if (!isUnchanged) await update($, view, () => ({ status, isRefreshing: false }))
    return status
  } catch (error) {
    await update($, view, current => ({ ...current, isRefreshing: false, error: message(error) }))
    throw error
  } finally {
    isReading = false
  }
}

// Background readings never overlap and never break an event.
function refreshInBackground($: EngineInterface, isForced = false, isQuiet = false): void {
  if (isReading && !isForced) return
  refresh($, isForced, isQuiet).catch(() => undefined)
}

// Moves this mod's row right above the anchor's; the other rows keep their order.
export function orderRows<Row extends { plugin: string }>(rows: readonly Row[]): Row[] {
  const own = rows.find(row => row.plugin === PLUGIN)
  if (!own || !rows.some(row => row.plugin === ANCHOR)) return [...rows]
  const others = rows.filter(row => row !== own)
  others.splice(others.findIndex(row => row.plugin === ANCHOR), 0, own)
  return others
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'git', description: 'Fetch from remote now and refresh the Git band above the prompt' })
    await $.tool.register({ name: 'git_status', description: DESCRIPTION, inputSchema: { type: 'object', properties: {} } })
    refreshInBackground($)
    // Keeps the band current with no answer needed; the engine stops the timer when the module unloads.
    $.clock.every(POLL_EVERY_MS, () => refreshInBackground($, false, true))
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) refreshInBackground($)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'git' }, async $ => {
    refreshInBackground($, true)
    return { text: 'Fetching from remote and refreshing the Git band.' }
  })

  on('tool.run', { tool: TOOL }, async $ => {
    try {
      return { result: JSON.stringify(await refresh($, true)) }
    } catch (error) {
      return { deny: `Git status failed: ${message(error)}` }
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    return gitBand($.ui.resolve(e), await read($, view), e.props.bodyColumns, e.props.maxRows, e.surface)
  })

  on('ui.render', { component: 'AbovePromptList' }, ($, e, next) => next({ ...e, props: { ...e.props, rows: orderRows(e.props.rows) } }))
}
