# Obsidian Kanban Plugin

## This fork

A personal fork of [mgmeyers/obsidian-kanban](https://github.com/mgmeyers/obsidian-kanban)
by [j0rd1smit](https://github.com/j0rd1smit), built for my own vault. It ships under its own
plugin id (`kanban-custom`, shown as "Kanban (custom)"), so it can be installed next to the
upstream plugin. Everything below is upstream's README and still applies.

On top of upstream:

- **Auto-move completed cards to a done list** — off by default. Ticking a card's checkbox
  moves it to the list named in the settings (`Done` by default), set globally or per board.
  It also runs on boards that are closed, so a card ticked from a `dataview` or `tasks` query
  ends up in the right list too.
- **Move a card to another board** — a "Move to other board" item in the card menu that asks
  for a board and then one of its lists. The destination board does not have to be open, which
  makes it usable on mobile.

Install with [BRAT](https://github.com/TfTHacker/obsidian42-brat): add
`j0rd1smit/obsidian-kanban` as a beta plugin.

---

**The Kanban plugin is looking for new maintainers.** Interested? [Read more here.](https://github.com/mgmeyers/obsidian-kanban/blob/main/MAINTAINERS.md)

---

Create markdown-backed Kanban boards in [Obsidian](https://obsidian.md/)

- [Bugs, Issues, & Feature Requests](https://github.com/mgmeyers/obsidian-kanban/issues)
- [Development Roadmap](https://github.com/mgmeyers/obsidian-kanban/projects/1)

![Screen Shot 2021-09-16 at 12.58.22 PM.png](https://github.com/mgmeyers/obsidian-kanban/blob/main/docs/Assets/Screen%20Shot%202021-09-16%20at%2012.58.22%20PM.png)

![Screen Shot 2021-09-16 at 1.10.38 PM.png](https://github.com/mgmeyers/obsidian-kanban/blob/main/docs/Assets/Screen%20Shot%202021-09-16%20at%201.10.38%20PM.png)

## Documentation

Find the plugin documentation here: [Obsidian Kanban Plugin Documentation](https://publish.obsidian.md/kanban/)
