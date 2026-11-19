import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { GitStatus, GitView } from '../types'
import { readGitStatus } from './git'
import { gitPane } from './pane'

export const PANE_ID = 'git-inspector'
export const TOOL = 'mcp__git-inspector__git_status'

const view = atom({ plugin: 'git-inspector', key: 'view' } as const, { isRefreshing: false } as GitView, { shape: 'view-1' })

const DESCRIPTION =
  "Reads the git repository the session runs in: its root and .git folder, the current branch, the remote branch it tracks, how many commits there are to pull (after a git fetch) and to push, and how many files are staged, changed but not staged, and untracked. hasGit is false when the session folder is not a git repository. Takes no input."

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// Reads the repository again and keeps the result for the pane.
async function refresh($: EngineInterface): Promise<GitStatus> {
  await update($, view, current => ({ ...current, isRefreshing: true }))
  try {
    const status = await readGitStatus($)
    await update($, view, () => ({ status, isRefreshing: false }))
    return status
  } catch (error) {
    await update($, view, current => ({ ...current, isRefreshing: false, error: message(error) }))
    throw error
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'git', description: 'Open the Git pane: branch, commits to pull and push, and local changes' })
    await $.tool.register({ name: 'git_status', description: DESCRIPTION, inputSchema: { type: 'object', properties: {} } })
    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'git' }, async $ => {
    // The pane opens at once and fills in when the fetch ends.
    refresh($).catch(() => undefined)
    const opened = await $.ui.open({ id: PANE_ID, title: 'Git' })
    return { text: opened.isPlaced ? 'Git pane opened.' : 'The Git pane is waiting for room: widen the terminal to show it.' }
  })

  on('tool.run', { tool: TOOL }, async $ => {
    try {
      return { result: JSON.stringify(await refresh($)) }
    } catch (error) {
      return { deny: `Git status failed: ${message(error)}` }
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE_ID }, async ($, e) => gitPane($.ui.resolve(e), await read($, view), e.props.bodyColumns))
}
