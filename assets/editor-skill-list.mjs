// The pilot skill list as the editor dialog works with it, and the six spirit command slots of the pilot page: what a row
// allows, what adding, removing and changing do to the lists, and why something is refused. Pure functions over plain
// data: no DOM, no game text.
//
// A pilot row carries (stream data core, see docs/LOCAL_EDITOR.md "파일럿 특수능력 추가·삭제"):
//   skillEditable, skillEditReason   whether the whole list may be rewritten, and a code when it may not
//   skillCapacity                    how many (id, level) pairs fit into the record's own footprint
//   specialAbilities                 the list now: { id, level, name, eventFlag?, familyId?, rank?, unresolved?, ... }
//   addableSkills                    every id the game builds minus the ones already held: { id, name, familyId, rank, unresolved }
//   skillConsumerLimit               how many distinct slot consumers a pilot may use (4)
// Every row of the core carries them. A row that does not (nothing the core produces) is treated as locked: its list is shown
// and nothing in it can change, because the page cannot know what the writer would accept.
//
// The writer refuses (and the dialog therefore never offers): a list longer than the capacity, more than the limit of
// distinct slot consumers (a ladder family counts once, every other skill once each), a repeated id, a new or changed
// level outside 1..99, and any change of a level-100-and-up entry other than keeping or deleting it.
import { PILOT_LADDER_FAMILIES, pilotSkillFamily, pilotSkillLevel } from "./editor-facts.mjs?v=20261011-public8";

export const SKILL_LEVEL_MIN = 1;
export const SKILL_LEVEL_MAX = 99;
export const DEFAULT_CONSUMER_LIMIT = 4;

export function hasSkillEditing(row) {
  return Boolean(row) && typeof row.skillEditable === "boolean";
}

// The slot a skill takes: its ladder family, or its own id when it stands alone (the same key the writer counts).
export function consumerKey(gameId, id) {
  return pilotSkillFamily(gameId, id) ?? `id-${id}`;
}

export function countConsumers(gameId, list) {
  return new Set(list.map((entry) => consumerKey(gameId, entry.id))).size;
}

// An event-flag entry (level 100 and up) is kept or deleted as it is, never created or changed.
export function isFlagGated(entry) {
  return Number.isSafeInteger(entry.eventFlag) || entry.level > SKILL_LEVEL_MAX;
}

export function isValidLevel(level) {
  return Number.isInteger(level) && level >= SKILL_LEVEL_MIN && level <= SKILL_LEVEL_MAX;
}

// Every skill the dialog may offer for one row: what can still be added plus what the pilot already holds, by id.
export function skillCatalog(row) {
  // a prepared row keeps the catalog it had when it was opened, so a deleted skill can be chosen again
  if (Array.isArray(row.skillChoices)) return row.skillChoices;
  const byId = new Map();
  for (const entry of row.addableSkills ?? []) byId.set(entry.id, entry);
  for (const entry of row.specialAbilities ?? []) {
    if (!byId.has(entry.id)) {
      byId.set(entry.id, {
        id: entry.id, name: entry.name ?? "", familyId: entry.familyId ?? null, rank: entry.rank ?? null, unresolved: Boolean(entry.unresolved),
      });
    }
  }
  return [...byId.values()].sort((left, right) => left.id - right.id);
}

// What the dialog says about capacity and slot consumers for the list as it is now. A row that carries the shared room
// (`pairCapacity` and its own spirit list) reserves all six spirit slots for new skills, even when a spirit was deleted.
// The physical capacity still describes existing entries, so a short original spirit block does not lock their edits.
export function skillSummary(row, gameId, list = row.specialAbilities ?? []) {
  const supported = hasSkillEditing(row);
  const shared = supported && isSharedRoom(row);
  const expansionPairs = shared && Number.isSafeInteger(row.skillExpansionPairs)
    ? row.skillExpansionPairs : 0;
  const reservedSpiritCount = shared ? Math.max(SPIRIT_SLOTS, row.spirits.length) : null;
  const capacity = shared
    ? Math.max(0, row.pairCapacity + Math.max(0, expansionPairs) - row.spirits.length - extraPairCount(row))
    : supported && Number.isSafeInteger(row.skillCapacity) ? row.skillCapacity : list.length;
  const limit = Number.isSafeInteger(row.skillConsumerLimit) ? row.skillConsumerLimit : DEFAULT_CONSUMER_LIMIT;
  return Object.freeze({
    supported,
    shared,
    editable: supported && row.skillEditable === true,
    reason: supported ? row.skillEditReason ?? null : "unsupported",
    capacity,
    reservedSpiritCount,
    count: list.length,
    free: Math.max(0, shared
      ? row.pairCapacity + expansionPairs - reservedSpiritCount - extraPairCount(row) - list.length
      : capacity - list.length),
    consumers: countConsumers(gameId, list),
    limit,
  });
}

