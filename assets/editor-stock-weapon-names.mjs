import {F_STOCK_NAME_MAP} from './editor-stock-name-map.mjs';
import {sha256Hex} from './sha256.mjs';
import {STOCK_F_NAME_RELOCATIONS as moves} from './editor-stock-weapon-name-profile.mjs';
export const STOCK_F_NAME_SOURCE='c198a93007d46161abe769b6f579f01cae89e23737c0a2ff38ec314d43b3adf8';
const TABLE_HASH='84ac7df600b471deda916364e45116c918fd4a0fb58aa9a7edd831f490d249f1';
const dv=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
const fail=(message,code='EDITOR_WEAPON_NAME_INVALID')=>{const error=new Error(message);error.code=code;throw error;};
export const usesStockWeaponNames=(gameId,baseHash)=>gameId==='srwf-f'&&baseHash===STOCK_F_NAME_SOURCE;
export function stockReservedWeaponNameOffset(gameId,baseHash,id){
 if(!usesStockWeaponNames(gameId,baseHash)||!Number.isInteger(id)||id<1248||id>1278)return null;
 return id<1252?16249+id-1248:id===1265?16250:16253;
}
export function encodeStockWeaponName(value){
 if(typeof value!=='string'||!value.length||value!==value.trim()||value.length>80||/[\u0000-\u001f\u007f]/u.test(value))
  fail('무기 이름은 공백으로 시작하거나 끝나지 않는 1~80자여야 합니다.');
 const bytes=[];
 for(const glyph of value){
  const display=glyph===' '?'　':glyph,ascii=/^[A-Za-z0-9]$/u.test(display);
  const matches=[...F_STOCK_NAME_MAP].filter(([code,text])=>code!=='FF'&&(text===display||ascii&&text.normalize('NFKC')===display))
   .sort(([a],[b])=>a.length-b.length||a.localeCompare(b));
  if(!matches.length)fail(`원본 게임 글꼴에 없는 문자입니다: ${glyph}`);
  const code=matches[0][0];for(let at=0;at<code.length;at+=2)bytes.push(parseInt(code.slice(at,at+2),16));
 }
 if(bytes.length>160)fail('게임 이름 표시 공간을 초과했습니다.');
 return Uint8Array.from([...bytes,255]);
}
function table(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length!==16272)fail('원본 이름 표의 크기가 일치하지 않습니다.');
}
function creations(entries){
 if(!Array.isArray(entries)||entries.length>24)fail('Too many custom weapon names.');
 const seen=new Set(),rows=[];
 for(const entry of entries){
  const {weaponIndex:id,sourceWeapon:source}=entry??{};
  if(!Number.isInteger(id)||!Number.isInteger(source)||seen.has(id)||id<1||id>1278||source<1||source>=1248)
   fail('Invalid original-language name identity.');
  seen.add(id);
  if(id!==source){if(stockReservedWeaponNameOffset('srwf-f',STOCK_F_NAME_SOURCE,id)===null)fail('Invalid new name slot.');rows.push(entry);}
  else if(entry.name!==undefined)fail('An original weapon keeps its own name.');
 }
 return rows;
}
function restoreReserved(bytes,rows){
 const v=dv(bytes);for(const row of rows){const id=row.weaponIndex;v.setInt32(id*4,stockReservedWeaponNameOffset('srwf-f',STOCK_F_NAME_SOURCE,id)-id*4);}
}
function assertCanonical(bytes){if(sha256Hex(bytes)!==TABLE_HASH)fail('원본 이름 표의 검증값이 일치하지 않습니다.');}
function copyAliases(bytes,rows){
 const v=dv(bytes);for(const row of rows){const id=row.weaponIndex,source=row.sourceWeapon;v.setInt32(id*4,source*4+v.getInt32(source*4)-id*4);}
}
// These pools contain exact duplicate strings in the hash-pinned stock table.
// All existing name cells keep identical bytes through a shared retained copy.
// This does not admit another weapon record or widen any TSR write mask.
export function allocateStockWeaponNames(input,entries){
 table(input);const created=creations(entries),canonical=input.slice();restoreReserved(canonical,created);assertCanonical(canonical);
 if(!created.some(row=>row.name!==undefined))return {bytes:input.slice(),allocations:[],usedBytes:0,capacityBytes:348,maxNameBytes:12};
 const result=canonical.slice(),v=dv(result),used=moves.map(()=>0),allocations=[];
 for(const [id,from,to,length]of moves){
  if(!canonical.subarray(from,from+length).every((byte,i)=>byte===canonical[to+i])||id*4+dv(canonical).getInt32(id*4)!==from)
   fail('Original name sharing profile mismatch.');
  v.setInt32(id*4,to-id*4);result.fill(255,from,from+length);
 }
 copyAliases(result,created);
 for(const entry of created.filter(row=>row.name!==undefined)){
  const bytes=encodeStockWeaponName(entry.name),slot=moves.findIndex((row,i)=>row[3]-used[i]>=bytes.length);
  if(slot<0)fail('원본 언어 이름을 저장할 공간이 부족합니다. 이름을 더 짧게 입력해 주세요.','EDITOR_WEAPON_NAME_CAPACITY');
  const at=moves[slot][1]+used[slot];result.set(bytes,at);v.setInt32(entry.weaponIndex*4,at-entry.weaponIndex*4);used[slot]+=bytes.length;
  allocations.push({weaponIndex:entry.weaponIndex,name:entry.name,address:at,byteLength:bytes.length});
 }
 return {bytes:result,allocations,usedBytes:used.reduce((a,b)=>a+b,0),capacityBytes:348,maxNameBytes:12};
}
export function normalizeStockWeaponNames(edited,entries){
 table(edited);const created=creations(entries);if(!created.some(row=>row.name!==undefined))return edited.slice();
 const restored=edited.slice(),v=dv(restored);
 for(const [id,from,to,length]of moves){restored.set(restored.slice(to,to+length),from);v.setInt32(id*4,from-id*4);}
 restoreReserved(restored,created);assertCanonical(restored);
 const expected=allocateStockWeaponNames(restored,entries).bytes;
 if(!edited.every((byte,i)=>byte===expected[i]))fail('Custom name bytes or references do not match their project.');
 // The layout normalizer next verifies these source aliases, then restores
 // each declared creation's exact original empty-name pointer.
 copyAliases(restored,created);return restored;
}
