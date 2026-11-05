import {srw4NativeIconId} from './editor-srw4-native-map.mjs?v=20261105-part2';
// Remaining artwork is real. Numeric headers are explicit clones; new weapon
// configurations use reviewed existing records, never recovered original specs.
import {F_NAME_MAP,FINAL_NAME_MAP} from './editor-name-map.mjs?v=20261105-part2';
import {F_NAME_SUPPLEMENT} from './editor-pilot-name-map.mjs?v=20261105-part2';
import {weaponsOfUnit} from './editor-weapon-links.mjs?v=20261105-part2';
import {ownData,readDenseList} from './editor-own.mjs?v=20261105-part2';
import {sha256Hex} from './sha256.mjs?v=20261105-part2';
import {bytesEqual as same,dataView as view} from './editor-bytes.mjs?v=20261105-part2';
import {requireTsrInspectionSize,writeRelative32,tsrRuntimeLimit} from './editor-storage-safety.mjs?v=20261105-part2';

import {UNUSED_UNIT_PRESETS,unitConstructionWeapons,unitConstructionLoadout,writeUnitConcept,writeSSeparatedStructure,cruiserRole,requireAircraftGraphicCompatibility,writeExSCruiserStructure} from './editor-unit-construction.mjs?v=20261105-part2';
export {UNUSED_UNIT_PRESETS};
const MAGIC=0x53525531,COMPACT_MAGIC=0x5332,align=n=>Math.ceil(n/4)*4;
const r16=(b,o)=>view(b).getUint16(o),r32=(b,o)=>view(b).getUint32(o),i32=(b,o)=>view(b).getInt32(o);
const w16=(b,o,v)=>view(b).setUint16(o,v),w32=(b,o,v)=>view(b).setInt32(o,v);
const invalid=reason=>{const e=new Error(`Invalid unused unit construction (${reason}).`);e.code='EDITOR_UNIT_RESTORATION_INVALID';e.details={kind:'unit',reason};throw e;};
const preset=id=>UNUSED_UNIT_PRESETS.find(p=>p.id===id);
const physical=(table,size)=>[...new Set(table.offsets)].sort((a,b)=>a-b)
  .map((start,i,all)=>({start,end:all[i+1]??size}));

// Exact filler preimage, used only to undo bounded construction for provenance.
// Its bytes are never carried here: the filler is recognized by SHA-256 and
// copied back from another untouched filler record of the user's own table.
const UNIT_FILLER_SHA256=Object.freeze({
  'srwf-f':'db94b5cdef29352d3a60b5fef9ba14dac2750eebbba8cbdf98c1bce33804e02e',
  'srwf-final':'cb03cd7ca5ae93e654ac1908794e3227559d12c3a5c6ffafbea54579c030be92',
});
export function unusedUnitFillerTest(gameId) {
  if(!['srwf-f','srwf-final'].includes(gameId))invalid('game');
  const expected=UNIT_FILLER_SHA256[gameId];
  return bytes=>bytes instanceof Uint8Array&&bytes.length===54&&sha256Hex(bytes)===expected;
}
export function isUnusedUnitPreimage(bytes,gameId){return unusedUnitFillerTest(gameId)(bytes);}
// Physical filler record of this same table outside the excluded starts.
export function unusedUnitPreimageFrom(source,table,gameId,excludeStarts=new Set()) {
  const filler=unusedUnitFillerTest(gameId);
  for(const r of physical(table,source.length)){
    if(excludeStarts.has(r.start))continue;
    const part=source.subarray(r.start,r.end);if(filler(part))return part.slice();
  }
  return null;
}

export function createUnitRestorationStorage(decoded,root,table,rows,gameId) {
  const source=root[27]?.bytes,filler=unusedUnitFillerTest(gameId),slots=[];
  if(!source||!root[11])return null;
  for(const row of rows) {
    const record=table.records.find(r=>r.recordIndex===row.recordIndex);
    if(row.recordKind!=='unused-filler'||row.nameStatus==='no-name-cell'||!record
      ||table.offsets.filter(x=>x===record.start).length!==1
      ||!filler(source.subarray(record.start,record.end)))continue;
    const cell=root[11].start+4*row.recordIndex;
    if(cell+4>root[11].end)continue;
    slots.push({recordIndex:row.recordIndex,nameDelta:i32(decoded,cell)});
  }
  if(!slots.length)return null;
  return {nameStart:root[11].start,nameMode:/[가-힣]/u.test(rows.find(x=>x.recordIndex===1)?.name??'')?'ko':'ja',slots};
}

