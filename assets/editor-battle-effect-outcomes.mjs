// Bounded web-only inspection. Never mutates the selected outcome or editor data.
export const EFFECT_OUTCOMES=Object.freeze([
 {mode:'attack',label:'명중'},{mode:'evade',label:'회피'},
 {mode:'defense',label:'방어'},{mode:'destroyed',label:'격추'},
].map(Object.freeze));
export function effectOutcomeState(result){
 const usage=result?.effectImportUsage;
 if((result?.previewStatus??result?.status)!=='ready'||!usage?.requested?.length)return 'unknown';
 if(usage.called?.length)return usage.uncalled?.length?'partial':'used';
 return usage.uncalled?.length?'unused':'unknown';
}
export async function inspectEffectOutcomes(read,{currentMode,currentResult,signal}={}){
 const rows=[];
 for(const outcome of EFFECT_OUTCOMES){
  signal?.throwIfAborted();
  let result;
  try{result=outcome.mode===currentMode?currentResult:await read(outcome.mode);}
  catch(error){if(signal?.aborted||error.name==='AbortError')throw error;result=null;}
  signal?.throwIfAborted();
  rows.push({...outcome,state:effectOutcomeState(result)});
 }
 return rows;
}
export function effectOutcomesLabel(rows){
 const labels={used:'사용',partial:'일부 사용',unused:'미사용',unknown:'미확인'};
 const summary=rows.map(row=>`${row.label} ${labels[row.state]??labels.unknown}`).join(' · ');
 return rows.length===4&&rows.every(row=>row.state==='unused')
  ? `${summary}. 현재 기체·조건에서는 모두 미사용입니다. 다른 연결 위치를 선택하세요.`
  : `${summary}. 현재 기체·조건 기준입니다.`;
}
