// Move only the unit table in the logical editor view. Final export compacts
// it back behind the original pointer table; Final may put overflowing whole
// records in bounded TSR tail space. Other segments and name pointers stay at
// their original addresses. The vacated logical table is never a second
// uncontrolled copy. A profile restores the logical table before hashing.
import { ownData, readDenseList } from './editor-own.mjs?v=20261106-part4';
import { planUnitLoadouts } from './editor-loadout.mjs?v=20261106-part4';
import { weaponsOfUnit } from './editor-weapon-links.mjs?v=20261106-part4';
import {createUnitRestorationStorage,appendConstructedUnitTable,readUnitRestorationPrefix} from './editor-unit-restoration.mjs?v=20261106-part4';
import {writeRelative32} from './editor-storage-safety.mjs?v=20261106-part4';

const write32 = (bytes, at, value) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setInt32(at, value);
const invalid = reason => { const error = new Error(`Invalid expanded unit storage (${reason}).`); error.code = 'EDITOR_LOADOUT_INVALID'; error.details = { kind: 'unit', field: 'weapons', reason }; throw error; };
const physical = (offsets, length) => [...new Set(offsets)].sort((a,b) => a-b).map((start,i,starts) => ({ start, end: starts[i+1] ?? length }));

export function createUnitStorage(root, table, units, decoded = null, gameId = null) {
  if (root.some((segment,i) => i !== 27 && !segment.opaque && segment.start === root[27].start)) return null;
  return { start: root[27].start, length: root[27].bytes.length, offsets: [...table.offsets],
    expandable: units.filter(row => row.editable && row.weaponList?.status === 'known' && !row.weaponList.placeholder
      && (row.weaponList.entries.length || row.weaponList.declaredAmmoSlots===0)).map(row => row.recordIndex),
    ...(decoded ? {restoration:createUnitRestorationStorage(decoded,root,table,units,gameId)} : {}) };
}

export function repackUnitAdditions(decoded, root, table, weapons, submitted, readOnly, storage, baseLength, gameId) {
  const { list: edits } = readDenseList(submitted === undefined ? [] : submitted, table.records.length);
  if (!edits) invalid('request');
  if (!edits.length) return null;
  if (!storage || !Number.isSafeInteger(baseLength) || baseLength > decoded.length) invalid('storage');
  const plans = new Map(), seen = new Set(), source = root[27].bytes;
  const weaponCount = Math.max(...weapons.map(row => row.recordIndex)) + 1;
  const rows=table.records.map(record=>({recordIndex:record.recordIndex,saveUnitKind:(source[record.start+7]>>>3)&15,saveUnitForm:source[record.start+7]&7,weaponList:weaponsOfUnit(source,record.start,record.end,weaponCount)}));
  for (const edit of edits) {
    if (!edit || typeof edit !== 'object' || Array.isArray(edit) || Reflect.ownKeys(edit).length !== 2
      || !Object.hasOwn(edit,'recordIndex') || !Object.hasOwn(edit,'weapons')) invalid('request');
    const id = ownData(edit,'recordIndex'), record = table.records.find(row => row.recordIndex === id);
    if (!Number.isSafeInteger(id) || !record || seen.has(id) || readOnly.has(id) || !storage.expandable.includes(id)) invalid('record');
    seen.add(id);
    const additions=readDenseList(ownData(edit,'weapons'),16).list;if(!additions)invalid('additions');
    rows.find(row=>row.recordIndex===id).weaponAdditions=additions;
  }
  const resolved=planUnitLoadouts(rows,weapons);
  for(const id of seen){const row=rows.find(r=>r.recordIndex===id),list=resolved.get(id);if(row.weaponAdditions?.length)plans.set(table.offsets[id],{entries:list.entries,ammoSlots:list.declaredAmmoSlots});}
  if (!plans.size) return null;
  const starts = physical(table.offsets,source.length), parts = [], moved = new Map();
  let cursor = table.offsets.length * 4;
  for (const record of starts) {
    const plan = plans.get(record.start); let part;
    if (!plan) part = source.slice(record.start,record.end);
    else {
      part = new Uint8Array(50 + plan.entries.length * 4);
      part.set(source.subarray(record.start,record.start+46)); part[46]=plan.entries.length; part[47]=plan.ammoSlots;
      plan.entries.forEach((entry,i) => part.set(entry.raw,48+4*i));
    }
    moved.set(record.start,cursor); parts.push(part); cursor += part.length;
  }
  const active = new Uint8Array(cursor);
  table.offsets.forEach((offset,i) => writeRelative32(active,i*4,moved.get(offset)));
  cursor = table.offsets.length*4; for (const part of parts) { active.set(part,cursor); cursor += part.length; }
  const constructions=readUnitRestorationPrefix(decoded,root,storage,baseLength,gameId);
  return appendConstructedUnitTable(decoded,active,storage,baseLength,constructions,gameId);
}

