// Replacing a weapon preserves the unit's list footprint, upgrade slot,
// event flag, investment bit and all unassigned bits. No executable is edited.
import { ownData, readDenseList } from './editor-own.mjs?v=20261110-part2';

export const UNIT_WEAPON_FIELDS = Object.freeze(Array.from({ length: 16 }, (_, i) => `weapon${i + 1}`));
export const isUnitWeaponField = field => UNIT_WEAPON_FIELDS.includes(field);
export function unitWeaponFields(list) {
  return list?.status === 'known' && !list.placeholder
    ? Object.fromEntries(list.entries.map((entry, i) => [UNIT_WEAPON_FIELDS[i], entry.weaponIndex])) : {};
}
function invalid(reason) {
  const error = new Error(`Invalid unit weapon replacement (${reason}).`);
  error.code = 'EDITOR_LOADOUT_INVALID';
  error.details = { kind: 'unit', field: 'weapons', reason };
  throw error;
}

// `weapons` is the authenticated table, or its pending rows in the UI/preset.
// Only changed entries require a matching ammo counter; unchanged unusual
// source entries and the source advisory counter are preserved byte for byte.
export function planUnitWeapons(list, submitted, weapons, reserved={}) {
  const { list: wanted } = readDenseList(submitted, 16);
  if (!wanted || list?.status !== 'known' || list.placeholder || wanted.length !== list.entries.length) invalid('list');
  const catalog = new Map((weapons ?? []).map(row => [row.recordIndex, row]));
  if (wanted.some(id => !Number.isSafeInteger(id) || id < 1 || id > 2047 || !catalog.has(id))) invalid('weapon');
  if (wanted.every((id, i) => id === list.entries[i].weaponIndex)) return null;
  const entries = list.entries.map((entry, i) => ({ ...entry, raw: [...entry.raw], weaponIndex: wanted[i] }));
  // Reserve counters used by entries which stay intact, including shared ones.
  const used = new Set(entries.filter((_, i) => wanted[i] === list.entries[i].weaponIndex).map(e => e.ammoSlot).filter(Boolean));
  for(const n of reserved.ammoSlots??[])used.add(n);
  for (const [i, entry] of entries.entries()) {
    if (wanted[i] === list.entries[i].weaponIndex) continue;
    const ammo = ownData(catalog.get(entry.weaponIndex), 'ammo');
    if (!Number.isSafeInteger(ammo) || ammo < 0 || ammo > 255) invalid('ammo');
    let counter = 0;
    if (ammo > 0) {
      // Keep a counter only if it is not shared with a different entry. New
      // counters use 1..16: at most sixteen stored entries can need one.
      counter = entry.ammoSlot > 0 && !used.has(entry.ammoSlot) ? entry.ammoSlot
        : Array.from({ length: 16 }, (_, n) => n + 1).find(n => !used.has(n));
      if (!counter) invalid('ammo-capacity');
      used.add(counter);
    }
    entry.ammoSlot = counter;
    entry.raw[0] = (entry.raw[0] & 0xf8) | (entry.weaponIndex >>> 8);
    entry.raw[1] = entry.weaponIndex & 255;
    entry.raw[2] = (entry.raw[2] & 0xc0) | counter;
  }
  if (entries.length === 1 && entries[0].slot === 1 && entries[0].weaponIndex === 1 && entries[0].ammoSlot === 0 && !entries[0].requiresFlag && !entries[0].requiresInvestment) invalid('placeholder');
  return { entries, ammoSlots: new Set(entries.map(e => e.ammoSlot).filter(Boolean)).size };
}

export function pendingUnitWeapons(row, weapons, units=null) {
  if(units)return planUnitLoadouts(units.map(unit=>unit.recordIndex===row.recordIndex?row:unit),weapons).get(row.recordIndex);
  const fields = Object.keys(unitWeaponFields(row?.weaponList));
  const plan = fields.length ? planUnitWeapons(row.weaponList, fields.map((field, i) => Number.isInteger(row[field]) ? row[field] : row.weaponList.entries[i].weaponIndex), weapons) : null;
  const current = plan ? { ...row.weaponList, entries: plan.entries, declaredAmmoSlots: plan.ammoSlots } : row?.weaponList ?? null;
  const added = planUnitWeaponAdditions(current, row?.weaponAdditions ?? [], weapons);
  return added ? { ...current, entries: added.entries, declaredCount: added.entries.length, declaredAmmoSlots: added.ammoSlots } : current;
}

