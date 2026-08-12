import update from 'immutability-helper';
import { KanbanSettings } from 'src/Settings';
import { StateManager } from 'src/StateManager';
import { Board, Item } from 'src/components/types';
import { Path } from 'src/dnd/types';
import { getEntityFromPath, insertEntity, removeEntity, updateEntity } from 'src/dnd/util/data';
import { getTaskStatusDone, toggleTask } from 'src/parsers/helpers/inlineMetadata';

import type { BoardModifiers } from './boardModifiers';

export const DEFAULT_DONE_LANE_NAME = 'Done';

export interface AutoMoveDoneOptions {
  /** `auto-move-done-to-lane` */
  enabled: boolean;
  /** `done-lane-name`, matched against lane titles case-insensitively */
  laneName: string;
  /** `new-card-insertion-method`, decides top vs bottom of the done lane */
  insertionMethod?: 'prepend' | 'prepend-compact' | 'append';
}

/**
 * What clicking a card's checkbox does.
 *
 * With the Tasks plugin installed the toggle is delegated to it, so the card
 * picks up Tasks' completion date and, for a recurring task, splits into the
 * completed occurrence plus the next one. Without it we just flip the checkbox
 * ourselves. Either way the result goes through `completeItem`, which is what
 * moves a finished card to the done lane.
 */
export function toggleItemCheckbox(
  stateManager: StateManager,
  boardModifiers: Pick<BoardModifiers, 'completeItem'>,
  path: Path,
  item: Item
) {
  const updates = toggleTask(item, stateManager.file);

  if (updates) {
    const [itemStrings, checkChars, thisIndex] = updates;
    const replacements: Item[] = itemStrings.map((str, i) => {
      const next = stateManager.getNewItem(str, checkChars[i]);
      if (i === thisIndex) next.id = item.id;
      return next;
    });

    return boardModifiers.completeItem(path, replacements, thisIndex);
  }

  const next = update(item, {
    data: {
      checkChar: {
        $apply: (v: string) => (v === ' ' ? getTaskStatusDone() : ' '),
      },
      $toggle: ['checked'],
    },
  });

  return boardModifiers.completeItem(path, [next], 0);
}

/**
 * The three settings the auto-move reads, resolved through `getSetting`.
 *
 * `settings` is the per-board block to resolve against. Pass it when the board
 * those settings came from is not (yet) the state manager's current state — a
 * freshly parsed board, for instance.
 */
export function autoMoveDoneOptions(
  stateManager: Pick<StateManager, 'getSetting'>,
  settings?: KanbanSettings
): AutoMoveDoneOptions {
  return {
    enabled: !!stateManager.getSetting('auto-move-done-to-lane', settings),
    laneName: stateManager.getSetting('done-lane-name', settings) || DEFAULT_DONE_LANE_NAME,
    insertionMethod: stateManager.getSetting('new-card-insertion-method', settings),
  };
}

export function isItemComplete(item: Item): boolean {
  return !!item?.data.checked && item.data.checkChar === getTaskStatusDone();
}

/**
 * Index of the first lane whose title matches `laneName`, or -1.
 * Lane titles are compared trimmed and case-insensitively; `lane.data.title`
 * already has the `(n)` max-items suffix stripped by `parseLaneTitle`.
 */
export function findLaneIndexByTitle(board: Board, laneName: string): number {
  const target = laneName?.trim().toLowerCase();
  if (!target) return -1;

  return board.children.findIndex((lane) => lane.data.title?.trim().toLowerCase() === target);
}

function replaceInPlace(board: Board, path: Path, items: Item[]): Board {
  return insertEntity(removeEntity(board, path), path, items) as Board;
}

