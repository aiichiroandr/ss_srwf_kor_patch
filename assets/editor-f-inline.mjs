// F's original installation tail is transient. Auxiliary editor records live
// only in the zero gap recovered by SRUCMP06/07 inside the original unit region.
// Names/glyph/construction codecs keep their canonical logical representation;
// only root11/root14 string pointers into that tail move for the game.
import {tsrRuntimeLimit,requireTsrInspectionSize,writeRelative32} from './editor-storage-safety.mjs?v=20261105-part2';
import {repackFUnitOffsetLedger,fUnitOffsetLedgerDiagnostics} from './editor-unit-compact.mjs?v=20261105-part2';
import {bytesEqual as equal,dataView as view} from './editor-bytes.mjs?v=20261105-part2';
const UNIT='SRUCMP06',UNIT7='SRUCMP07',MAGIC='SRFAUX01',HEADER=16;
const marker=(b,at,s)=>at>=0&&at+s.length<=b.length&&[...s].every((c,i)=>b[at+i]===c.charCodeAt(0));
function fail(reason,details={}){const e=Error('F의 이름·글자·복원 기록을 원래 기체 표의 안전한 빈 공간에 저장할 수 없습니다.');e.code='EDITOR_STORAGE_INVALID';e.details={reason,...details};throw e;}
function area(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length<164)return null;
 const d=view(bytes),rootSize=d.getUint32(0),start=108+d.getInt32(108);
 if(rootSize<144||rootSize>512||rootSize%4||start<rootSize||start>=bytes.length)return null;
 let end=bytes.length;for(let cell=0;cell<rootSize;cell+=4){const at=cell+d.getInt32(cell);if(at>start&&at<end)end=at;}
 const footer=end-32;if(!marker(bytes,footer,UNIT)&&!marker(bytes,footer,UNIT7))return null;
 const baseLength=d.getUint32(footer+8),unitStart=d.getUint32(footer+16),unitLength=d.getUint32(footer+20),used=d.getUint32(footer+28);
 if(unitStart!==start||unitStart+unitLength!==end||end>tsrRuntimeLimit('srwf-f')||baseLength<end||used<8||used+34>unitLength)fail('f-inline-layout');
 return {baseLength,begin:start+used+2,footer};
}
function namePointers(bytes,visit,constructed=false){
 const d=view(bytes),start=56+d.getInt32(56),weapons=116+d.getInt32(116);
 if(start<164||weapons<164||weapons+4>bytes.length||d.getUint32(weapons)!==1280*4||start+1280*4>bytes.length)fail('f-inline-name-table');
 for(let id=0;id<1280;id++){const cell=start+id*4,target=cell+d.getInt32(cell);visit(cell,target);}
 if(constructed){
  const units=108+d.getInt32(108),names=44+d.getInt32(44),count=units>=164&&units+4<=bytes.length?d.getUint32(units)/4:0;
  if(!Number.isInteger(count)||count<1||count>1024||names<164||names+count*4>bytes.length)fail('f-inline-unit-names');
  for(let id=0;id<count;id++){const cell=names+id*4;visit(cell,cell+d.getInt32(cell));}
 }
}
// Called on canonical F06/F07 before auxiliary bytes have been placed in its gap.
// Keep historical F06 exact when it fits; only compress its reconstruction
// ledger if auxiliary metadata would otherwise overflow the same original gap.
export function packFInlineAuxiliary(staged,gameId,originalLength=null){
 if(gameId!=='srwf-f')return staged;
 requireTsrInspectionSize(staged,gameId);const a=area(staged);
 if(!a)return staged;
 const base=originalLength??a.baseLength;
 if(!Number.isSafeInteger(base)||base<a.footer+32||base>a.baseLength||a.baseLength>staged.length)fail('f-inline-base');
 if(staged.length===base)return staged;
 let end=a.begin;while(end<a.footer&&staged[end]===0)end++;
 const payloadBytes=staged.length-base,usedBytes=HEADER+payloadBytes,limitBytes=end-a.begin;
 if(usedBytes>limitBytes){const compact=repackFUnitOffsetLedger(staged);if(compact!==staged)return packFInlineAuxiliary(compact,gameId,originalLength);}
 if(usedBytes>limitBytes)fail('f-inline-aux-capacity',{usedBytes,limitBytes,excessBytes:usedBytes-limitBytes,offsetLedger:fUnitOffsetLedgerDiagnostics(staged)});
 const out=staged.slice(0,base),payloadStart=a.begin+HEADER,d=view(out);
 out.set(staged.subarray(base),payloadStart);out.set(new TextEncoder().encode(MAGIC),a.begin);
 d.setUint32(a.begin+8,payloadBytes);d.setUint32(a.begin+12,base);
 namePointers(out,(cell,target)=>{if(target>=base&&target<staged.length)writeRelative32(out,cell,payloadStart+target-base);},base<a.baseLength);
 return out;
}
// Must run before glyph/name readers and before F06/F07 is expanded. Those readers
// and immutable provenance still authenticate all records and original bytes.
export function expandFInlineAuxiliary(stored,gameId){
 if(gameId!=='srwf-f')return stored;
 const a=area(stored);if(!a||!marker(stored,a.begin,MAGIC))return stored;
 const d=view(stored),length=d.getUint32(a.begin+8),base=d.getUint32(a.begin+12),payloadStart=a.begin+HEADER,end=payloadStart+length;
 if(base!==stored.length||a.baseLength<base||a.baseLength>base+length||!length||end>a.footer)fail('f-inline-aux-layout');
 const out=new Uint8Array(base+length);requireTsrInspectionSize(out,gameId);
 out.set(stored);out.fill(0,a.begin,end);out.set(stored.subarray(payloadStart,end),base);
 namePointers(out,(cell,target)=>{if(target>=payloadStart&&target<end)writeRelative32(out,cell,base+target-payloadStart);},base<a.baseLength);
 if(!equal(packFInlineAuxiliary(out,gameId,base),stored))fail('f-inline-aux-noncanonical');
 return out;
}
export function fInlineAuxiliaryUsage(stored,gameId){
 if(gameId!=='srwf-f')return 0;const a=area(stored);
 return a&&marker(stored,a.begin,MAGIC)?HEADER+view(stored).getUint32(a.begin+8):0;
}
