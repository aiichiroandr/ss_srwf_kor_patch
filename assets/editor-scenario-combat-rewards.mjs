import {isFieldValueInBounds} from './editor-fields.mjs?v=20261105-part2';

const controls=Object.freeze([
 {id:'scenarioKillMoney',kind:'unit',field:'killMoney',label:'격추 자금'},
 {id:'scenarioUnitExp',kind:'unit',field:'killExp',label:'기체 기본 EXP'},
 {id:'scenarioPilotExp',kind:'pilot',field:'exp',label:'파일럿 기본 EXP'},
]);

// Use only the actual placement IDs. A dynamic sortie or a missing pilot must
// never borrow the first unit/pilot in the table. Alias IDs resolve to their
// authenticated owner, so changes use the ordinary writer/preset authority.
export function scenarioCombatRewardTargets(placement,units=[],pilots=[],aliases=[]) {
 const unitId=placement?.unitId,pilotId=placement?.pilotId;
 const unit=Number.isInteger(unitId)&&unitId>0?units.find(row=>row.recordIndex===unitId):null;
 const alias=Number.isInteger(pilotId)&&pilotId>0?aliases.find(row=>row.recordIndex===pilotId):null;
 const pilot=Number.isInteger(pilotId)&&pilotId>0?pilots.find(row=>row.recordIndex===(alias?.aliasOf??pilotId)||row.aliasIds?.includes(pilotId)):null;
 return controls.map(control=>({...control,row:control.kind==='unit'?unit:pilot}));
}

export function createScenarioCombatRewards(host) {
 const group=host.el('scenarioCombatRewards'),reset=host.el('scenarioCombatRewardReset'),scope=host.el('scenarioCombatRewardScope');
 const entries=()=>scenarioCombatRewardTargets(host.placement(),host.rows('unit'),host.rows('pilot'),host.aliases?.()??[]);
 const readable=entry=>Boolean(entry.row&&entry.row.statsValid!==false&&isFieldValueInBounds(entry.kind,entry.field,entry.row[entry.field]));
 const editable=entry=>readable(entry)&&entry.row.editable===true&&Object.hasOwn(entry.row.original??{},entry.field);
 const changed=entry=>editable(entry)&&entry.row[entry.field]!==entry.row.original[entry.field];
 const available=()=>Boolean(host.placement()&&entries().some(readable));
 const clear=input=>{input.setCustomValidity('');input.removeAttribute('aria-invalid');};
 function sync(){
  const targets=entries();
  for(const entry of targets){const input=host.el(entry.id);input.disabled=!host.canEdit()||!editable(entry);input.classList.toggle('is-modified',changed(entry));}
  reset.disabled=!host.canEdit()||!targets.some(entry=>changed(entry)||host.el(entry.id).getAttribute('aria-invalid')==='true');
 }
 function render(){
  group.hidden=!available();
  for(const entry of entries()){
   const input=host.el(entry.id);input.value=readable(entry)?String(entry.row[entry.field]):'';clear(input);
   input.title=readable(entry)?`${entry.row.name||'이름 미확인'} #${entry.row.recordIndex} · 같은 ${entry.kind==='unit'?'기체 종류':'파일럿'} 전체에 적용`:'기체·파일럿 연결을 확인하지 못했습니다.';
  }
  scope.textContent='기체·파일럿 공통 값 · 다른 시나리오에도 적용';
  sync();
 }
 function validate({report=false}={}){
  if(!host.canEdit()||!host.placement())return true;
  const wanted=[];let invalid=null;
  for(const entry of entries()){
   const input=host.el(entry.id);if(!editable(entry))continue;
   clear(input);const value=input.value.trim()===''?NaN:Number(input.value);
   if(!isFieldValueInBounds(entry.kind,entry.field,value)||input.validity?.badInput){
    input.setCustomValidity(`${entry.label}: 0부터 ${input.max} 사이의 정수를 입력해주세요.`);input.setAttribute('aria-invalid','true');invalid??=input;
   }else wanted.push({...entry,value});
  }
  if(invalid){sync();if(report)host.reveal(invalid);return false;}
  const updates=new Map();
  for(const entry of wanted)if(entry.row[entry.field]!==entry.value){entry.row[entry.field]=entry.value;updates.set(entry.row,entry.kind);}
  for(const [row,kind]of updates)host.onChange(kind,row);
  sync();return true;
 }
 for(const {id}of controls)host.el(id).addEventListener('input',()=>validate());
 reset.addEventListener('click',()=>{
  if(!host.canEdit())return;
  const updates=new Map();
  for(const entry of entries())if(changed(entry)){entry.row[entry.field]=entry.row.original[entry.field];updates.set(entry.row,entry.kind);}
  render();for(const [row,kind]of updates)host.onChange(kind,row);
  const first=entries().find(editable);if(first)host.reveal(host.el(first.id));
 });
 return Object.freeze({render,sync,validate,available});
}
