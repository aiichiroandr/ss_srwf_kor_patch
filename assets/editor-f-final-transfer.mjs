// Only like-for-like balance values. No records, skills, flags, voice IDs,
// equipment links, text, scenario assets, or other game-specific meanings.
const supported = Object.freeze({
 unit: Object.freeze(['hp','en','armor','speed','limit','killMoney','killExp','partSlots','move','ground','sea','air','space','shield','parry']),
 pilot: Object.freeze(['exp','atk','shot','agi','hit','tech','cnt','mp','ground','sea','air','space','attackGrowth','shotGrowth','hitGrowth','techGrowth','agiGrowth','cntGrowth','mindGrowth']),
 weapon: Object.freeze(['attack','hit','minRange','maxRange','terrain','energy','ammo','requiredMorale','postMove']),
});
const table = Object.freeze({unit:'units',pilot:'pilots',weapon:'weapons'});
// Legacy exports before identity metadata can only be interpreted if their
// declared source is one of the already verified, same-data F releases.
const knownLegacyF = /^srwf-f-20260928-v0-5-[abc]$/;
const typedIdentity = (kind, digest) => `${kind}:1:${digest}`;

export function prepareFinalBalanceTransfer(source, session, verifiedFinalTransfer) {
 const entries={},skipped=[];
 const usedTarget=new Set();
 for(const [kind,list] of Object.entries(source.entries)){
  const approved = Object.hasOwn(verifiedFinalTransfer,kind) ? verifiedFinalTransfer[kind] : null;
  const rows=new Map((approved ? (session[table[kind]] ?? []) : []).map(row=>[row.recordIndex,row]));
  entries[kind]=[];
  for(const entry of list){
   const id=entry.recordIndex;
   const digest=approved&&Object.hasOwn(approved,id)?approved[id]:null;
   const stamp=digest&&typedIdentity(kind,digest);
   const row=rows.get(id);
   const legacy=entry.identity==null&&knownLegacyF.test(source.releaseId??'');
   // A construction/clone is never the original record, on either side.
   const targetHasStamp=row?.identity===stamp||(kind==='weapon'&&row?.identityAliases?.includes(stamp));
   const sourceMatches=entry.identity===stamp||(kind==='weapon'&&(entry.identity===row?.identity||row?.identityAliases?.includes(entry.identity)))||legacy;
   const verified=Boolean(stamp&&row?.recordKind==='regular'&&row.editable===true&&targetHasStamp&&sourceMatches&&
     !row.construction&&!row.weaponClone&&!entry.construction&&!usedTarget.has(`${kind}:${id}`));
   const skip=(field,reason)=>skipped.push({kind,field,recordIndex:id,name:entry.name,status:'skip',reason,sourceOnly:true});
   const fields=[];
   for(const item of entry.fields){
    if(!approved||!supported[kind].includes(item.field))skip(item.field,'transfer-unsupported');
    else if(!verified)skip(item.field,'transfer-unverified');
    else fields.push(item);
   }
   for(const field of ['skills','spirits','weaponAdditions','construction'])if(entry[field])skip(field,'transfer-unsupported');
   if(fields.length){
    usedTarget.add(`${kind}:${id}`);
    entries[kind].push({recordIndex:id,name:row.name,identity:row.identity,fields});
   }
  }
 }
 return {preset:{...source,gameId:'srwf-final',entries},skipped};
}
