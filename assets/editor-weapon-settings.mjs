// Keep UI, export and preset snapshots on the same explicit field contract.
export function copyWeaponAuthoringEntries(entries){
 return entries.map(({weaponIndex,sourceWeapon,unitIndex,edits,animationWeapon,name,imports})=>({
  weaponIndex,sourceWeapon,unitIndex,edits:edits.map(edit=>({...edit})),
  ...(imports?.length?{imports:imports.map(({targetSequence,donorWeapon,donorSequence,placement})=>({targetSequence,donorWeapon,donorSequence,...(placement!==undefined?{placement}:{})}))}:{}),
  ...(animationWeapon!==undefined?{animationWeapon}:{}),...(name!==undefined?{name}:{}),
 }));
}

// Previewing a donor must not show that donor's personal motion overrides.
// Other recipes stay present so unrelated newly created weapons remain valid.
export function weaponAnimationPreviewEntries(entries,weaponIndex,{original=false}={}){
 const copy=copyWeaponAuthoringEntries(entries);
 return original?copy.filter(entry=>entry.weaponIndex!==weaponIndex):copy;
}

// Count changed weapon recipes, including removal from a reopened personal image.
// Entry ordering is not a user change; individual operand order follows the writer contract.
export function changedWeaponAuthoringIndices(entries,original=[]){
 const current=new Map(copyWeaponAuthoringEntries(entries).map(row=>[row.weaponIndex,row]));
 const before=new Map(copyWeaponAuthoringEntries(original).map(row=>[row.weaponIndex,row]));
 return [...new Set([...before.keys(),...current.keys()])].filter(id=>JSON.stringify(current.get(id))!==JSON.stringify(before.get(id))).sort((a,b)=>a-b);
}
