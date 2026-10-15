// TSR root 32: 48 selectors, each pointing to [part id, percent] pairs terminated by FF FF.
// The executable chooses one outcome when the unit is created, with the remainder yielding no part.
// Preserve selector aliases, pair count and terminators; this module never relocates a record.
import { ownData, readDenseList } from "./editor-own.mjs?v=20261015-stocknames2";
import { Sha256 } from "./sha256.mjs?v=20261015-stocknames2";

export const REWARD_FIELDS = Object.freeze(["part1", "chance1", "part2", "chance2"]);
export const REWARD_PART_MAX = 22;
export const REWARD_SELECTOR_COUNT = 48;

const displayName = value => typeof value === "string" ? value.replace(/\u3000/gu, " ").replace(/\s+/gu, " ").trim() : "";

// Display the stored, mutually exclusive outcomes, rather than the selector
// number or the pair's storage position. Zero-percent candidates stay visible
// so a saved configuration can still be selected and enabled again.
export function rewardOutcomeLabel(row, partName = () => "", { compact = false } = {}) {
  if (!row?.capacity) return "보상 없음";
  const outcomes = Array.from({ length: row.capacity }, (_, i) => {
    const slot = i + 1;
    const name = displayName(partName(row[`part${slot}`])) || "명칭 미확인 강화파츠";
    return { id: row[`part${slot}`], chance: row[`chance${slot}`], name, label: `${name} ${row[`chance${slot}`]}%` };
  });
  if (!compact) return outcomes.map(item => item.label).join(" / ");
  const first = outcomes[0];
  const firstChance = outcomes.filter(item => item.id === first.id).reduce((total, item) => total + item.chance, 0);
  const otherIds = new Set(outcomes.slice(1).map(item => item.id).filter(id => id !== first.id));
  return `${first.name} ${firstChance}%${otherIds.size ? ` 외 ${otherIds.size}종` : ""}`;
}

// A reward belongs to a scenario appearance, not to a unit's base stats. This
// is a list of inspected appearances currently pointing at the shared record;
// it does not claim to cover unparsed commands or all possible game routes.
export function rewardReferences(row, model = {}) {
  const aliases = new Set(row?.aliases ?? []);
  const deployments = model.deployments ?? model.rows?.("deployment") ?? [];
  const reinforcements = model.reinforcements ?? model.rows?.("reinforcement") ?? [];
  const references = [];
  for (const appearance of deployments) {
    if (!aliases.has(appearance.rewardSelector)) continue;
    references.push({ kind: "deployment", recordIndex: appearance.recordIndex,
      physicalIndex: appearance.physicalIndex, scenarioSlots: appearance.scenarioSlots,
      unitId: appearance.unitId, name: displayName(appearance.name) || "기체 이름 확인 불가",
      x: appearance.x, y: appearance.y, editable: appearance.editable });
  }
  for (const appearance of reinforcements) {
    if (appearance.enabled !== 1 || !aliases.has(appearance.rewardSelector)) continue;
    const template = appearance.templates?.find(item => item.byteOffset === appearance.templateOffset);
    if (!template) continue;
    references.push({ kind: "reinforcement", recordIndex: appearance.recordIndex,
      physicalIndex: appearance.physicalIndex, scenarioSlots: appearance.scenarioSlots,
      unitId: template.unitId, name: displayName(template.name) || "기체 이름 확인 불가",
      x: appearance.x, y: appearance.y, turn: appearance.turn, editable: appearance.editable });
  }
  return references;
}

function fail(message) {
  const error = new Error(message);
  error.code = "EDITOR_REWARD_INVALID";
  throw error;
}

export function rewardTotal(row) {
  return Array.from({ length: row.capacity }, (_, i) => row[`chance${i + 1}`]).reduce((a, b) => a + b, 0);
}

