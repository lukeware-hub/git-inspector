# Design

The Git band is an Operate surface drawn in a terminal: the person is in a task and glances down to know whether to pull, commit or push. It looks like the Session Inspector band: one framed panel, a fixed label column, a dim label before every figure, and color reserved for meaning.

## Medium

- Claude Code's own elements only (`Box`, `Text`); colors are theme keys, so the band follows the dark or light theme.

## Shape

- **Place**: one row of the band above the prompt, moved right above the Session Inspector row when that mod is on; other rows keep their order.
- **The frame** is one rounded border (`borderStyle: round`, dim). Its first row holds "Git Inspector" in bold brand color on the left, and on the right the branch, the dim remote branch and the fetch mark with its time. Under five rows of room the frame and title are dropped and the rows stay.
- **Layout** follows Session Inspector: in the terminal, one table whose neighbouring cells share a single line (`╭┬╮ ├┼┤ ╰┴╯`) when the band has the height for it (`3 + 2 × rows + 1`), else one line per row; on the desktop, rows of cards, where a message row is one bordered card across the whole width. When the height is short, `Commit` then `Diff` leave first; the table is kept as long as every other row fits.
- **Rows** start with a dim label in a 9-column label column: `Repo` (the repository name in bold, then its dim path, cut in the middle, and the session folder when it is not the root), `Sync`, `Commit` (dim `last:`, the bold short hash, the quoted subject), `Diff` (`files`, then `lines` with the added count in `diffAdded` and the removed count in `diffRemoved`, as Session Inspector's `lines`), `Changes`, `Next`, and `Fetch` or `Error` when something failed. Outside a repository the one row is `Folder` with `.git not found`.
- **Figures** carry their own dim label before the value (`to pull`, `to push`, `status`, `staged`, `modified`, `new files`). Columns share one width in every row and fill the band to its right edge; whole columns leave from the right when the band is narrow.
- **Next** says what to do in plain words, in git's order: pull, commit, push ("pull 2 commits, commit 3 files, then push"). Warning color while there is something to pull, green "nothing to do, all in sync" when clean.
- **Messages** (the repository, the next step, a failure, "no remote branch", "reading") span their row and never sit in a column, so they never widen the grid.
- **Glyphs**: `●` a finished fetch (green when it worked, red when it failed), `○` a reading in progress, nothing fetched yet, no remote or no repository (dim).

## Color roles

| Role | Theme key | Used for |
| --- | --- | --- |
| Brand mark | `claude` | The title only. |
| Good | `success` | "up to date", "● fetched", "nothing to do, all in sync". |
| Watch | `warning` | Commits to pull or push, "behind", "diverged", a next step that starts with a pull, a detached HEAD, ".git not found". |
| Danger | `error` | A failed fetch or reading. |
| Secondary | dim | Labels, the remote branch, the repository path, zero counts, empty states. |
| Body | default | Every other value; the branch and the repository name are bold because they are the main facts. |

## Copy

- Sentence case and plain words a person new to Git reads at once: "to pull", "modified", "new files"; git's own words where they are the clearest: "behind", "ahead", "diverged", "up to date".
- No em dash.