// `table` is parsed by the existing core reader. Only bounded extra entries
// may disappear during normalization; no bytes of another segment are lost.
export function normalizeUnitStorage(decoded, root, table, weapons, profile) {
  const storage = profile.unitStorage;
  if (!storage) return decoded.length === profile.decodedLength ? decoded : null;
  if (root[27].start === storage.start) return decoded.length === profile.decodedLength ? decoded : null;
  const append = Math.ceil(profile.decodedLength/4)*4, source = root[27].bytes;
  if (root[27].start !== append || decoded.length !== append+source.length
    || table.offsets.length !== storage.offsets.length
    || decoded.subarray(storage.start,storage.start+storage.length).some(Boolean)
    || decoded.subarray(profile.decodedLength,append).some(Boolean)) return null;
  const original = physical(storage.offsets,storage.length), current = physical(table.offsets,source.length);
  if (original.length !== current.length || current[0]?.start !== table.offsets.length*4) return null;
  const destinations = new Map(original.map((record,i) => [record.start,current[i].start]));
  if (storage.offsets.some((offset,i) => destinations.get(offset) !== table.offsets[i])) return null;
  const catalog = new Map(weapons.map(row => [row.recordIndex,row])), weaponCount = Math.max(...catalog.keys())+1;
  const result = decoded.slice(0,profile.decodedLength), target = result.subarray(storage.start,storage.start+storage.length);
  storage.offsets.forEach((offset,i) => write32(target,i*4,offset-i*4));
  for (const [i,old] of original.entries()) {
    const now=current[i], oldLength=old.end-old.start, added=now.end-now.start-oldLength;
    if (added<0 || added%4) return null;
    if (!added) { target.set(source.subarray(now.start,now.end),old.start); continue; }
    // The reserved cell may alias a real unit. Match any authenticated owner.
    if (!storage.expandable.some(owner => storage.offsets[owner] === old.start) || oldLength<50 || (oldLength-50)%4) return null;
    const count=(oldLength-50)/4, list=weaponsOfUnit(source,now.start,now.end,weaponCount);
    if (list.status!=='known' || list.entries.length!==count+added/4
      || list.declaredAmmoSlots!==new Set(list.entries.map(entry=>entry.ammoSlot).filter(Boolean)).size) return null;
    const slots=new Set(list.entries.slice(0,count).map(entry=>entry.slot)), ammoSlots=new Set(list.entries.slice(0,count).map(entry=>entry.ammoSlot).filter(Boolean));
    for (const entry of list.entries.slice(count)) {
      const ammo=catalog.get(entry.weaponIndex)?.ammo;
      if (!Number.isInteger(ammo) || slots.has(entry.slot) || entry.requiresFlag || entry.raw[2]&0xc0 || entry.raw[3]!==0
        || (ammo ? entry.ammoSlot<1 || entry.ammoSlot>16 || ammoSlots.has(entry.ammoSlot) : entry.ammoSlot!==0)) return null;
      slots.add(entry.slot); if (entry.ammoSlot) ammoSlots.add(entry.ammoSlot);
    }
    target.set(source.subarray(now.start,now.start+oldLength-2),old.start);
    target[old.start+46]=count;
    if(!count)target[old.start+47]=0;
    target[old.end-2]=0; target[old.end-1]=0;
  }
  write32(result,27*4,storage.start-27*4);
  return result;
}
