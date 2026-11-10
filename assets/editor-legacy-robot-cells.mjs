// Final v0.3 keeps a second copy of six C_ROBOT archive cells inside the TSR.
// The v0.3 EXEC routine at 0x060AE408 scans the id table at RAM 0x20288A90
// (decoded TSR 0x6BA90: 3D 3E C8 C9 CF D0) and, for a listed graphic, reads
// the 8-byte cell at 0x20288A98 + k*8 (literal at 0x060AE434) instead of the
// TSR root-1 copy of the C_ROBOT header. Those cells are the header entries
// id*8 of the stock archive. When an added unit repacks C_ROBOT.BIN, root 1
// follows the new archive; these six cells must follow it too, or the ability
// screen of graphics 61/62/200/201/207/208 (사이버스터·사이버드·밧슈·아톨·
// 진겟타1·진겟타2) reads from a stale offset.
import {bytesEqual,dataView} from './editor-bytes.mjs?v=20261110-part2';

export const LEGACY_ROBOT_CELLS=Object.freeze({
 ids:Object.freeze([61,62,200,201,207,208]),
 table:0x6ba90,cells:0x6ba98,
 // EXEC file '0' (LBA 24, 758,232 bytes, loaded at 0x06004000).
 execBytes:758232,execTableLiteral:0xaa430,execCellsLiteral:0xaa434,
 ramTable:0x20288a90,ramCells:0x20288a98,
});
const P=LEGACY_ROBOT_CELLS,END=P.cells+8*P.ids.length;

function invalid(message){const e=new Error(message);e.code='EDITOR_BATTLE_COMPONENT_INVALID';throw e;}
const tableAt=decoded=>decoded instanceof Uint8Array&&decoded.length>=END&&P.ids.every((id,k)=>decoded[P.table+k]===id);
function literalsAt(exec){
 if(!(exec instanceof Uint8Array)||exec.length!==P.execBytes)return false;
 const v=dataView(exec);
 return v.getUint32(P.execTableLiteral)===P.ramTable&&v.getUint32(P.execCellsLiteral)===P.ramCells;
}

// present: the TSR id table and both EXEC literals agree. Exactly one of the
// two means an image this editor does not understand; refuse instead of
// guessing. Neither (F, synthetic tests, another base) leaves the TSR alone.
export function legacyRobotCellsState(decoded,{gameId,exec=null}={}){
 if(gameId!=='srwf-final')return Object.freeze({present:false});
 const table=tableAt(decoded),literal=literalsAt(exec);
 if(table!==literal)invalid('능력 화면 기체 그림 칸(TSR 0x6BA98)과 실행 파일의 연결을 함께 확인하지 못했습니다. 이 이미지에는 기체 추가 결과를 저장할 수 없습니다.');
 return Object.freeze({present:table});
}

const cellOf=(bytes,at)=>bytes.subarray(at,at+8);

// Export: copy the header entry id*8 of the archive being written into each
// cell. `header` is the C_ROBOT header that root 1 now carries. Returns true
// when a byte changed; the TSR is changed in place.
export function syncLegacyRobotCells(decoded,header,options={}){
 if(!legacyRobotCellsState(decoded,options).present)return false;
 if(!(header instanceof Uint8Array)||header.length<8*(Math.max(...P.ids)+1))invalid('전투 그림 주소표가 능력 화면 기체 그림을 담지 못합니다.');
 let changed=false;
 P.ids.forEach((id,k)=>{
  const at=P.cells+8*k,entry=cellOf(header,8*id);
  if(!bytesEqual(cellOf(decoded,at),entry)){decoded.set(entry,at);changed=true;}
 });
 return changed;
}

// Open: each cell must equal either the stock archive's entry (stock image or
// an output of an earlier editor, which never touched the cells) or the entry
// of the archive the image carries (an output of this editor). Returns a copy
// with the stock entries, so the immutable TSR hash compares the stock cells.
export function normalizeLegacyRobotCells(decoded,{gameId,originalHeader,currentHeader}){
 if(gameId!=='srwf-final'||!tableAt(decoded))return decoded;
 let out=decoded;
 P.ids.forEach((id,k)=>{
  const at=P.cells+8*k,cell=cellOf(decoded,at),original=cellOf(originalHeader,8*id),current=cellOf(currentHeader,8*id);
  if(original.length!==8||current.length!==8)invalid('전투 그림 주소표가 능력 화면 기체 그림을 담지 못합니다.');
  if(bytesEqual(cell,original))return;
  if(!bytesEqual(cell,current))invalid('능력 화면 기체 그림 칸이 전투 그림 주소표와 일치하지 않습니다.');
  if(out===decoded)out=decoded.slice();
  out.set(original,at);
 });
 return out;
}

// Cells that disagree with the archive (an output of an earlier editor).
export function staleLegacyRobotCells(decoded,header,{gameId}={}){
 if(gameId!=='srwf-final'||!tableAt(decoded)||!(header instanceof Uint8Array))return [];
 return P.ids.filter((id,k)=>!bytesEqual(cellOf(decoded,P.cells+8*k),cellOf(header,8*id)));
}