export function unusedUnitNameBytes(presetId,gameId,mode) {
  const p=preset(presetId);if(!p||!['ko','ja'].includes(mode))invalid('preset');
  const map=gameId==='srwf-f'?new Map([...F_NAME_MAP,...F_NAME_SUPPLEMENT]):gameId==='srwf-final'?new Map(FINAL_NAME_MAP):null;
  if(!map)invalid('game');
  const reverse=new Map([...map].map(([key,char])=>[char,key])),bytes=[];
  for(const char of p[mode]) {
    const key=reverse.get(char);if(!key||!/^(?:[A-F0-9]{2}){1,2}$/.test(key))invalid('name-glyph');
    for(let i=0;i<key.length;i+=2)bytes.push(parseInt(key.slice(i,i+2),16));
  }
  bytes.push(255);return Uint8Array.from(bytes);
}

// Serialize a parsed table while preserving aliases and physical record order.
export function replaceUnitTableRecords(source,table,replacements=new Map()) {
  const parts=[],moved=new Map();let cursor=table.offsets.length*4;
  for(const record of physical(table,source.length)) {
    const part=replacements.get(record.start)??source.subarray(record.start,record.end);
    if(!(part instanceof Uint8Array)||part.length<50||(part.length-50)%4)invalid('record-length');
    moved.set(record.start,cursor);parts.push(part);cursor+=part.length;
  }
  const result=new Uint8Array(cursor);
  table.offsets.forEach((offset,i)=>writeRelative32(result,4*i,moved.get(offset)));
  cursor=table.offsets.length*4;for(const part of parts){result.set(part,cursor);cursor+=part.length;}
  return result;
}

function prefixLayout(baseLength,entries,storage,gameId,compact=false) {
  const start=align(baseLength),names=entries.map(e=>unusedUnitNameBytes(e.preset,gameId,storage.restoration.nameMode));
  let cursor=start+(compact?4:8)+4*entries.length;const targets=names.map(bytes=>{const at=cursor;cursor+=bytes.length;return at;});
  return {start,names,targets,unitStart:align(cursor)};
}

// This prefix is outside all original tables. Name cells point to individual
// strings here; shared original empty/dash strings are never overwritten.
export function appendConstructedUnitTable(decoded,active,storage,baseLength,entries,gameId) {
  const sorted=[...entries].sort((a,b)=>a.recordIndex-b.recordIndex);
  if(!sorted.length) {
    const start=align(baseLength),result=new Uint8Array(start+active.length);
    result.set(decoded.subarray(0,baseLength));result.fill(0,storage.start,storage.start+storage.length);
    result.set(active,start);writeRelative32(result,27*4,start);requireTsrInspectionSize(result,gameId);return result;
  }
  if(!storage.restoration||sorted.length>storage.restoration.slots.length)invalid('storage');
  let compact=false,layout=prefixLayout(baseLength,sorted,storage,gameId);
  if(gameId==='srwf-final'&&layout.unitStart>tsrRuntimeLimit(gameId)){
    const smaller=prefixLayout(baseLength,sorted,storage,gameId,true);
    if(sorted.length<=255&&smaller.unitStart<=tsrRuntimeLimit(gameId)){compact=true;layout=smaller;}
  }
  const result=new Uint8Array(layout.unitStart+active.length);
  result.set(decoded.subarray(0,baseLength));result.fill(0,storage.start,storage.start+storage.length);
  if(compact){w16(result,layout.start,COMPACT_MAGIC);result[layout.start+2]=sorted.length;}
  else{w32(result,layout.start,MAGIC);w16(result,layout.start+4,sorted.length);}
  const seen=new Set();
  sorted.forEach((entry,i)=>{
    const p=UNUSED_UNIT_PRESETS.findIndex(p=>p.id===entry.preset);
    if(p<0||seen.has(entry.recordIndex)||!storage.restoration.slots.some(s=>s.recordIndex===entry.recordIndex))invalid('target');
    if(entry.loadoutVersion!==undefined&&![0,1,2].includes(entry.loadoutVersion))invalid('loadout-version');
    const header=compact?4:8;
    seen.add(entry.recordIndex);w16(result,layout.start+header+4*i,entry.recordIndex);w16(result,layout.start+header+2+4*i,p|(entry.loadoutVersion===1?0x8000:entry.loadoutVersion===2?0x4000:0));
    result.set(layout.names[i],layout.targets[i]);const cell=storage.restoration.nameStart+4*entry.recordIndex;
    writeRelative32(result,cell,layout.targets[i]);
  });
  result.set(active,layout.unitStart);writeRelative32(result,27*4,layout.unitStart);requireTsrInspectionSize(result,gameId);return result;
}

