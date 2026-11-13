// Final74's no-transfer new-game initializer only. The archive/image caller
// authenticates the normalized scenario and current construction records.
// C0.0D 80 tests every persistent unit row, including an unassigned hangar
// unit; C0.0D 00 similarly tests pilots. Neither query requires a map actor.
const MAGIC=new TextEncoder().encode('SRW4NG01'),FOOTER=32,LIMIT=0x9000;
const HOOKS=Object.freeze([2237,2255]),HELPER=2270,LEVEL=31;
export const SRW4_START_PRESETS=Object.freeze(['s-gundam','s-g-cruiser','ex-s-gundam','g-cruiser','sirbine','zwauss','blood-temple']);
const BASE_INDICES=Object.freeze([0,2,4,5,6]);
function fail(message){const error=new Error(message);error.code='EDITOR_SRW4_START_ROSTER_INVALID';throw error;}
import {bytesEqual as same} from './editor-bytes.mjs?v=20261113-alicecopies1';
function checkedConfig(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['version','unitIds','aliceEnabled','alicePilotId','aliceLevel'].includes(k))
  ||input.version!==1||typeof input.aliceEnabled!=='boolean'||input.alicePilotId!==399||input.aliceLevel!==LEVEL
  ||!Array.isArray(input.unitIds)||input.unitIds.length!==7||input.unitIds.some(n=>!Number.isInteger(n)||n<1||n>511)||new Set(input.unitIds).size!==7
  ||input.unitIds[1]!==input.unitIds[0]+1||input.unitIds[3]!==input.unitIds[2]+1)fail('제4차 새 게임 기체 구성의 식별·변형 연결을 확인하지 못했습니다.');
 return Object.freeze({version:1,unitIds:Object.freeze([...input.unitIds]),aliceEnabled:input.aliceEnabled,alicePilotId:399,aliceLevel:LEVEL});
}
export function makeSrw4StartRosterConfig(units,{gameId,aliceEnabled=false}={}){
 if(gameId==='srwf-f')return null;
 if(gameId!=='srwf-final'||!Array.isArray(units)||typeof aliceEnabled!=='boolean')fail('완결편의 검증된 기체 목록이 필요합니다.');
 const imported=units.filter(u=>u.srw4Native===true);
 if(!imported.length)return null;
 const rows=SRW4_START_PRESETS.map(p=>{
  const matches=imported.filter(u=>(u.construction?.preset??u.pendingConstruction)===p);
  if(matches.length!==1)fail('제4차 새 게임 등록에는 기본 기체 5대와 연결된 변형 2형태가 필요합니다.');
  return matches[0];
 });
 for(const i of [0,2])for(const form of [0,1]){
  const row=rows[i+form];
  if(row.saveUnitKind!==1||row.saveUnitForm!==form||row.constructionGroupRoot!==rows[i].recordIndex)fail('제4차 기체의 실제 두 형태 연결이 예상과 다릅니다.');
 }
 return checkedConfig({version:1,unitIds:rows.map(u=>u.recordIndex),aliceEnabled,alicePilotId:399,aliceLevel:LEVEL});
}
function checkBody(body){
 const b=body?.decoded;
 if(!(b instanceof Uint8Array)||b.length<HELPER+4||b.length>LIMIT||!Array.isArray(body.roots)||body.roots.length!==14||!Array.isArray(body.slots)||body.slots.length!==1||body.slots[0]!==74)fail('완결편 새 게임 시나리오의 경계가 예상과 다릅니다.');
 const view=new DataView(b.buffer,b.byteOffset,b.byteLength);
 if(body.roots.some((n,i)=>!Number.isInteger(n)||n<56||n>=b.length||n!==i*4+view.getInt32(i*4))||body.roots[2]!==1975)fail('완결편 새 게임 시나리오의 루트가 예상과 다릅니다.');
 // Both callers follow their original super/real roster construction. The
 // next BF00 selects Final100/102; the F-save-transfer code is untouched.
 if(!same(b.subarray(2240,2252),Uint8Array.of(0xbf,0,100,0xbf,3,30,0xe7,3,0xe9,1,255,254))
  ||!same(b.subarray(2258,2270),Uint8Array.of(0xbf,0,102,0xbf,3,67,0xe7,3,0xe9,1,255,254))
  ||!same(b.subarray(HELPER,HELPER+4),Uint8Array.of(0xd0,2,0,53)))fail('완결편 새 게임의 원래 편성·이동 명령이 예상과 다릅니다.');
 return b;
}
function relative(view,cell,target){const d=target-cell;if(d< -32768||d>32767)fail('새 게임 등록 명령의 분기 범위를 넘었습니다.');view.setInt16(cell,d);}
function program(base,config){
 const out=[],refs=[];
 const emit=(...bytes)=>out.push(...bytes);
 const ref=(target)=>{refs.push([out.length,target]);emit(0,0);};
 emit(3);ref(HELPER);
 const query=(id,mode,skip)=>{emit(0xc0,0x0d,mode,id>>>8,id&255,0xf0,0);const cell=out.length;emit(0,0);skip.push(cell);};
 for(const index of BASE_INDICES){
  const skip=[],id=config.unitIds[index];query(id,0x80,skip);
  if(index===0||index===2)query(config.unitIds[index+1],0x80,skip);
  emit(0xc2,4,id>>>8,id&255);
  for(const cell of skip)refs.push([cell,base+out.length]);
 }
 if(config.aliceEnabled){
  const skip=[];query(399,0,skip);
  const packed=LEVEL*512+399;emit(0xc1,6,packed>>>8,packed&255);
  for(const cell of skip)refs.push([cell,base+out.length]);
 }
 emit(4);
 const bytes=Uint8Array.from(out),view=new DataView(bytes.buffer);
 for(const [cell,target]of refs){const d=target-base-cell;if(d< -32768||d>32767)fail('새 게임 등록 명령의 분기 범위를 넘었습니다.');view.setInt16(cell,d);}
 return bytes;
}
function install(canonical,config){
 const code=program(canonical.length,config),bytes=new Uint8Array(canonical.length+code.length+FOOTER);
 if(bytes.length>LIMIT)fail('새 게임 등록이 시나리오 작업 공간을 넘었습니다.');
 bytes.set(canonical);bytes.set(code,canonical.length);const view=new DataView(bytes.buffer);
 for(const at of HOOKS){if(canonical[at]!==3||at+1+new DataView(canonical.buffer,canonical.byteOffset,canonical.byteLength).getInt16(at+1)!==HELPER)fail('새 게임 등록 위치에 다른 변경이 있습니다.');relative(view,at+1,canonical.length);}
 const footer=bytes.length-FOOTER;bytes.set(MAGIC,footer);view.setUint32(footer+8,canonical.length);bytes[footer+12]=Number(config.aliceEnabled);bytes[footer+13]=LEVEL;
 config.unitIds.forEach((id,i)=>view.setUint16(footer+14+i*2,id));
 return bytes;
}
export function normalizeSrw4StartRosterBody(body,{gameId}={}){
 const b=body?.decoded;
 if(!(b instanceof Uint8Array))fail('시나리오 바이트가 없습니다.');
 const marked=b.length>=FOOTER&&same(b.subarray(b.length-FOOTER,b.length-FOOTER+8),MAGIC);
 if(gameId!=='srwf-final'){if(marked)fail('다른 게임에 완결편 새 게임 등록 기록이 있습니다.');return {body,config:null};}
 if(!body.slots?.includes(74)){if(marked)fail('새 게임 등록 기록이 다른 시나리오에 있습니다.');return {body,config:null};}
 // No marker means no normalization permission. A damaged/missing marker
 // leaves redirects and appended bytes intact for the original scope check.
 if(!marked)return {body,config:null};
 checkBody(body);
 const footer=b.length-FOOTER,view=new DataView(b.buffer,b.byteOffset,b.byteLength),length=view.getUint32(footer+8);
 if(length<=HELPER+4||length>=footer||b[footer+12]>1||b[footer+13]!==LEVEL||b.subarray(footer+28).some(Boolean))fail('새 게임 등록 기록의 크기·옵션이 잘못되었습니다.');
 const config=checkedConfig({version:1,unitIds:Array.from({length:7},(_,i)=>view.getUint16(footer+14+i*2)),aliceEnabled:!!b[footer+12],alicePilotId:399,aliceLevel:LEVEL});
 const canonical=b.slice(0,length),v=new DataView(canonical.buffer);
 for(const at of HOOKS){canonical[at]=3;relative(v,at+1,HELPER);}
 const clean={...body,decoded:canonical};checkBody(clean);
 if(!same(install(canonical,config),b))fail('새 게임 등록 명령이 검증된 형식과 다릅니다.');
 return {body:clean,config};
}
export function applySrw4StartRosterBody(body,config,{gameId='srwf-final'}={}){
 if(gameId!=='srwf-final')fail('제4차 초기 보유 등록은 완결편에서만 지원합니다.');
 const clean=normalizeSrw4StartRosterBody(body,{gameId}).body;
 if(config===null)return clean;
 const checked=checkedConfig(config);return {...clean,decoded:install(checkBody(clean),checked)};
}
