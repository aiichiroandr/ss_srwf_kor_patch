// Keep source diagnostics available to the web UI without displaying VM
// addresses/opcodes as instructions to an editor user.
const labels={
 'resource-cache-value-uninitialized':'연출 진행값 연결 미완료',
 'completion-counter-unresolved':'연출 종료 신호 연결 미완료',
 'screen-fragment-unresolved':'화면 효과 그림 연결 미완료',
 'other-sprite-priority-composition-unresolved':'효과 겹침 순서 연결 미완료',
 'scene-unit-graphics-invalid':'이 기체의 그림 자료 연결 미확인',
};
export function battlePreviewReasonLabel(value){
 const seen=new Set();
 for(let depth=0;depth<8&&value&&typeof value==='object';depth++){
  if(seen.has(value))return null;seen.add(value);
  value=value.reason??value.blocked??value.evidence;
 }
 return typeof value==='string'?labels[value]??null:null;
}