export function readUnitRestorationPrefix(decoded,root,storage,baseLength,gameId) {
  const start=align(baseLength);
  if(root[27].start===storage.start||root[27].start===start)return [];
  const compact=start+4<=decoded.length&&r16(decoded,start)===COMPACT_MAGIC,header=compact?4:8;
  if(!storage.restoration||start+header>decoded.length||(compact?gameId!=='srwf-final'||decoded[start+3]!==0:r32(decoded,start)!==MAGIC||r16(decoded,start+6)!==0))invalid('prefix');
  const count=compact?decoded[start+2]:r16(decoded,start+4);
  if(count<1||count>storage.restoration.slots.length||start+header+count*4>decoded.length)invalid('prefix-count');
  const entries=[];
  for(let i=0;i<count;i++) {
    const recordIndex=r16(decoded,start+header+4*i),encoded=r16(decoded,start+header+2+4*i),p=UNUSED_UNIT_PRESETS[encoded&0x3fff],version=encoded&0xc000;
    if(!p||version===0xc000||recordIndex<=(entries.at(-1)?.recordIndex??0)||!storage.restoration.slots.some(s=>s.recordIndex===recordIndex))invalid('target');
    entries.push({recordIndex,preset:p.id,...(version?{loadoutVersion:version===0x8000?1:2}:{})});
  }
  const layout=prefixLayout(baseLength,entries,storage,gameId,compact);
  if(layout.unitStart!==root[27].start||decoded.length!==layout.unitStart+root[27].bytes.length)invalid('prefix-length');
  entries.forEach((entry,i)=>{
    const cell=storage.restoration.nameStart+4*entry.recordIndex;
    if(cell+4>baseLength||cell+i32(decoded,cell)!==layout.targets[i]
      ||!same(decoded.subarray(layout.targets[i],layout.targets[i]+layout.names[i].length),layout.names[i]))invalid('name');
  });
  const nameEnd=layout.targets.at(-1)+layout.names.at(-1).length;
  if(decoded.subarray(nameEnd,layout.unitStart).some(Boolean))invalid('padding');
  return entries;
}

