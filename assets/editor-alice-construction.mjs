import {ALICE_EDITOR_FIELDS} from './editor-alice-crew-data.mjs?v=20261110-part2';
const snapshot=row=>Object.fromEntries(ALICE_EDITOR_FIELDS.map(key=>[key,row[key]]));

// A newly chosen Ex-S pair opts into its proposed support crew. A previously
// saved choice or explicit crew choice is never changed by adding another unit.
export function connectDefaultAlice(row,rootId,{explicitChoice=false}={}){
 if(!row||explicitChoice||row.original?.enabled===1||row.crewEnabled===1||!Number.isInteger(rootId))return null;
 const before=snapshot(row);row.enabled=1;row.crewEnabled=1;
 return {rootId,before,applied:snapshot(row)};
}
export function cancelDefaultAlice(row,marker,{hasPair=false}={}){
 if(!row||hasPair)return false;
 if(marker&&ALICE_EDITOR_FIELDS.every(key=>row[key]===marker.applied[key])){
  Object.assign(row,marker.before);return true;
 }
 // Keep later user edits to the AI's identity/SP/spirits; only detach a crew
 // which no longer has a valid pair. The native writer enforces the same rule.
 if(row.crewEnabled===1){row.crewEnabled=0;return true;}
 return false;
}
