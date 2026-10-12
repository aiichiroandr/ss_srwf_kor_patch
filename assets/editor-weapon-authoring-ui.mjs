const LABELS={horizontalVelocity:'가로 속도',horizontalDisplacement:'가로 이동',verticalDisplacement:'세로 이동',horizontalPosition:'가로 위치',verticalPosition:'세로 위치',motionDuration:'이동 시간'};
const copy=entries=>entries.map(({weaponIndex,sourceWeapon,unitIndex,edits})=>({weaponIndex,sourceWeapon,unitIndex,edits:edits.map(e=>({...e}))}));
export function createWeaponAuthoringUI({container,inspect,apply,getEntries,getOwner,onToggle,onSelect}){
 const doc=container.ownerDocument,node=(tag,cls,text)=>{const n=doc.createElement(tag);n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const tools=node('div','weapon-authoring-tools'),edit=node('button','','연출 편집'),add=node('button','','무기 추가'),remove=node('button','','신규 무기 삭제');
 for(const b of [edit,add,remove])b.type='button';tools.append(edit,add,remove);
 const panel=node('div','weapon-authoring-panel'),picker=node('select','weapon-authoring-picker');picker.setAttribute('aria-label','편집할 원본 움직임');
 const fields=node('div','weapon-authoring-fields'),actions=node('div','weapon-authoring-actions'),save=node('button','','적용'),reset=node('button','','이 움직임 초기화'),status=node('p','weapon-authoring-status');
 save.type=reset.type='button';status.setAttribute('role','status');actions.append(save,reset);panel.append(picker,fields,actions,status);container.append(tools,panel);
 let record=null,info=null,open=false,busy=false,externalBusy=false,generation=0,controller=null,current=null;const inputs=new Map();
 const owner=()=>getOwner()??record?.owners?.[0]?.unit;
 function controls(){const allowed=Boolean(record?.editable&&record?.owners?.length)&&!busy&&!externalBusy;edit.disabled=add.disabled=!allowed;remove.hidden=!record?.authoring?.isNew;remove.disabled=!allowed;picker.disabled=busy||externalBusy;save.disabled=reset.disabled=busy||externalBusy||!current;edit.textContent=open?'원본 그림':'연출 편집';edit.setAttribute('aria-expanded',String(open));panel.hidden=!open;}
 function cancel(){generation++;controller?.abort();controller=null;}
 function say(text){status.textContent=text;status.title=text;}
 function renderFields(){
  fields.replaceChildren();inputs.clear();current=info?.instructions.find(i=>i.recordOffset===Number(picker.value));
  for(const field of current?.fields.filter(f=>f.editable)??[]){
   const label=node('label','',LABELS[field.name]??field.name),input=node('input','');input.type='number';input.step='1';input.min=String(Math.min(field.min,field.originalValue));input.max=String(field.max);input.value=String(field.value);input.inputMode=field.min<0?'text':'numeric';input.dataset.weaponMotionField=field.name;input.title=`원본 ${field.originalValue} · ${field.min}~${field.max}`;
   label.append(input);fields.append(label);inputs.set(field.name,{input,field});
  }
  controls();say(current?'원본 연출의 이동·시간값을 편집합니다.':'편집 가능한 움직임이 아직 확인되지 않았습니다.');
 }
 async function load(){
  cancel();const ownGeneration=generation;controller=new AbortController();info=null;current=null;busy=true;controls();say('원본 연출을 읽고 있습니다.');
  try{
   const result=await inspect({weaponIndex:record.recordIndex,unitIndex:owner(),signal:controller.signal});
   if(generation!==ownGeneration)return;info=result;
   const selected=picker.value;picker.replaceChildren();
   for(const instruction of info.instructions.filter(i=>i.fields.some(f=>f.editable))){
    const option=node('option','',`동작 ${picker.options.length+1} · ${instruction.fields.filter(f=>f.editable).map(f=>LABELS[f.name]).join('·')}`);option.value=String(instruction.recordOffset);picker.append(option);
   }
   if([...picker.options].some(o=>o.value===selected))picker.value=selected;
   busy=false;renderFields();
  }catch(e){if(generation!==ownGeneration)return;busy=false;controls();if(e.name!=='AbortError')say('연출을 읽지 못했습니다. 다시 선택해주세요.');}
 }
 async function commit(entries,select=null,seed=null){
  busy=true;controls();say('편집값을 확인하고 있습니다.');
  try{await apply(entries,seed);busy=false;controls();if(select!==null)onSelect(select);else if(open)await load();return true;}
  catch(e){busy=false;controls();say(e.userMessage??'편집값 또는 남은 공간을 확인해주세요. 현재 내용은 유지됩니다.');}
 }
 edit.addEventListener('click',()=>{open=!open;onToggle(open);controls();if(open)void load();});
 picker.addEventListener('change',renderFields);
 function submit(){
  const changes=[];let valid=true;
  for(const {input,field} of inputs.values()){
   const value=Number(input.value),allowed=input.value.trim()!==''&&Number.isSafeInteger(value)&&(value===field.originalValue||value>=field.min&&value<=field.max);
   input.setAttribute('aria-invalid',String(!allowed));if(!allowed){valid=false;continue;}
   if(value!==field.originalValue)changes.push({recordOffset:current.recordOffset,field:field.name,value});
  }
  if(!valid){say('값이 비었거나 허용 범위를 벗어났습니다.');return Promise.resolve(false);}
  const entries=copy(getEntries()),id=record.recordIndex,index=entries.findIndex(e=>e.weaponIndex===id),existing=index<0?{weaponIndex:id,sourceWeapon:info.sourceWeapon,unitIndex:owner(),edits:[]}:entries[index];
  existing.edits=existing.edits.filter(e=>e.recordOffset!==current.recordOffset).concat(changes);
  if(index<0){if(changes.length)entries.push(existing);}else if(!existing.edits.length&&!record.authoring?.isNew)entries.splice(index,1);
  return commit(entries);
 }
 save.addEventListener('click',()=>void submit());
 reset.addEventListener('click',()=>{for(const {input,field}of inputs.values())input.value=String(field.originalValue);save.click();});
 add.addEventListener('click',async()=>{
  if(busy||externalBusy)return;
  if(open&&current&&[...inputs.values()].some(({input,field})=>Number(input.value)!==field.value||input.value.trim()==='')){if(!await submit())return;}
  await load();if(!info)return;
  const target=info.freeWeaponIndices[0];if(target===undefined){say('신규 무기 슬롯을 모두 사용했습니다.');return;}
  const entries=copy(getEntries()),source=entries.find(e=>e.weaponIndex===record.recordIndex);
  entries.push({weaponIndex:target,sourceWeapon:info.sourceWeapon,unitIndex:owner(),edits:source?.edits.map(e=>({...e}))??[]});
  void commit(entries,target,{copyFrom:record.recordIndex,copyTo:target});
 });
 remove.addEventListener('click',()=>{const source=record.authoring.sourceWeapon;void commit(copy(getEntries()).filter(e=>e.weaponIndex!==record.recordIndex),source);});
 function select(next){const changed=record?.recordIndex!==next?.recordIndex;record=next;if(changed){cancel();info=null;current=null;fields.replaceChildren();picker.replaceChildren();if(open&&record)void load();}controls();}
 function clear(){cancel();record=info=current=null;open=busy=false;fields.replaceChildren();picker.replaceChildren();say('');onToggle(false);controls();}
 controls();return Object.freeze({select,clear,setBusy(value){externalBusy=Boolean(value);controls();},refresh(){if(open&&record)void load();},flush(){if(!open||!current)return true;if(busy)return false;return [...inputs.values()].some(({input,field})=>Number(input.value)!==field.value||input.value.trim()==='')?submit():true;},snapshot:()=>({open,busy,weaponIndex:record?.recordIndex??null})});
}
