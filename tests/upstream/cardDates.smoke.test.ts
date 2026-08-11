/**
 * Upstream behaviour guard: adding dates and times to a card.
 *
 * The card menu's "Add date" / "Add time" entries hand a picked value to these
 * two builders, which edit the card's raw text. The text they write is the
 * format everything downstream reads, and it changes shape with `date-trigger`,
 * `date-format` and `link-date-to-daily-note`.
 */
import {
  constructMenuDatePickerOnChange,
  constructMenuTimePickerOnChange,
} from 'src/components/Item/helpers';
import { describe, expect, it } from 'vitest';

import { wrapBoard } from '../helpers/boards';
import { Harness, loadBoard } from '../helpers/harness';

const PICKED = new Date(2026, 7, 7);

function setDate(harness: Harness, hasDate: boolean, date = PICKED) {
  const item = harness.board().children[0].children[0];

  constructMenuDatePickerOnChange({
    stateManager: harness.stateManager,
    boardModifiers: harness.boardModifiers,
    item,
    hasDate,
    path: [0, 0],
  })([date]);

  return harness.board().children[0].children[0];
}

function setTime(harness: Harness, hasTime: boolean, time: string) {
  const item = harness.board().children[0].children[0];

  constructMenuTimePickerOnChange({
    stateManager: harness.stateManager,
    boardModifiers: harness.boardModifiers,
    item,
    hasTime,
    path: [0, 0],
  })(time);

  return harness.board().children[0].children[0];
}

describe('adding a date to a card', () => {
  it('appends it with the date trigger', async () => {
    const harness = await loadBoard(wrapBoard(['## Todo', '', '- [ ] Card']));
    const item = setDate(harness, false);

    expect(item.data.titleRaw).toBe('Card @{2026-08-07}');
    expect(item.data.metadata.dateStr).toBe('2026-08-07');
    expect(harness.markdown()).toContain('- [ ] Card @{2026-08-07}');
  });

  it('replaces the date a card already has', async () => {
    const harness = await loadBoard(wrapBoard(['## Todo', '', '- [ ] Card @{2020-01-01} #tag']));
    const item = setDate(harness, true);

    expect(item.data.titleRaw).toBe('Card @{2026-08-07} #tag');
    expect(item.data.metadata.dateStr).toBe('2026-08-07');
  });

  it('honours a custom trigger and format', async () => {
    const harness = await loadBoard(wrapBoard(['## Todo', '', '- [ ] Card']), {
      'date-trigger': '~',
      'date-format': 'DD/MM/YYYY',
    });
    const item = setDate(harness, false);

    expect(item.data.titleRaw).toBe('Card ~{07/08/2026}');
    expect(item.data.metadata.dateStr).toBe('07/08/2026');
  });

  it('writes a daily note link when link-date-to-daily-note is on', async () => {
    const harness = await loadBoard(wrapBoard(['## Todo', '', '- [ ] Card']), {
      'link-date-to-daily-note': true,
    });
    const item = setDate(harness, false);

    expect(item.data.titleRaw).toBe('Card @[[2026-08-07]]');
    expect(item.data.metadata.dateStr).toBe('2026-08-07');
  });

  it('replaces an existing daily note link rather than appending a second date', async () => {
    const harness = await loadBoard(wrapBoard(['## Todo', '', '- [ ] Card @[[2020-01-01]]']), {
      'link-date-to-daily-note': true,
    });
    const item = setDate(harness, true);

    expect(item.data.titleRaw).toBe('Card @[[2026-08-07]]');
  });
});

describe('adding a time to a card', () => {
  it('appends it with the time trigger', async () => {
    const harness = await loadBoard(wrapBoard(['## Todo', '', '- [ ] Card']));
    const item = setTime(harness, false, '10:15');

    expect(item.data.titleRaw).toBe('Card @@{10:15}');
    expect(item.data.metadata.timeStr).toBe('10:15');
  });

  it('replaces the time a card already has', async () => {
    const harness = await loadBoard(wrapBoard(['## Todo', '', '- [ ] Card @@{09:00} #tag']));
    const item = setTime(harness, true, '10:15');

    expect(item.data.titleRaw).toBe('Card @@{10:15} #tag');
  });

  it('folds the time onto the date when the card has both', async () => {
    const harness = await loadBoard(wrapBoard(['## Todo', '', '- [ ] Card @{2026-08-07}']));
    const item = setTime(harness, false, '10:15');

    expect(item.data.titleRaw).toBe('Card @{2026-08-07} @@{10:15}');
    expect(item.data.metadata.time.format('YYYY-MM-DD HH:mm')).toBe('2026-08-07 10:15');
  });
});
