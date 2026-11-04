// Presentation of proved local command links only. No chronology or flag
// meaning is inferred from a callback, a branch or a repeated actor ID.
const hex=value=>Number.isInteger(value)?`0x${value.toString(16).toUpperCase()}`:'미확인';
const list=value=>Array.isArray(value)?value:[];
const name=(rows,id,kind)=>list(rows).find(row=>row.recordIndex===id)?.name?.trim()||`${kind} #${id}`;
const comparison=Object.freeze({eq:'=',ne:'≠',gt:'>',ge:'≥',lt:'<',le:'≤'});
const relations=Object.freeze({'can-follow':'생성 뒤 도달 가능한 경로','can-precede':'생성 앞에 연결된 경로','loop-related':'반복 경로로 연결','same-callback':'동일 콜백 · 순서 미확인'});

function guardLabel(guard){
 const producer=guard.producer;
 const subject=producer?.kind==='flag-query'?`플래그 #${producer.flagId} 검사`:producer?.kind==='turn-query'?'턴 검사':'이전 조건 미확인';
 const compare=Number.isInteger(guard.value)?` ${comparison[guard.comparison]??guard.comparison??'비교'} ${guard.value}`:'';
 return `${subject}${compare} · ${guard.opcode??'명령'} 분기 ${guard.taken?'이동':'비이동'} 경로`;
}

export function formatRosterContext(row,{pilots=[],units=[],dialogues=[],catalog=null}={}){
 const context=row?.rosterContext;
 if(!context)return null;
 const callbacks=list(context.contexts),conditions=callbacks.flatMap(callback=>{
  const source=`콜백 ${list(callback.rootIndices).map(n=>`#${n}`).join('·')||'미확인'} · ${hex(callback.start)}`;
  const guards=list(callback.guards);
  if(!callback.reachedFromRoot)return [{text:'이전 조건 미확인 · 원래 생성 명령의 경계만 확인',title:source}];
  const rows=guards.length?guards.map(guard=>({text:guardLabel(guard),title:`${source} · 분기 ${hex(guard.byteOffset)} · 이 콜백 내부 경로만 확인`})):[{text:'이전 조건 미확인 · 이 콜백에서 선행 분기 확인 안 됨',title:source}];
  if(!callback.complete)rows.push({text:'미해석 경로가 남아 있음',title:source});
  return rows;
 });
 if(!conditions.length)conditions.push({text:'이전 조건 미확인',title:'연결된 콜백 조건이 없습니다.'});
 const uniqueConditions=[...new Map(conditions.map(item=>[`${item.text}\0${item.title}`,item])).values()];
 const commands=list(context.bundle?.commands).map(command=>{
  const pilot=name(pilots,command.pilotId,'파일럿');let text;
  if(command.kind==='pilot-unit-create')text=`${pilot} + ${name(units,command.unitId,'기체')} 생성 · 초기 Lv${row.initialLevel}`;
  else if(command.kind==='pilot-create')text=`${pilot} 생성 · 초기 Lv${command.initialLevel}`;
  else if(command.kind==='pilot-link')text=`${pilot} → ${name(pilots,command.linkedPilotId,'파일럿')} 연결`;
  else text=`${command.opcode??'명령'} · 의미 미확인`;
  return {text,title:`${command.opcode??'명령'} · ${hex(command.byteOffset)}`};
 });
 const calls=list(context.dialogueCalls).map(call=>{
  // B1 owner identity is the join key. A nearby string is not evidence that
  // this call displays it, and an unresolved call remains visibly unresolved.
  const runs=list(dialogues).filter(dialogue=>dialogue.physicalIndex===row.physicalIndex&&list(dialogue.owners).some(owner=>owner.recordIndex===call.recordIndex)).sort((a,b)=>a.byteOffset-b.byteOffset);
  const speaker=name(pilots,runs[0]?.speakerId??call.speakerId,'파일럿');
  const excerpt=runs.map(run=>typeof run.text==='string'?run.text:'').join(' ').replace(/\s+/gu,' ').trim();
  return {callId:call.recordIndex,recordIndex:runs[0]?.recordIndex??null,runCount:runs.length,
   text:excerpt?`${speaker} · ${excerpt}`:`${speaker} · 본문 연결 미확인`,
   relation:relations[call.relation]??'연결 방식 미확인',
   title:`B1 ${hex(call.byteOffset)} → ${hex(call.targetOffset)} · ${relations[call.relation]??'연결 방식 미확인'} · 필수 연출 여부 미확인${runs.length>1?` · 본문 ${runs.length}구간`:''}`};
 });
 const familyCount=(families,id)=>list(families).find(family=>family.id===id)?.recordIndices?.length??0;
 const pilotSites=familyCount(catalog?.pilotFamilies,row.pilotId),unitSites=familyCount(catalog?.unitFamilies,row.unitId);
 const sites=[pilotSites>1?`동일 파일럿 생성 ${pilotSites}곳`:'',unitSites>1?`동일 기체 생성 ${unitSites}곳`:''].filter(Boolean).join(' · ');
 return {source:`본문 ${row.physicalIndex} · ${hex(context.byteOffset)}${sites?` · ${sites}`:''}`,
  sourceTitle:'초기 구성·인계를 포함한 명령 위치이며, 화수나 진행 순서를 뜻하지 않습니다.',
  conditions:uniqueConditions,commands,calls,
  notice:'조기 이동 편집 미지원 · 콜백 연결은 실제 합류 시점이나 필수 연출을 뜻하지 않습니다.'};
}
