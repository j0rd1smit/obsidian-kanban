# Changelog (personal fork)

Entries for changes made on `custom` that diverge from upstream.
Newest first.

Format per entry:

```
## YYYY-MM-DD - Short title

**Why:** motivation for the change.

**What:** brief summary of the change (the diff has the details).
```

## 2026-08-10 - Fetch the obsidian-api dep over git instead of a codeload tarball

**Why:** `yarn install` failed in the Claude Code cloud sandbox with
`https://codeload.github.com/obsidianmd/obsidian-api/tar.gz/8b2eda0f... 403
Forbidden`. `package.json` asks for `obsidian@^1.5.7-1`, and the inherited
`yarn.lock` resolved it to a source tarball on `codeload.github.com`. The
sandbox routes outbound https through a policy-enforcing egress proxy that
does not allow that host, nor `github.com/.../archive/*.tar.gz`. The git
transport to the same repo is allowed, so the content was reachable — only
the tarball download path was not. Fixing it in git config would not have
travelled with the repo, so the fix has to live in the lockfile.

**What:** Rewrote the single `resolved` line for
`obsidian@obsidianmd/obsidian-api#master` in `yarn.lock` from the
`codeload.github.com` tarball URL to
`git+https://github.com/obsidianmd/obsidian-api.git#<sha>`. The commit SHA is
unchanged, so the installed package contents are identical, only the
transport differs. Verified with a cold yarn cache and `--frozen-lockfile`
(so yarn accepts the lockfile without rewriting it): the install resolves
`obsidian@1.5.7-1`, and `yarn typecheck` and `yarn build` both pass.
`git+https` needs no SSH key and no proxy allowance, so it works on a normal
dev machine and in the sandbox alike.

## 2026-08-07 - Rename plugin id/name to avoid clashing with upstream

**Why:** Running this fork alongside (or instead of) the official
`obsidian-kanban` plugin needs a distinct plugin id, otherwise Obsidian
can't tell the two apart (install/update/BRAT conflicts, same data
directory under `.obsidian/plugins/`).

**What:** Changed the plugin id from `obsidian-kanban` to `kanban-custom`
and display name from `Kanban` to `Kanban (custom)` in `manifest.json` and
`package.json`. Updated the test vault (`docs/.obsidian/`) to match: renamed
`plugins/obsidian-kanban/` to `plugins/kanban-custom/` and updated
`community-plugins.json`. The markdown board format (`kanban-plugin`
frontmatter key) and vault settings keys are unchanged.
