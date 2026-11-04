// Small, on-demand report on the existing save screen. No per-keystroke
// compression and no new dialog interrupting the editor or preview player.
export function createEditorStorageUI({root,status,list,note}){
 let checkedRevision=-1;
 const document=root.ownerDocument;
 function clear(message){checkedRevision=-1;list.replaceChildren();note.textContent='';status.textContent=message;root.dataset.state='pending';}
 function show(report,revision){
  if(report?.schema!=='srwf.editor-storage-budget.v1'||!Array.isArray(report.rows))throw Error('저장 공간 결과가 올바르지 않습니다.');
  const rows=report.rows.map(row=>{
   if(typeof row.label!=='string'||!Number.isSafeInteger(row.usedBytes)||row.usedBytes<0||!Number.isSafeInteger(row.limitBytes)||row.limitBytes<0||row.remainingBytes!==row.limitBytes-row.usedBytes)throw Error('저장 공간 수치가 올바르지 않습니다.');
   const item=document.createElement('div'),label=document.createElement('strong'),value=document.createElement('span');item.className='editor-budget-row';
   label.textContent=row.label;value.textContent=row.fixed?`${row.usedBytes.toLocaleString()} B · 고정 크기`:`${row.usedBytes.toLocaleString()} / ${row.limitBytes.toLocaleString()} B · ${row.remainingBytes<0?'초과':'남음'} ${Math.abs(row.remainingBytes).toLocaleString()} B`;
   item.append(label,value);
   if(!row.fixed){const meter=document.createElement('progress');meter.max=Math.max(1,row.limitBytes);meter.value=Math.min(row.usedBytes,meter.max);meter.setAttribute('aria-label',row.label);item.append(meter);}
   item.dataset.state=row.remainingBytes<0?'error':'ok';return item;
  });
  list.replaceChildren(...rows);checkedRevision=revision;root.dataset.state=report.canExport?'ok':'error';
  status.textContent=report.canExport?'현재 편집값의 공간 확인 완료':'저장 공간 초과 · 편집량을 줄여 주세요';
  const m=report.metadata;note.textContent=m?`무기명 기록 ${m.nameBytes.toLocaleString()} B · 추가 글자 ${m.glyphCount}개 / 기록 ${m.glyphBytes.toLocaleString()} B${m.cloneCount?` · 독립 무기 ${m.cloneCount}개 / 기록 ${m.cloneBytes.toLocaleString()} B`:''}. 공유 풀은 표시된 그룹 안에서만 사용할 수 있습니다.`:'';
 }
 return Object.freeze({show,reset:warning=>{clear('저장 공간을 확인할 수 있습니다.');if(warning){root.dataset.state='warning';note.textContent=warning;}},cancelled:()=>clear('공간 확인을 중단했습니다. 다시 계산할 수 있습니다.'),pending:()=>{checkedRevision=-1;root.dataset.state='pending';status.textContent='현재 편집값의 압축·공간 계산 중…';},
  invalidate:()=>{if(checkedRevision>=0){checkedRevision=-1;root.dataset.state='stale';status.textContent='편집값이 바뀌었습니다 · 다시 확인해 주세요';}},
  failed:()=>{checkedRevision=-1;root.dataset.state='error';status.textContent='공간 확인을 마치지 못했습니다 · 아래 오류를 확인해 주세요';}});
}
