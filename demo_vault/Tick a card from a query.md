Ticking a checkbox here edits [[Completed from a query]] directly — the board
never runs any code. This is the case
[issue #16](https://github.com/j0rd1smit/obsidian-kanban/issues/16) is about.

## Setup

Install and enable [Dataview](https://blacksmithgu.github.io/obsidian-dataview/)
and [Tasks](https://publish.obsidian.md/tasks/). Both are already listed in
`.obsidian/community-plugins.json`, so they switch on once installed. Without
them the blocks below stay code blocks and there is nothing to tick.

## The queries

```dataview
TASK
FROM "Completed from a query"
WHERE !completed
GROUP BY join(nonnull([file.folder, file.name, meta(section).subpath]), " > ")
```

```tasks
not done
path includes Completed from a query
group by heading
```

## What to try

**The board is closed.** Close [[Completed from a query]], then tick a task in
either query above. Within a couple of seconds the card is in `Done` in the
file — reopen the board and it is already there. This is the case that matters:
you work from the query precisely so you do not have to open the board.

**The board is open.** Open [[Completed from a query]] in another tab and tick a
task here. The card moves as soon as the board notices the file changed. Same
outcome, different path: the open board reparses instead.

**Obsidian was not running.** Quit Obsidian, edit `Completed from a query.md` in
any text editor, change a card in `Todo` from `- [ ]` to `- [x]`, and start
Obsidian again. The card is in `Done` before you open anything.

**A card that was already in the wrong place.** The rule is the invariant, not
the click: any complete card outside `Done` moves. Put a `- [x]` card into
`Doing` by hand and it goes to `Done` the next time that board is parsed or
swept.

**The opt-out.** The `Kept as-is` list is marked `**Complete**`, so its cards
are complete because of the list and are left alone. Nothing moves them.

**The setting.** `auto-move-done-to-lane` is on for this board, in its settings
footer. Turn it off there (or in the board's settings) and every one of the
above stops happening.

## Recurring tasks

`Feed the cat` carries a Tasks recurrence. Ticking it from a query leaves Tasks
in charge of the split: it writes the next occurrence and the completed one into
the file, and the completed one is the one that ends up in `Done`.