const expansionBaselines = new WeakMap();

// Account for every pending pilot edit against the inspector's shared padding pool. Capture the inspected facts once:
// recalculating after an undo must not treat a previously reduced budget as a fresh baseline. Negative external room is
// retained as debt when another pilot has consumed this record's own padding; clamping it would spend that padding twice.
export function syncPilotExpansionBudget(rows, baselineRows = null) {
  const groups = new Map();
  for (const [index, row] of (rows ?? []).entries()) {
    if (!row || !isSharedRoom(row) || !Array.isArray(row.specialAbilities)) continue;
    let baseline = expansionBaselines.get(row) ?? expansionBaselines.get(baselineRows?.[index]);
    if (baseline) expansionBaselines.set(row, baseline);
    if (!baseline) {
      const group = row.pilotExpansionGroup;
      const pool = row.pilotExpansionPairs;
      const sharedFree = row.sharedPilotPairFree;
      const external = row.skillExpansionPairs;
      if ((typeof group !== "string" && !Number.isSafeInteger(group)) || group === ""
        || !Number.isSafeInteger(pool) || pool < 0 || !Number.isSafeInteger(sharedFree) || sharedFree < 0
        || !Number.isSafeInteger(external) || external < 0) continue;
      const ownFree = sharedFree - external;
      if (pool !== sharedFree || ownFree < 0 || ownFree > row.pairCapacity) continue;
      baseline = Object.freeze({
        group, pool, external, protectedPairs: row.pairCapacity - ownFree,
        skillCount: (row.originalSkillEntries ?? row.specialAbilities).length,
        spiritCount: Math.max((row.original?.spirits ?? row.spirits).length,
          Number.isSafeInteger(row.pilotSpiritReserve) && row.pilotSpiritReserve >= 0 ? row.pilotSpiritReserve : 0),
      });
      expansionBaselines.set(row, baseline);
    }
    const required = requiredPilotPairs(row, row.specialAbilities.length, row.spirits.length, baseline.skillCount, baseline.spiritCount);
    const spent = required - baseline.protectedPairs;
    if (!groups.has(baseline.group)) groups.set(baseline.group, []);
    groups.get(baseline.group).push({ row, baseline, spent });
  }
  for (const entries of groups.values()) {
    const spent = entries.reduce((sum, entry) => sum + entry.spent, 0);
    const pool = entries[0].baseline.pool;
    const consistent = entries.every((entry) => entry.baseline.pool === pool);
    for (const entry of entries) {
      entry.row.skillExpansionPairs = consistent
        ? entry.baseline.external - (spent - entry.spent)
        : -entry.row.pairCapacity;
    }
  }
  return rows;
}

function requiredPilotPairs(row, skills, spirits, originalSkills, originalSpirits) {
  const extra = extraPairCount(row);
  const actual = spirits + extra + skills;
  const protectedSpirits = Math.max(originalSpirits, spirits, skills > 0 ? SPIRIT_SLOTS : 0);
  return skills > originalSkills
    ? Math.max(SPIRIT_SLOTS, spirits) + extra + skills
    : Math.max(actual, Math.min(row.pairCapacity, protectedSpirits + extra + skills));
}

// The same reservation cost used by the shared budget and preset transaction validation. An existing short original
// remains editable, while a new learning entry must leave room for all six spirits. Canonical reserves survive reopen.
export function pilotPairRequirement(row, skills = row.specialAbilities ?? [], spirits = row.spirits ?? []) {
  const originalSkills = (row.originalSkillEntries ?? row.specialAbilities ?? []).length;
  const originalSpirits = Math.max((row.original?.spirits ?? row.spirits ?? []).length,
    Number.isSafeInteger(row.pilotSpiritReserve) && row.pilotSpiritReserve >= 0 ? row.pilotSpiritReserve : 0);
  return requiredPilotPairs(row, skills.length, spirits.length, originalSkills, originalSpirits);
}

