// Generated data only: enough record identities to exercise every researched
// preset without copying a byte or translated name from a game image.
import {buildGame} from './synthetic-game.mjs';
import {nameTable,recordTable,weaponRecord,world,NAME} from './synthetic-tsr.mjs';
import {splitRootSegments,dataRecordOffsets} from '../../assets/editor-core.mjs';
import {unitFiller as unusedUnitPreimage} from './synthetic-fillers.mjs';
import {weaponCloneIds} from '../../assets/editor-weapon-clone.mjs';
import {weaponFiller as weaponClonePreimage} from './synthetic-fillers.mjs';

export const CONSTRUCTION_TARGETS=Object.freeze([50,51,52,53,54]);
export const FILLER_DONOR=60;
export function constructionGame(gameId,{clones=false,cannonAnimation=1317}={}){
 const source=buildGame({units:210,unitWeapons:{
  1:[{slot:3,weapon:1,ammo:1,flag:99,investment:true,e2bit6:true},{slot:7,weapon:2}],
  8:[{slot:1,weapon:2}],
  47:[{slot:1,weapon:2}],209:[{slot:4,weapon:1,ammo:1,flag:92}],
 }});
 const root=splitRootSegments(source),parts=Object.fromEntries(root.map((part,i)=>[i,part.bytes]));
 const ammunition=new Map([[1,12],[467,20],[470,8],[474,6],[757,10]]);
 const cloneIds=new Set(weaponCloneIds(gameId));
 const weapons=Array.from({length:clones?(gameId==='srwf-f'?1280:1408):786},(_,id)=>{
  if(clones&&cloneIds.has(id))return weaponClonePreimage(gameId);
  const record=weaponRecord('0020000000012c0730010103cf00000a00');record[12]=ammunition.get(id)??0;
  // This generated fixture models the immutable identity of the cannon donor,
  // not its proprietary VM or graphics bank. Its real animation selector is
  // 1317; using the generic zero selector would test a foreign donor instead.
  if(id===511){record[3]=cannonAnimation>>>8;record[4]=cannonAnimation&255;}
  return record;
 });
 parts[14]=nameTable(weapons.slice(0,clones&&gameId==='srwf-final'?1344:weapons.length).map((_,id)=>clones&&cloneIds.has(id)?NAME.EMPTY:id?Uint8Array.of(0x30+id%10,255):NAME.DASH));
 parts[29]=recordTable(weapons.map((_,id)=>id),weapons);
 const decoded=world(parts,{rooted:true}).decoded,segments=splitRootSegments(decoded),table=dataRecordOffsets(segments[27].bytes,48);
 const dv=new DataView(decoded.buffer),emptyCell=segments[11].start+211*4,emptyName=emptyCell+dv.getInt32(emptyCell);
 // Real images keep more fillers than constructions can use. This named one
 // is not a slot; it is the untouched filler restored targets are copied from.
 decoded.set(unusedUnitPreimage(gameId),segments[27].start+table.offsets[FILLER_DONOR]);
 for(const id of CONSTRUCTION_TARGETS){
  decoded.set(unusedUnitPreimage(gameId),segments[27].start+table.offsets[id]);
  const cell=segments[11].start+id*4;dv.setInt32(cell,emptyName-cell);
 }
 return decoded;
}
