# Security

## What the mod does

Git Inspector reads the state of the git repository the session runs in. It never changes a file, a branch, a commit or the working tree, and never blocks or changes anything in the session.

It keeps the last reading (folders, branch names and counts) in Claude Code's session state, in memory. It writes nothing to disk of its own.

## Commands it runs

The mod runs these commands with Claude Code's `$.process.run`, in the session's folder, with no shell:

| Command | Why | When |
| --- | --- | --- |
| `git rev-parse --absolute-git-dir` | Finds the `.git` folder. | When the session starts, after each answer, on `/git` and when the tool runs. |
| `git status --porcelain=v2 --branch` | Reads the branch, the remote branch, the commits ahead and behind, and the file counts. | Same, once or twice. |
| `git fetch --quiet` | Updates what Git knows about the remote branch, so the pull count is current. | On `/git`, when the tool runs, and at most once every five minutes otherwise; only when the branch tracks a remote branch. |

`git fetch` is the only command that uses the network, and it talks only to the remote your repository already has configured, with your own Git credentials. It updates the remote-tracking references inside `.git` (as any `git fetch` does) and never changes your branches or files. It runs with `GIT_TERMINAL_PROMPT=0` and `GCM_INTERACTIVE=never`, so it fails instead of asking for a password, and it stops after 20 seconds.

## Reporting a vulnerability

Please report a vulnerability privately through the repository's GitHub security advisories ("Report a vulnerability" on the Security tab), not in a public issue.
