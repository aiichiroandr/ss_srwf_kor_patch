// Bounded auxiliary storage in verified zero slack; runtime limit is unchanged.
import {requireTsrInspectionSize,tsrRuntimeLimit,writeRelative32} from './editor-storage-safety.mjs?v=20261110-part1';
import {bytesEqual as equal,dataView as view} from './editor-bytes.mjs?v=20261110-part1';
const UNIT='SRUCMP09',MAGIC='SRXAUX01',HEADER=16;
const marker=(b,at,s)=>at>=0&&at+s.length<=b.length&&[...s].every((c,i)=>b[at+i]===c.charCodeAt(0));
function fail(reason,details={}){const e=Error('완결편의 이름·복원 기록을 안전한 기체 표 공간에 저장할 수 없습니다.');e.code='EDITOR_STORAGE_INVALID';e.details={reason,...details};throw e;}
function area(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length<164)return null;
 const d=view(bytes),rootSize=d.getUint32(0),start=108+d.getInt32(108);
 if(rootSize<144||rootSize>512||rootSize%4||start<rootSize||start>=bytes.length)return null;
 let end=bytes.length;for(let cell=0;cell<rootSize;cell+=4){const at=cell+d.getInt32(cell);if(at>start&&at<end)end=at;}
 const footer=end-32;if(!marker(bytes,footer,UNIT))return null;
 const baseLength=d.getUint32(footer+8),unitStart=d.getUint32(footer+16),unitLength=d.getUint32(footer+20),used=d.getUint32(footer+28),ledgerStart=footer-32;
 if(unitStart!==start||unitStart+unitLength!==end||end>tsrRuntimeLimit('srwf-final')||baseLength<end||used<8||start+used+2>ledgerStart)fail('final-inline-aux-layout');
 return {baseLength,begin:start+used+2,ledgerStart};
}
function namePointers(bytes,visit,constructed=false,alice=false){
 const d=view(bytes),start=56+d.getInt32(56),weapons=116+d.getInt32(116);
 if(start<164||weapons<164||weapons+4>bytes.length||d.getUint32(weapons)!==1408*4||start+1344*4>bytes.length)fail('final-inline-name-table');
 for(let id=0;id<1344;id++){const cell=start+id*4;visit(cell,cell+d.getInt32(cell));}
 if(alice){
  const roots=[48,52,112];for(const r of roots){const start=r+d.getInt32(r),cell=start+399*4;
   if(start<164||cell+4>bytes.length)fail('research-alice-pointer-table');
   visit(cell,cell+d.getInt32(cell));
  }
 }
 if(constructed){
  const units=108+d.getInt32(108),names=44+d.getInt32(44),count=units>=164&&units+4<=bytes.length?d.getUint32(units)/4:0;
  if(!Number.isInteger(count)||count<1||count>1024||names<164||names+count*4>bytes.length)fail('final-inline-unit-names');
  for(let id=0;id<count;id++){const cell=names+id*4;visit(cell,cell+d.getInt32(cell));}
 }
}
export function packFinalInlineAuxiliary(staged,gameId,originalLength=null){
 if(gameId!=='srwf-final')return staged;
 requireTsrInspectionSize(staged,gameId);const a=area(staged);if(!a)return staged;
 const base=originalLength??a.baseLength;
 if(!Number.isSafeInteger(base)||base<a.ledgerStart+64||base>a.baseLength||a.baseLength>staged.length)fail('final-inline-aux-base');
 if(staged.length===base)return staged;
 if(staged.subarray(a.begin,a.ledgerStart).some(Boolean))fail('final-inline-aux-nonzero');
 const payloadBytes=staged.length-base,usedBytes=HEADER+payloadBytes,limitBytes=a.ledgerStart-a.begin;
 if(usedBytes>limitBytes)fail('final-inline-aux-capacity',{usedBytes,limitBytes,excessBytes:usedBytes-limitBytes});
 const out=staged.slice(0,base),payloadStart=a.begin+HEADER,d=view(out);
 out.set(staged.subarray(base),payloadStart);out.set(new TextEncoder().encode(MAGIC),a.begin);d.setUint32(a.begin+8,payloadBytes);d.setUint32(a.begin+12,base);
 namePointers(out,(cell,target)=>{if(target>=base&&target<staged.length)writeRelative32(out,cell,payloadStart+target-base);},base<a.baseLength,(marker(staged,staged.length-16,'SRWALC03')||marker(staged,staged.length-16,'SRWALC04')));
 return out;
}
export function expandFinalInlineAuxiliary(stored,gameId){
 if(gameId!=='srwf-final')return stored;
 const a=area(stored);if(!a||!marker(stored,a.begin,MAGIC))return stored;
 const d=view(stored),length=d.getUint32(a.begin+8),base=d.getUint32(a.begin+12),payloadStart=a.begin+HEADER,end=payloadStart+length;
 if(base!==stored.length||a.baseLength<base||a.baseLength>base+length||!length||end>a.ledgerStart)fail('final-inline-aux-layout');
 const out=new Uint8Array(base+length);requireTsrInspectionSize(out,gameId);out.set(stored);out.fill(0,a.begin,end);out.set(stored.subarray(payloadStart,end),base);
 namePointers(out,(cell,target)=>{if(target>=payloadStart&&target<end)writeRelative32(out,cell,base+target-payloadStart);},base<a.baseLength,(marker(out,out.length-16,'SRWALC03')||marker(out,out.length-16,'SRWALC04')));
 if(!equal(packFinalInlineAuxiliary(out,gameId,base),stored))fail('final-inline-aux-noncanonical');return out;
}
export function finalInlineAuxiliaryUsage(stored,gameId){
 if(gameId!=='srwf-final')return 0;const a=area(stored);if(!a||!marker(stored,a.begin,MAGIC))return 0;
 const length=view(stored).getUint32(a.begin+8);if(!length||a.begin+HEADER+length>a.ledgerStart)fail('final-inline-aux-layout');return HEADER+length;
}
