// Structural local experiment: clone a weapon into a VERIFIED free record and
// fund one new unit entry by removing a VERIFIED unused unit's sentinel entry.
// The caller must supply authenticated admission; this is not a public writer.
import {weaponsOfUnit} from './editor-weapon-links.mjs?v=20261012-battle1';
const own=(o,k)=>o&&typeof o==='object'?Object.getOwnPropertyDescriptor(o,k)?.value:undefined;
const dv=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
function fail(message){const e=new Error(message);e.code='EDITOR_WEAPON_LAYOUT_INVALID';throw e;}
function table(bytes,minimum){
 if(!(bytes instanceof Uint8Array)||bytes.length<8)fail('Missing record table.');
 const d=dv(bytes),size=d.getUint32(0,false);
 if(size<8||size%4||size>bytes.length||size>8192)fail('Invalid record directory.');
 const offsets=Array.from({length:size/4},(_,i)=>i*4+d.getInt32(i*4,false));
 if(offsets.some(p=>p<size||p>=bytes.length))fail('Invalid relative record pointer.');
 const unique=[...new Set(offsets)].sort((a,b)=>a-b),ends=new Map(unique.map((p,i)=>[p,unique[i+1]??bytes.length]));
 if(unique.some(p=>ends.get(p)-p<minimum))fail('Truncated record.');
 return {size,offsets,ends,unique};
}
export function cloneWeaponIntoVerifiedSlot(unitBytes,weaponBytes,request,admission){
 const unitIndex=own(request,'unitIndex'),sourceWeapon=own(request,'sourceWeapon'),targetWeapon=own(request,'targetWeapon'),donorUnit=own(request,'donorUnit');
 const units=table(unitBytes,50),weapons=table(weaponBytes,17);
 for(const [id,count] of [[unitIndex,units.offsets.length],[donorUnit,units.offsets.length],[sourceWeapon,weapons.offsets.length],[targetWeapon,weapons.offsets.length]])if(!Number.isInteger(id)||id<1||id>=count)fail('Invalid record selection.');
 if(unitIndex===donorUnit||sourceWeapon===targetWeapon
  ||own(admission,'unitIndex')!==unitIndex||own(admission,'sourceWeapon')!==sourceWeapon
  ||own(admission,'targetWeapon')!==targetWeapon||own(admission,'donorUnit')!==donorUnit)fail('Missing authenticated clone admission.');
 const selected=weaponsOfUnit(unitBytes,units.offsets[unitIndex],units.ends.get(units.offsets[unitIndex]),weapons.offsets.length);
 const donor=weaponsOfUnit(unitBytes,units.offsets[donorUnit],units.ends.get(units.offsets[donorUnit]),weapons.offsets.length);
 if(selected.status!=='known'||selected.placeholder||selected.entries.length>=16||donor.status!=='known'||!donor.placeholder)fail('No verified unit entry capacity.');
 // Independent reverse-reference scan: an unknown list cannot prove the target
 // free, and aliases may never be activated as distinct new weapon records.
 for(let id=0;id<units.offsets.length;id++){
  const list=weaponsOfUnit(unitBytes,units.offsets[id],units.ends.get(units.offsets[id]),weapons.offsets.length);
  const countOnly=list.status==='inconsistent'&&list.problems.length===1&&list.problems[0]==='count-mismatch';
  if((list.status!=='known'&&!countOnly)||list.rawEntries.some(e=>e.weaponIndex===targetWeapon))fail('Target weapon may already be referenced.');
  // F #126 disagrees only in its count. Check BOTH possible readers, without
  // treating it as an owner or changing its bytes. Even the declared-count
  // path (including bytes across the physical terminator) must exclude target.
  if(countOnly){
   const start=units.offsets[id];
   if(start+48+list.declaredCount*4>unitBytes.length)fail('Unbounded declared weapon count.');
   for(let j=0;j<list.declaredCount;j++){const p=start+48+j*4;if(((unitBytes[p]&7)<<8|unitBytes[p+1])===targetWeapon)fail('Declared-count reader references target.');}
  }
 }
 if(weapons.offsets.filter(p=>p===weapons.offsets[targetWeapon]).length!==1
  ||units.offsets.filter(p=>p===units.offsets[donorUnit]).length!==1
  ||units.offsets.filter(p=>p===units.offsets[unitIndex]).length!==1)fail('An aliased record cannot be allocated.');
 if(!selected.entries.some(e=>e.weaponIndex===sourceWeapon))fail('The source weapon is not owned by the selected unit.');
 const slot=Array.from({length:16},(_,i)=>i+1).find(s=>!selected.entries.some(e=>e.slot===s));
 const ammo=weaponBytes[weapons.offsets[sourceWeapon]+12];
 const ammoSlot=ammo?Array.from({length:16},(_,i)=>i+1).find(s=>!selected.entries.some(e=>e.ammoSlot===s)):0;
 if(!slot||(ammo&&!ammoSlot))fail('No independent upgrade or ammo storage slot.');
 if(selected.notes.length||donor.notes.length)fail('Noncanonical unit entries require separate investigation.');
 const nextUnits=unitBytes.slice(),nextWeapons=weaponBytes.slice(),payloads=new Map();
 for(const start of units.unique)payloads.set(start,unitBytes.slice(start,units.ends.get(start)));
 const old=payloads.get(units.offsets[unitIndex]),grown=new Uint8Array(old.length+4);
 grown.set(old.subarray(0,old.length-2));
 const at=48+selected.entries.length*4;
 grown.set([((slot-1)<<3)|(targetWeapon>>>8),targetWeapon&255,ammoSlot,0],at);
 grown[46]=selected.entries.length+1;grown[47]=selected.declaredAmmoSlots+(ammo?1:0);
 const donorHead=payloads.get(units.offsets[donorUnit]).slice(0,50);
 donorHead[46]=0;donorHead[47]=0;donorHead.fill(0,48);
 payloads.set(units.offsets[unitIndex],grown);payloads.set(units.offsets[donorUnit],donorHead);
 let cursor=units.size;
 for(const start of units.unique){const payload=payloads.get(start);nextUnits.set(payload,cursor);
  for(let id=0;id<units.offsets.length;id++)if(units.offsets[id]===start)dv(nextUnits).setInt32(id*4,cursor-id*4,false);
  cursor+=payload.length;
 }
 if(cursor!==unitBytes.length)fail('The clone exceeded its fixed unit table budget.');
 nextWeapons.set(weaponBytes.subarray(weapons.offsets[sourceWeapon],weapons.offsets[sourceWeapon]+17),weapons.offsets[targetWeapon]);
 const reparsed=table(nextUnits,50),list=weaponsOfUnit(nextUnits,reparsed.offsets[unitIndex],reparsed.ends.get(reparsed.offsets[unitIndex]),weapons.offsets.length);
 if(list.status!=='known'||list.entries.at(-1).weaponIndex!==targetWeapon)fail('Clone failed its structural readback.');
 return {unitBytes:nextUnits,weaponBytes:nextWeapons,unitIndex,sourceWeapon,targetWeapon,donorUnit,slot,ammoSlot,
  scope:'private-structural-experiment',runtimeVerified:false};
}

