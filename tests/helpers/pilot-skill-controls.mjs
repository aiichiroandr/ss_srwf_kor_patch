import assert from "node:assert/strict";
import { PILOT_LADDER_FAMILIES, pilotSkillFamily } from "../../assets/editor-facts.mjs";

// The skill picker chooses an ability family first, then its rank and the pilot level that acquires it.
// Tests continue to name the saved ability ID so the screen and exported data can be compared directly.
export function choosePilotSkill(byId, gameId, id, level = 1) {
  const family = pilotSkillFamily(gameId, id);
  const ladder = PILOT_LADDER_FAMILIES.includes(family);
  const select = byId("pilotSkillAddSelect");
  select.value = ladder ? `family-${family}` : `id-${id}`;
  select.dispatchEvent({ type: "change", target: select });
  if (ladder) {
    const rank = byId("pilotSkillAddRank");
    rank.value = String(id);
    rank.dispatchEvent({ type: "change", target: rank });
  }
  const box = byId("pilotSkillAddLevel");
  box.value = String(level);
  box.dispatchEvent({ type: "input", target: box });
}

// Grouping changes visual row order without changing indices in the saved learning list.
export function indexedSkillRows(byId) {
  return [...byId("pilotSkillSchedule").querySelectorAll(".pilot-skill-row")]
    .sort((left, right) => Number(left.dataset.skillIndex) - Number(right.dataset.skillIndex));
}

export function offeredPilotSkillIds(byId) {
  const select = byId("pilotSkillAddSelect");
  const rank = byId("pilotSkillAddRank");
  const previous = select.value;
  const previousRank = rank.value;
  const ids = [];
  for (const option of [...select.options]) {
    if (!option.value || option.disabled) continue;
    select.value = option.value;
    select.dispatchEvent({ type: "change", target: select });
    if (option.value.startsWith("family-")) {
      ids.push(...[...rank.options].filter((entry) => entry.value && !entry.disabled).map((entry) => Number(entry.value)));
    } else {
      ids.push(Number(option.value.slice("id-".length)));
    }
  }
  select.value = previous;
  select.dispatchEvent({ type: "change", target: select });
  rank.value = previousRank;
  rank.dispatchEvent({ type: "change", target: rank });
  return ids.sort((left, right) => left - right);
}

export function assertSkillStatus(byId, count, capacity, free, consumers, limit = 4, room = null) {
  const status = byId("pilotSkillStatus");
  const parts = status.children.filter((child) => child.tagName === "SPAN");
  assert.deepEqual(parts.map((part) => part.textContent), [
    `습득 시점 ${count}개`,
    `능력 종류 ${consumers}/${limit}`,
  ], "learning points and the active ability limit are shown separately");
}