// The catalog without what is already in `list`: the choices of the add box.
export function availableSkills(row, list = row.specialAbilities ?? []) {
  const held = new Set(list.map((entry) => entry.id));
  return skillCatalog(row).filter((entry) => !held.has(entry.id));
}

// Only the five verified ladders are grouped as one named ability. Other ids remain individual choices, including F's
// unused specific-support ids: sharing a runtime consumer key does not make them an editable rank ladder.
function skillGroupInfo(gameId, entry) {
  const familyId = pilotSkillFamily(gameId, entry.id);
  const ranked = PILOT_LADDER_FAMILIES.includes(familyId);
  const rank = ranked ? pilotSkillLevel(gameId, entry.id) : null;
  const name = String(entry.name ?? "").normalize("NFKC").trim();
  return {
    key: ranked ? `family-${familyId}` : `id-${entry.id}`,
    familyId,
    ranked,
    rank,
    name: ranked ? name.replace(/\s*(?:lv\.?|l|레벨)\s*[1-9]\s*$/i, "").trim() : name,
  };
}

// The held growth entries, grouped for display only. `index` always refers to the unsorted list in hand, so choosing a
// rank or acquisition level in a visually grouped row edits the correct stored pair even when other skills separate it.
export function skillGroups(gameId, list) {
  const groups = new Map();
  list.forEach((entry, index) => {
    const { rank, ...info } = skillGroupInfo(gameId, entry);
    if (!groups.has(info.key)) groups.set(info.key, { ...info, entries: [] });
    const group = groups.get(info.key);
    if (!group.name && info.name) group.name = info.name;
    group.entries.push({ entry, index, rank });
  });
  for (const group of groups.values()) {
    if (group.ranked) group.entries.sort((left, right) => left.rank - right.rank || left.index - right.index);
  }
  return [...groups.values()];
}

// A family selector plus its remaining rank choices. Adding excludes every held id; replacing includes the selected
// pair's own id but still excludes ids another pair uses. Empty families are omitted rather than offering a duplicate.
export function groupedSkillCatalog(row, gameId, list = row.specialAbilities ?? [], { excludeIndex = null } = {}) {
  const held = new Set(list.filter((_, index) => index !== excludeIndex).map((entry) => entry.id));
  const groups = new Map();
  for (const choice of skillCatalog(row)) {
    if (held.has(choice.id)) continue;
    const { rank, ...info } = skillGroupInfo(gameId, choice);
    if (!groups.has(info.key)) groups.set(info.key, { ...info, choices: [] });
    const group = groups.get(info.key);
    if (!group.name && info.name) group.name = info.name;
    group.choices.push({ ...choice, rank });
  }
  for (const group of groups.values()) group.choices.sort((left, right) => left.id - right.id);
  return [...groups.values()];
}

// Within a ladder family the game registers skills in list order and a lower rank behind a higher one does not replace
// it, so every ladder is kept in ascending rank. Entries keep the positions their ladder already holds; only the
// entries of one ladder trade places. Other skills stay where they are. Ranks follow the ids (nine consecutive ids). The
// ladders are the facts table's own (the writer sorts the same ones), and a test pins the two orders to each other.
export function orderLadders(gameId, list) {
  const result = list.slice();
  const positions = new Map();
  list.forEach((entry, index) => {
    const family = pilotSkillFamily(gameId, entry.id);
    if (family === null || !PILOT_LADDER_FAMILIES.includes(family)) return;
    if (!positions.has(family)) positions.set(family, []);
    positions.get(family).push(index);
  });
  for (const indices of positions.values()) {
    if (indices.length < 2) continue;
    const sorted = indices.map((index) => list[index]).sort((left, right) => left.id - right.id);
    indices.forEach((position, order) => { result[position] = sorted[order]; });
  }
  return result;
}

// Why adding `id` at `level` is not possible right now, or null when it is. The code names the cause.
export function addBlock(row, gameId, id, level, list = row.specialAbilities ?? []) {
  const summary = skillSummary(row, gameId, list);
  if (!summary.editable) return "read-only";
  if (!Number.isInteger(id)) return "no-choice";
  if (list.some((entry) => entry.id === id)) return "held";
  if (!isValidLevel(level)) return "level";
  if (summary.free <= 0) return "capacity";
  if (summary.consumers >= summary.limit && !list.some((entry) => consumerKey(gameId, entry.id) === consumerKey(gameId, id))) return "consumers";
  return null;
}

