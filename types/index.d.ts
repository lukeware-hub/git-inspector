// What git-inspector reads from the session's repository.
export type FetchResult = 'done' | 'failed' | 'no upstream'

export type GitStatus = {
  // The folder the session runs in.
  cwd: string
  // False when that folder is not inside a git repository.
  hasGit: boolean
  root?: string
  gitDir?: string
  // The branch name, or the short commit when HEAD is detached.
  branch?: string
  isDetached?: boolean
  // The remote branch the local one tracks, such as origin/main.
  upstream?: string
  toPull?: number
  toPush?: number
  staged: number
  unstaged: number
  untracked: number
  fetch?: FetchResult
  checkedAt: number
}

// What the pane draws: the last reading, whether a new one runs, and the last failure.
export type GitView = { status?: GitStatus; isRefreshing: boolean; error?: string }

declare module 'claude-code' {
  // The git_status tool takes no input.
  interface McpToolInputs {
    'mcp__git-inspector__git_status': {}
  }

  interface PluginState {
    'git-inspector': { view: Shaped<GitView> }
  }
}
