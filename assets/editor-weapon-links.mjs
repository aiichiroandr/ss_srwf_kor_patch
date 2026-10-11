// Unit <-> weapon linkage. Pure functions over the decoded unit table: no DOM, no game bytes, no imports.
//
// A unit record (TSR root segment 27) is NOT a fixed 48-byte record. After the fixed numeric head it carries a
// variable-length weapon list:
//
//   +46        n, the number of weapon entries (0..16)
//   +47        m, the number of distinct non-zero ammo-storage slots among the entries (advisory)
//   +48 + 4j   entry j (j < n): e0 e1 e2 e3
//   +48 + 4n   00 00 terminator, so the whole record is 50 + 4n bytes
//
// entry bytes:  e0 bit 7        the weapon is usable only while a story flag is set (flag number = e3)
//               e0 bits 6..3    slot - 1 (0..15), the weapon-upgrade storage number
//               weapon index    ((e0 & 7) << 8) | e1, an 11-bit index into the weapon record table (the same number as
//                               the weapon row's recordIndex; table index 0 is an alias of 1 and is never referenced)
//               e2 bits 5..0    ammo storage slot (0 = the weapon has no ammo counter)
//               e2 bit 7        needs an additional investment before the weapon can be used
//               e3              flag number when e0 bit 7 is set
//
// Evidence and the open questions (which order the game lists the weapons in, what each flag number means) are in
// docs/EDITOR_FACTS.md, section "unit weapon lists". This module lists the entries in the STORED order and exposes the
// slot numbers; it makes no claim about the order a game screen uses.
//
// The reader fails closed. A list is "known" only when the declared count, the 00 00 terminator and the record length
// all agree and every weapon index points into the weapon table. Otherwise the list is "unknown": `entries` stays
// empty, the problems are named, and the best-effort parse is kept in `rawEntries` for diagnostics only.
//
// One disagreement is shown instead of hidden: when the declared count is the ONLY thing that differs (the terminator,
// the record length and every weapon index agree with the entries before the terminator), the list is "inconsistent".
// `entries` then holds the entries before the terminator, `problems` is ["count-mismatch"], and `declaredCount` and
// `terminatedCount` give both numbers, so a screen can show the weapons with a caution. Which of the two the game
// follows is not known, so an inconsistent list is never "known". Neither an unknown nor an inconsistent list makes its
// unit the owner of a weapon (the weapons stay "unverified").

export const UNIT_WEAPON_ENTRIES_OFFSET = 48;
export const UNIT_WEAPON_MIN_RECORD_BYTES = 50;
export const UNIT_WEAPON_MAX_ENTRIES = 16;
export const UNIT_WEAPON_ENTRY_BYTES = 4;

// What is not established: the order in which the game shows a unit's weapons (stored entry order or slot order).
export const UNIT_WEAPON_LIST_ORDER = Object.freeze({
  entries: "stored-entry-order",
  slotNumbers: "exposed-as-stored",
  gameDisplayOrder: "unknown",
});

const freezeAll = (items) => Object.freeze(items.map((item) => Object.freeze(item)));

function readEntry(data, offset, entryIndex, weaponTableLength) {
  const e0 = data[offset];
  const e1 = data[offset + 1];
  const e2 = data[offset + 2];
  const e3 = data[offset + 3];
  const weaponIndex = ((e0 & 7) << 8) | e1;
  const requiresFlag = (e0 & 0x80) !== 0;
  return {
    entryIndex,
    slot: ((e0 >>> 3) & 15) + 1,
    weaponIndex,
    ammoSlot: e2 & 0x3f,
    requiresFlag,
    flagNumber: requiresFlag ? e3 : null,
    requiresInvestment: (e2 & 0x80) !== 0,
    valid: weaponIndex >= 1 && weaponIndex < weaponTableLength,
    raw: Object.freeze([e0, e1, e2, e3]),
  };
}

