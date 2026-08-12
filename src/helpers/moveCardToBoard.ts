import { App, TFile } from 'obsidian';
import { StateManager } from 'src/StateManager';
import { maybeCompleteForMove } from 'src/components/helpers';
import { Board, Item, Lane, LaneTemplate } from 'src/components/types';
import { Path } from 'src/dnd/types';
import { getEntityFromPath, insertEntity, removeEntity, updateEntity } from 'src/dnd/util/data';
import { itemToMd } from 'src/parsers/formats/list';

import { hasFrontmatterKey } from '../helpers';
import {
  InsertionMethod,
  insertItemIntoLane,
  parseLanesFromMarkdown,
  parseSettingsFromMarkdown,
} from './boardMarkdown';

/**
 * Moving one card from the board it lives on to a list of some other board.
 *
 * The destination board may not be open, and a board that is not open has no
 * `StateManager` and no view, so there are two write paths:
 *
 * - open: insert through the destination's `StateManager`, exactly as the
 *   cross-board branch of `handleDrop` does, and let it save.
 * - closed: splice the card's markdown into the file (see `boardMarkdown.ts`).
 *   Going around an open board's `StateManager` would race its pending save,
 *   which is why the open case never takes this path.
 *
 * Either way the card only leaves the source board once it has landed, so a
 * failed write loses nothing.
 */

/** One list of the destination board, as offered to the user. */
export interface DestinationLane {
  index: number;
  title: string;
  shouldMarkItemsComplete: boolean;
}

export interface MoveCardToBoardOptions {
  /** The board the card is leaving. */
  stateManager: StateManager;
  path: Path;
  item: Item;
  file: TFile;
  lane: DestinationLane;
  /** The destination's `StateManager`, when the board is open. */
  destination?: StateManager;
}

/** Every kanban board in the vault except `exclude`, by path. */
export function listKanbanBoards(app: App, exclude?: TFile): TFile[] {
  return app.vault
    .getMarkdownFiles()
    .filter((file) => file !== exclude && hasFrontmatterKey(file))
    .sort((a, b) => a.path.localeCompare(b.path));
}

/** The `StateManager` of `file`, if some view has the board open. */
export function findOpenStateManager(
  stateManager: StateManager,
  file: TFile
): StateManager | undefined {
  return stateManager.getAView()?.plugin?.stateManagers.get(file);
}

/** The lists of `file`, read from the open board when there is one. */
export async function getDestinationLanes(
  app: App,
  file: TFile,
  destination?: StateManager
): Promise<DestinationLane[]> {
  if (destination?.state) {
    return destination.state.children.map((lane, index) => ({
      index,
      title: lane.data.title,
      shouldMarkItemsComplete: !!lane.data.shouldMarkItemsComplete,
    }));
  }

  return parseLanesFromMarkdown(await app.vault.cachedRead(file)).map((lane) => ({
    index: lane.index,
    title: lane.title,
    shouldMarkItemsComplete: lane.shouldMarkItemsComplete,
  }));
}

export async function moveCardToBoard(options: MoveCardToBoardOptions): Promise<void> {
  const { stateManager, item, destination } = options;
  const path = resolveItemPath(stateManager.state, item, options.path);

  if (!path) {
    throw new Error(`Card is no longer on ${stateManager.file.basename}`);
  }

  const replacement = destination
    ? moveToOpenBoard({ ...options, path }, destination)
    : await moveToClosedBoard({ ...options, path });

  stateManager.setState((board) => removeEntity(board, path, replacement) as Board);
}

/**
 * The card may have been dragged or edited while the user was picking a
 * destination, so trust its id over the path the menu was opened with.
 */
function resolveItemPath(board: Board, item: Item, path: Path): Path | undefined {
  if (getEntityFromPath(board, path)?.id === item.id) return path;

  for (let laneIndex = 0; laneIndex < board.children.length; laneIndex++) {
    const itemIndex = board.children[laneIndex].children.findIndex((i) => i.id === item.id);
    if (itemIndex !== -1) return [laneIndex, itemIndex];
  }
}

function insertIndex(count: number, method: InsertionMethod) {
  return method === 'prepend' || method === 'prepend-compact' ? 0 : count;
}

/**
 * Insert into a board that is open. Returns the card the source lane keeps, if
 * completing a recurring task left one behind.
 */
function moveToOpenBoard(options: MoveCardToBoardOptions, destination: StateManager): Item {
  const { stateManager, path, item, lane } = options;
  const destinationLane = destination.state.children[lane.index];

  if (!destinationLane) {
    throw new Error(`${options.file.basename} no longer has a list named "${lane.title}"`);
  }

  const method = destination.getSetting('new-card-insertion-method') as InsertionMethod;
  const destinationPath = [lane.index, insertIndex(destinationLane.children.length, method)];

  const { next, replacement } = maybeCompleteForMove(
    stateManager,
    stateManager.state,
    path,
    destination,
    destination.state,
    destinationPath,
    item
  );

  destination.setState((board) => {
    const inserted = insertEntity(board, destinationPath, [next]) as Board;

    // A manual placement shouldn't be immediately re-sorted, same as a drop
    if (board.children[lane.index]?.data.sorted !== undefined) {
      return updateEntity(inserted, [lane.index], { data: { $unset: ['sorted'] } }) as Board;
    }

    return inserted;
  });

  return replacement;
}

/** Insert into a board that is not open, by editing its file. */
async function moveToClosedBoard(options: MoveCardToBoardOptions): Promise<Item> {
  const { stateManager, path, item, file, lane } = options;

  const { next, replacement } = maybeCompleteForMove(
    stateManager,
    stateManager.state,
    path,
    // A closed board has no StateManager, and a card only needs its raw text and
    // its checkbox to be written out, neither of which the destination's
    // settings affect. The stub board is here so the destination list's
    // `**Complete**` marker still decides the checkbox.
    stateManager,
    stubBoardForLane(lane),
    [0, 0],
    item
  );

  const itemMd = itemToMd(next);
  let inserted = false;

  await stateManager.app.vault.process(file, (md) => {
    const lanes = parseLanesFromMarkdown(md);
    const target =
      lanes[lane.index]?.title === lane.title
        ? lanes[lane.index]
        : lanes.find((l) => l.title === lane.title);

    if (!target) return md;

    inserted = true;

    const method = (parseSettingsFromMarkdown(md)['new-card-insertion-method'] ??
      stateManager.getGlobalSetting('new-card-insertion-method')) as InsertionMethod;

    return insertItemIntoLane(md, target, itemMd, method);
  });

  if (!inserted) {
    throw new Error(`${file.basename} no longer has a list named "${lane.title}"`);
  }

  return replacement;
}

/** A one-lane board, just enough for `maybeCompleteForMove` to read the lane. */
function stubBoardForLane(lane: DestinationLane): Board {
  const stub: Lane = {
    ...LaneTemplate,
    id: 'move-to-board-stub',
    children: [],
    data: {
      title: lane.title,
      shouldMarkItemsComplete: lane.shouldMarkItemsComplete,
    },
  };

  return { children: [stub] } as Board;
}