// Name cells are TSR-wide self-relative pointers. Copy the referenced string,
// not its displacement, so the clone uses an existing supported game name.
// Arbitrary new text needs a separately verified string arena and encoder.
export function cloneWeaponNameReference(decoded,nameSegmentStart,nameCellCount,sourceWeapon,targetWeapon){
 if(!(decoded instanceof Uint8Array)||!Number.isSafeInteger(nameSegmentStart)||nameSegmentStart<0
  ||!Number.isInteger(nameCellCount)||nameCellCount<2||nameCellCount>2048
  ||nameSegmentStart+nameCellCount*4>decoded.length
  ||![sourceWeapon,targetWeapon].every(id=>Number.isInteger(id)&&id>=1&&id<nameCellCount)
  ||sourceWeapon===targetWeapon)fail('Invalid weapon name table.');
 const source=nameSegmentStart+sourceWeapon*4,target=nameSegmentStart+targetWeapon*4;
 const address=source+dv(decoded).getInt32(source,false);
 if(address<0||address>=decoded.length)fail('Invalid existing weapon name reference.');
 const displacement=address-target;
 if(displacement< -0x80000000||displacement>0x7fffffff)fail('Weapon name reference overflow.');
 const result=decoded.slice();dv(result).setInt32(target,displacement,false);
 return result;
}