// The list of a unit when there is no usable weapon table to check the indices against.
export function unavailableWeaponList(recordLength = 0) {
  return Object.freeze({
    recordLength,
    declaredCount: null,
    declaredAmmoSlots: null,
    terminatedCount: null,
    expectedLength: null,
    entries: Object.freeze([]),
    rawEntries: Object.freeze([]),
    placeholder: false,
    notes: Object.freeze([]),
    order: UNIT_WEAPON_LIST_ORDER,
    status: "unknown",
    problems: Object.freeze(["no-weapon-table"]),
  });
}

// One unit record: data.subarray(start, end) where `end` is the start of the next unique record (or the table end).
// `weaponTableLength` is the number of pointer cells of the weapon table; valid weapon indices are 1..length-1.
export function weaponsOfUnit(data, start, end, weaponTableLength) {
  if (!(data instanceof Uint8Array) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)
    || start < 0 || end < start || end > data.length) {
    throw new TypeError("weaponsOfUnit needs a byte array and a record range inside it");
  }
  if (!Number.isSafeInteger(weaponTableLength) || weaponTableLength < 2) {
    throw new TypeError("weaponsOfUnit needs the weapon table length (at least 2 cells)");
  }
  const recordLength = end - start;
  const problems = [];
  const base = {
    recordLength,
    declaredCount: null,
    declaredAmmoSlots: null,
    terminatedCount: null,
    expectedLength: null,
    entries: Object.freeze([]),
    rawEntries: Object.freeze([]),
    placeholder: false,
    notes: Object.freeze([]),
    order: UNIT_WEAPON_LIST_ORDER,
  };
  const unknown = (extra = {}) => Object.freeze({ ...base, ...extra, status: "unknown", problems: Object.freeze(problems.slice()) });
  if (recordLength < UNIT_WEAPON_MIN_RECORD_BYTES) {
    problems.push("record-too-short");
    return unknown();
  }
  const declaredCount = data[start + 46];
  const declaredAmmoSlots = data[start + 47];
  if (declaredCount > UNIT_WEAPON_MAX_ENTRIES) problems.push("count-out-of-range");

  // The terminator decides where the list ends (the reference viewer reads it the same way); the declared count and the
  // record length must agree with it, otherwise the list is not trusted.
  const parsed = [];
  let terminated = false;
  for (let index = 0; index <= UNIT_WEAPON_MAX_ENTRIES; index += 1) {
    const offset = start + UNIT_WEAPON_ENTRIES_OFFSET + index * UNIT_WEAPON_ENTRY_BYTES;
    if (offset + 2 > end) break;
    if (data[offset] === 0 && data[offset + 1] === 0) { terminated = true; break; }
    if (index === UNIT_WEAPON_MAX_ENTRIES || offset + UNIT_WEAPON_ENTRY_BYTES > end) break;
    parsed.push(readEntry(data, offset, index, weaponTableLength));
  }
  const terminatedCount = terminated ? parsed.length : null;
  if (!terminated) problems.push("unterminated");
  else if (terminatedCount !== declaredCount) problems.push("count-mismatch");
  if (terminated && recordLength !== UNIT_WEAPON_MIN_RECORD_BYTES + UNIT_WEAPON_ENTRY_BYTES * terminatedCount) {
    problems.push("length-mismatch");
  }
  if (parsed.some((entry) => !entry.valid)) problems.push("index-out-of-range");

  const rawEntries = freezeAll(parsed);
  const common = {
    declaredCount,
    declaredAmmoSlots,
    terminatedCount,
    expectedLength: UNIT_WEAPON_MIN_RECORD_BYTES + UNIT_WEAPON_ENTRY_BYTES * declaredCount,
    rawEntries,
  };
  const countOnly = problems.length === 1 && problems[0] === "count-mismatch";
  if (problems.length > 0 && !countOnly) return unknown(common);

  const notes = [];
  const slots = parsed.map((entry) => entry.slot);
  if (new Set(slots).size !== slots.length) notes.push("duplicate-slot");
  const ammoSlots = new Set(parsed.filter((entry) => entry.ammoSlot !== 0).map((entry) => entry.ammoSlot));
  if (ammoSlots.size !== declaredAmmoSlots) notes.push("ammo-slot-count");
  if (parsed.some((entry) => !entry.requiresFlag && entry.raw[3] !== 0)) notes.push("flag-byte-without-flag");
  // A sentinel filler: the only entry is slot 1, weapon 1, no ammo, no flag, no investment. It does not own weapon 1.
  const placeholder = !countOnly && parsed.length === 1 && parsed[0].slot === 1 && parsed[0].weaponIndex === 1
    && parsed[0].ammoSlot === 0 && !parsed[0].requiresFlag && !parsed[0].requiresInvestment;
  return Object.freeze({
    ...base,
    ...common,
    status: countOnly ? "inconsistent" : "known",
    problems: Object.freeze(problems.slice()),
    entries: rawEntries,
    placeholder,
    notes: Object.freeze(notes),
  });
}

