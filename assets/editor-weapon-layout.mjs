// Structural local experiment: clone a weapon into a VERIFIED free record and
// fund one new unit entry by removing a VERIFIED unused unit's sentinel entry.
// The caller must supply authenticated admission; this is not a public writer.
import {weaponsOfUnit} from './editor-weapon-links.mjs?v=20261012-weapons2';
import {isWeaponRequiredSkillEditable} from './editor-facts.mjs?v=20261012-weapons2';
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

// Canonicalize ONLY the project-defined additions and animation references.
// The caller must compare the result with a pinned immutable TSR hash. Any
// unrelated pointer/list/name mutation remains visible to that comparison.
export function normalizeWeaponProjectTsr(decoded,root,gameId,project){
 const final=gameId==='srwf-final';
 if(!['srwf-f','srwf-final'].includes(gameId)||project?.gameId!==gameId
  ||!(decoded instanceof Uint8Array)||!Array.isArray(root)||!Array.isArray(project.entries)
  ||!(project.canonicalBytes instanceof Uint8Array))fail('Invalid project normalization.');
 const result=decoded.slice(),unitRoot=root[27],weaponRoot=root[29],nameRoot=root[14],directoryRoot=root[6];
 for(const segment of [unitRoot,weaponRoot,nameRoot,directoryRoot])if(!segment||!Number.isSafeInteger(segment.start)
  ||!Number.isSafeInteger(segment.end)||segment.start<0||segment.end>decoded.length||segment.end<segment.start)fail('Invalid project root.');
 const units=table(decoded.subarray(unitRoot.start,unitRoot.end),50),weapons=table(decoded.subarray(weaponRoot.start,weaponRoot.end),17);
 if(units.offsets.length!==(final?448:368)||weapons.offsets.length!==(final?1408:1280)
  ||units.offsets.some((p,i)=>i&&p<=units.offsets[i-1]))fail('Unknown project table layout.');
 const reserveFirst=final?1331:1248,reserveLast=final?1343:1278,templateId=final?1407:1279;
 const unitBytes=decoded.subarray(unitRoot.start,unitRoot.end),weaponBytes=result.subarray(weaponRoot.start,weaponRoot.end);
 const d=dv(result),entries=project.entries,creations=new Map(),donors=new Set();
 for(const entry of entries){
  const {weaponIndex,sourceWeapon,unitIndex,donorUnit,sourceSelector,targetSelector}=entry;
  if(![weaponIndex,sourceWeapon,unitIndex,donorUnit,sourceSelector,targetSelector].every(Number.isSafeInteger)
   ||weaponIndex<1||weaponIndex>=weapons.offsets.length||sourceWeapon<1||sourceWeapon>=reserveFirst
   ||unitIndex<1||unitIndex>=units.offsets.length||sourceSelector>=0x0560||targetSelector<0x0560||targetSelector>0x057f)fail('Invalid project binding.');
  const at=weaponRoot.start+weapons.offsets[weaponIndex];
  if(d.getUint16(at+3,false)!==targetSelector)fail('Weapon does not reference its project animation.');
  if(!donorUnit){
   if(weaponIndex!==sourceWeapon||weaponIndex>=reserveFirst)fail('Invalid original weapon animation binding.');
   d.setUint16(at+3,sourceSelector,false);
  }else{
   if(weaponIndex<reserveFirst||weaponIndex>reserveLast||donorUnit<(final?430:354)
    ||donorUnit>=units.offsets.length||donorUnit===unitIndex||donors.has(donorUnit)||creations.has(weaponIndex))fail('Invalid new weapon allocation.');
   creations.set(weaponIndex,entry);donors.add(donorUnit);
  }
 }
 for(const entry of entries){
  const source=weaponRoot.start+weapons.offsets[entry.sourceWeapon];
  if(d.getUint16(source+3,false)!==entry.sourceSelector)fail('Project origin does not match its original weapon.');
 }
 const payloads=new Map(),newReferences=new Map();
 for(let id=0;id<units.offsets.length;id++){
  const start=units.offsets[id],end=units.ends.get(start),list=weaponsOfUnit(unitBytes,start,end,weapons.offsets.length);
  const current=unitBytes.slice(start,end);
  if(donors.has(id)){
   if(list.status!=='known'||list.notes.length||list.entries.length!==0||current.length!==50)fail('Project donor changed outside its sentinel allocation.');
   const restored=new Uint8Array(54);restored.set(current.subarray(0,48));restored[46]=1;restored[47]=0;restored.set([0,1,0,0],48);payloads.set(start,restored);continue;
  }
  const added=list.entries.filter(e=>creations.has(e.weaponIndex));
  if(!added.length){payloads.set(start,current);continue;}
  if(list.status!=='known'||list.notes.length)fail('Project changed a noncanonical unit list.');
  const original=list.entries.filter(e=>!creations.has(e.weaponIndex)),slots=new Set(original.map(e=>e.slot)),ammoSlots=new Set(original.filter(e=>e.ammoSlot).map(e=>e.ammoSlot));
  let removedAmmo=0;
  for(const weapon of added){
   const binding=creations.get(weapon.weaponIndex),source=weapons.offsets[binding.sourceWeapon],hasAmmo=weaponBytes[source+12]>0;
   if(binding.unitIndex!==id||newReferences.has(weapon.weaponIndex)||weapon.requiresFlag||weapon.requiresInvestment
    ||weapon.raw[3]!==0||weapon.raw[2]&0xc0||slots.has(weapon.slot)||!original.some(e=>e.weaponIndex===binding.sourceWeapon)
    ||hasAmmo&&(weapon.ammoSlot<1||weapon.ammoSlot>16||ammoSlots.has(weapon.ammoSlot))||!hasAmmo&&weapon.ammoSlot!==0)fail('New weapon has an invalid independent unit slot.');
   slots.add(weapon.slot);if(hasAmmo){ammoSlots.add(weapon.ammoSlot);removedAmmo++;}newReferences.set(weapon.weaponIndex,id);
  }
  const restored=new Uint8Array(50+original.length*4);restored.set(current.subarray(0,48));
  restored[46]=current[46]-added.length;restored[47]=current[47]-removedAmmo;
  original.forEach((entry,i)=>restored.set(entry.raw,48+i*4));payloads.set(start,restored);
 }
 if(newReferences.size!==creations.size)fail('A new weapon is missing its verified unit owner.');
 let cursor=units.size;
 for(let id=0;id<units.offsets.length;id++){
  const payload=payloads.get(units.offsets[id]);result.set(payload,unitRoot.start+cursor);
  d.setInt32(unitRoot.start+id*4,cursor-id*4,false);cursor+=payload.length;
 }
 if(cursor!==unitRoot.end-unitRoot.start)fail('Project unit table budget does not balance.');
 const emptyCell=nameRoot.start+753*4,emptyAddress=emptyCell+d.getInt32(emptyCell,false);
 if(emptyAddress<0||emptyAddress>=result.length||result[emptyAddress]!==255)fail('Invalid locked empty name reference.');
 const template=weaponBytes.slice(weapons.offsets[templateId],weapons.offsets[templateId]+17);
 // The terminal sentinel has tune nibble 0; the admitted named-table reserve
 // records have nibble 1 in both games. This immutable nibble is not a stat mask.
 template[8]=(template[8]&0xf0)|1;
 for(const [id,entry] of creations){
  const source=weapons.offsets[entry.sourceWeapon],at=weapons.offsets[id];
  if(!weaponBytes.subarray(at,at+3).every((v,i)=>v===weaponBytes[source+i])
   ||(weaponBytes[at+8]&15)!==(weaponBytes[source+8]&15)
   ||(weaponBytes[source+12]===0)!==(weaponBytes[at+12]===0)
   ||weaponBytes[at+15]>150&&weaponBytes[at+15]!==weaponBytes[source+15]
   ||weaponBytes[at+16]!==weaponBytes[source+16]&&!isWeaponRequiredSkillEditable(gameId,weaponBytes[at+16]))fail('New weapon changed an unverified type or usage domain.');
  const nameCell=nameRoot.start+id*4,sourceCell=nameRoot.start+entry.sourceWeapon*4;
  if(nameCell+d.getInt32(nameCell,false)!==sourceCell+d.getInt32(sourceCell,false))fail('New weapon changed an unverified name reference.');
  weaponBytes.set(template,at);d.setInt32(nameCell,emptyAddress-nameCell,false);
 }
 if(directoryRoot.end-directoryRoot.start<6168||!(project.directoryBytes instanceof Uint8Array)
  ||project.directoryBytes.length!==6168||!decoded.subarray(directoryRoot.start,directoryRoot.start+6168)
    .every((v,i)=>v===project.directoryBytes[i]))fail('TSR and animation file directories disagree.');
 result.set(project.canonicalBytes.subarray(0,6168),directoryRoot.start);
 return result;
}
