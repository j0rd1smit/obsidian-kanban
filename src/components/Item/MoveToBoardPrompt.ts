import { App, FuzzySuggestModal, Notice, TFile } from 'obsidian';
import { StateManager } from 'src/StateManager';
import { Path } from 'src/dnd/types';
import {
  DestinationLane,
  findOpenStateManager,
  getDestinationLanes,
  listKanbanBoards,
  moveCardToBoard,
} from 'src/helpers/moveCardToBoard';
import { t } from 'src/lang/helpers';

import { Item } from '../types';

/**
 * The "Move to other board" flow: pick a board, then pick one of its lists.
 *
 * Two suggest modals rather than nested menus, because this is meant to be
 * usable on a phone, where a submenu of every board in the vault is not.
 * The lists are loaded only once a board has been picked — they differ per
 * board, and the board may not even be open.
 */

class PickerModal<T> extends FuzzySuggestModal<T> {
  constructor(
    app: App,
    placeholder: string,
    private items: T[],
    private label: (item: T) => string,
    private onChoose: (item: T) => void
  ) {
    super(app);
    this.setPlaceholder(placeholder);
  }

  getItems(): T[] {
    return this.items;
  }

  getItemText(item: T): string {
    return this.label(item);
  }

  onChooseItem(item: T): void {
    this.onChoose(item);
  }
}

interface MoveToBoardPromptParams {
  stateManager: StateManager;
  path: Path;
  item: Item;
}

export function promptMoveToBoard({ stateManager, path, item }: MoveToBoardPromptParams) {
  const app = stateManager.app;
  const boards = listKanbanBoards(app, stateManager.file);

  if (!boards.length) {
    new Notice(t('No other boards in this vault'));
    return;
  }

  new PickerModal<TFile>(
    app,
    t('Move card to board...'),
    boards,
    (file) => file.path.replace(/\.md$/, ''),
    (file) => pickLane(stateManager, path, item, file)
  ).open();
}

function pickLane(stateManager: StateManager, path: Path, item: Item, file: TFile) {
  const app = stateManager.app;
  const destination = findOpenStateManager(stateManager, file);

  getDestinationLanes(app, file, destination)
    .then((lanes) => {
      if (!lanes.length) {
        new Notice(t('That board has no lists'));
        return;
      }

      new PickerModal<DestinationLane>(
        app,
        t('Move card to list...'),
        lanes,
        (lane) => lane.title,
        (lane) => {
          moveCardToBoard({ stateManager, path, item, file, lane, destination })
            .then(() => {
              new Notice(`${t('Card moved to')} ${file.basename} → ${lane.title}`);
            })
            .catch((e) => reportFailure(e));
        }
      ).open();
    })
    .catch((e) => reportFailure(e));
}

function reportFailure(e: Error) {
  console.error(e);
  new Notice(`${t('Could not move the card')}: ${e.message}`);
}
