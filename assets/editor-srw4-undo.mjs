// Session-only import undo. This is editor state, never ROM authentication.
const copy=value=>structuredClone(value);
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const index=rows=>new Map(rows.map(row=>[row.recordIndex,row]));

export function captureSrw4Import(before,after){
 const previous=index(before.units);
 return copy({before,after,added:after.units.filter(row=>row.pendingConstruction&&!previous.get(row.recordIndex)?.construction).map(row=>row.recordIndex)});
}

// A JSON-imported, not-yet-saved package also has its original empty rows.
// An already saved package cannot be removed through these pending snapshots.
export function pendingSrw4Import(units,weapons){
 const forms=units.filter(row=>row.srw4Native);
 if(forms.length!==7||forms.some(row=>!row.pendingConstruction||!row.constructionSource||row.constructionSource.construction))return null;
 const ids=new Set(forms.map(row=>row.recordIndex));
 return captureSrw4Import({
  units:units.map(row=>ids.has(row.recordIndex)?row.constructionSource:row),
  weapons:weapons.map(row=>row.pendingWeaponClone&&row.constructionWeaponRole&&row.cloneSource?row.cloneSource:row),
 },{units,weapons});
}

// Revert only import changes on existing rows. Later personal edits survive.
function merge(row,before,after){
 const next=copy(row);
 for(const key of new Set([...Object.keys(before),...Object.keys(after)])){
  if(equal(before[key],after[key])||!equal(row[key],after[key]))continue;
  if(Object.hasOwn(before,key))next[key]=copy(before[key]);else delete next[key];
 }
 return next;
}
function usedWeapons(units){
 const used=new Set();
 for(const row of units){
  for(const [i,entry]of(row.weaponList?.entries??[]).entries())used.add(row[`weapon${i+1}`]??entry.weaponIndex);
  for(const id of row.weaponAdditions??[])used.add(id);
 }
 return used;
}
export function rollbackSrw4Import(transaction,current){
 if(!transaction)throw new RangeError('No pending cartridge import');
 const beforeUnits=index(transaction.before.units),afterUnits=index(transaction.after.units),added=new Set(transaction.added);
 const units=current.units.map(row=>{
  const before=beforeUnits.get(row.recordIndex),after=afterUnits.get(row.recordIndex);
  if(!before||!after)return copy(row);
  return added.has(row.recordIndex)?copy(before):merge(row,before,after);
 });
 const used=usedWeapons(units),beforeWeapons=index(transaction.before.weapons),afterWeapons=index(transaction.after.weapons),keptWeapons=[];
 const weapons=current.weapons.map(row=>{
  const before=beforeWeapons.get(row.recordIndex),after=afterWeapons.get(row.recordIndex);
  if(!before||!after)return copy(row);
  if(!before.weaponClone&&after.weaponClone){
   if(used.has(row.recordIndex)){keptWeapons.push(row.recordIndex);return copy(row);}
   return copy(before);
  }
  return merge(row,before,after);
 });
 return {units,weapons,removed:transaction.added.length,keptWeapons};
}
