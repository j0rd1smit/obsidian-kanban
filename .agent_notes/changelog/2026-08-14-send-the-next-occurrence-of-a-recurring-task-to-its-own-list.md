# 2026-08-14 - Send the next occurrence of a recurring task to its own list

**Why:** With `auto-move-done-to-lane` on, ticking a recurring card was
confusing. The Tasks plugin splits it into two — the completed occurrence
and the next one — and the completed one flew off to `Done` while the new
one was dropped into the exact spot the old card just vacated. The result
reads as if nothing happened: a card with the same title is still sitting
there, so the tick looks like it failed, and there is no way to tell "this
is next month's rent" from "this is the rent I just paid" without reading
the date. Recurring cards also tend to belong somewhere other than the list
work is picked from — they are scheduled, not in progress.

**What:** A second, independent destination. `move-recurring-to-lane`
(default off) plus `recurring-lane-name` (default `Recurring`) send the
occurrence the Tasks plugin creates to a list of its own, so the tick
visibly empties the source position and the new card appears where recurring
work is kept.

`autoMoveDoneItem` now routes each item the toggle produced rather than
moving one and re-inserting the rest: the completed occurrence to the done
list, everything else — which is only ever the next occurrence — to the
recurring list, and whatever isn't routed stays put. The two settings are
independent, so the recurring list works with the completed-card move off,
which is the setup for someone who wants recurring cards collected but
finishes work by dragging.

Scoped to the checkbox path, which is where the recurrence is identifiable.
The parse invariant and the closed-board file sweep both see the new
occurrence as an ordinary incomplete card with no way to tell it apart from
one that was always there, so a card ticked from a Dataview or Tasks query
still leaves its next occurrence in place. Dragging a card into a list
marked `**Complete**` also creates a recurrence, and that path
(`maybeCompleteForMove` in `DragDropApp`/`moveCardToBoard`) is untouched —
covering it means changing upstream drop handling, which is worth its own
change if it turns out to matter.

Default off, no change to the on-disk format, and a board that never sets
the key behaves exactly as before.