export function repackUnitRestorations(decoded,root,table,submitted,storage,baseLength,gameId,weapons) {
  const {list}=readDenseList(submitted===undefined?[]:submitted,storage?.restoration?.slots.length??0);
  if(!list)invalid('request');if(!list.length)return null;
  if(!storage?.restoration||baseLength>decoded.length)invalid('storage');
  const entries=readUnitRestorationPrefix(decoded,root,storage,baseLength,gameId),seen=new Set();
  const source=root[27].bytes,replacements=new Map(),original=physical({offsets:storage.offsets},storage.length);
  const sourceRecords=physical(table,source.length),endOf=start=>sourceRecords.find(r=>r.start===start)?.end;
  for(const request of list) {
    if(!request||typeof request!=='object'||Array.isArray(request)||Reflect.ownKeys(request).some(key=>!['recordIndex','preset','loadoutVersion','previousVersion'].includes(key))
      ||!Object.hasOwn(request,'recordIndex')||!Object.hasOwn(request,'preset'))invalid('request');
    const id=ownData(request,'recordIndex'),p=preset(ownData(request,'preset'));
    // Old worker/preset requests have the donor-copy semantics. Only an
    // explicit version 1 opts into the researched configuration.
    const loadoutVersion=Object.hasOwn(request,'loadoutVersion')?ownData(request,'loadoutVersion'):0;
    if(![0,1,2].includes(loadoutVersion))invalid('loadout-version');
    if(!p||!Number.isSafeInteger(id)||seen.has(id)||!storage.restoration.slots.some(s=>s.recordIndex===id))invalid('target');
    const existingIndex=entries.findIndex(e=>e.recordIndex===id),previous=existingIndex<0?null:entries[existingIndex];
    const upgrading=Object.hasOwn(request,'previousVersion');
    if(upgrading){
      const version=ownData(request,'previousVersion');
      if(![0,1,2].includes(version)||loadoutVersion!==2||!previous||previous.preset!==p.id||(previous.loadoutVersion??0)!==version)invalid('upgrade-version');
    }else if(previous)invalid('occupied-target');
    const at=table.offsets[id],donor=table.offsets[p.donor],old=original.find(r=>r.start===storage.offsets[p.donor]);
    if(!Number.isInteger(at)||!Number.isInteger(donor)||!old||(!upgrading&&!isUnusedUnitPreimage(source.subarray(at,endOf(at)),gameId))
      ||upgrading&&(r16(source,at+2)!==p.graphic||endOf(at)<at+50))invalid('occupied-target');
    if(endOf(donor)<donor+46)invalid('donor');
    let part;
    if(loadoutVersion>=1){
      const list=unitConstructionWeapons(p.id,gameId,weapons,loadoutVersion),count=list.entries.length;
      const head=upgrading?at:donor;
      part=new Uint8Array(50+count*4);part.set(source.subarray(head,head+46));part[46]=count;part[47]=list.declaredAmmoSlots;
      list.entries.forEach((entry,i)=>part.set(entry.raw,48+4*i));
    }else{
      const count=(old.end-old.start-50)/4;
      if(!Number.isInteger(count)||count<1||count>16||endOf(donor)<donor+50+count*4)invalid('donor');
      part=new Uint8Array(50+count*4);part.set(source.subarray(donor,donor+part.length-2));part[46]=count;
      part[47]=new Set(Array.from({length:count},(_,i)=>part[50+4*i]&63).filter(Boolean)).size;
    }
    w16(part,2,p.graphic);
    if(loadoutVersion===2)writeUnitConcept(part,p.id);
    // Version 1 starts with independent slots and no donor conditions;
    // version 0 reproduces the original donor-copy behavior for old JSON.
    replacements.set(at,part);seen.add(id);
    const entry={recordIndex:id,preset:p.id,...(loadoutVersion?{loadoutVersion}:{})};
    if(upgrading)entries[existingIndex]=entry;else entries.push(entry);
  }
  // Keep one untouched filler so provenance can restore targets from this image.
  if(replacements.size&&!unusedUnitPreimageFrom(source,table,gameId,new Set(replacements.keys())))invalid('filler-donor');
  requireAircraftGraphicCompatibility(entries);
  for(const entry of entries){
    const role=cruiserRole(entries,entry.recordIndex);
    if(['g-cruiser','s-g-cruiser'].includes(entry.preset)&&role!==1)invalid('g-cruiser-pair');
    if(role===null)continue;
    const at=table.offsets[entry.recordIndex],part=replacements.get(at)??source.slice(at,endOf(at));
    writeExSCruiserStructure(part,role);replacements.set(at,part);
  }
  return appendConstructedUnitTable(decoded,replaceUnitTableRecords(source,table,replacements),storage,baseLength,entries,gameId);
}

const masked=(bytes,ranges)=>{const out=bytes.slice();for(const [at,n,mask] of ranges)for(let i=at;i<Math.min(at+n,out.length);i++)out[i]&=~mask;return out;};
// Same numeric domains as editorDecodedMasks; tests compare the two so this
// construction path cannot quietly widen what a unit header may change.
export const UNIT_CONSTRUCTION_NUMERIC_MASKS=Object.freeze([[9,1,48],[19,3,255],[24,1,255],[25,1,48],[26,20,255]].map(Object.freeze));