export function rewardValueAllowed(row, fields = row) {
  if (!Number.isInteger(row?.capacity) || row.capacity < 1 || row.capacity > 2) return false;
  for (let i = 1; i <= row.capacity; i += 1) {
    if (!Number.isInteger(fields[`part${i}`]) || fields[`part${i}`] < 1 || fields[`part${i}`] > REWARD_PART_MAX
      || !Number.isInteger(fields[`chance${i}`]) || fields[`chance${i}`] < 0 || fields[`chance${i}`] > 100) return false;
  }
  return rewardTotal({ ...fields, capacity: row.capacity }) <= 100;
}

export function readRewardTable(segment) {
  const bytes = segment?.bytes;
  if (!(bytes instanceof Uint8Array) || bytes.length < REWARD_SELECTOR_COUNT * 4 + 2) fail("The reward table is missing.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getInt32(0) !== REWARD_SELECTOR_COUNT * 4) fail("The reward selector layout is unsupported.");
  const targets = Array.from({ length: REWARD_SELECTOR_COUNT }, (_, i) => i * 4 + view.getInt32(i * 4));
  if (targets.some(p => p < REWARD_SELECTOR_COUNT * 4 || p + 2 > bytes.length || p % 2)) fail("Invalid reward pointer.");
  const starts = [...new Set(targets)].sort((a, b) => a - b);
  const rows = [];
  for (const start of starts) {
    const limit = starts.find(p => p > start) ?? bytes.length;
    const aliases = targets.flatMap((p, id) => p === start ? [id] : []);
    const row = { recordIndex: aliases[0], byteOffset: start, aliases, capacity: 0, name: "강화파츠 격추 보상", statsValid: true };
    let cursor = start;
    while (cursor + 2 <= limit && bytes[cursor] !== 255 && bytes[cursor + 1] !== 255) {
      if (++row.capacity > 2) fail("The reward list exceeds its verified capacity.");
      row[`part${row.capacity}`] = bytes[cursor];
      row[`chance${row.capacity}`] = bytes[cursor + 1];
      cursor += 2;
    }
    if (cursor + 2 !== limit || bytes[cursor] !== 255 || bytes[cursor + 1] !== 255) fail("Malformed reward terminator or record boundary.");
    row.editable = rewardValueAllowed(row);
    if (!row.capacity) row.name = "보상 없음";
    if (row.capacity && !row.editable) fail("Invalid reward parts or probability total.");
    row.identity = `reward:1:${new Sha256().update(new TextEncoder().encode(`reward:${aliases.join(",")}:${row.capacity}`)).hex()}`;
    rows.push(row);
  }
  return rows;
}

export function rewardDecodedMasks(segment) {
  return readRewardTable(segment).filter(row => row.editable).map(row => [segment.start + row.byteOffset, row.capacity * 2, 255]);
}

export function updateRewardRecords(segment, submitted) {
  if (submitted === undefined) return;
  const { list, problem } = readDenseList(submitted, REWARD_SELECTOR_COUNT);
  if (problem) fail("Invalid reward edit list.");
  if (!list.length) return;
  const rows = new Map(readRewardTable(segment).map(row => [row.recordIndex, row]));
  const planned = [];
  const seen = new Set();
  for (const edit of list) {
    const id = ownData(edit, "recordIndex");
    const row = rows.get(id);
    const fields = ownData(edit, "fields");
    if (!row?.editable || seen.has(id) || !fields || typeof fields !== "object" || Array.isArray(fields)) fail("The reward edit names an unavailable or duplicate selector.");
    seen.add(id);
    const wanted = { ...row };
    for (const key of Reflect.ownKeys(fields)) {
      if (!REWARD_FIELDS.slice(0, row.capacity * 2).includes(key)) fail("The reward edit changes the record capacity.");
      wanted[key] = ownData(fields, key);
    }
    if (!rewardValueAllowed(row, wanted)) fail("Reward probabilities must total at most 100 percent.");
    planned.push(wanted);
  }
  // Validate the whole request before changing a byte.
  for (const row of planned) for (let i = 1; i <= row.capacity; i += 1) {
    const at = row.byteOffset + (i - 1) * 2;
    segment.bytes[at] = row[`part${i}`];
    segment.bytes[at + 1] = row[`chance${i}`];
  }
}
