// Conditions inspect the current editor rows. Bulk edits use the preset planner's writer-domain checks;
// no second binary writer and no game data. Unit/pilot and weapon grade encodings remain distinct.
import { EDITOR_FIELD_BOUNDS, isFieldValueInBounds } from "./editor-fields.mjs?v=20261011-public12";
import { GRADE_CHOICES, WEAPON_GRADE_CHOICES, gradeLabel, weaponGradeLabel, splitWeaponTerrain, joinWeaponTerrain } from "./editor-grades.mjs?v=20261011-public12";
import { planPresetApplication, applyPresetPlan } from "./editor-preset.mjs?v=20261011-public12";

const TYPES = ["unit", "pilot", "weapon"];
const TABLES = { unit: "units", pilot: "pilots", weapon: "weapons" };
const TERRAIN = ["air", "ground", "sea", "space"];
const TERRAIN_NAMES = ["공중", "지상", "바다", "우주"];
const NUMBERS = {
  unit: [["hp", "HP"], ["en", "EN"], ["move", "이동력"], ["speed", "운동성"], ["armor", "장갑"], ["limit", "한계 반응"]],
  pilot: [["atk", "격투"], ["shot", "사격"], ["hit", "명중"], ["agi", "회피"], ["mp", "SP"], ["tech", "기량"], ["cnt", "반응"], ["exp", "초기 경험치"]],
  weapon: [["attack", "공격력"], ["hit", "명중 보정"], ["critical", "크리티컬"], ["minRange", "최소 사거리"], ["maxRange", "최대 사거리"], ["energy", "소비 EN"], ["ammo", "탄수"], ["requiredMorale", "필요 기력"]],
};
export const MAX_EDITOR_CONDITIONS = 12;
export function filterFields(kind, { editableOnly = false } = {}) {
  if (!TYPES.includes(kind)) return [];
  const fields = TERRAIN.map((key, i) => ({ key, label: TERRAIN_NAMES[i], group: `${kind === "weapon" ? "무기" : kind === "pilot" ? "파일럿" : "기체"} 지형`, type: "grade", editable: true }));
  fields.push(...NUMBERS[kind].map(([key, label]) => ({ key, label, group: "능력치", type: "number", editable: true, bounds: EDITOR_FIELD_BOUNDS[kind][key] })));
  if (kind === "unit") fields.push(...[["shield", "실드"], ["parry", "베어내기 가능"]].map(([key, label]) => ({ key, label, group: "기체 기능", type: "boolean", editable: true })));
  if (kind !== "weapon") fields.push({ key: "ability", label: "특수능력", group: "보유 능력", type: "membership", editable: false });
  if (kind === "pilot") fields.push({ key: "spirit", label: "정신커맨드", group: "보유 능력", type: "membership", editable: false });
  fields.push({ key: "modified", label: "편집 여부", group: "표시", type: "boolean", editable: false });
  return editableOnly ? fields.filter(field => field.editable) : fields;
}
export const filterField = (kind, key) => filterFields(kind).find(field => field.key === key) ?? null;
export const gradeChoices = kind => kind === "weapon" ? WEAPON_GRADE_CHOICES : GRADE_CHOICES;
export const gradeText = (kind, value) => kind === "weapon" ? weaponGradeLabel(value) : gradeLabel(value);
export function filterValue(kind, row, key, isModified = () => false) {
  if (!row || row.statsValid === false && key !== "modified") return null;
  if (key === "modified") return Boolean(isModified(kind, row));
  if (TERRAIN.includes(key) && kind === "weapon") {
    return Number.isInteger(row.terrain) && row.terrain >= 0 && row.terrain <= 255 ? splitWeaponTerrain(row.terrain)[key] : null;
  }
  if (key === "ability") {
    if (kind === "unit") {
      const values = [1, 2, 3, 4].map(slot => row[`ability${slot}`]);
      return values.every(Number.isInteger) ? values.filter(id => id > 0) : null;
    }
    return Array.isArray(row.specialAbilities) ? row.specialAbilities.map(entry => entry.id) : null;
  }
  if (key === "spirit") {
    // The editable current list is authoritative; extra pairs beyond the game's six slots never count.
    const entries = row.spirits ?? row.spiritCommands;
    return Array.isArray(entries) ? entries.map(entry => entry.id) : null;
  }
  return Object.hasOwn(row, key) ? row[key] : null;
}
export function isValidCondition(kind, condition) {
  const field = filterField(kind, condition?.field);
  if (!field) return false;
  const { op, value } = condition;
  if (field.type === "membership") return ["has", "lacks"].includes(op) && Number.isInteger(value) && value > 0 && value <= 255;
  if (field.type === "boolean") return op === "eq" && typeof value === "boolean";
  if (!["eq", "gte", "lte"].includes(op) || !Number.isSafeInteger(value)) return false;
  const [min, max] = field.type === "grade" ? [0, kind === "weapon" ? 3 : 4] : field.bounds;
  return value >= min && value <= max;
}
export function matchesConditions(kind, row, conditions, isModified) {
  if (!Array.isArray(conditions) || conditions.length > MAX_EDITOR_CONDITIONS) return false;
  return conditions.every(condition => {
    if (!isValidCondition(kind, condition)) return false;
    const actual = filterValue(kind, row, condition.field, isModified);
    if (actual === null || actual === undefined) return false;
    if (filterField(kind, condition.field).type === "grade" && !gradeChoices(kind).some(choice => choice.value === actual)) return false;
    if (condition.op === "has") return actual.includes(condition.value);
    if (condition.op === "lacks") return !actual.includes(condition.value);
    if (condition.op === "eq") return actual === condition.value;
    if (!Number.isSafeInteger(actual)) return false;
    return condition.op === "gte" ? actual >= condition.value : actual <= condition.value;
  });
}
export function isValidBulkValue(kind, key, value) {
  const field = filterField(kind, key);
  if (!field?.editable) return false;
  if (field.type === "grade") return gradeChoices(kind).some(choice => choice.value === value);
  if (!isFieldValueInBounds(kind, key, value)) return false;
  // The same changed-value limits as the writer and the preset planner, before making a plan.
  if (kind === "weapon" && key === "requiredMorale") return value <= 150;
  if (kind === "weapon" && key === "ammo") return value >= 1;
  return true;
}
export function planBulkEdit(session, kind, rows, key, value) {
  if (!TYPES.includes(kind) || !isValidBulkValue(kind, key, value)) throw new RangeError("일괄 편집 값을 확인해 주세요.");
  const entries = rows.map(row => {
    let field = key, to = value;
    if (kind === "weapon" && TERRAIN.includes(key)) {
      field = "terrain";
      to = Number.isInteger(row.terrain) && row.terrain >= 0 && row.terrain <= 255
        ? joinWeaponTerrain({ ...splitWeaponTerrain(row.terrain), [key]: value }) : 0;
    }
    return { recordIndex: row.recordIndex, name: row.name ?? "", fields: [{ field, from: row[field], to }] };
  });
  if (new Set(rows.map(row => row.recordIndex)).size !== rows.length) throw new RangeError("중복된 편집 대상입니다.");
  const plan = planPresetApplication({ gameId: session.gameId, entries: { [kind]: entries } }, session);
  return { kind, key, value, plan };
}
export function applyBulkEdit(bulk, session) {
  const map = new Map((session[TABLES[bulk.kind]] ?? []).map(row => [row.recordIndex, row]));
  const items = bulk.plan.items.filter(item => item.status === "apply");
  // Validate the WHOLE snapshot before mutation, including rows that will not change. No partial stale batch.
  for (const item of bulk.plan.items) {
    const row = map.get(item.recordIndex);
    if (item.status !== "skip" && (!row || row[item.field] !== item.current || row.editable === false || row.statsValid === false)) throw new Error("대상 값이 바뀌었습니다. 일괄 편집을 다시 열어 주세요.");
  }
  const result = applyPresetPlan(bulk.plan, session, "matching");
  return { ...result, kind: bulk.kind, key: bulk.key, value: bulk.value, items: items.map(item => ({ recordIndex: item.recordIndex, field: item.field, before: item.current, after: item.to })) };
}
export function undoBulkEdit(transaction, session) {
  const rows = new Map((session[TABLES[transaction.kind]] ?? []).map(row => [row.recordIndex, row]));
  if (transaction.items.some(item => {
    const row = rows.get(item.recordIndex);
    return !row || row.editable === false || row.statsValid === false || row[item.field] !== item.after;
  })) throw new Error("이후에 다시 편집한 값이 있어 일괄 되돌리기를 할 수 없습니다. 변경 목록에서 확인해 주세요.");
  for (const item of transaction.items) rows.get(item.recordIndex)[item.field] = item.before;
  return transaction.items.length;
}