export function planUnitWeaponAdditions(list, submitted, weapons, reserved={}) {
  const { list: wanted } = readDenseList(submitted, 16);
  if (!wanted) invalid('additions');
  if (!wanted.length) return null;
  if (list?.status !== 'known' || list.placeholder || list.entries.length + wanted.length > 16) invalid('capacity');
  const catalog = new Map((weapons ?? []).map(row => [row.recordIndex, row]));
  const entries = list.entries.map(entry => ({ ...entry, raw: [...entry.raw] }));
  const slots = new Set(entries.map(entry => entry.slot)), ammoSlots = new Set(entries.map(entry => entry.ammoSlot).filter(Boolean));
  for(const n of reserved.slots??[])slots.add(n);
  for(const n of reserved.ammoSlots??[])ammoSlots.add(n);
  for (const [additionIndex, id] of wanted.entries()) {
    const ammo = ownData(catalog.get(id), 'ammo');
    if (!Number.isSafeInteger(id) || id < 1 || id > 2047 || !Number.isSafeInteger(ammo) || ammo < 0 || ammo > 255) invalid('weapon');
    let slot = Array.from({ length: 16 }, (_, i) => i + 1).find(n => !slots.has(n));
    // The reader recognizes the source's single #1/slot-1/no-ammo pattern
    // as filler. A real new one-weapon list uses the next storage slot.
    if (!entries.length && wanted.length === 1 && id === 1 && !ammo) slot = 2;
    const ammoSlot = ammo ? Array.from({ length: 16 }, (_, i) => i + 1).find(n => !ammoSlots.has(n)) : 0;
    if (!slot || ammo && !ammoSlot) invalid('capacity');
    const raw = [((slot - 1) << 3) | (id >>> 8), id & 255, ammoSlot, 0];
    entries.push({ entryIndex: entries.length, weaponIndex: id, slot, ammoSlot, requiresFlag: false, flagNumber: null,
      requiresInvestment: false, valid: true, raw, added: true, additionIndex });
    slots.add(slot); if (ammoSlot) ammoSlots.add(ammoSlot);
  }
  return { entries, ammoSlots: new Set(entries.map(e=>e.ammoSlot).filter(Boolean)).size };
}

// +7 stores kind/form. Transformations and combination components use the
// same sixteen upgrade/ammunition coordinates; list positions are unrelated.
export function unitWeaponFamily(id,units){
 const row=units.find(r=>r.recordIndex===id);if(!row)return [];
 const kind=row.saveUnitKind,form=row.saveUnitForm;
 if(!Number.isInteger(kind)||!Number.isInteger(form)||kind===0)return [id];
 const combined=units.find(r=>r.saveUnitKind===6&&id>=r.recordIndex&&id<=r.recordIndex+12||r.saveUnitKind===8&&id>=r.recordIndex&&id<=r.recordIndex+5);
 if(combined)return units.filter(r=>r.recordIndex>=combined.recordIndex&&r.recordIndex<=combined.recordIndex+(combined.saveUnitKind===6?12:5)).map(r=>r.recordIndex);
 if(kind===9){const main=units.find(r=>r.saveUnitKind===9&&r.saveUnitForm===2&&id>=r.recordIndex&&id<=r.recordIndex+2);if(main)return units.filter(r=>r.recordIndex>=main.recordIndex&&r.recordIndex<=main.recordIndex+2).map(r=>r.recordIndex);}
 const count=[1,2].includes(kind)?2:[3,4,5].includes(kind)?3:kind===7?5:1,base=id-form;
 return count===1||form>=count?[id]:units.filter(r=>r.saveUnitKind===kind&&r.saveUnitForm<count&&r.recordIndex-r.saveUnitForm===base).map(r=>r.recordIndex);
}
export function unitWeaponReservations(id,units){
 const ids=new Set(unitWeaponFamily(id,units)),slots=new Set(),ammoSlots=new Set();
 for(const row of units)if(row.recordIndex!==id&&ids.has(row.recordIndex))for(const entry of row.weaponList?.entries??[]){slots.add(entry.slot);if(entry.ammoSlot)ammoSlots.add(entry.ammoSlot);}
 return {slots,ammoSlots};
}
// Stable record order makes simultaneous edits independent of request order.
// Preserve existing shared counters; allocate only changed/new ones separately.
export function planUnitLoadouts(units,weapons){
 const rows=units.map(row=>({...row})).sort((a,b)=>a.recordIndex-b.recordIndex);
 for(const row of rows){const fields=Object.keys(unitWeaponFields(row.weaponList));
  const plan=fields.length?planUnitWeapons(row.weaponList,fields.map((field,i)=>Number.isInteger(row[field])?row[field]:row.weaponList.entries[i].weaponIndex),weapons,unitWeaponReservations(row.recordIndex,rows)):null;
  if(plan)row.weaponList={...row.weaponList,entries:plan.entries,declaredAmmoSlots:plan.ammoSlots};
 }
 for(const row of rows){const added=planUnitWeaponAdditions(row.weaponList,row.weaponAdditions??[],weapons,unitWeaponReservations(row.recordIndex,rows));
  if(added)row.weaponList={...row.weaponList,entries:added.entries,declaredCount:added.entries.length,declaredAmmoSlots:added.ammoSlots};
 }
 return new Map(rows.map(row=>[row.recordIndex,row.weaponList]));
}

export function unitWeaponMasks(start, list) {
  if (!Object.keys(unitWeaponFields(list)).length) return [];
  return [[start + 47, 1, 255], ...list.entries.flatMap((_, i) => [
    [start + 48 + 4 * i, 1, 7], [start + 49 + 4 * i, 1, 255], [start + 50 + 4 * i, 1, 63],
  ])];
}