export function addSkill(row, gameId, id, level, list = row.specialAbilities ?? []) {
  const choice = skillCatalog(row).find((entry) => entry.id === id);
  const entry = {
    id, level, name: choice?.name ?? "", familyId: choice?.familyId ?? null, rank: choice?.rank ?? null, unresolved: Boolean(choice?.unresolved),
  };
  return orderLadders(gameId, [...list, entry]);
}

// Adding keeps every existing spirit and ability. Retain this compatibility export for stale callers without offering
// any entry as disposable storage. Replacement and deletion have their own explicit operations.
export function skillRoomChoices() {
  return [];
}

// Plan a new skill without removing any existing entry. Refuse stale room-trading requests, including ones sent directly
// with real room available. Every refusal returns the original arrays; successful plans keep the spirit list unchanged.
export function planSkillAdd(row, gameId, { id, level, freePair = null } = {}) {
  const skills = Array.isArray(row?.specialAbilities) ? row.specialAbilities : [];
  const spirits = Array.isArray(row?.spirits) ? row.spirits : [];
  const refused = (block) => ({ block, skills, spirits, removed: null });
  if (!row || !Array.isArray(row.specialAbilities) || !skillSummary(row, gameId, skills).editable) return refused("read-only");
  if (!Number.isInteger(id) || !skillCatalog(row).some((choice) => choice.id === id)) return refused("no-choice");
  if (!isValidLevel(level)) return refused("level");
  if (freePair !== null) return refused("invalid-removal");
  const summary = skillSummary(row, gameId, skills);
  const block = addBlock(row, gameId, id, level, skills);
  if (block !== null) return refused(block);
  const added = addSkill(row, gameId, id, level, skills);
  if (countConsumers(gameId, added) > summary.limit) return refused("consumers");
  return { block: null, skills: added, spirits, removed: null };
}

// Replacing a learning entry needs no free pair, but its new id must still belong to this row's catalog and leave no
// duplicate or fifth active ability family. An event-gated pair stays untouched; an odd stored level may be kept for
// the same id, but is not copied to a newly selected id because the writer accepts new pairs only at levels 1..99.
export function skillReplaceBlock(row, gameId, index, id, list = row.specialAbilities ?? []) {
  const summary = skillSummary(row, gameId, list);
  if (!summary.editable) return "read-only";
  if (!Number.isInteger(index) || !list[index]) return "missing";
  const entry = list[index];
  if (isFlagGated(entry)) return "event-gated";
  if (!Number.isInteger(id) || !skillCatalog(row).some((choice) => choice.id === id)) return "no-choice";
  if (entry.id === id) return null;
  if (list.some((candidate, position) => position !== index && candidate.id === id)) return "held";
  if (!isValidLevel(entry.level)) return "level";
  if (summary.count > summary.capacity) return "capacity";
  const next = list.map((candidate, position) => position === index ? { ...candidate, id } : candidate);
  if (countConsumers(gameId, next) > summary.limit) return "consumers";
  return null;
}

export function replaceSkill(row, gameId, index, id, list = row.specialAbilities ?? []) {
  if (skillReplaceBlock(row, gameId, index, id, list) !== null || list[index].id === id) return list;
  const choice = skillCatalog(row).find((candidate) => candidate.id === id);
  const entry = {
    id, level: list[index].level, name: choice.name ?? "", familyId: pilotSkillFamily(gameId, id),
    rank: pilotSkillLevel(gameId, id), unresolved: Boolean(choice.unresolved), eventFlag: null,
  };
  return orderLadders(gameId, list.map((candidate, position) => position === index ? entry : candidate));
}

// Deleting leaves the other entries in order. An event-flag entry is locked: the dialog neither changes nor deletes it
// (the writer would allow the deletion, but a flag condition is not something to drop by a stray click).
export function removeSkill(list, index) {
  if (!Number.isInteger(index) || index < 0 || index >= list.length || isFlagGated(list[index])) return list;
  return [...list.slice(0, index), ...list.slice(index + 1)];
}

// A level change: the entry's level only (never the id). An event-flag entry cannot change. A new level must be 1..99;
// the level an entry had when the record was opened (`original`, its id and level) is always allowed, so an odd stored
// level can be put back.
export function setLevel(list, index, level, original = []) {
  if (!Number.isInteger(index) || index < 0 || index >= list.length) return list;
  const entry = list[index];
  if (isFlagGated(entry) || !Number.isInteger(level)) return list;
  const stored = original.find((candidate) => candidate.id === entry.id);
  if (!isValidLevel(level) && !(stored && stored.level === level)) return list;
  if (entry.level === level) return list;
  return list.map((candidate, position) => (position === index ? { ...candidate, level } : candidate));
}