// Reverse index over every unit. `units` is a list of { recordIndex, name?, weaponList } (the unit rows).
// Returns { owners: Map(weaponIndex -> owner[]), unverified: Map(weaponIndex -> unit record indices) } where
//   owners      one owner per entry of every KNOWN, non-placeholder list: { unit, unitName, slot, entryIndex, ammoSlot,
//               requiresFlag, flagNumber, requiresInvestment }, in unit order and then entry order
//   unverified  units whose list is unknown or inconsistent but whose entries mention the weapon; they are not owners
export function unitsOfWeapon(units) {
  const owners = new Map();
  const unverified = new Map();
  for (const unit of units) {
    const list = unit.weaponList;
    if (!list) continue;
    if (list.status === "known") {
      if (list.placeholder) continue;
      for (const entry of list.entries) {
        if (!owners.has(entry.weaponIndex)) owners.set(entry.weaponIndex, []);
        owners.get(entry.weaponIndex).push(Object.freeze({
          unit: unit.recordIndex,
          unitName: unit.name ?? "",
          slot: entry.slot,
          entryIndex: entry.entryIndex,
          ammoSlot: entry.ammoSlot,
          requiresFlag: entry.requiresFlag,
          flagNumber: entry.flagNumber,
          requiresInvestment: entry.requiresInvestment,
        }));
      }
    } else {
      for (const entry of list.rawEntries) {
        if (!entry.valid) continue;
        const units = unverified.get(entry.weaponIndex) ?? [];
        if (!units.includes(unit.recordIndex)) units.push(unit.recordIndex);
        unverified.set(entry.weaponIndex, units);
      }
    }
  }
  return { owners, unverified };
}

// What a weapon row carries: owners, distinct owner units and names (for searching), and an honest ownership state.
//   owned       at least one known owner
//   unowned     no known owner and no unit with an unknown list mentions it
//   unverified  no known owner, but a unit whose list could not be trusted mentions it
export function weaponOwnership(index, linkage) {
  const owners = linkage.owners.get(index) ?? [];
  const unverifiedOwnerUnits = linkage.unverified.get(index) ?? [];
  const ownerUnits = [...new Set(owners.map((owner) => owner.unit))];
  const ownerNames = [...new Set(owners.map((owner) => owner.unitName).filter((name) => name !== ""))];
  const ownership = owners.length > 0 ? "owned" : unverifiedOwnerUnits.length > 0 ? "unverified" : "unowned";
  return Object.freeze({
    owners: Object.freeze(owners),
    ownerUnits: Object.freeze(ownerUnits),
    ownerCount: ownerUnits.length,
    ownerNames: Object.freeze(ownerNames),
    ownership,
    unverifiedOwnerUnits: Object.freeze(unverifiedOwnerUnits.slice()),
  });
}
