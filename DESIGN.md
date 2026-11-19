# Design

The Git band is an Operate surface drawn in a terminal: the person is in a task and glances down to know whether to pull, commit or push. It looks like the Session Inspector band: one framed panel, a fixed label column, a dim label before every figure, and color reserved for meaning.

## Medium

- Claude Code's own elements only (`Box`, `Text`); colors are theme keys, so the band follows the dark or light theme.

## Shape

- **Place**: one row of the band above the prompt, moved right above the Session Inspector row when that mod is on; other rows keep their order.
- **The frame** is one rounded border (`borderStyle: round`, dim). Its first row holds "Git Inspector" in bold brand color on the left, and on the right the branch, the dim remote branch and the fetch mark with its time. Under five rows of room the frame and title are dropped and the rows stay.
- **Rows** start with a dim label in a 9-column label column: `Repo` (the path, then `.git found` or `.git not found`), `Sync`, `Changes`, and `Fetch` or `Error` when something failed.
- **Figures** carry their own dim label before the value (`pull`, `push`, `state`, `staged`, `changed`, `untracked`). Columns share one width in every row; the gaps share the spare room so the last column ends on the right edge, and whole columns leave from the right when the band is narrow.
- **Messages** (the repository path, a failure, "no remote branch", "reading") span their row and never sit in a column, so they never widen the grid. Long paths are cut in the middle.
- **Glyphs**: `●` a finished fetch (green when it worked, red when it failed), `○` a reading in progress, nothing fetched yet, no remote or no repository (dim).

## Color roles

| Role | Theme key | Used for |
| --- | --- | --- |
| Brand mark | `claude` | The title only. |
| Good | `success` | "up to date", "● fetched". |
| Watch | `warning` | Commits to pull or push, "behind", "diverged", a detached HEAD, ".git not found". |
| Danger | `error` | A failed fetch or reading. |
| Secondary | dim | Labels, the remote branch, zero counts, ".git found", empty states. |
| Body | default | Every other value; the branch stays default because it is the main fact. |

## Copy

- Sentence case and git's own words: "behind", "ahead", "diverged", "up to date", "untracked".
- No em dash.
