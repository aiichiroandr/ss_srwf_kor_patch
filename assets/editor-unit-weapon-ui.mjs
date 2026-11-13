import {createWeaponNameControl} from './editor-name-control.mjs?v=20261113-alicecopies1';
import {createWeaponDialogueSource} from './editor-weapon-dialogue-ui.mjs?v=20261113-alicecopies1';
import {EDITOR_FIELD_BOUNDS,isFieldValueInBounds} from './editor-fields.mjs?v=20261113-alicecopies1';
import {criticalChoices,criticalValues,criticalAppliedText} from './editor-critical-values.mjs?v=20261113-alicecopies1';
import {WEAPON_GRADE_CHOICES,TERRAIN_SCREEN_ORDER,TERRAIN_LABELS,splitWeaponTerrain,joinWeaponTerrain} from './editor-grades.mjs?v=20261113-alicecopies1';

const fields=Object.freeze([
 ['attack','공격력',0,65535],['hit','명중',...EDITOR_FIELD_BOUNDS.weapon.hit],
 ['minRange','최소 사정',0,255],['maxRange','최대 사정',0,255],
 ['energy','소비 EN',0,65535],['ammo','탄수',1,255],
 ['requiredMorale','필요 기력',0,150],['critical','크리티컬 보정',0,15],
]);
const choiceFields=Object.freeze([['requiredSkill','필요 기능'],['voiceType','공격 대사 유형']]);
const editableFields=[...fields.map(([field])=>field),...choiceFields.map(([field])=>field),'terrain','name'];