/**
 * Replace the item at `path` with `items`, moving `items[completedIndex]` to the
 * done lane when it came back complete and auto-move is on.
 *
 * `items` is what a checkbox toggle produced: normally a single item, but the
 * Tasks plugin turns a recurring task into two — the completed occurrence
 * (`completedIndex`) and the freshly scheduled one. Only the completed
 * occurrence travels; the new occurrence stays where the user left it.
 *
 * Note this deliberately does *not* run `maybeCompleteForMove` the way the drop
 * handler does. The checkbox already decided the card's completion state, and
 * re-deriving it from the destination lane would undo that.
 */
export function autoMoveDoneItem(
  board: Board,
  path: Path,
  items: Item[],
  completedIndex: number,
  options: AutoMoveDoneOptions
): Board {
  const completedItem = items[completedIndex];

  if (!options.enabled || !completedItem || !isItemComplete(completedItem)) {
    return replaceInPlace(board, path, items);
  }

  const sourceLaneIndex = path[0];
  const doneLaneIndex = findLaneIndexByTitle(board, options.laneName);

  // No such lane, or the card is already sitting in it
  if (doneLaneIndex === -1 || doneLaneIndex === sourceLaneIndex) {
    return replaceInPlace(board, path, items);
  }

  const staying = items.filter((_, i) => i !== completedIndex);
  const withoutCompleted = replaceInPlace(board, path, staying);

  const doneLane = withoutCompleted.children[doneLaneIndex];
  const insertIndex =
    (options.insertionMethod || 'append') === 'append' ? doneLane.children.length : 0;

  const moved = insertEntity(
    withoutCompleted,
    [doneLaneIndex, insertIndex],
    [completedItem]
  ) as Board;

  // A manual placement shouldn't be immediately re-sorted, same as a drop
  if (doneLane.data.sorted !== undefined) {
    return updateEntity(moved, [doneLaneIndex], { data: { $unset: ['sorted'] } }) as Board;
  }

  return moved;
}

/** Path of the card with this id, or undefined. */
function findItemPathById(board: Board, id: string): Path | undefined {
  for (let laneIndex = 0; laneIndex < board.children.length; laneIndex++) {
    const itemIndex = board.children[laneIndex].children.findIndex((item) => item.id === id);
    if (itemIndex !== -1) return [laneIndex, itemIndex];
  }
}

/**
 * The same move, for cards completed outside the board.
 *
 * A checkbox ticked in a Dataview or Tasks query writes straight into the board
 * file, so no board code runs — the board only learns about it when the file
 * change makes it reparse. This compares the freshly parsed board against the
 * one it replaces and moves whatever just flipped to complete.
 *
 * Only a transition counts. Cards that are new to this parse are left alone, so
 * a `- [x]` line typed into a lane by hand stays where it was put, and so does
 * every card that was already complete when the board was opened. Matching is by
 * entity id, which survives a reparse — see the diff/patch step in
 * `ListFormat.mdToBoard`.
 */
export function autoMoveExternallyCompletedItems(
  previous: Board | undefined,
  next: Board,
  options: AutoMoveDoneOptions
): Board {
  if (!options.enabled || !previous) return next;

  const doneLaneIndex = findLaneIndexByTitle(next, options.laneName);
  if (doneLaneIndex === -1) return next;

  const wasComplete = new Map<string, boolean>();
  for (const lane of previous.children) {
    for (const item of lane.children) {
      wasComplete.set(item.id, isItemComplete(item));
    }
  }

  const newlyCompleted: string[] = [];
  next.children.forEach((lane, laneIndex) => {
    if (laneIndex === doneLaneIndex) return;
    for (const item of lane.children) {
      if (isItemComplete(item) && wasComplete.get(item.id) === false) {
        newlyCompleted.push(item.id);
      }
    }
  });

  // One at a time, re-finding each card: an earlier move shifts the paths
  return newlyCompleted.reduce((board, id) => {
    const path = findItemPathById(board, id);
    if (!path) return board;

    const item = getEntityFromPath(board, path) as Item;
    return autoMoveDoneItem(board, path, [item], 0, options);
  }, next);
}
