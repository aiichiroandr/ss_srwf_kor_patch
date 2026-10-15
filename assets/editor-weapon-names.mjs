// Local weapon-name allocation. Accepted Korean tables use bounded FF spans;
// the exact stock F profile shares verified duplicates without TSR growth.
import {F_NAME_MAP,FINAL_NAME_MAP} from './editor-name-map.mjs?v=20261015-stocknames2';
import {usesStockWeaponNames,encodeStockWeaponName,allocateStockWeaponNames,normalizeStockWeaponNames} from './editor-stock-weapon-names.mjs';
export {stockReservedWeaponNameOffset,usesStockWeaponNames,STOCK_F_NAME_SOURCE} from './editor-stock-weapon-names.mjs';
const PROFILES={
 'srwf-f':{length:16272,cells:1280,spans:[[12457,121],[12783,181],[14095,159],[15172,84],[15288,102],[16225,28]]},
 'srwf-final':{length:17259,cells:1344,spans:[[13188,152],[13354,1802],[15560,1699]]},
};
function fail(message,code='EDITOR_WEAPON_NAME_INVALID'){const error=new Error(message);error.code=code;throw error;}
function profile(bytes,gameId){const p=PROFILES[gameId];if(!(bytes instanceof Uint8Array)||!p||bytes.length!==p.length)fail('Unsupported weapon name table.');return p;}
export function encodeWeaponName(value,gameId,baseHash){
 if(usesStockWeaponNames(gameId,baseHash))return encodeStockWeaponName(value);
 if(typeof value!=='string'||!value.length||value!==value.trim()||value.length>80||/[\u0000-\u001f\u007f]/u.test(value))fail('무기 이름은 공백으로 시작하거나 끝나지 않는 1~80자여야 합니다.');
 const map=gameId==='srwf-f'?F_NAME_MAP:gameId==='srwf-final'?FINAL_NAME_MAP:null;if(!map)fail('Unknown game.');
 const bytes=[];
 for(const glyph of value){
  // The owned name font encodes its blank as U+3000. A normal keyboard space
  // uses that same glyph; do not make users enter a full-width space manually.
  const displayGlyph=glyph===' '?'　':glyph;
  const matches=[...map].filter(([code,text])=>text===displayGlyph&&code!=='FF').sort(([a],[b])=>a.length-b.length||a.localeCompare(b));
  if(!matches.length)fail(`게임 글꼴에 없는 문자입니다: ${glyph}`);
  const code=matches[0][0];for(let i=0;i<code.length;i+=2)bytes.push(parseInt(code.slice(i,i+2),16));
 }
 if(bytes.length>160)fail('게임 이름 표시 공간을 초과했습니다.');
 return Uint8Array.from([...bytes,255]);
}
function checkFreeSpans(bytes,p){
 const d=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),occupied=new Uint8Array(bytes.length);
 occupied.fill(1,0,p.cells*4);
 for(let id=0;id<p.cells;id++){
  let at=id*4+d.getInt32(id*4,false),terminated=false;
  // F's accepted table aliases strings in other TSR roots. Such strings
  // cannot touch these spans: the bounded decoder walks forward <=161 bytes.
  if(at<0&&at+161<=p.spans[0][0]||at>=bytes.length)continue;
  if(at<p.cells*4)fail('Weapon name reference overlaps its directory.');
  for(let length=0;length<=160&&at<bytes.length;){
   occupied[at]=1;if(bytes[at]===255){terminated=true;break;}
   const width=bytes[at]>=235&&bytes[at]<=245?2:1;
   if(at+width>bytes.length)fail('Truncated weapon name.');
   if(width===2)occupied[at+1]=1;at+=width;length+=width;
  }
  if(!terminated)fail('Unterminated weapon name.');
 }
 for(const [start,length]of p.spans){
  if(!bytes.subarray(start,start+length).every((v,i)=>v===255&&!occupied[start+i]))fail('Weapon name capacity is not verified free padding.');
 }
}
// Caller must use its authenticated canonical name table, not the edited table.
export function allocateWeaponNames(canonical,gameId,submitted,baseHash){
 if(usesStockWeaponNames(gameId,baseHash))return allocateStockWeaponNames(canonical,submitted);
 const p=profile(canonical,gameId);checkFreeSpans(canonical,p);
 if(!Array.isArray(submitted)||submitted.length>24)fail('Too many custom weapon names.');
 const result=canonical.slice(),d=new DataView(result.buffer),used=p.spans.map(()=>0),seen=new Set(),allocations=[];
 for(const entry of submitted){
  const id=entry?.weaponIndex,name=entry?.name;
  if(!Number.isInteger(id)||id<(gameId==='srwf-f'?1248:1331)||id>=p.cells||seen.has(id))fail('Invalid new weapon name identity.');seen.add(id);
  const bytes=encodeWeaponName(name,gameId),slot=p.spans.findIndex(([,length],i)=>length-used[i]>=bytes.length);
  if(slot<0)fail('새 무기 이름을 저장할 공간이 부족합니다. 이름을 줄이거나 추가한 무기를 삭제해주세요.','EDITOR_WEAPON_NAME_CAPACITY');
  const at=p.spans[slot][0]+used[slot];result.set(bytes,at);d.setInt32(id*4,at-id*4,false);used[slot]+=bytes.length;
  allocations.push({weaponIndex:id,name,address:at,byteLength:bytes.length});
 }
 return {bytes:result,allocations,usedBytes:used.reduce((a,b)=>a+b,0),capacityBytes:p.spans.reduce((a,[,b])=>a+b,0)};
}

// Reopen normalization must verify the exact allocation before restoring it.
// A declared name grants no permission to hide extra bytes in the name pool.
// Returns source-name aliases for the existing weapon-layout normalizer.
export function normalizeAllocatedWeaponNames(edited,gameId,entries,baseHash){
 if(usesStockWeaponNames(gameId,baseHash))return normalizeStockWeaponNames(edited,entries);
 const p=profile(edited,gameId);
 if(!Array.isArray(entries)||entries.length>24)fail('Too many custom weapon names.');
 const named=entries.filter(entry=>entry?.name!==undefined);
 if(!named.length)return edited.slice();
 const restored=edited.slice(),d=new DataView(restored.buffer);
 for(const [start,length]of p.spans)restored.fill(255,start,start+length);
 const seen=new Set();
 for(const entry of named){
  const {weaponIndex,sourceWeapon}=entry;
  if(!Number.isInteger(weaponIndex)||weaponIndex<(gameId==='srwf-f'?1248:1331)||weaponIndex>=p.cells
   ||!Number.isInteger(sourceWeapon)||sourceWeapon<1||sourceWeapon>=(gameId==='srwf-f'?1248:1331)||seen.has(weaponIndex))fail('Invalid custom name origin.');
  seen.add(weaponIndex);const sourceCell=sourceWeapon*4,targetCell=weaponIndex*4;
  d.setInt32(targetCell,sourceCell+d.getInt32(sourceCell,false)-targetCell,false);
 }
 const expected=allocateWeaponNames(restored,gameId,named).bytes;
 if(!edited.every((byte,i)=>byte===expected[i]))fail('Custom name bytes or references do not match their project.');
 return restored;
}
