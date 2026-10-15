import {inspectWeaponAnimation,weaponAnimationSpan} from './editor-weapon-authoring.mjs?v=20261015-stocknames2';
// A unit-list absence is an observed reference property, not proof that a
// weapon is secret, obtainable, or unused by event code. No names are guessed
// from sprite appearance. Source selectors never become caller write rights.
export function catalogBattleWeaponMotions({weapons,weaponData,animationData}={}){
 if(!Array.isArray(weapons)||weapons.length>4096||!(weaponData instanceof Uint8Array)||!(animationData instanceof Uint8Array))throw new Error('Battle catalog: bounded authenticated tables required');
 const v=new DataView(weaponData.buffer,weaponData.byteOffset,weaponData.byteLength),template=weaponAnimationSpan(animationData,0),programs=new Map();
 const templateBytes=animationData.subarray(template.start,template.end);
 const entries=weapons.filter(row=>row.nameStatus==='decoded'&&row.recordKind==='regular').map(row=>{
  const offset=row.byteOffset;if(!Number.isInteger(offset)||offset<0||offset+17>weaponData.length)throw new Error('Battle catalog: invalid weapon record');
  const selector=v.getUint16(offset+3);let program=programs.get(selector);
  if(!program){
   try{
    const parsed=inspectWeaponAnimation(animationData,selector),bytes=animationData.subarray(parsed.start,parsed.end);
    const isTemplate=bytes.length===templateBytes.length&&bytes.every((b,i)=>b===templateBytes[i]);
    program={selector,status:isTemplate?'template':parsed.instructions.some(i=>i.opcode!==254&&i.opcode!==255)?'source-program':'empty',sequenceCount:parsed.count,instructionCount:parsed.instructions.length,diagnosticCount:parsed.diagnostics.length};
   }catch{program={selector,status:'unresolved'};}
   programs.set(selector,program);
  }
  const shared=weapons.filter(other=>other.owners?.length&&Number.isInteger(other.byteOffset)&&other.byteOffset>=0&&other.byteOffset+17<=weaponData.length&&v.getUint16(other.byteOffset+3)===selector);
  // Original TSRViewer weaponload reads bit15 as MAP and bits13:8 as
  // weaponMapNumber. Keep these source attributes read-only: they do not
  // grant MAP layout/animation editing or establish event availability.
  const attributes=v.getUint16(offset),mapWeapon=Boolean(attributes&0x8000);
  return {recordIndex:row.recordIndex,name:row.name,ownership:row.ownership,ownerCount:row.owners?.length??0,
   mapWeapon,mapPatternIndex:mapWeapon?attributes>>>8&63:null,
   sharedOwnerUnits:[...new Set(shared.flatMap(other=>other.owners.map(owner=>owner.unit??owner.unitIndex)))].filter(Number.isInteger),
   motionStatus:program.status,sequenceCount:program.sequenceCount,instructionCount:program.instructionCount,
   previewEligible:row.editable&&row.attack>0&&program.status==='source-program',
   sourceScope:'authenticated-weapon-record-and-disc-program'};
 });
 return {format:'battle-weapon-motion-catalog-v1',entries,counts:{linked:entries.filter(r=>r.ownerCount).length,
  unlinked:entries.filter(r=>r.ownership==='unowned'&&!r.ownerCount).length,unlinkedPrograms:entries.filter(r=>r.ownership==='unowned'&&!r.ownerCount&&r.previewEligible).length},
  scope:'unit-weapon-table-links; event use and gameplay availability not inferred'};
}
