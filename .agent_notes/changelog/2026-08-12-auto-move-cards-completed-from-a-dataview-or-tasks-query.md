# 2026-08-12 - Auto-move cards completed from a dataview or tasks query

**Why:** Issue #16. Ticking a board card's checkbox from a `dataview` TASK
query or a `tasks` query writes `- [x]` straight into the board file — no
board code runs at all, so the card was marked complete but stayed in the
list it was in. That is the one workflow where the auto-move matters most,
and the board is almost never open while it happens: the whole point of
collecting tasks in a query is to work from the query instead of the board.
Anything that only fires for an open board misses the case it exists for.

**What:** Turned the feature from "react to a click" into an invariant:
with `auto-move-done-to-lane` on, a complete card does not sit outside the
done list. It is enforced in three places — the checkbox handler as before,
every parse of a board (`StateManager.newBoard`), and, for boards no view
has open, the file itself. `ClosedBoardSweeper` watches `vault.on('modify')`
and also runs once at startup, so a card ticked from a query — or on another
device, with Obsidian closed — has already moved by the time the board is
opened.

A closed board cannot be parsed (no `StateManager`), so the file path edits
markdown as text, splicing the card's lines out of one list and into the
done list and leaving every other byte alone. That reuses `boardMarkdown.ts`
from the cross-board card move, which grew card-block reading and settings
resolution for it. A test pins that both paths put the card in the same
place.

The invariant is what makes the closed case possible at all: with no board
in memory there is nothing to compare a parse against, so "was ticked a
moment ago" is not knowable, while "is complete and in the wrong list" is.
The cost is that a card left complete outside the done list from before the
setting was turned on is relocated too. Lists marked `**Complete**` are the
way to opt a list out, and the archive is never touched.

No new setting, and no change to the on-disk format.
