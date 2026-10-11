import assert from 'node:assert/strict';
import test from 'node:test';
import { createSkillPagination, packSkillPages } from '../assets/editor-skill-pagination.mjs';

const group = (chrome, heights) => ({ chrome, rows: heights.map((height, index) => ({ height, index })) });

test('all growth milestones stay together when their measured rows and heading fit', () => {
  const pages = packSkillPages([group(42, [46, 46, 46]), group(42, [46])], 274, 6);
  assert.equal(pages.length, 1);
  assert.equal(pages[0].height, 274);
  assert.deepEqual(pages[0].items, [
    { groupIndex: 0, rowIndex: 0 }, { groupIndex: 0, rowIndex: 1 }, { groupIndex: 0, rowIndex: 2 },
    { groupIndex: 1, rowIndex: 0 },
  ]);
});

test('a split family pays for its repeated heading and preserves every original row exactly once', () => {
  const pages = packSkillPages([group(42, Array(9).fill(46))], 226);
  assert.deepEqual(pages.map((page) => page.items.length), [4, 4, 1]);
  assert.deepEqual(pages.map((page) => page.height), [226, 226, 88]);
  assert.deepEqual(pages.flatMap((page) => page.items.map((item) => item.rowIndex)), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.ok(pages.every((page) => !page.oversized));
});

test('family spacing and a long event-condition row are measured before deciding a split', () => {
  const groups = [group(40, [40]), group(40, [82, 40])];
  assert.deepEqual(packSkillPages(groups, 250, 8).map((page) => page.items.length), [3]);
  const tighter = packSkillPages(groups, 249, 8);
  assert.deepEqual(tighter.map((page) => page.items.length), [2, 1]);
  assert.deepEqual(tighter.map((page) => page.height), [210, 80]);
  assert.ok(tighter.every((page) => !page.oversized));
});

test('only an individually oversized row requires fallback scrolling; later rows still receive pages', () => {
  const pages = packSkillPages([group(42, [130, 46, 46])], 100);
  assert.deepEqual(pages.map((page) => page.items.length), [1, 1, 1]);
  assert.deepEqual(pages.map((page) => page.oversized), [true, false, false]);
  assert.deepEqual(packSkillPages([], 100), []);
  assert.deepEqual(packSkillPages([group(42, [46])], 0).map((page) => page.oversized), [true]);
});

test('a smaller available viewport repacks without losing, duplicating, or renumbering rows', () => {
  const groups = [group(42, [46, 48, 50]), group(38, [44, 46]), group(40, [90])];
  const expected = groups.flatMap((item, groupIndex) => item.rows.map((_, rowIndex) => ({ groupIndex, rowIndex })));
  for (const height of [88, 130, 180, 250, 400, 800]) {
    const pages = packSkillPages(groups, height, 6);
    assert.deepEqual(pages.flatMap((page) => page.items), expected);
    for (const page of pages) {
      if (page.oversized) assert.equal(page.items.length, 1);
      else assert.ok(page.height <= height + 0.5);
    }
  }
});

test('the helper safely skips a closed dialog or test DOM with no geometry', async () => {
  const missing = createSkillPagination({});
  await missing.refresh({ reset: true, focusIndex: 8 });
  const closed = createSkillPagination({ dialog: { open: false } });
  await closed.refresh();
  const noLayout = createSkillPagination({ dialog: { open: true }, schedule: { clientHeight: 0 } });
  await noLayout.refresh();
});
