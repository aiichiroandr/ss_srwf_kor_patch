// Record lists of the editor: search matching, stepping through the filtered list and the keys that do it.
// Pure functions over plain data and duck-typed elements: no DOM globals, no imports, no game text.

// ---- search ---------------------------------------------------------------------------------------------------------

// Lower-cases and folds full-width forms (ＡＢ１ -> ab1) so a typed "ab1" finds what the game spells in full-width.
export function normalizeSearch(text) {
  return String(text ?? "").normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

// A query is a list of whitespace-separated tokens that must all match. A token written as #12 means the record number
// 12 and nothing else; a bare number matches record 12 and any text that contains the digits.
export function parseSearchQuery(query) {
  const tokens = normalizeSearch(query).split(" ").filter(Boolean).map((text) => {
    const numbered = /^#(\d+)$/.exec(text);
    if (numbered) return { text, number: Number(numbered[1]), strict: true };
    return { text, number: /^\d+$/.test(text) ? Number(text) : null, strict: false };
  });
  return Object.freeze({ tokens: Object.freeze(tokens), empty: tokens.length === 0 });
}

function tokenMatches(token, recordIndex, haystack) {
  if (token.strict) return recordIndex === token.number;
  if (token.number !== null && recordIndex === token.number) return true;
  return haystack.includes(token.text);
}

// `rows` are { recordIndex, ... }; `textOf(row)` is the already normalized text to search (name, owners, ...).
// A purely numeric query lists the record with that number first and keeps the others in record order.
export function filterRecords(rows, query, textOf) {
  const parsed = typeof query === "string" ? parseSearchQuery(query) : query;
  if (parsed.empty) return rows.slice();
  const matches = rows.filter((row) => {
    const haystack = textOf(row);
    return parsed.tokens.every((token) => tokenMatches(token, row.recordIndex, haystack));
  });
  if (parsed.tokens.length === 1 && parsed.tokens[0].number !== null) {
    const exact = matches.findIndex((row) => row.recordIndex === parsed.tokens[0].number);
    if (exact > 0) matches.unshift(...matches.splice(exact, 1));
  }
  return matches;
}

// ---- stepping --------------------------------------------------------------------------------------------------------

// Key -> how the selection moves. `by` is a signed step in rows, `to` an absolute end, `page` a signed page.
export const NAVIGATION_KEYS = Object.freeze({
  ArrowUp: Object.freeze({ by: -1 }),
  ArrowLeft: Object.freeze({ by: -1 }),
  ArrowDown: Object.freeze({ by: 1 }),
  ArrowRight: Object.freeze({ by: 1 }),
  PageUp: Object.freeze({ page: -1 }),
  PageDown: Object.freeze({ page: 1 }),
  Home: Object.freeze({ to: "first" }),
  End: Object.freeze({ to: "last" }),
});

// The position the selection moves to inside a list of `length` rows, or null when it cannot move.
//   current  index of the selected row in the list, or -1 when the selected record is not in the list (a search that
//            hides it): a step forward then lands on the first row and a step back on the last.
//   move     an entry of NAVIGATION_KEYS or { by: n }
//   pageSize rows that fit in the list (at least 1)
export function stepPosition(length, current, move, pageSize = 8) {
  if (!Number.isInteger(length) || length <= 0) return null;
  const last = length - 1;
  let target;
  if (move.to === "first") target = 0;
  else if (move.to === "last") target = last;
  else {
    const size = Math.max(1, Math.floor(pageSize));
    const amount = move.page ? move.page * Math.max(1, size - 1) : move.by;
    if (!Number.isInteger(amount) || amount === 0) return null;
    if (current < 0) target = amount > 0 ? 0 : last;
    else target = Math.min(last, Math.max(0, current + amount));
  }
  return target === current ? null : target;
}

// Whether a step in `direction` (-1 or 1) is still possible: for the previous/next buttons.
export function canStep(length, current, direction) {
  if (!Number.isInteger(length) || length <= 0) return false;
  if (current < 0) return true;
  return direction < 0 ? current > 0 : current < length - 1;
}

// "12 / 447", or "-- / 447" when the selected record is not in the (filtered) list.
export function positionLabel(length, current) {
  if (!Number.isInteger(length) || length <= 0) return "0 / 0";
  return `${current >= 0 ? current + 1 : "-"} / ${length}`;
}

// ---- keys ------------------------------------------------------------------------------------------------------------

const TYPING_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT", "OPTION"]);
const OWN_ARROW_ROLES = new Set(["tab", "slider", "spinbutton", "combobox", "textbox", "searchbox"]);

// True when the event comes from a control that uses the arrow keys itself (typing, choosing, tabs, dialogs). The editor
// then leaves the key alone instead of moving the record selection.
export function isTypingTarget(target) {
  if (!target || typeof target !== "object") return false;
  if (TYPING_TAGS.has(String(target.tagName ?? "").toUpperCase())) return true;
  if (target.isContentEditable === true) return true;
  const role = typeof target.getAttribute === "function" ? target.getAttribute("role") : null;
  if (role && OWN_ARROW_ROLES.has(role)) return true;
  if (typeof target.closest === "function" && target.closest("dialog[open], [role='dialog']")) return true;
  return false;
}

// What an arrow-key event should do, or null to leave it alone.
export function navigationFor(event, pageSize) {
  if (!event || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return null;
  const move = NAVIGATION_KEYS[event.key];
  if (!move) return null;
  if (isTypingTarget(event.target)) return null;
  return { move, pageSize };
}

// ---- scrolling -------------------------------------------------------------------------------------------------------

// The scrollTop that puts an item fully inside a scrolling list with the least movement, or the current one when it
// is already inside. All numbers are pixels in the list's own scroll space.
export function scrollTopToReveal(scrollTop, viewHeight, itemTop, itemHeight) {
  if (itemTop < scrollTop) return itemTop;
  if (itemTop + itemHeight > scrollTop + viewHeight) return Math.max(0, itemTop + itemHeight - viewHeight);
  return scrollTop;
}