export function normalizeUnitRestorations(decoded,root,table,weapons,profile,gameId,{nativeMap=false}={}) {
  const storage=profile.unitStorage;if(!storage)return {decoded,restorations:[]};
  try {
    const entries=readUnitRestorationPrefix(decoded,root,storage,profile.decodedLength,gameId);
    if(!entries.length)return {decoded,restorations:[]};
    requireAircraftGraphicCompatibility(entries);
    if(root[11].start!==storage.restoration.nameStart
      ||decoded.subarray(storage.start,storage.start+storage.length).some(Boolean)
      ||decoded.subarray(profile.decodedLength,align(profile.decodedLength)).some(Boolean))return null;
    const source=root[27].bytes,replacements=new Map(),original=physical({offsets:storage.offsets},storage.length);
    const now=physical(table,source.length),catalog=new Map(weapons.map(w=>[w.recordIndex,w])),weaponCount=Math.max(...catalog.keys())+1;
    const empty=unusedUnitPreimageFrom(source,table,gameId,new Set(entries.map(e=>table.offsets[e.recordIndex])));if(!empty)return null;
    for(const entry of entries) {
      const p=preset(entry.preset),at=table.offsets[entry.recordIndex],end=now.find(r=>r.start===at)?.end;
      const donor=table.offsets[p.donor],donorEnd=now.find(r=>r.start===donor)?.end,old=original.find(r=>r.start===storage.offsets[p.donor]);
      if(!Number.isInteger(at)||!Number.isInteger(donor)||!old||r16(source,at+2)!==p.graphic)return null;
      const researched=(entry.loadoutVersion??0)>=1;
      const count=researched?unitConstructionLoadout(p.id,entry.loadoutVersion).weapons.length:(old.end-old.start-50)/4,
        list=weaponsOfUnit(source,at,end,weaponCount),donorList=weaponsOfUnit(source,donor,donorEnd,weaponCount);
      if(!Number.isInteger(count)||count<1||count>16||list.status!=='known'||donorList.status!=='known'
        ||list.entries.length<count||list.entries.length>16||!researched&&donorList.entries.length<count
        ||list.declaredAmmoSlots!==new Set(list.entries.map(e=>e.ammoSlot).filter(Boolean)).size)return null;
      const expected=source.slice(donor,donor+46);w16(expected,2,p.graphic);
      if(nativeMap){const icon=srw4NativeIconId(p.id,gameId);if(icon===null)return null;expected[0]=(expected[0]&254)|(icon>>>8);expected[1]=icon&255;}
      if(entry.loadoutVersion===2)writeSSeparatedStructure(expected,p.id);
      const role=cruiserRole(entries,entry.recordIndex);
      if(['g-cruiser','s-g-cruiser'].includes(entry.preset)&&role!==1)return null;
      if(role!==null){
        writeExSCruiserStructure(expected,role);
        const slot=role===0?2:1;
        if(source[at+36+slot*2]!==17||source[at+37+slot*2]!==0)return null;
      }
      if(!same(masked(source.subarray(at,at+46),UNIT_CONSTRUCTION_NUMERIC_MASKS),masked(expected,UNIT_CONSTRUCTION_NUMERIC_MASKS)))return null;
      for(let i=0;i<count;i++) {
        const actual=list.entries[i].raw,wanted=researched?[i<<3,0,0,0]:donorList.entries[i].raw;
        if((actual[0]&248)!==(wanted[0]&248)||(actual[2]&192)!==(wanted[2]&192)||actual[3]!==wanted[3])return null;
      }
      if(researched){
        const seenAmmo=new Set();
        for(const base of list.entries.slice(0,count)){
          const w=catalog.get(base.weaponIndex);
          if(!w||(w.ammo?base.ammoSlot<1||base.ammoSlot>16||seenAmmo.has(base.ammoSlot):base.ammoSlot!==0))return null;
          if(base.ammoSlot)seenAmmo.add(base.ammoSlot);
        }
      }
      const slots=new Set(list.entries.slice(0,count).map(e=>e.slot)),ammo=new Set(list.entries.slice(0,count).map(e=>e.ammoSlot).filter(Boolean));
      for(const extra of list.entries.slice(count)) {
        const w=catalog.get(extra.weaponIndex);
        if(!w||slots.has(extra.slot)||extra.requiresFlag||(extra.raw[2]&192)||extra.raw[3]!==0
          ||(w.ammo?extra.ammoSlot<1||extra.ammoSlot>16||ammo.has(extra.ammoSlot):extra.ammoSlot!==0))return null;
        slots.add(extra.slot);if(extra.ammoSlot)ammo.add(extra.ammoSlot);
      }
      replacements.set(at,empty);
    }
    const base=decoded.slice(0,profile.decodedLength);
    for(const entry of entries) {
      const slot=storage.restoration.slots.find(s=>s.recordIndex===entry.recordIndex);
      w32(base,storage.restoration.nameStart+4*entry.recordIndex,slot.nameDelta);
    }
    const active=replaceUnitTableRecords(source,table,replacements);
    return {decoded:appendConstructedUnitTable(base,active,storage,profile.decodedLength,[],gameId),restorations:entries};
  } catch{return null;}
}