// This view edits the same weapon rows as the weapon tab, using a separate
// control namespace so no weapon value can enter a unit's numeric request.
export function createUnitWeaponEditor(host) {
 const panel=host.panel,work=host.workarea,controls=new Map(),terrain=new Map(),drafts=new Map();
 let unitKey=null,weaponId=null,weaponIds=[];
 const row=()=>weaponId===null?null:host.row(weaponId);
 const criticalOptions=current=>criticalChoices(current.critical,current.original?.critical??current.critical);
 const locked=current=>!host.canEdit()||!current||current.editable!==true||current.statsValid===false;
 const changed=(current,field)=>Boolean(current?.original)&&current[field]!==current.original[field];
 const heading=document.createElement('div');heading.className='unit-weapon-detail-heading';
 const back=document.createElement('button');back.type='button';back.textContent='‹ 무장 목록';back.className='unit-weapon-detail-back';
 const title=document.createElement('h5');title.id='unitWeaponDetailTitle';
 const previous=document.createElement('button');previous.type='button';previous.textContent='‹';previous.setAttribute('aria-label','이전 무장 수치');
 const next=document.createElement('button');next.type='button';next.textContent='›';next.setAttribute('aria-label','다음 무장 수치');
 const cost=document.createElement('button');cost.type='button';cost.textContent='개조 비용';
 const reset=document.createElement('button');reset.type='button';reset.textContent='복원';reset.setAttribute('aria-label','선택한 무기 이름·수치 전체 복원');
 heading.append(back,previous,title,next,cost,reset);panel.append(heading);
 const scope=document.createElement('p');scope.className='unit-weapon-detail-scope';panel.append(scope);
 const body=document.createElement('div');body.className='unit-weapon-detail-body';panel.append(body);
 const names=createWeaponNameControl({container:title,row,gameId:()=>host.gameId?.(),canEdit:host.canEdit,onChange:host.onChange,onInvalid:host.onInvalid,encodeText:host.encodeText,textOptions:host.textOptions});
 title.className='unit-weapon-name-heading';
 const statsHeading=document.createElement('h6');statsHeading.className='unit-weapon-section-title';statsHeading.textContent='무기 성능';body.append(statsHeading);
 const numbers=document.createElement('div');numbers.className='unit-weapon-number-grid';numbers.dataset.editorNumericRow='';numbers.tabIndex=0;numbers.setAttribute('role','group');numbers.setAttribute('aria-label','선택한 기체 무장 수치');body.append(numbers);
 const choices=document.createElement('div');choices.className='unit-weapon-choice-grid';body.append(choices);
 const terrainHeading=document.createElement('h6');terrainHeading.className='unit-weapon-section-title unit-weapon-terrain-heading';terrainHeading.textContent='지형 적응';body.append(terrainHeading);
 const terrainGroup=document.createElement('div');terrainGroup.className='unit-weapon-terrain-grid';body.append(terrainGroup);
 const dialogueDetails=document.createElement('details');dialogueDetails.className='unit-weapon-dialogue-details';
 const dialogueSummary=document.createElement('summary');dialogueSummary.textContent='공격 대사 설정';dialogueDetails.append(dialogueSummary);body.append(dialogueDetails);
 const dialogueChoices=document.createElement('div');dialogueChoices.className='unit-weapon-choice-grid';dialogueDetails.append(dialogueChoices);
 const dialogue=createWeaponDialogueSource({container:dialogueDetails,row,rows:()=>host.weapons?.()??[],canEdit:()=>!locked(row()),onChange:current=>{host.onChange(current);refresh();},
  pilotContext:current=>host.dialoguePilotContext?.(current,unitKey),readDialogue:host.readDialogue,sessionKey:host.sessionKey,onPilotChange:host.onPilotChange});
 const status=document.createElement('p');status.className='unit-weapon-detail-status';status.setAttribute('role','status');status.id='unitWeaponDetailStatus';panel.append(status);
 panel.setAttribute('aria-label','기체 무장 정보');
 const clearError=input=>{input.setCustomValidity('');input.removeAttribute('aria-invalid');input.removeAttribute('aria-describedby');};
 function reject(input,message){input.setCustomValidity(message);input.setAttribute('aria-invalid','true');input.setAttribute('aria-describedby',status.id);status.textContent=message;}
 const invalidInput=()=>[...controls.values()].find(input=>drafts.has(input.dataset.inlineWeaponField));
 const clearDrafts=()=>{drafts.clear();names.reset();for(const input of controls.values())clearError(input);status.textContent='';};
 function validate({report=false}={}){
  if(!names.validate({report:false})){
   if(report){panel.hidden=false;work.dataset.weaponDetail='open';host.reveal?.(names.input);names.validate({report:true});}
   return false;
  }
  const invalid=invalidInput();if(!invalid)return true;
  if(report){panel.hidden=false;work.dataset.weaponDetail='open';host.reveal?.(invalid);invalid.focus({preventScroll:true});invalid.reportValidity();}
  return false;
 }
 function commit(field,input){
  const current=row();if(locked(current)||input.disabled)return;
  clearError(input);
  const value=input.value.trim()===''?NaN:Number(input.value);
  const allowed=isFieldValueInBounds('weapon',field,value)&&input.validity.valid
   &&(field!=='critical'||criticalOptions(current).some(option=>option.value===value))
   &&(field!=='requiredSkill'||host.choices(field,current).some(option=>option.value===value))
   &&(field!=='ammo'||current.ammo>0&&current.ammoEditable!==false)
   &&(field!=='requiredMorale'||value<=150||value===current.original?.requiredMorale);
  if(!allowed){drafts.set(field,input.value);reject(input,field==='critical'?'크리티컬 보정: 목록의 보정값을 선택해주세요.':`${input.dataset.caption}: ${input.min||0}~${input.max||255} 범위의 정수를 입력해주세요.`);host.onInvalid?.();return;}
  const wasInvalid=drafts.has(field);drafts.delete(field);clearError(input);status.textContent=invalidInput()?.validationMessage??'';
  if(current[field]!==value){current[field]=value;host.onChange(current);}
  else if(wasInvalid)host.onInvalid?.();
  refresh();
 }
 function addControl(parent,field,caption,input){
  const label=document.createElement('label'),name=document.createElement('span');name.textContent=caption;
  input.dataset.inlineWeaponField=field;input.dataset.caption=caption;
  input.setAttribute('aria-label',`기체 무장 ${caption}`);input.title=host.help?.(field)??'';
  const restore=document.createElement('button');restore.type='button';restore.className='unit-weapon-field-reset';restore.textContent='↶';restore.setAttribute('aria-label',`${caption} 복원`);restore.dataset.inlineWeaponReset=field;
  restore.addEventListener('click',()=>{const current=row();if(locked(current))return;current[field]=current.original[field];drafts.delete(field);clearError(input);host.onChange(current);refresh();input.focus({preventScroll:true});});
  const value=document.createElement('span');value.className='unit-weapon-value';value.append(input,restore);
  label.append(name,value);parent.append(label);controls.set(field,input);
  input.addEventListener(input.tagName==='SELECT'?'change':'input',()=>commit(field,input));
  return label;
 }
 for(const [field,caption,min,max]of fields){
  const input=document.createElement(field==='critical'?'select':'input');
  if(field!=='critical'){input.type='number';input.inputMode='numeric';input.min=String(min);input.max=String(max);input.step='1';}
  const label=addControl(numbers,field,caption,input);
  if(field==='critical'){label.className='unit-weapon-critical-field';const actual=document.createElement('output');actual.dataset.inlineWeaponCriticalActual='';actual.className='critical-applied-value';label.append(actual);}
  if(field==='ammo'){const noAmmo=document.createElement('output');noAmmo.textContent='없음';noAmmo.className='unit-weapon-no-ammo';noAmmo.hidden=true;label.querySelector('.unit-weapon-value').append(noAmmo);}
 }
 for(const [field,caption]of choiceFields)addControl(field==='voiceType'?dialogueChoices:choices,field,caption,document.createElement('select'));
 for(const key of TERRAIN_SCREEN_ORDER){
  const label=document.createElement('label'),name=document.createElement('span'),select=document.createElement('select');name.textContent=TERRAIN_LABELS[key];
  select.dataset.inlineWeaponTerrain=key;select.setAttribute('aria-label',`기체 무장 ${TERRAIN_LABELS[key]} 지형 적응`);
  for(const choice of WEAPON_GRADE_CHOICES){const option=document.createElement('option');option.value=String(choice.value);option.textContent=choice.letter;option.setAttribute('aria-label',choice.label);select.append(option);}
  select.addEventListener('change',()=>{const current=row();if(locked(current)||select.disabled)return;const parts=Object.fromEntries([...terrain].map(([key,input])=>[key,Number(input.value)]));
   if(Object.values(parts).some(value=>!Number.isInteger(value)||value<0||value>3))return;
   const value=joinWeaponTerrain(parts);if(current.terrain!==value){current.terrain=value;host.onChange(current);}refresh();});
  label.append(name,select);terrainGroup.append(label);terrain.set(key,select);
 }
 const terrainReset=document.createElement('button');terrainReset.type='button';terrainReset.textContent='↶';terrainReset.setAttribute('aria-label','무기 지형 적응 복원');terrainGroup.append(terrainReset);
 terrainReset.addEventListener('click',()=>{const current=row();if(locked(current))return;current.terrain=current.original.terrain;host.onChange(current);refresh();});
 function sync(){
  dialogue.sync();
  names.refresh();
  const current=row(),disabled=locked(current);
  const fix=typeof host.criticalFixEnabled==='function'?host.criticalFixEnabled():false;
  const actual=panel.querySelector('[data-inline-weapon-critical-actual]'),values=criticalValues(current?.critical,fix);
  actual.textContent=criticalAppliedText(current?.critical,fix);
  actual.classList.toggle('is-different',values?.actual!==null&&values?.actual!==undefined&&values.display!==values.actual);
  actual.title=`오류 수정 ${fix===null?'상태 미확인':fix?'ON':'OFF'} · 무기 보정값이며 최종 크리티컬 발생률이 아닙니다.`;
  actual.setAttribute('aria-label',`${actual.textContent}. ${actual.title}`);
  for(const [field,input]of controls){input.disabled=disabled||!Number.isSafeInteger(current?.[field])||field==='ammo'&&(!(current.ammo>0)||current.ammoEditable===false);
   const restore=panel.querySelector(`[data-inline-weapon-reset="${field}"]`);restore.disabled=disabled||!changed(current,field)&&!drafts.has(field);restore.hidden=!changed(current,field)&&!drafts.has(field);}
  for(const select of terrain.values())select.disabled=disabled||!Number.isSafeInteger(current?.terrain);
  reset.disabled=disabled||!editableFields.some(field=>changed(current,field))&&!drafts.size&&names.validate();
  cost.disabled=disabled;terrainReset.disabled=disabled||!changed(current,'terrain');
  previous.disabled=weaponIds.indexOf(weaponId)<=0;next.disabled=weaponIds.indexOf(weaponId)>=weaponIds.length-1;
 }
 function refresh({discardDrafts=false}={}){
  if(discardDrafts){clearDrafts();names.reset();}
  const current=row();if(!current){panel.hidden=true;delete work.dataset.weaponDetail;return;}
  title.title=`${host.name?.(current)??current.name} · #${current.recordIndex}`;
  panel.setAttribute('aria-label',`${host.name?.(current)??current.name} · #${current.recordIndex} 무장 정보`);
  scope.textContent=`무기 #${current.recordIndex} · 같은 번호를 쓰는 모든 기체에 적용`;
  for(const [field,input]of controls){
   if(input.tagName==='SELECT'){
    const options=field==='critical'?criticalOptions(current):host.choices(field,current),signature=JSON.stringify(options);if(input.dataset.options!==signature){input.replaceChildren(...options.map(choice=>{const option=document.createElement('option');option.value=String(choice.value);option.textContent=choice.label;return option;}));input.dataset.options=signature;}
   }
   const value=drafts.get(field)??(Number.isSafeInteger(current[field])?String(current[field]):'');if(input.value!==value)input.value=value;
   input.classList.toggle('is-modified',changed(current,field));
   if(field==='ammo'){const counted=current.ammo>0;input.hidden=!counted;input.closest('label').querySelector('.unit-weapon-no-ammo').hidden=counted;}
  }
  const parts=Number.isSafeInteger(current.terrain)?splitWeaponTerrain(current.terrain):null,original=Number.isSafeInteger(current.original?.terrain)?splitWeaponTerrain(current.original.terrain):null;
  for(const [key,input]of terrain){input.value=parts?String(parts[key]):'';input.classList.toggle('is-modified',Boolean(parts&&original&&parts[key]!==original[key]));}
  status.textContent=invalidInput()?.validationMessage??'';sync();
  dialogue.refresh();
 }
 function close({force=false}={}){if(!force&&!validate({report:true}))return false;panel.hidden=true;delete work.dataset.weaponDetail;host.highlight?.(null);return true;}
 back.addEventListener('click',()=>close());
 function open(id){
  if(!host.row(id)||!validate({report:true}))return false;
  const previous=weaponId;weaponId=id;
  if(host.onSelect?.(row())===false){weaponId=previous;return false;}
  panel.hidden=false;work.dataset.weaponDetail='open';refresh();host.highlight?.(id);return true;
 }
 previous.addEventListener('click',()=>open(weaponIds[weaponIds.indexOf(weaponId)-1]));
 next.addEventListener('click',()=>open(weaponIds[weaponIds.indexOf(weaponId)+1]));
 cost.addEventListener('click',()=>{if(!locked(row())&&validate({report:true}))host.openCost?.(row());});
 reset.addEventListener('click',()=>{const current=row();if(locked(current))return;for(const field of editableFields)if(Object.hasOwn(current.original,field))current[field]=current.original[field];clearDrafts();host.onChange(current);refresh();});
 return Object.freeze({
  open,dialoguePilot:()=>row()?dialogue.pilot():null,setDialoguePilot:id=>dialogue.setPilot(id),
  context(key,ids){if(key!==unitKey||weaponId!==null&&!ids.includes(weaponId)){clearDrafts();weaponId=null;close({force:true});}unitKey=key;weaponIds=[...new Set(ids)];sync();},
  reset(){clearDrafts();names.reset();weaponId=unitKey=null;weaponIds=[];close({force:true});},
  refresh,sync,validate,selected:()=>panel.hidden?null:weaponId,
 });
}
