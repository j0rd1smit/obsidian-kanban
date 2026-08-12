# 2026-08-12 - Auto-move cards completed from a Dataview or Tasks query

**Why:** Issue #16. Ticking a board card's checkbox from a `dataview` TASK
query or a `tasks` query writes `- [x]` straight into the board file — no
board code runs at all, so the card was marked complete but stayed in the
list it was in. That is the one workflow where the auto-move matters most:
the whole point of collecting tasks in a query is to work from the query
instead of the board, and the board then quietly drifted out of the shape
the setting promises.

**What:** The auto-move now also runs on the reparse that follows an
external change to the board file, not only on a click inside the board.
`StateManager.newBoard` compares the board it just parsed against the one it
replaces and moves every card that flipped from incomplete to complete,
writing the result back to disk. Only that transition counts, so cards that
were already complete when the board was opened, and `- [x]` lines added by
hand, stay where they are. The `auto-move-done-to-lane` /
`done-lane-name` settings are unchanged and govern both paths; no new
setting, no markdown format change.

Known gap, left out on purpose: this needs the board open to notice. A card
ticked in a query while its board is closed is still sitting in the wrong
list when the board is next opened, because a first parse has nothing to
compare against. Sweeping every complete card into the done list on open
would fix that, but it would also rewrite files on open and would empty any
other list marked `**Complete**`, so it wants its own setting and its own
discussion.
