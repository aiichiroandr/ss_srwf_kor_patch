import assert from "node:assert/strict";
import test from "node:test";
import {
  NAVIGATION_KEYS,
  canStep,
  filterRecords,
  isTypingTarget,
  navigationFor,
  normalizeSearch,
  parseSearchQuery,
  positionLabel,
  scrollTopToReveal,
  stepPosition,
} from "../assets/editor-list.mjs";

const rows = (names) => names.map((name, index) => ({ recordIndex: index + 1, name }));
const textOf = (row) => normalizeSearch(`${row.name} #${row.recordIndex}`);

test("search folds full-width letters, case and spaces so what is typed finds what the game spells", () => {
  assert.equal(normalizeSearch("  ＡＢ１　Ｃ  "), "ab1 c");
  assert.equal(normalizeSearch(undefined), "");
  const list = rows(["ＡＢ１", "ＺＺ가나", "푸른 도구"]);
  assert.deepEqual(filterRecords(list, "ab1", textOf).map((row) => row.recordIndex), [1]);
  assert.deepEqual(filterRecords(list, "zz", textOf).map((row) => row.recordIndex), [2]);
  assert.deepEqual(filterRecords(list, "푸른", textOf).map((row) => row.recordIndex), [3]);
});

test("every word of a query must match; an empty query keeps the whole list in order", () => {
  const list = rows(["푸른 도구", "푸른 칼", "긴 도구"]);
  assert.deepEqual(filterRecords(list, "푸른 도구", textOf).map((row) => row.recordIndex), [1]);
  assert.deepEqual(filterRecords(list, "도구", textOf).map((row) => row.recordIndex), [1, 3]);
  assert.deepEqual(filterRecords(list, "   ", textOf).map((row) => row.recordIndex), [1, 2, 3]);
  assert.equal(parseSearchQuery("").empty, true);
  const copy = filterRecords(list, "", textOf);
  assert.notEqual(copy, list, "an empty query still returns a copy the caller may keep");
});

test("#12 means record 12 only; a bare 12 also finds names that contain the digits, with record 12 first", () => {
  const list = rows(Array.from({ length: 30 }, (_, index) => (index === 4 ? "슈퍼12호" : `기체${index + 1}`)));
  assert.deepEqual(filterRecords(list, "#12", textOf).map((row) => row.recordIndex), [12]);
  assert.deepEqual(filterRecords(list, "#5", textOf).map((row) => row.recordIndex), [5]);
  const bare = filterRecords(list, "12", textOf).map((row) => row.recordIndex);
  assert.equal(bare[0], 12, "the record with that number comes first");
  assert.ok(bare.includes(5), "a name containing 12 still matches");
  assert.equal(bare.length, 2, "nothing else contains the digits");
  assert.deepEqual(bare.slice(1), [...bare.slice(1)].sort((a, b) => a - b), "the rest keeps record order");
});

test("stepping moves inside the list, clamps at both ends and says when it cannot move", () => {
  assert.equal(stepPosition(10, 4, { by: 1 }), 5);
  assert.equal(stepPosition(10, 4, { by: -1 }), 3);
  assert.equal(stepPosition(10, 9, { by: 1 }), null, "the last row cannot go forward");
  assert.equal(stepPosition(10, 0, { by: -1 }), null, "the first row cannot go back");
  assert.equal(stepPosition(10, 4, { to: "first" }), 0);
  assert.equal(stepPosition(10, 4, { to: "last" }), 9);
  assert.equal(stepPosition(10, 0, { to: "first" }), null);
  assert.equal(stepPosition(0, -1, { by: 1 }), null);
  assert.equal(stepPosition(10, 4, { page: 1 }, 4), 7, "a page is one row less than the rows that fit");
  assert.equal(stepPosition(10, 4, { page: -1 }, 4), 1);
  assert.equal(stepPosition(10, 8, { page: 1 }, 4), 9);
  assert.equal(stepPosition(10, 1, { page: -1 }, 4), 0);
  assert.equal(stepPosition(10, 4, { page: 1 }, 0), 5, "a list with no measurable height still moves a row");
});

test("when a search hides the selected record a step forward lands on the first row and a step back on the last", () => {
  assert.equal(stepPosition(7, -1, { by: 1 }), 0);
  assert.equal(stepPosition(7, -1, { by: -1 }), 6);
  assert.equal(stepPosition(7, -1, { page: 1 }, 5), 0);
  assert.equal(stepPosition(7, -1, { page: -1 }, 5), 6);
  assert.equal(canStep(7, -1, 1), true);
  assert.equal(canStep(7, -1, -1), true);
  assert.equal(positionLabel(7, -1), "- / 7");
});

