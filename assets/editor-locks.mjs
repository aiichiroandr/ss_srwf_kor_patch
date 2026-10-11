// Structural unit abilities: the ones that a unit must carry as the game's data has them. The editor does not add them to
// a unit, remove them, change their condition flag, move them to another slot or hide them behind an empty slot.
//
// This is a safety POLICY of the editor, not a statement about what the game does with these ids. It is kept in one
// constant so that it is easy to adjust: every check below (the writer, the row fields, the view) reads this list.
// The ids are the same in both games; only the name tables differ.
export const LOCKED_UNIT_ABILITY_IDS = Object.freeze([11, 12, 13, 15, 16, 17, 18]);
export const UNIT_ABILITY_SLOT_COUNT = 4;
export const UNIT_ABILITY_LOCK_REASON = "게임 구조와 묶인 능력이라 안전을 위해 편집을 막았습니다";

const LOCKED = new Set(LOCKED_UNIT_ABILITY_IDS);

// Only a whole number of the list is an id; "17", 17.5 and 17n are not (a Set matches by identity of value).
export function isLockedUnitAbility(id) {
  return LOCKED.has(id);
}

// A unit holds four (ability id, condition flag number) pairs; every function here takes them as an array of
// UNIT_ABILITY_SLOT_COUNT entries { id, aux } in slot order (index 0 is slot 1 of the unit table).
const isEmptyPair = (pair) => pair.id === 0 && pair.aux === 0;

// The list the game builds from the four pairs ends at the first pair from slot 2 on that is (0, 0): slot 1 may be empty
// and the list goes on, but an empty slot 2, 3 or 4 hides every slot behind it. `reached[slot]` says whether the slot is
// read at all.
export function reachedUnitAbilitySlots(pairs) {
  const reached = [];
  let open = true;
  for (let slot = 0; slot < UNIT_ABILITY_SLOT_COUNT; slot += 1) {
    if (slot > 0 && isEmptyPair(pairs[slot])) open = false;
    reached.push(open);
  }
  return reached;
}

// The first reason an edit of one unit may not be applied, or null. `before` is the unit as stored, `after` the four
// pairs that the edit would leave. The locked ability of a unit stays where it is: in its slot, with its id and its
// condition flag, and it stays read. Everything is judged against the stored pairs, so a unit that an earlier editor
// changed is held exactly as it is now. A locked ability that the stored pairs already hide is not made worse, and an
// edit that makes it read again is not refused.
//   { cause: "changed", slot, field, abilityId }  a locked slot got another id or another condition flag number
//   { cause: "added", slot, field, abilityId }    a slot that held no locked ability now holds one
//   { cause: "hidden", slot, field, abilityId }   a locked slot is no longer reached (`slot`/`field` name the empty slot
//                                                 that ends the list in front of it)
// `slot` is 0-based like the slots of abilityLocks; `field` is the unit field of the edit that is refused.
export function findUnitAbilityLockViolation(before, after) {
  for (let slot = 0; slot < UNIT_ABILITY_SLOT_COUNT; slot += 1) {
    const stored = before[slot];
    const next = after[slot];
    if (isLockedUnitAbility(stored.id)) {
      if (next.id !== stored.id) return { cause: "changed", slot, field: `ability${slot + 1}`, abilityId: stored.id };
      if (next.aux !== stored.aux) return { cause: "changed", slot, field: `abilityValue${slot + 1}`, abilityId: stored.id };
    } else if (isLockedUnitAbility(next.id)) {
      return { cause: "added", slot, field: `ability${slot + 1}`, abilityId: next.id };
    }
  }
  const readBefore = reachedUnitAbilitySlots(before);
  const readAfter = reachedUnitAbilitySlots(after);
  for (let slot = 0; slot < UNIT_ABILITY_SLOT_COUNT; slot += 1) {
    if (!isLockedUnitAbility(before[slot].id) || !readBefore[slot] || readAfter[slot]) continue;
    // the first empty slot from slot 2 on ends the list (there is one in front of this slot, or it would be read); it was
    // read before, so one of its two fields was changed
    const ending = after.findIndex((pair, index) => index > 0 && isEmptyPair(pair));
    const field = before[ending].id !== after[ending].id ? `ability${ending + 1}` : `abilityValue${ending + 1}`;
    return { cause: "hidden", slot: ending, field, abilityId: before[slot].id };
  }
  return null;
}

// The layout of the locked abilities in the original game data, kept as a lookup: `ids` are the ability ids the census
// covers, `entries` maps a unit number to its sorted "slot:id:aux" entries for those ids (a unit that is not listed
// carries none of them). `groups` is [[id, slot, aux, [unit numbers]]]. See editor-lock-layout.mjs.
export function createLockLayout(ids, groups) {
  const byUnit = new Map();
  for (const [id, slot, aux, units] of groups) {
    for (const unit of units) {
      if (!byUnit.has(unit)) byUnit.set(unit, []);
      byUnit.get(unit).push(`${slot}:${id}:${aux}`);
    }
  }
  const entries = new Map([...byUnit].map(([unit, list]) => [unit, list.sort().join(",")]));
  return Object.freeze({ ids: Object.freeze([...ids]), entries });
}

const NO_ISSUES = Object.freeze([]);

// The lock facts of one stored unit: the slots that hold a locked ability now (0..3, with their ids), the reason text and
// whether the stored pairs are what the lock would not have produced. `tampered` is true when
//   hidden                  a locked ability sits behind an empty slot 2, 3 or 4, where the game's list never reaches it
//   duplicate               one locked id is held twice
//   differs-from-original   a layout is given and the unit's locked abilities (those of the census ids) are not the ones
//                           the layout lists for this unit number: one is missing, extra, in another slot or has
//                           another condition flag number
// Without a layout only the first two can be found: the editor has no copy of the original data to compare with.
// Opening such a unit is allowed; only editing its locked slots is refused (findUnitAbilityLockViolation).
export function unitAbilityLocks(pairs, unitNumber = null, layout = null) {
  const slots = [];
  const ids = [];
  const reached = reachedUnitAbilitySlots(pairs);
  const issues = [];
  pairs.forEach((pair, slot) => {
    if (!isLockedUnitAbility(pair.id)) return;
    slots.push(slot);
    ids.push(pair.id);
    if (!reached[slot] && !issues.includes("hidden")) issues.push("hidden");
  });
  if (new Set(ids).size !== ids.length) issues.push("duplicate");
  if (layout !== null && unitNumber !== null) {
    const census = new Set(layout.ids);
    const held = [];
    // in slot order, which is the sorted order of the entries since a slot is one digit
    pairs.forEach((pair, slot) => { if (census.has(pair.id)) held.push(`${slot}:${pair.id}:${pair.aux}`); });
    if (held.join(",") !== (layout.entries.get(unitNumber) ?? "")) issues.push("differs-from-original");
  }
  return Object.freeze({
    slots: Object.freeze(slots),
    ids: Object.freeze(ids),
    reason: UNIT_ABILITY_LOCK_REASON,
    tampered: issues.length > 0,
    issues: issues.length > 0 ? Object.freeze(issues) : NO_ISSUES,
  });
}
