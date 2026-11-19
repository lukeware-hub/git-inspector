# Git Inspector

A Claude Code mod that shows the Git state of the repository the session runs in.

It answers five questions at a glance: which repository the session points at, whether it has a `.git` folder, which branch is checked out, how many commits wait to be pulled or pushed, and how many files are ready to commit.

## What it adds

- **The `/git` command** opens a pane beside the chat:

  ```
  ╭──────────────────────────────────────────────────────────────────────────╮
  │ Git Inspector                       main   remote origin/main   ● fetched │
  │ Repo     C:/work/app, session in web                                     │
  │ Sync     pull   3          push    1          state     diverged         │
  │ Changes  staged 2          changed 4          untracked 1                │
  │ Checked  at     14:02:11   .git    found                                 │
  ╰──────────────────────────────────────────────────────────────────────────╯
  ```

- **The `git_status` tool** gives the agent the same data as JSON, so you can ask Claude "what is the git state?" and it reads it itself.

How each figure is read:

- **To pull**: commits on the remote branch that are not in the local branch, counted after a `git fetch`. When the fetch fails (no network, no access), the pane says so and the count comes from the last fetch.
- **To push**: local commits that are not on the remote branch.
- **Staged**: files added with `git add`, ready to commit. **Not staged**: tracked files changed but not added, including merge conflicts. **Untracked**: new files Git does not track yet.
- A branch with no remote branch shows that instead of pull and push counts. A detached HEAD shows the commit it points at.
- A session folder outside any git repository shows "not found" and nothing else.

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
