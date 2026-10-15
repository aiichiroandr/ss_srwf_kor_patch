// F06040258..060402B4 / Final06045898..060458F4, scene setup phase3.
// Slots6/7 are already created by the owned common-main body attachments.
// This publisher selects owned BTSR group16 pictures and initially hides
// them. Their existing FA43 sequence supplies visibility, pose and material.
// No ellipse, coordinate adjustment or per-frame shadow is manufactured.
//
// Raw unit byte10 low2 -> working unit+0178 bits1..2:
// F0602C6D4..0602C6E2 / Final0603036E..0603037C.
// Working unit+0178 -> packed unit-trait byte1 bits5..6:
// F06063A34..06063A48 / Final06069E94..06069EA8.
export function initializeBattleUnitShadowSelectors(records,{gameId,unitByte10,opponentByte10}={}){
 const byte=value=>Number.isInteger(value)&&value>=0&&value<=255;
 if(!['srwf-f','srwf-final'].includes(gameId)||!byte(unitByte10)||!byte(opponentByte10)
  ||!Array.isArray(records)||![128,129].includes(records.length)
  ||new Set(records).size!==records.length)
  throw new Error('Battle shadow selectors: source unit context is unresolved');
 const assignments=[{slot:6,parentIndex:1,unitByte:unitByte10},
  {slot:7,parentIndex:4,unitByte:opponentByte10}].map(row=>({...row,
   selector:0x100c+(row.unitByte&3),subIndex:12+(row.unitByte&3),actor:records[row.slot]}));
 // The narrow web constructor must provide both actual owned attachments.
 // Refuse a skipped/reordered spawn before altering either record.
 if(assignments.some(({actor,parentIndex,slot})=>!actor||actor.removed
  ||!byte(actor.flags1)||!(actor.flags1&128)||actor.requestByte!==slot
  ||actor.parentIndex!==parentIndex||actor.sequenceIndex!==8
  ||!Number.isInteger(actor.selector)||actor.selector<0||actor.selector>65535))
  throw new Error('Battle shadow selectors: owned body attachments are unresolved');
 const result=assignments.map(({slot,parentIndex,selector,subIndex})=>
  ({slot,parentIndex,selector,frameCacheGroup:16,subIndex}));
 for(const {actor,selector}of assignments){actor.selector=selector;actor.flags1&=191;}
 return {status:'ready',gameId,assignments:result,
  scope:'owned unit size selects body-linked BTSR pictures; FA43 controls their display'};
}
