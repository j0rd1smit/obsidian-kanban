Scratch vault for trying the plugin out against the current source.

## Use it

```sh
yarn build:demo   # one-off build into .obsidian/plugins/kanban-custom/
yarn dev:demo     # same, but rebuilds on every change
```

Then open this folder as a vault in Obsidian (`Open folder as vault`). The
plugin is already listed in `.obsidian/community-plugins.json`, so it loads on
its own — after a `dev:demo` rebuild, reload the plugin (or the window) to pick
up the new code.

The build output isn't committed; `yarn build:demo` regenerates it.

## Boards

- [[Auto-move completed cards]] — ticking a card's checkbox moves it to the
  `Done` list. The setting is enabled on the board itself, so it works whatever
  your global setting says.
- [[Move cards between boards]] — a second board, so a card's "Move to other
  board" menu item has somewhere to go. Try it with this board closed too: the
  card is written straight into the file.
- [[Completed from a query]] — for ticking cards from somewhere other than the
  board. [[Tick a card from a query]] holds the Dataview and Tasks queries and
  the things worth trying, including the case that matters: the board closed.
- [[Recurring cards]] — the same auto-move, plus "Move new recurring cards to a
  list" turned on, so ticking a recurring card sends its next occurrence to
  `Recurring` instead of leaving it in the completed card's place.

The recurring cards need the [Tasks](https://publish.obsidian.md/tasks/) plugin
to do anything interesting: without it they're ordinary cards, with it ticking
one leaves the next occurrence behind in `Todo` — or in the list named by the
recurring setting — and sends the completed occurrence to `Done` with a `✅`
date. The query note also wants
[Dataview](https://blacksmithgu.github.io/obsidian-dataview/). Both are listed
in `.obsidian/community-plugins.json`, so they enable themselves once installed.
