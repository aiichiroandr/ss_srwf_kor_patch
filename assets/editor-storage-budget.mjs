import {tsrRuntimeLimit} from './editor-storage-safety.mjs?v=20261110-part2';
import {unitStorageUsage,fUnitOffsetLedgerDiagnostics,finalInlineLedgerBytes,isFinalReferenceInlineUnitStorage,isFinalInlineUnitStorage} from './editor-unit-compact.mjs?v=20261110-part2';
import {fInlineAuxiliaryUsage} from './editor-f-inline.mjs?v=20261110-part2';
import {finalInlineAuxiliaryUsage} from './editor-final-inline-aux.mjs?v=20261110-part2';
import {pilotLayout,pilotPaddingPairs} from './editor-pilot-layout.mjs?v=20261110-part2';

const row=(id,label,usedBytes,limitBytes,fixed=false)=>Object.freeze({id,label,usedBytes,limitBytes,remainingBytes:limitBytes-usedBytes,fixed});
function pilotPools(segment,rows,gameId){
 const layout=pilotLayout(segment,gameId),byId=new Map(rows.map(r=>[r.recordIndex,r]));
 return layout?.spans.filter(span=>span.records.some(r=>byId.get(r.recordIndex)?.skillEditable||byId.get(r.recordIndex)?.spiritEditable)).map(span=>({id:`pilot-${span.first}-${span.last}`,first:span.first,last:span.last,
  freeBytes:2*span.records.reduce((n,r)=>n+pilotPaddingPairs(byId.get(r.recordIndex),layout.profile.spiritCounts?.[r.recordIndex]??0),0)}))??[];
}
export function editorStorageBudget({session,logical,stored,root,unitStorage,pilots,sourcePilots,nameBytes=0,glyphBytes=0,glyphCount=0,cloneBytes=0,cloneCount=0}){
 const gameId=session.descriptor.gameId,maximum=tsrRuntimeLimit(gameId),originalTail=gameId==='srwf-f'&&stored.length>maximum?stored.length-maximum:0;
 const rows=[row('tsr',gameId==='srwf-final'?'게임 RAM · CD 로더 보호 2 KiB 제외':originalTail?'F 지속 데이터 · 새 꼬리 공간 없음':'게임 RAM',stored.length-originalTail,maximum)];
 if(originalTail)rows.push(row('f-original-installer','원래 설치 데이터 · 편집 공간 아님',originalTail,originalTail,true));
 const unit=unitStorageUsage(logical,unitStorage,gameId);
 if(unit){
  const relocated=108+new DataView(stored.buffer,stored.byteOffset,stored.byteLength).getInt32(108)!==unitStorage.start;
  const auxiliary=fInlineAuxiliaryUsage(stored,gameId)+finalInlineAuxiliaryUsage(stored,gameId),ledger=gameId==='srwf-f'?fUnitOffsetLedgerDiagnostics(stored):null,ledgerSavings=ledger?.savedBytes??0;
  const finalLedger=gameId==='srwf-final'?finalInlineLedgerBytes(stored):0;
  rows.push(row('unit',relocated?'기체 표 · 전체 RAM에 포함':auxiliary?'기체·이름·글자·복원 기록 · 빈 슬롯 공유 후':'기체 표 · 빈 슬롯 공유 후',relocated?root[27].bytes.length:unit.usedBytes+auxiliary-ledgerSavings+finalLedger,relocated?root[27].bytes.length:unit.limitBytes,relocated));
  if(!relocated&&unit.overflowBytes&&gameId==='srwf-final'){
   rows[rows.length-1]=row('unit','기체 표 · 원래 영역',unit.insideBytes,unit.limitBytes);
   rows.push(row('unit-tail','추가 기체 레코드 · 전체 RAM에 포함',unit.overflowBytes,unit.overflowBytes,true));
  }
 }
 const original=pilotPools(session.root[28].bytes,sourcePilots,gameId),current=pilotPools(root[28].bytes,pilots,gameId);
 for(const pool of current){const before=original.find(x=>x.id===pool.id),limit=Math.max(before?.freeBytes??0,pool.freeBytes);
  rows.push(row(pool.id,`파일럿 #${pool.first}–${pool.last} 추가 공간`,limit-pool.freeBytes,limit));}
 rows.push(row('weapon','무기 표 · 고정 크기',root[29].bytes.length,session.root[29].bytes.length,true));
 return Object.freeze({schema:'srwf.editor-storage-budget.v1',gameId,rows:Object.freeze(rows),
  metadata:Object.freeze({nameBytes,glyphBytes,glyphCount,cloneBytes,cloneCount,unitStorageFormat:isFinalReferenceInlineUnitStorage(stored)?'reference-inline':isFinalInlineUnitStorage(stored)?'inline':null}),scenarioBodies:0});
}
export function withDiskBudget(budget,slot,packedBytes){
 const rows=[...budget.rows,row('tsr-disk','TSR 압축 저장 공간',packedBytes,slot.writableLength)];
 return Object.freeze({...budget,rows:Object.freeze(rows),canExport:rows.every(r=>r.remainingBytes>=0)});
}
