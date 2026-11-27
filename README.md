# Git Inspector

A Claude Code mod that shows the Git state of the repository the session runs in.

It answers at a glance: which repository the session points at, whether it has a `.git` folder, which branch is checked out, how many commits wait to be pulled or pushed, what the last commit was, how big the changes since it are, how many files are ready to commit, and what to do next.

## What it adds

- **A band above the prompt**, drawn like the Session Inspector band and stacked right above it. In the terminal it is one bordered table; on the desktop, rows of cards. When the terminal band is too short for the table, it falls back to one line per row.

  ```
  ╭────────────────────────────────────────────────────────────────────────────────╮
  │ Git Inspector                      main   remote origin/main   ● fetched 14:02 │
  │          ╭───────────────────────────────────────────────────────────────────╮ │
  │ Repo     │ app   C:/work/app, session in web                                 │ │
  │          ├─────────────────────┬──────────────────────┬──────────────────────┤ │
  │ Sync     │ to pull 3           │ to push 1            │ status diverged      │ │
  │          ├─────────────────────┴──────────────────────┴──────────────────────┤ │
  │ Commit   │ last: 3fa92b1 "fix bug #21"                                       │ │
  │          ├─────────────────────┬──────────────────────┬──────────────────────┤ │
  │ Diff     │ files 3             │ lines +12 −4         │                      │ │
  │          ├─────────────────────┼──────────────────────┼──────────────────────┤ │
  │ Changes  │ staged 2            │ modified 4           │ new files 1          │ │
  │          ├─────────────────────┴──────────────────────┴──────────────────────┤ │
  │ Next     │ pull 3 commits, commit 7 files, then push                         │ │
  │          ╰───────────────────────────────────────────────────────────────────╯ │
  ╰────────────────────────────────────────────────────────────────────────────────╯
  ```

  It reads the repository when the session starts, after each answer, and every 10 seconds on its own, so changes made outside the session show up without a prompt. It runs `git fetch` at most once every five minutes, so the band never waits on the network.
- **The `/git` command** fetches from the remote now and refreshes the band.
- **The `git_status` tool** gives the agent the same data as JSON, after a fresh fetch, so you can ask Claude "what is the git state?" and it reads it itself.

How each figure is read:

- **To pull**: commits on the remote branch that are not in the local branch, counted after a `git fetch`. When the fetch fails (no network, no access), the band says so in red and the count comes from the last fetch.
- **To push**: local commits that are not on the remote branch.
- **Staged**: files added with `git add`, ready to commit. **Modified**: tracked files changed but not added, including merge conflicts. **New files**: files Git does not track yet.
- **Commit**: the last commit, its short hash and its subject line. "no commits yet" in a new repository.
- **Diff**: how big the changes since the last commit are (`git diff HEAD`, staged or not): files changed, then lines added in green and removed in red. New untracked files are not in it, because Git does not compare them yet.
- When the terminal band is too short for every row, Commit and Diff leave first.
- **Next**: what to do now, in plain words and in order: pull first, then commit, then push. "nothing to do, all in sync" when there is nothing.
- A branch with no remote branch shows that instead of pull and push counts. A detached HEAD shows the commit it points at.
- A session folder outside any git repository shows ".git not found" and nothing else.

## Install

In the Claude Code terminal:

```
/plugin install git-inspector --marketplace lukeware-hub/git-inspector
```

To try it from a local copy without installing:

```
claude --plugin-dir .
```

## Development

```
claude plugin validate .
claude plugin test .
```

`tsc -p .` type-checks the mod once Claude Code has loaded it and written its types to `.claude-plugin/types/`.

## License

MIT