export function sameList(left, right) {
  return left.length === right.length && left.every((entry, index) => entry.id === right[index].id && entry.level === right[index].level);
}

// The request carries the whole wanted list in order: ids and levels only.
export function skillRequest(list) {
  return list.map(({ id, level }) => ({ id, level }));
}

// What differs from the list the record had when it was opened: ids added, ids removed, levels changed.
export function skillDiff(current, original) {
  const before = new Map(original.map((entry) => [entry.id, entry]));
  const after = new Map(current.map((entry) => [entry.id, entry]));
  const added = current.filter((entry) => !before.has(entry.id)).map((entry) => entry.id);
  const removed = original.filter((entry) => !after.has(entry.id)).map((entry) => entry.id);
  const changed = current.filter((entry) => before.has(entry.id) && before.get(entry.id).level !== entry.level).map((entry) => entry.id);
  return Object.freeze({ added, removed, changed });
}

// ---- spirit commands ---------------------------------------------------------------------------------------------------
// A pilot row of the core also carries (docs/LOCAL_EDITOR.md "정신커맨드 편집"):
//   spirits                          the six slots as stored: { id, level, name, eventFlag, unresolved }
//   spiritEditable, spiritEditReason whether the slots may be rewritten, and a code when they may not
//   spiritMinimum, spiritMinimumReason the fewest slots an edit may leave (null when the slots cannot change)
//   addableSpirits                   the named spirit commands minus the ones the pilot holds: { id, name, unresolved }
//   pairCapacity                     the pairs the record holds in all; spirit commands and skills share them
// The writer refuses what these functions never produce: more than six slots, an id outside 1..30 or twice (more often than
// the record already has it), a new level outside 1..99, fewer slots than the minimum, a list that does not fit the shared
// room, and any change, removal or move of an entry whose level is 100 or more (an event condition).

export const SPIRIT_SLOTS = 6;
export const SPIRIT_LEVEL_MIN = 1;
export const SPIRIT_LEVEL_MAX = 99;

export function hasSpiritEditing(row) {
  return Boolean(row) && typeof row.spiritEditable === "boolean" && Array.isArray(row.spirits);
}

function isSharedRoom(row) {
  return Number.isSafeInteger(row.pairCapacity) && Array.isArray(row.spirits);
}

function extraPairCount(row) {
  return Array.isArray(row.extraSpirits) ? row.extraSpirits.length : 0;
}

// An entry with an event condition (level 100 and up) stays in its slot as it is.
export function isSpiritLocked(entry) {
  return Boolean(entry) && (Number.isSafeInteger(entry.eventFlag) || entry.level > SPIRIT_LEVEL_MAX);
}

// The room the six slots and the skills share: pairs in all, pairs in use with these lists, pairs free. Null for a row
// without the core's pair facts.
export function pairRoom(row, spirits = row.spirits ?? [], skills = row.specialAbilities ?? []) {
  if (!isSharedRoom(row)) return null;
  const used = spirits.length + extraPairCount(row) + skills.length;
  const expansion = Number.isSafeInteger(row.skillExpansionPairs) ? row.skillExpansionPairs : 0;
  const available = row.pairCapacity + expansion;
  return Object.freeze({ capacity: Math.max(used, available), used, free: Math.max(0, available - used) });
}

export function spiritSummary(row, list = row.spirits ?? []) {
  const supported = hasSpiritEditing(row);
  const editable = supported && row.spiritEditable === true;
  const room = pairRoom(row, list);
  const minimum = editable && Number.isSafeInteger(row.spiritMinimum) ? row.spiritMinimum : 0;
  return Object.freeze({
    supported,
    editable,
    reason: supported ? row.spiritEditReason ?? null : "unsupported",
    minimum,
    minimumReason: editable ? row.spiritMinimumReason ?? null : null,
    count: list.length,
    free: room ? room.free : 0,
    canAdd: editable && list.length < SPIRIT_SLOTS && Boolean(room) && room.free > 0,
  });
}

// Every spirit command the slots may hold for one row, by id: what can still be added plus what the pilot holds.
export function spiritCatalog(row) {
  if (Array.isArray(row.spiritChoices)) return row.spiritChoices;
  const byId = new Map();
  for (const entry of row.addableSpirits ?? []) byId.set(entry.id, entry);
  for (const entry of row.spirits ?? []) {
    if (!byId.has(entry.id)) byId.set(entry.id, { id: entry.id, name: entry.name ?? "", unresolved: Boolean(entry.unresolved) });
  }
  return [...byId.values()].sort((left, right) => left.id - right.id);
}

