const LABELS={spawnSequence:'연결 효과',spawnX:'생성 가로 위치',spawnDepth:'생성 깊이',spawnDelay:'생성 후 대기',scale:'크기',scaleDelta:'크기 변화',horizontalVelocity:'가로 속도',horizontalDisplacement:'가로 이동',verticalDisplacement:'세로 이동',horizontalPosition:'가로 위치',verticalPosition:'세로 위치',motionDuration:'이동 시간',holdDuration:'그림 유지 시간',frameInterval:'연속 그림 유지 시간'};
import {copyWeaponAuthoringEntries as copy} from './editor-weapon-settings.mjs?v=20261015-stocknames2';
import {encodeWeaponName} from './editor-weapon-names.mjs?v=20261015-stocknames2';
export function createWeaponAuthoringUI({container,inspect,apply,getEntries,getOwner,getWeapons=()=>[],getUnits=()=>[],getGame=()=>null,getBaseHash=()=>null,readMotionCatalog,onToggle=()=>{},onDraftChange=()=>{},onSelect,onPreview,onPreviewEffect}){
 const doc=container.ownerDocument,node=(tag,cls,text)=>{const n=doc.createElement(tag);n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const tools=node('div','weapon-authoring-tools'),edit=node('button','','연출 편집'),add=node('button','','무기 추가'),remove=node('button','','신규 무기 삭제');
 for(const b of [edit,add,remove])b.type='button';tools.append(edit,add,remove);
 const configuration=node('div','weapon-authoring-configuration'),nameLabel=node('label','','무기 이름'),nameInput=node('input',''),motionLabel=node('label','','공격 연출'),motionSelect=node('select','weapon-authoring-picker'),configure=node('button','','무기 설정 적용');
 const discover=node('button','weapon-authoring-discover','연결 없는 연출 찾기');discover.type='button';discover.hidden=typeof readMotionCatalog!=='function';
 const resetWhole=node('button','','원본 연출로'),previewMotion=node('button','','원본 보기'),configurationActions=node('div','weapon-authoring-actions weapon-authoring-config-actions');resetWhole.type=previewMotion.type='button';resetWhole.title='이 무기의 위치·시간·효과 조합을 포함한 연출 편집을 모두 되돌립니다. 무기 수치는 유지됩니다.';previewMotion.setAttribute('aria-label','공격 연출 원본 미리보기');previewMotion.title='선택한 원본의 전체 전투 연출을 미리 봅니다. 편집값에는 적용하지 않습니다.';previewMotion.hidden=typeof onPreview!=='function';
 nameInput.type='text';nameInput.maxLength=80;nameInput.setAttribute('aria-label','새 무기 이름');motionSelect.setAttribute('aria-label','공격 연출 원본 무기');configure.type='button';nameLabel.append(nameInput);motionLabel.append(motionSelect);configurationActions.append(previewMotion,configure,resetWhole);configuration.append(nameLabel,motionLabel,configurationActions,discover);
 const panel=node('div','weapon-authoring-panel'),picker=node('select','weapon-authoring-picker');picker.setAttribute('aria-label','편집할 원본 움직임');
 const fields=node('div','weapon-authoring-fields'),actions=node('div','weapon-authoring-actions'),save=node('button','','적용'),reset=node('button','','이 움직임 초기화'),status=node('p','weapon-authoring-status');
 save.type=reset.type='button';status.setAttribute('role','status');actions.append(save,reset);panel.append(picker,fields,actions);container.append(tools,configuration,panel,status);
 const importPanel=node('div','weapon-authoring-import-panel'),donorLabel=node('label','','효과를 가져올 무기'),donorPicker=node('select','weapon-authoring-picker'),effectPicker=node('select','weapon-authoring-picker'),importActions=node('div','weapon-authoring-actions'),importButton=node('button','','효과 가져오기'),restoreEffect=node('button','','가져온 효과 해제'),previewDonor=node('button','','원본 전투 보기'),previewEffect=node('button','','조합 미리보기');
 const donorSearch=node('input','weapon-authoring-picker weapon-authoring-source-search');donorSearch.type='search';donorSearch.placeholder='기체·무기 검색';donorSearch.setAttribute('aria-label','효과 원본 기체·무기 검색');
 donorPicker.setAttribute('aria-label','효과 원본 무기');effectPicker.setAttribute('aria-label','가져올 효과');
 for(const button of [importButton,restoreEffect,previewDonor,previewEffect])button.type='button';
 previewDonor.hidden=typeof onPreview!=='function';previewEffect.hidden=typeof onPreviewEffect!=='function';previewEffect.title='현재 동작의 입력값과 선택한 효과를 임시 연결합니다. 편집값에 반영하려면 효과 가져오기를 누르세요.';donorLabel.append(donorSearch,donorPicker);importActions.append(previewEffect,importButton,previewDonor,restoreEffect);importPanel.append(donorLabel,effectPicker,importActions);panel.append(importPanel);
 const compatibleLabel=node('label','','사용 가능한 연결'),compatiblePicker=node('select','weapon-authoring-picker');compatiblePicker.setAttribute('aria-label','효과를 넣을 수 있는 기존 연결');compatibleLabel.append(compatiblePicker);importPanel.replaceChildren(donorLabel,compatibleLabel,effectPicker,importActions);
 const importNotice=node('p','weapon-authoring-status');importPanel.append(importNotice);
 const blockedLabels={'sound-resource-mismatch':'원본 효과의 음향 자료가 달라 함께 가져올 수 없음','recipient-state-required':'원본 동작의 진행 신호·효과음 처리를 함께 보존해야 함','picture-resource-missing':'별도 그림 자료 연결이 필요함','picture-context-required':'원본 기체·그림 상태에 의존함','shared-state-required':'원본 전투의 진행 조건에 의존함','nested-effect':'하위 효과를 함께 옮겨야 함','capacity-or-address-limit':'편집 공간·주소 범위를 초과함','same-animation':'같은 연출: 위의 연결 효과에서 선택 가능','unsupported-track':'복합 동작 이식을 아직 지원하지 않음'};
 let importOptions=[],importBlocked=[];
 let record=null,info=null,open=false,busy=false,externalBusy=false,generation=0,controller=null,current=null,motionCatalog=null,configurationBaseline=null,focusAfterLoad=false;let movementDrafts=new Map(),loadedOwner=null,loadedSignature=null;const inputs=new Map(),drafts=new Map(),weaponMovementDrafts=new Map();
 const owner=()=>getOwner()??record?.owners?.[0]?.unit;
 function controls(){const allowed=Boolean(record?.editable&&record?.owners?.length)&&!busy&&!externalBusy;edit.disabled=add.disabled=!allowed;remove.hidden=!record?.authoring?.isNew;remove.disabled=!allowed;configuration.hidden=!record?.editable||!record?.owners?.length||(!record?.authoring?.isNew&&!open);nameLabel.hidden=!record?.authoring?.isNew;configuration.classList.toggle('weapon-authoring-original',!record?.authoring?.isNew);configure.textContent=record?.authoring?.isNew?'무기 설정 적용':'공격 연출 적용';nameInput.disabled=motionSelect.disabled=configure.disabled=discover.disabled=!allowed;const entry=getEntries().find(e=>e.weaponIndex===record?.recordIndex),source=entry?.sourceWeapon??record?.recordIndex;resetWhole.disabled=!allowed||!movementDrafts.size&&!entry?.edits.length&&!entry?.imports?.length&&(entry?.animationWeapon??source)===source&&(!motionSelect.value||motionSelect.value===String(source));previewMotion.disabled=!allowed||!motionSelect.value;picker.disabled=busy||externalBusy;save.disabled=reset.disabled=busy||externalBusy||!current;edit.textContent=open?'연출 편집 닫기':'연출 편집';edit.setAttribute('aria-expanded',String(open));panel.hidden=!open;renderImports();}
 function renderConfiguration(){
  if(!record)return;
  const entry=getEntries().find(item=>item.weaponIndex===record.recordIndex),units=new Map(getUnits().map(unit=>[unit.recordIndex,unit.name]));
  const draft=drafts.get(record.recordIndex);nameInput.value=draft?.name??entry?.name??record.name;motionSelect.replaceChildren();
  for(const weapon of getWeapons().filter(row=>row.editable&&row.owners?.length&&!row.authoring?.isNew)){
   const unit=units.get(weapon.owners[0].unit)??`기체 #${weapon.owners[0].unit}`;
   const option=node('option','',`${unit} · ${weapon.name}`);option.value=String(weapon.recordIndex);motionSelect.append(option);
  }
  for(const entry of motionCatalog?.entries.filter(row=>row.ownership==='unowned'&&row.previewEligible)??[]){const option=node('option','',`[미연결] ${entry.name}`);option.value=String(entry.recordIndex);motionSelect.append(option);}
  motionSelect.value=String(draft?.animationWeapon??entry?.animationWeapon??entry?.sourceWeapon??record.authoring?.sourceWeapon??record.recordIndex);
  configurationBaseline=storedConfiguration();
 }
 function storedConfiguration(){
  if(!record)return null;
  const entry=getEntries().find(item=>item.weaponIndex===record.recordIndex);
  return {id:record.recordIndex,name:entry?.name??record.name,motion:String(entry?.animationWeapon??entry?.sourceWeapon??record.authoring?.sourceWeapon??record.recordIndex)};
 }
 function syncConfiguration(){
  const next=storedConfiguration(),old=configurationBaseline;if(!next||!old||next.id!==old.id)return;
  if(next.name===old.name&&next.motion===old.motion)return;
  const dirty=motionSelect.value!==old.motion||Boolean(record.authoring?.isNew&&nameInput.value!==old.name);
  const matches=motionSelect.value===next.motion&&(!record.authoring?.isNew||nameInput.value===next.name);
  if(!dirty||matches){drafts.delete(next.id);renderConfiguration();}
 }
 function cancel(){generation++;controller?.abort();controller=null;}
 function say(text){status.textContent=text;status.title=text;}
 function effectDescription(effect){
  const body=(effect?.bodyBindings??[]).map(role=>role==='attacker'?'사용 기체 참조':'대상 기체 참조');
  const pictures=effect?.pictureSelectors??[];
  return [...body,...(pictures.length?[`그림 ${pictures.map(index=>index+1).join('·')}`]:body.length||effect?.screenEffects||effect?.soundCues?[]:['그림 연결 미확인']),...(effect?.screenEffects?['화면 효과 포함']:[]),...(effect?.soundCues?['효과음 포함']:[])].join(' · ');
 }
 function effectLabel(value,field){
  return `${value+1} · ${effectDescription(info?.effectCatalog?.find(row=>row.sequenceIndex===value))}${value===field.originalValue?' · 기본':''}`;
 }
 function renderImports(){
  const target=inputs.get('spawnSequence');importPanel.hidden=!target;
  if(!target){donorSearch.disabled=donorPicker.disabled=effectPicker.disabled=importButton.disabled=restoreEffect.disabled=previewDonor.disabled=previewEffect.disabled=true;return;}
  compatiblePicker.replaceChildren();const choose=node('option','','연결 선택');choose.value='';compatiblePicker.append(choose);
  const compatibleTargets=new Set(importOptions.map(row=>row.targetSequence));
  for(const [index,instruction]of (info?.instructions.filter(i=>i.fields.some(f=>f.editable))??[]).entries()){
   const field=instruction.fields.find(f=>f.name==='spawnSequence'&&f.editable);if(!field)continue;
   const value=instruction.recordOffset===current?.recordOffset?Number(target.input.value):field.value;
   if(!compatibleTargets.has(value))continue;
   const option=node('option','',`동작 ${index+1} · 연결 효과 ${value+1}`);option.value=String(instruction.recordOffset);compatiblePicker.append(option);
  }
  compatibleLabel.hidden=!donorPicker.value||compatiblePicker.options.length===1;compatiblePicker.disabled=busy||externalBusy;
  compatiblePicker.value=[...compatiblePicker.options].some(option=>option.value===picker.value)?picker.value:'';
  const selected=effectPicker.value;effectPicker.replaceChildren();
  for(const option of importOptions.filter(row=>row.targetSequence===Number(target?.input.value))){
   const item=node('option','',`효과 ${option.donorSequence+1} · ${effectDescription(option.dependencies)}`);
   item.value=String(option.donorSequence);effectPicker.append(item);
  }
  if([...effectPicker.options].some(o=>o.value===selected))effectPicker.value=selected;
  donorSearch.disabled=donorPicker.disabled=busy||externalBusy;effectPicker.disabled=importButton.disabled=previewEffect.disabled=busy||externalBusy||!effectPicker.options.length;
  previewDonor.disabled=busy||externalBusy||!donorPicker.value;
  restoreEffect.disabled=busy||externalBusy||!getEntries().find(e=>e.weaponIndex===record?.recordIndex)?.imports?.some(e=>e.targetSequence===Number(target?.input.value));
  importNotice.hidden=busy||externalBusy||!donorPicker.value||Boolean(effectPicker.options.length);
  if(!importNotice.hidden){
   const reasons=new Set(importBlocked.filter(row=>row.targetSequence===Number(target.input.value)).map(row=>row.reason));
   importNotice.textContent=reasons.size?`이 연결에 가져올 수 없음 · ${[...reasons].map(reason=>blockedLabels[reason]??blockedLabels['unsupported-track']).join(' / ')}`:'이 연결로 가져올 수 있는 원본 효과가 없습니다.';
  }
 }
 function renderImportSources(){
  const selected=donorPicker.value,units=new Map(getUnits().map(unit=>[unit.recordIndex,unit.name]));
  const normalize=value=>String(value).normalize('NFKC').toLowerCase().replace(/\s+/g,'');
  const query=normalize(donorSearch.value);donorPicker.replaceChildren();const placeholder=node('option','','무기 선택');placeholder.value='';donorPicker.append(placeholder);
  const unlinked=new Set(motionCatalog?.entries.filter(row=>row.ownership==='unowned'&&row.previewEligible).map(row=>row.recordIndex)??[]);
  for(const weapon of getWeapons().filter(w=>w.editable&&(w.owners?.length||unlinked.has(w.recordIndex))&&!w.authoring?.isNew&&w.recordIndex!==record?.recordIndex)){
   const names=(weapon.owners??[]).map(row=>units.get(row.unit)??`기체 #${row.unit}`);
   if(query&&!normalize(`${weapon.name} ${names.join(' ')} #${weapon.recordIndex}`).includes(query))continue;
   const label=names.length?`${weapon.name} · ${names[0]}${names.length>1?` 외 ${names.length-1}기`:''}`:`[미연결] ${weapon.name}`;
   const option=node('option','',`${label} · #${weapon.recordIndex}`);option.value=String(weapon.recordIndex);donorPicker.append(option);
  }
  if(donorPicker.options.length===1)placeholder.textContent='검색 결과 없음';
  donorPicker.value=[...donorPicker.options].some(o=>o.value===selected)?selected:'';
  if(selected&&!donorPicker.value)importOptions=[];
 }
 donorSearch.addEventListener('input',()=>{renderImportSources();renderImports();});
 function motionSignature(id,entries=getEntries()){
  const entry=entries.find(row=>row.weaponIndex===id);
  return JSON.stringify([entry?.sourceWeapon??id,entry?.animationWeapon??entry?.sourceWeapon??id,entry?.imports??[]]);
 }
 function rememberMovement(){
  if(busy||externalBusy||!current)return;
  if(!getWeapons().some(row=>row.recordIndex===record?.recordIndex)){weaponMovementDrafts.delete(record?.recordIndex);movementDrafts=new Map();return;}
  const values=[...inputs.values()].map(({input,field})=>({field,value:input.value}));
  if(values.some(({field,value})=>value.trim()===''||Number(value)!==field.value))movementDrafts.set(current.recordOffset,values);
  else movementDrafts.delete(current.recordOffset);
  if(movementDrafts.size){const labels=weaponMovementDrafts.get(record.recordIndex)?.labels??new Map();const index=info.instructions.filter(i=>i.fields.some(f=>f.editable)).findIndex(i=>i.recordOffset===current.recordOffset)+1;labels.set(current.recordOffset,`동작 ${index}`);weaponMovementDrafts.set(record.recordIndex,{movements:movementDrafts,labels,sourceWeapon:info.sourceWeapon,unitIndex:loadedOwner,signature:loadedSignature,isNew:Boolean(record.authoring?.isNew),selection:current.recordOffset});}
  else weaponMovementDrafts.delete(record.recordIndex);
 }
 function renderFields(){
  fields.replaceChildren();inputs.clear();current=info?.instructions.find(i=>i.recordOffset===Number(picker.value));
  for(const field of current?.fields.filter(f=>f.editable)??[]){
   const label=node('label','',LABELS[field.name]??field.name),input=node(field.choices?'select':'input','');if(field.choices){for(const value of field.choices){const option=node('option','',field.name==='spawnSequence'?effectLabel(value,field):`${value+1}${value===field.originalValue?' · 기본':''}`);option.value=String(value);input.append(option);}}else input.type='number';input.step='1';input.min=String(Math.min(field.min,field.originalValue));input.max=String(field.max);input.value=movementDrafts.get(current.recordOffset)?.find(row=>row.field.name===field.name)?.value??String(field.value);input.inputMode=field.min<0?'text':'numeric';input.dataset.weaponMotionField=field.name;input.title=field.name==='spawnSequence'?'같은 연출에서 실제 호출되는 원본 효과만 연결합니다. 위치·크기·시간 설정은 유지됩니다.':field.name==='scale'?'0=기본 크기 · 100≈100% · 801 이상은 최대 크기':field.name==='scaleDelta'?'현재 크기에 더할 값 · 100≈100% · 크기 설정 후 적용':field.name==='frameInterval'?`원본 ${field.originalValue}프레임 · 1~256프레임`:field.name==='holdDuration'?`원본 ${field.originalValue}프레임 · 1~190 또는 256프레임`:`원본 ${field.originalValue} · ${field.min}~${field.max}`;
   if(field.name==='spawnSequence')label.className='weapon-authoring-effect-field';label.append(input);fields.append(label);inputs.set(field.name,{input,field});
  }
  controls();renderImports();say(current?'원본 연출의 위치·크기·시간을 편집합니다. 유지 시간은 1~190 또는 256프레임입니다.':info?.scope==='exact-source-copy-only'?'원본 연출을 그대로 복사해 무기를 추가할 수 있습니다. 이 연출의 개별 동작 편집은 아직 지원하지 않습니다.':'편집 가능한 움직임이 아직 확인되지 않았습니다.');
 }
 async function load(){
  cancel();loadedOwner=owner();loadedSignature=motionSignature(record.recordIndex);const ownGeneration=generation;controller=new AbortController();info=null;current=null;busy=true;controls();say('원본 연출을 읽고 있습니다.');
  try{
   const result=await inspect({weaponIndex:record.recordIndex,unitIndex:loadedOwner,signal:controller.signal});
   if(generation!==ownGeneration)return;info=result;
   const cached=weaponMovementDrafts.get(record.recordIndex);
   if(cached&&(cached.signature!==loadedSignature||cached.unitIndex!==loadedOwner))weaponMovementDrafts.delete(record.recordIndex);
   movementDrafts=weaponMovementDrafts.get(record.recordIndex)?.movements??new Map();
   const selected=String(weaponMovementDrafts.get(record.recordIndex)?.selection??picker.value);picker.replaceChildren();
   for(const instruction of info.instructions.filter(i=>i.fields.some(f=>f.editable))){
    const option=node('option','',`동작 ${picker.options.length+1} · ${instruction.fields.filter(f=>f.editable).map(f=>LABELS[f.name]).join('·')}`);option.value=String(instruction.recordOffset);picker.append(option);
   }
   if([...picker.options].some(o=>o.value===selected))picker.value=selected;
   busy=false;renderImportSources();renderFields();if(focusAfterLoad){(picker.options.length?picker:motionSelect).focus();focusAfterLoad=false;}
  }catch(e){if(generation!==ownGeneration)return;focusAfterLoad=false;busy=false;controls();if(e.name!=='AbortError')say('연출을 읽지 못했습니다. 다시 선택해주세요.');}
 }
 async function commit(entries,select=null,seed=null){
  busy=true;controls();say('편집값을 확인하고 있습니다.');
  try{await apply(entries,seed);
   for(const [id,draft]of weaponMovementDrafts){
    const entry=entries.find(row=>row.weaponIndex===id);
    const removed=!getWeapons().some(row=>row.recordIndex===id);
    const satisfied=[...draft.movements].every(([offset,values])=>values.every(({field,value})=>value.trim()!==''&&Number(value)===(entry?.edits.find(e=>e.recordOffset===offset&&e.field===field.name)?.value??field.originalValue)));
    if(removed||motionSignature(id,entries)!==draft.signature||satisfied)weaponMovementDrafts.delete(id);
   }
   movementDrafts=weaponMovementDrafts.get(record?.recordIndex)?.movements??new Map();busy=false;syncConfiguration();controls();if(select!==null){onSelect(select);say(seed?'새 무기 추가 · 원형의 사용 속성 유지':'신규 무기를 삭제했습니다.');}else if(open)await load();else{current=null;inputs.clear();}onDraftChange();return true;}
  catch(e){busy=false;controls();say(e.userMessage??'편집값 또는 남은 공간을 확인해주세요. 현재 내용은 유지됩니다.');}
 }
 edit.addEventListener('click',()=>{rememberMovement();open=!open;onToggle(open);controls();if(open)void load();});
 picker.addEventListener('change',()=>{rememberMovement();renderFields();});
 compatiblePicker.addEventListener('change',()=>{if(!compatiblePicker.value||busy||externalBusy)return;rememberMovement();picker.value=compatiblePicker.value;renderFields();say('현재 연결에 가져올 수 있는 효과입니다. 조합 미리보기로 확인하세요.');});
 fields.addEventListener('input',()=>{rememberMovement();controls();onDraftChange();});
 fields.addEventListener('change',()=>{rememberMovement();controls();onDraftChange();});
 donorPicker.addEventListener('change',async()=>{
  importOptions=[];importBlocked=[];renderImports();if(!donorPicker.value)return;
  const ownGeneration=generation,id=record.recordIndex;busy=true;controls();renderImports();say('가져올 수 있는 효과를 확인합니다.');
  try{
   const result=await inspect({weaponIndex:id,unitIndex:owner(),effectDonorWeaponIndex:Number(donorPicker.value),signal:controller?.signal});
   if(generation!==ownGeneration)return;importOptions=result.importOptions??[];importBlocked=result.importBlocked??[];
   say(importOptions.some(row=>row.targetSequence===Number(inputs.get('spawnSequence')?.input.value))?'현재 연결에 가져올 수 있는 효과입니다. 조합 미리보기로 확인하세요.':importOptions.length?'현재 연결에는 가져올 수 없습니다. 사용 가능한 연결이 있으면 위에서 선택하세요.':'현재 방식으로 가져올 수 있는 효과가 없습니다. 그림 자원 할당·복잡한 효과 이식은 아직 지원하지 않습니다.');
  }catch(error){if(generation===ownGeneration&&error.name!=='AbortError')say('원본 효과를 읽지 못했습니다.');}
  finally{if(generation===ownGeneration){busy=false;controls();renderImports();}}
 });
 previewDonor.addEventListener('click',()=>{if(donorPicker.value&&!busy&&!externalBusy)void onPreview?.(Number(donorPicker.value));});
 previewEffect.addEventListener('click',async()=>{
  if(busy||externalBusy||typeof onPreviewEffect!=='function')return;
  const targetSequence=Number(inputs.get('spawnSequence')?.input.value),option=importOptions.find(row=>row.targetSequence===targetSequence&&row.donorSequence===Number(effectPicker.value));
  if(!option)return;
  const weaponIndex=record.recordIndex,ownGeneration=generation,signature=JSON.stringify(copy(getEntries())),base=prepareMotionEntries();
  if(!base)return;
  busy=true;controls();say('선택한 효과의 조합을 준비합니다.');
  try{
   const plan=await inspect({weaponIndex,unitIndex:owner(),weaponAuthoring:base,effectChange:{targetSequence,donorWeapon:option.donorWeapon,donorSequence:option.donorSequence},signal:controller?.signal});
   if(generation!==ownGeneration||record?.recordIndex!==weaponIndex||JSON.stringify(copy(getEntries()))!==signature)return;
   let entry=base.find(row=>row.weaponIndex===weaponIndex);
   if(!entry){entry={weaponIndex,sourceWeapon:info.sourceWeapon,unitIndex:owner(),edits:[]};base.push(entry);}
   entry.edits=plan.effectChange.edits;entry.imports=plan.effectChange.imports;
   await onPreviewEffect({weaponIndex,entries:copy(base)});
   say('조합 미리보기 · 적용하려면 효과 가져오기를 누르세요.');
  }catch(error){if(generation===ownGeneration&&error.name!=='AbortError')say(error.userMessage??'조합을 미리 볼 수 없습니다. 편집값은 유지됩니다.');}
  finally{if(generation===ownGeneration){busy=false;controls();}}
 });
 async function importEffect(remove=false){
  if(busy||externalBusy)return;
  const targetSequence=Number(inputs.get('spawnSequence')?.input.value),option=importOptions.find(row=>row.targetSequence===targetSequence&&row.donorSequence===Number(effectPicker.value));
  if(!Number.isInteger(targetSequence)||!remove&&!option)return;
  const weaponIndex=record.recordIndex;
  if(!await submit())return;
  if(record?.recordIndex!==weaponIndex)return;
  const ownGeneration=generation;
  const entries=copy(getEntries()),index=entries.findIndex(e=>e.weaponIndex===record.recordIndex),entry=index<0?{weaponIndex:record.recordIndex,sourceWeapon:info.sourceWeapon,unitIndex:owner(),edits:[]}:entries[index];
  busy=true;controls();
  try{
   const plan=await inspect({weaponIndex,unitIndex:owner(),effectChange:remove?{targetSequence,remove:true}:{targetSequence,donorWeapon:option.donorWeapon,donorSequence:option.donorSequence},signal:controller?.signal});
   if(generation!==ownGeneration||record?.recordIndex!==weaponIndex)return;
   entry.edits=plan.effectChange.edits;entry.imports=plan.effectChange.imports;
  }catch(error){if(generation===ownGeneration&&error.name!=='AbortError')say(error.userMessage??'효과를 옮길 수 없습니다. 기존 편집은 유지됩니다.');return;}
  finally{if(generation===ownGeneration){busy=false;controls();}}
  if(!entry.imports.length)delete entry.imports;
  if(index<0)entries.push(entry);
  if(!entry.imports?.length&&!entry.edits.length&&!record.authoring?.isNew&&(!entry.animationWeapon||entry.animationWeapon===entry.sourceWeapon))entries.splice(entries.indexOf(entry),1);
  if(await commit(entries))say(remove?'가져온 효과를 원본으로 되돌렸습니다.':'다른 무기의 효과를 가져왔습니다. 전투 플레이어에서 확인하고 BIN/CUE로 저장하세요.');
 }
 importButton.addEventListener('click',()=>void importEffect());restoreEffect.addEventListener('click',()=>void importEffect(true));
 function prepareMotionEntries({all=false,skip=new Set()}={}){
  rememberMovement();
  const entries=copy(getEntries());
  for(const [id,draft]of weaponMovementDrafts){
   if(skip.has(id)||!all&&id!==record?.recordIndex)continue;
   if(motionSignature(id)!==draft.signature){say(`무기 #${id}의 연출 원본이 바뀌었습니다. 다시 선택해주세요.`);return null;}
   const index=entries.findIndex(e=>e.weaponIndex===id),existing=index<0?{weaponIndex:id,sourceWeapon:draft.sourceWeapon,unitIndex:draft.unitIndex,edits:[]}:entries[index];
   for(const [recordOffset,values]of draft.movements){
    const changes=[];let valid=true;
    for(const {field,value:raw}of values){
     const value=Number(raw),allowed=raw.trim()!==''&&Number.isSafeInteger(value)&&(value===field.originalValue||value>=field.min&&value<=field.max&&(!field.choices||field.choices.includes(value))&&(field.name!=='holdDuration'||value<=190||value===256));
     if(id===record?.recordIndex&&recordOffset===current?.recordOffset)inputs.get(field.name)?.input.setAttribute('aria-invalid',String(!allowed));
     if(!allowed){valid=false;continue;}
     if(value!==field.originalValue)changes.push({recordOffset,field:field.name,value});
    }
    if(!valid){const weaponName=getWeapons().find(row=>row.recordIndex===id)?.name??'무기';say(`${weaponName} #${id} · ${draft.labels?.get(recordOffset)??'선택한 동작'}의 값이 비었거나 허용 범위를 벗어났습니다.`);return null;}
    existing.edits=existing.edits.filter(e=>e.recordOffset!==recordOffset).concat(changes);
   }
   if(index<0){if(existing.edits.length)entries.push(existing);}else if(!existing.edits.length&&!existing.imports?.length&&!draft.isNew&&(!existing.animationWeapon||existing.animationWeapon===existing.sourceWeapon))entries.splice(index,1);
  }
  return entries;
 }
 function submit(){const entries=prepareMotionEntries();return entries?commit(entries):Promise.resolve(false);}
 save.addEventListener('click',()=>void submit());
 reset.addEventListener('click',()=>{for(const {input,field}of inputs.values())input.value=String(field.originalValue);save.click();});
 add.addEventListener('click',async()=>{
  if(busy||externalBusy)return;
  if(!await flushPending())return;
  if(open&&current&&[...inputs.values()].some(({input,field})=>Number(input.value)!==field.value||input.value.trim()==='')){if(!await submit())return;}
  await load();if(!info)return;
  const target=info.freeWeaponIndices[0];if(target===undefined){say('신규 무기 슬롯을 모두 사용했습니다.');return;}
  const entries=copy(getEntries()),source=entries.find(e=>e.weaponIndex===record.recordIndex);
  entries.push({weaponIndex:target,sourceWeapon:info.sourceWeapon,unitIndex:owner(),edits:source?.edits.map(e=>({...e}))??[],...(source?.imports?.length?{imports:source.imports.map(e=>({...e}))}:{}),...(source?.animationWeapon!==undefined?{animationWeapon:source.animationWeapon}:{}),...(source?.name!==undefined?{name:source.name}:{})});
  void commit(entries,target,{copyFrom:record.recordIndex,copyTo:target});
 });
 remove.addEventListener('click',async()=>{const id=record.recordIndex,source=record.authoring.sourceWeapon;if(await commit(copy(getEntries()).filter(e=>e.weaponIndex!==id),source))drafts.delete(id);});
 function rememberConfiguration(){
  if(busy||externalBusy)return;
  if(!record?.editable||!record?.owners?.length)return;
  if(!getWeapons().some(row=>row.recordIndex===record.recordIndex)){drafts.delete(record.recordIndex);return;}
  const entry=getEntries().find(item=>item.weaponIndex===record.recordIndex),sourceWeapon=entry?.sourceWeapon??record.recordIndex;
  if((!record.authoring?.isNew||nameInput.value===(entry?.name??record.name))&&Number(motionSelect.value)===(entry?.animationWeapon??sourceWeapon))drafts.delete(record.recordIndex);
  else drafts.set(record.recordIndex,{name:nameInput.value,animationWeapon:Number(motionSelect.value),unitIndex:owner(),isNew:Boolean(record.authoring?.isNew)});
 }
 async function flushConfigurations(stagedEntries=null){
  rememberConfiguration();if(!drafts.size)return true;
  const entries=copy(stagedEntries??getEntries());let changedName=false;
  for(const [id,draft]of drafts){
   let entry=entries.find(item=>item.weaponIndex===id);if(!entry){entry={weaponIndex:id,sourceWeapon:id,unitIndex:draft.unitIndex,edits:[]};entries.push(entry);}
   if(!Number.isSafeInteger(draft.animationWeapon)||!getWeapons().some(w=>w.recordIndex===draft.animationWeapon&&!w.authoring?.isNew)){say('연출 원본 무기를 선택해주세요.');return false;}
   const sourceName=getWeapons().find(w=>w.recordIndex===entry.sourceWeapon)?.name,renaming=draft.isNew&&draft.name!==sourceName;
   if(draft.isNew&&draft.name!==(entry.name??sourceName))changedName=true;
   if(renaming&&getGame())try{encodeWeaponName(draft.name,getGame(),getBaseHash());}catch(error){if(record?.recordIndex===id)nameInput.setAttribute('aria-invalid','true');say(error.message);return false;}
   if(draft.animationWeapon!==(entry.animationWeapon??entry.sourceWeapon)){entry.edits=[];delete entry.imports;}
   entry.animationWeapon=draft.animationWeapon;
   if(!renaming)delete entry.name;else entry.name=draft.name;
   if(!draft.isNew&&entry.animationWeapon===entry.sourceWeapon&&!entry.edits.length&&!entry.imports?.length)entries.splice(entries.indexOf(entry),1);
  }
  const applied=await commit(entries);if(applied){drafts.clear();say(changedName?'무기 이름과 공격 연출을 적용했습니다.':'공격 연출을 적용했습니다.');}return Boolean(applied);
 }
 function flushPending(){
  if(busy||externalBusy)return false;
  rememberConfiguration();
  rememberMovement();
  const skip=new Set([...drafts].filter(([id,draft])=>{
   const entry=getEntries().find(row=>row.weaponIndex===id);
   return draft.animationWeapon!==(entry?.animationWeapon??entry?.sourceWeapon??id);
  }).map(([id])=>id));
  if(!weaponMovementDrafts.size&&!drafts.size)return true;
  const staged=prepareMotionEntries({all:true,skip});if(!staged)return false;
  return drafts.size?flushConfigurations(staged):commit(staged);
 }
 async function submitConfiguration(){
  if(busy||externalBusy||!record)return false;
  return flushPending();
 }
 configure.addEventListener('click',()=>void submitConfiguration());
 previewMotion.addEventListener('click',()=>{if(!busy&&!externalBusy&&Number(motionSelect.value)>0)void onPreview?.(Number(motionSelect.value));});
 motionSelect.addEventListener('change',()=>{controls();onDraftChange();});
 resetWhole.addEventListener('click',async()=>{
  if(busy||externalBusy||!record?.editable||!record?.owners?.length)return;
  const id=record.recordIndex,entries=copy(getEntries()),entry=entries.find(e=>e.weaponIndex===id),pendingName=nameInput.value,isNew=Boolean(record.authoring?.isNew);
  drafts.delete(id);weaponMovementDrafts.delete(id);movementDrafts=new Map();motionSelect.value=String(entry?.sourceWeapon??id);
  if(entry){
   if(isNew){entry.edits=[];delete entry.imports;delete entry.animationWeapon;}
   else entries.splice(entries.indexOf(entry),1);
   if(!await commit(entries)||record?.recordIndex!==id)return;
  }
  if(!entry&&open)renderFields();
  renderConfiguration();if(isNew){nameInput.value=pendingName;rememberConfiguration();}
  controls();onDraftChange();say('원본 연출로 되돌렸습니다. 무기 수치는 유지됩니다.');
 });
 discover.addEventListener('click',async()=>{if(busy||externalBusy)return;rememberConfiguration();busy=true;controls();say('디스크의 연결 없는 연출을 확인합니다.');try{motionCatalog=await readMotionCatalog();renderConfiguration();renderImportSources();renderImports();say(`미연결 연출 ${motionCatalog.counts.unlinkedPrograms}개를 공격 연출·효과 원본에 추가했습니다. 이름만 있는 기본 연출은 제외합니다.`);}catch{say('연결 없는 연출을 읽지 못했습니다.');}finally{busy=false;controls();}});
 nameInput.addEventListener('input',()=>{nameInput.setAttribute('aria-invalid','false');onDraftChange();});
 function select(next){const changed=record?.recordIndex!==next?.recordIndex;if(changed){rememberConfiguration();rememberMovement();movementDrafts=new Map();}record=next;if(changed)renderConfiguration();else syncConfiguration();if(changed){focusAfterLoad=false;cancel();importOptions=[];importBlocked=[];donorPicker.value='';donorSearch.value='';info=null;current=null;fields.replaceChildren();picker.replaceChildren();if(open&&record)void load();}controls();}
 function clear(){cancel();drafts.clear();weaponMovementDrafts.clear();movementDrafts=new Map();record=info=current=null;configurationBaseline=null;focusAfterLoad=false;motionCatalog=null;importOptions=[];importBlocked=[];donorPicker.value='';donorSearch.value='';open=busy=false;fields.replaceChildren();picker.replaceChildren();say('');onToggle(false);controls();}
 controls();return Object.freeze({select,clear,hasPending(){rememberConfiguration();rememberMovement();return drafts.size>0||weaponMovementDrafts.size>0;},show(){if(!record?.editable||!record?.owners?.length||externalBusy)return false;focusAfterLoad=true;if(!open){open=true;onToggle(true);controls();void load();}else if(!busy){(picker.options.length?picker:motionSelect).focus();focusAfterLoad=false;}return true;},setBusy(value){externalBusy=Boolean(value);controls();},refresh(){weaponMovementDrafts.clear();movementDrafts=new Map();if(open&&record)void load();},flush:flushPending,snapshot:()=>({open,busy,weaponIndex:record?.recordIndex??null})});
}
