// A UI prerequisite check only. The writer authenticates art, motion and bank
// preimages independently; these row flags never grant binary write access.
export function exSBeamCloneIds(units,weapons){
 const cannonIds=new Set((weapons??[]).filter(w=>w.weaponClone?.sourceRecordIndex===511).map(w=>w.recordIndex)),used=new Set(),shared=new Set();
 for(const unit of units??[]){
  const exs=(unit.construction?.preset??unit.pendingConstruction)==='ex-s-gundam';
  const ids=[...(unit.weaponList?.entries??[]).map((entry,i)=>unit[`weapon${i+1}`]??entry.weaponIndex),...(unit.weaponAdditions??[])];
  for(const id of ids)if(cannonIds.has(id))(exs?used:shared).add(id);
 }
 return [...used].filter(id=>!shared.has(id));
}
export function freshExSBeamCloneIds(units,weapons){
 const fresh=new Set((weapons??[]).filter(w=>w.pendingWeaponClone===511).map(w=>w.recordIndex));
 return exSBeamCloneIds(units,weapons).filter(id=>fresh.has(id));
}
