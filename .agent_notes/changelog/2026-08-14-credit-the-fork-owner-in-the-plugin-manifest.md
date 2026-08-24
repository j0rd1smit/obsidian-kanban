# 2026-08-14 - Credit the fork owner in the plugin manifest

**Why:** In Obsidian's community plugin list the fork was still listed as
"By mgmeyers" with the upstream description, so it was hard to spot as the
personal build and the installed-plugin search (which matches name, author
and description) never hit on `j0rd1smit`.

**What:** `manifest.json` now sets `author` to
`j0rd1smit (fork of mgmeyers' Kanban)`, points `authorUrl` at the fork, and
appends the fork attribution to `description`. Upstream credit stays in the
author string and `helpUrl` still points at the upstream docs. The docs test
vault manifest (`docs/.obsidian/plugins/kanban-custom/`) was updated to
match. Plugin `id`, `name` and the on-disk board format are unchanged, so
existing boards and plugin data are untouched.
