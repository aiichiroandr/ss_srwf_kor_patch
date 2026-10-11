import { findUnitAbilityLockViolation, reachedUnitAbilitySlots } from "./editor-locks.mjs?v=20261011-public3";

export function unitAbilityPairs(row) {
  return Array.from({ length: 4 }, (_, slot) => ({ id: row[`ability${slot + 1}`], aux: row[`abilityValue${slot + 1}`] }));
}

// Remove the pair, not just its id. Compact the remaining pairs so an empty
// second/third slot cannot silently hide the abilities behind it in the game.
// Structural abilities retain their original slot and condition flag.
export function unitAbilityRemoval(row, slot) {
  if (!row?.editable || !Number.isSafeInteger(slot) || slot < 0 || slot > 3) return null;
  const before = unitAbilityPairs(row);
  if (before[slot].id === 0 || row.abilityLocks?.slots?.includes(slot)) return null;
  const anchoredAfter = row.abilityLocks?.slots?.some(position => position > slot);
  const after = before.map(pair => ({ ...pair }));
  if (anchoredAfter) {
    // The loader permits an empty first slot; an empty later slot ends the list.
    if (slot !== 0) return null;
    after[slot] = { id: 0, aux: 0 };
  } else {
    after.splice(slot, 1);
    after.push({ id: 0, aux: 0 });
  }
  if (findUnitAbilityLockViolation(before, after)) return null;
  return Object.fromEntries(after.flatMap((pair, index) => [[`ability${index + 1}`, pair.id], [`abilityValue${index + 1}`, pair.aux]]));
}

export function canAddUnitAbilityAt(row, slot) {
  if (!row?.editable || !Number.isSafeInteger(slot) || slot < 0 || slot > 3) return false;
  const pairs = unitAbilityPairs(row);
  return pairs[slot].id === 0 && (slot === 0 || reachedUnitAbilitySlots(pairs)[slot - 1]);
}