// The choices of slot `index` (or of the empty slot when `index` is the list length): the catalog without the ids that
// another slot holds. The slot's own id stays, so a record that already holds an id twice keeps showing it.
export function spiritOptions(row, list, index) {
  const others = new Set(list.filter((_, position) => position !== index).map((entry) => entry.id));
  const own = list[index]?.id;
  return spiritCatalog(row).filter((entry) => entry.id === own || !others.has(entry.id));
}

function namedEntry(row, id, level) {
  const choice = spiritCatalog(row).find((entry) => entry.id === id);
  return choice ? { id, level, name: choice.name ?? "", unresolved: Boolean(choice.unresolved), eventFlag: null } : null;
}

// The slot takes another spirit command at the same level. Returns the list unchanged when that is not allowed.
export function replaceSpirit(row, list, index, id) {
  const summary = spiritSummary(row, list);
  const entry = list[index];
  if (!summary.editable || !entry || isSpiritLocked(entry) || entry.id === id) return list;
  if (!spiritOptions(row, list, index).some((choice) => choice.id === id)) return list;
  const next = namedEntry(row, id, entry.level);
  return next ? list.map((candidate, position) => (position === index ? next : candidate)) : list;
}

// A level change of one slot: 1..99, or the level the same entry had when the record was opened.
export function setSpiritLevel(row, list, index, level, original = []) {
  const entry = list[index];
  if (!spiritSummary(row, list).editable || !entry || isSpiritLocked(entry) || !Number.isInteger(level) || entry.level === level) return list;
  const stored = original.some((candidate) => candidate.id === entry.id && candidate.level === level);
  if (!stored && (level < SPIRIT_LEVEL_MIN || level > SPIRIT_LEVEL_MAX)) return list;
  return list.map((candidate, position) => (position === index ? { ...candidate, level } : candidate));
}

// Why slot `index` cannot be deleted, or null. An entry with an event condition is locked, and so is every entry in front
// of one (deleting it would move the locked entry to another slot).
export function spiritRemoveBlock(row, list, index) {
  const summary = spiritSummary(row, list);
  if (!summary.editable) return "read-only";
  if (!list[index]) return "missing";
  if (isSpiritLocked(list[index]) || list.slice(index + 1).some(isSpiritLocked)) return "event-gated";
  if (list.length <= summary.minimum) return "minimum";
  return null;
}

export function removeSpirit(row, list, index) {
  if (spiritRemoveBlock(row, list, index) !== null) return list;
  return [...list.slice(0, index), ...list.slice(index + 1)];
}

// A new spirit command goes into the first empty slot, at level `level`.
export function addSpirit(row, list, id, level = SPIRIT_LEVEL_MIN) {
  if (!spiritSummary(row, list).canAdd || !Number.isInteger(level) || level < SPIRIT_LEVEL_MIN || level > SPIRIT_LEVEL_MAX) return list;
  if (!spiritOptions(row, list, list.length).some((choice) => choice.id === id)) return list;
  const entry = namedEntry(row, id, level);
  return entry ? [...list, entry] : list;
}

// The request carries the whole wanted list of the six slots in order: ids and levels only.
export function spiritRequest(list) {
  return list.map(({ id, level }) => ({ id, level }));
}

// How many changes the slots hold against the list the record had when it was opened: one per slot whose spirit command
// was replaced, added or deleted, and one per changed level. Only a new order of the same commands counts as one.
export function spiritChangeCount(current, original) {
  const count = (list) => list.reduce((map, entry) => map.set(entry.id, (map.get(entry.id) ?? 0) + 1), new Map());
  const before = count(original);
  const after = count(current);
  let added = 0;
  let removed = 0;
  for (const [id, number] of after) added += Math.max(0, number - (before.get(id) ?? 0));
  for (const [id, number] of before) removed += Math.max(0, number - (after.get(id) ?? 0));
  const levels = new Map(original.map((entry) => [entry.id, entry.level]));
  const changed = current.filter((entry) => levels.has(entry.id) && !original.some((stored) => stored.id === entry.id && stored.level === entry.level)).length;
  const counted = Math.max(added, removed) + changed;
  return counted === 0 && !sameList(current, original) ? 1 : counted;
}