test("previous and next are available exactly where the selection can move", () => {
  assert.equal(canStep(5, 0, -1), false);
  assert.equal(canStep(5, 0, 1), true);
  assert.equal(canStep(5, 4, 1), false);
  assert.equal(canStep(5, 4, -1), true);
  assert.equal(canStep(0, -1, 1), false);
  assert.equal(canStep(1, 0, 1), false);
  assert.equal(positionLabel(447, 11), "12 / 447");
  assert.equal(positionLabel(0, -1), "0 / 0");
});

test("the four arrow keys, Home, End and the page keys are the navigation keys", () => {
  assert.deepEqual(Object.keys(NAVIGATION_KEYS).sort(), [
    "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp", "End", "Home", "PageDown", "PageUp",
  ]);
  const move = (key) => navigationFor({ key, target: { tagName: "BODY" } }, 8)?.move;
  assert.deepEqual(move("ArrowUp"), { by: -1 });
  assert.deepEqual(move("ArrowLeft"), { by: -1 });
  assert.deepEqual(move("ArrowDown"), { by: 1 });
  assert.deepEqual(move("ArrowRight"), { by: 1 });
  assert.deepEqual(move("Home"), { to: "first" });
  assert.deepEqual(move("End"), { to: "last" });
  assert.deepEqual(move("PageDown"), { page: 1 });
  assert.deepEqual(move("PageUp"), { page: -1 });
  assert.equal(navigationFor({ key: "a", target: { tagName: "BODY" } }, 8), null);
  assert.equal(navigationFor({ key: "Enter", target: { tagName: "BODY" } }, 8), null);
});

test("keys that type or choose, shortcuts and handled events are never taken", () => {
  for (const tagName of ["INPUT", "TEXTAREA", "SELECT", "OPTION", "input"]) {
    assert.equal(navigationFor({ key: "ArrowDown", target: { tagName } }, 8), null, tagName);
  }
  assert.equal(navigationFor({ key: "ArrowLeft", target: { tagName: "DIV", isContentEditable: true } }, 8), null);
  assert.equal(navigationFor({ key: "ArrowRight", target: { tagName: "BUTTON", getAttribute: (name) => (name === "role" ? "tab" : null) } }, 8), null);
  assert.equal(navigationFor({ key: "ArrowRight", target: { tagName: "DIV", getAttribute: (name) => (name === "role" ? "slider" : null) } }, 8), null);
  assert.equal(navigationFor({ key: "ArrowDown", ctrlKey: true, target: { tagName: "BODY" } }, 8), null);
  assert.equal(navigationFor({ key: "ArrowDown", metaKey: true, target: { tagName: "BODY" } }, 8), null);
  assert.equal(navigationFor({ key: "ArrowDown", altKey: true, target: { tagName: "BODY" } }, 8), null);
  assert.equal(navigationFor({ key: "ArrowDown", defaultPrevented: true, target: { tagName: "BODY" } }, 8), null);
  // inside a dialog (the skill dialog, the help card) the page's list is not the thing the keys are for
  const inDialog = { tagName: "BUTTON", getAttribute: () => null, closest: (selector) => (selector.includes("dialog") ? {} : null) };
  assert.equal(navigationFor({ key: "ArrowDown", target: inDialog }, 8), null);
  // the list itself (a listbox) and plain buttons do pass the key on
  const listbox = { tagName: "DIV", getAttribute: (name) => (name === "role" ? "listbox" : null), closest: () => null };
  assert.equal(isTypingTarget(listbox), false);
  assert.notEqual(navigationFor({ key: "ArrowDown", target: listbox }, 8), null);
  assert.equal(isTypingTarget(null), false);
});

test("scrolling reveals the least that is needed and never moves a visible row", () => {
  assert.equal(scrollTopToReveal(100, 200, 150, 40), 100, "fully visible: stay");
  assert.equal(scrollTopToReveal(100, 200, 60, 40), 60, "above: align its top");
  assert.equal(scrollTopToReveal(100, 200, 280, 40), 120, "below: align its bottom");
  assert.equal(scrollTopToReveal(0, 200, 0, 40), 0);
  assert.equal(scrollTopToReveal(100, 200, 100, 40), 100, "touching the top edge is visible");
  assert.equal(scrollTopToReveal(100, 200, 260, 40), 100, "touching the bottom edge is visible");
});
