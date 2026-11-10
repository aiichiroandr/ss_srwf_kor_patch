// Existing join commands only: each control edits its original initial-level
// operand. No actor, event, join date or story flag is created here.
import {formatRosterContext} from './editor-scenario-roster-context.mjs?v=20261110-part2';
export function createScenarioRosterEditor(host){
 const panel=host.el('scenarioRosterList'),count=host.el('scenarioRosterCount');
 let controls=new Map(),source=null,observer=null,expanded=null;
 function sync(){
  for(const control of controls.values()){
   const {row,input,reset,contextButton}=control;
   const enabled=row.editable&&host.canEdit();input.disabled=!enabled;reset.disabled=!enabled||row.initialLevel===row.original.initialLevel;
   input.classList.toggle('is-modified',row.initialLevel!==row.original.initialLevel);
   if(input.getAttribute('aria-invalid')!=='true')input.value=String(row.initialLevel);
   contextButton.disabled=!row.rosterContext;
   // Keep inputs and navigation focus stable while editing. The open context
   // reads current names, levels and text when reopened, not a cached snapshot.
   if(expanded===row.recordIndex)paintContext(control);
  }
 }
 function paintContext(control){
  const {row,context}=control,data=formatRosterContext(row,host.context?.()??{});
  if(!data){context.replaceChildren();return;}
  const signature=JSON.stringify(data);if(control.contextSignature===signature)return;control.contextSignature=signature;
  const fragment=[];
  const p=(text,className='')=>{const item=document.createElement('p');item.textContent=text;item.className=className;return item;};
  const source=p(data.source,'scenario-roster-context-source');source.title=data.sourceTitle;fragment.push(source);
  const section=(title,items)=>{const group=document.createElement('section'),heading=document.createElement('h4'),list=document.createElement('ul');heading.textContent=title;for(const item of items){const li=document.createElement('li');li.textContent=item.text;li.title=item.title??'';list.append(li);}group.append(heading,list);fragment.push(group);};
  section('선행 조건 · 콜백 내부 근거',data.conditions);
  section('생성 → 파일럿 연결',data.commands.length?data.commands:[{text:'연속된 생성·연결 명령 미확인'}]);
  const group=document.createElement('section'),heading=document.createElement('h4'),calls=document.createElement('div');heading.textContent='관련 대사 · 필수 연출 여부 미확인';calls.className='scenario-roster-dialogues';
  for(const call of data.calls){const button=document.createElement('button'),text=document.createElement('span'),relation=document.createElement('small');button.type='button';button.dataset.dialogue=call.recordIndex??'';button.disabled=!call.recordIndex||typeof host.onOpenDialogue!=='function';button.title=call.title;text.textContent=call.text;relation.textContent=call.relation;button.append(text,relation);button.addEventListener('click',()=>{if(validate({report:true}))host.onOpenDialogue?.(call.recordIndex);});calls.append(button);}
  if(!data.calls.length)calls.append(p('이 생성 지점과 연결된 대사 호출 미확인'));
  group.append(heading,calls);fragment.push(group,p(data.notice,'scenario-roster-context-note'));const scroll=context.scrollTop;context.replaceChildren(...fragment);context.scrollTop=scroll;
 }
 function toggleContext(control){
  if(!validate({report:true}))return;
  expanded=expanded===control.row.recordIndex?null:control.row.recordIndex;
  for(const item of controls.values()){const open=item.row.recordIndex===expanded;item.context.hidden=!open;item.contextButton.setAttribute('aria-expanded',String(open));item.line.classList.toggle('is-expanded',open);if(open)paintContext(item);}
 }
 function validate({report=false}={}){for(const {input}of controls.values())if(input.getAttribute('aria-invalid')==='true'){if(report){host.onInvalid?.();input.focus();input.reportValidity();}return false;}return true;}
 function accept(control){
  const {row,input}=control;if(!row.editable||!host.canEdit())return true;
  const value=input.value===''?NaN:Number(input.value),valid=Number.isInteger(value)&&value>=1&&value<=99;
  input.setCustomValidity(valid?'':'생성 초기 레벨은 1~99 정수로 입력하세요.');
  input.setAttribute('aria-invalid',String(!valid));
  if(valid&&row.initialLevel!==value){row.initialLevel=value;host.onChange('roster',row);}sync();return valid;
 }
 function refresh(key){
  const rows=host.rows();
  if(source===key&&rows.length===controls.size&&rows.every(row=>controls.get(row.recordIndex)?.row===row)){sync();return;}
  source=key;controls=new Map();expanded=null;observer?.disconnect();
  const artwork=new Map();observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){artwork.get(entry.target)?.();artwork.delete(entry.target);observer.unobserve(entry.target);}},{root:panel.parentElement,rootMargin:'100px'}):null;
  panel.replaceChildren(...rows.map(row=>{
   const entry=document.createElement('div'),line=document.createElement('div');entry.className='scenario-roster-entry';line.className='scenario-roster-row';
   const label=document.createElement('label'),name=document.createElement('span'),input=document.createElement('input'),reset=document.createElement('button');
   name.textContent=row.name;name.title=`${row.name} · ${row.recordIndex}`;input.type='number';input.min='1';input.max='99';input.step='1';input.inputMode='numeric';input.setAttribute('aria-label',`${row.name} 생성 초기 레벨`);input.title=row.readOnlyReason||'이 로스터 명령이 새로 생성하는 파일럿의 초기 레벨';
   reset.type='button';reset.textContent='복원';reset.title='이 BIN을 열었을 때의 초기 레벨로 복원';
   const contextButton=document.createElement('button'),context=document.createElement('div');contextButton.type='button';contextButton.textContent='연결';contextButton.className='scenario-roster-context-toggle';contextButton.title=row.rosterContext?'조건·생성·파일럿 연결·관련 대사 보기':'이 생성 지점의 연결 근거를 읽지 못했습니다.';contextButton.setAttribute('aria-label',`${row.name} 조건·생성·대사 보기`);contextButton.setAttribute('aria-expanded','false');context.id=`scenarioRosterContext-${row.recordIndex.replace(/[^a-zA-Z0-9-]/gu,'-')}`;contextButton.setAttribute('aria-controls',context.id);context.className='scenario-roster-context';context.hidden=true;
   if(host.appendArtwork){const art=document.createElement('span');art.className='scenario-roster-art';label.append(art);const paint=()=>host.appendArtwork(art,row);if(observer){artwork.set(line,paint);observer.observe(line);}else paint();}label.append(name,input);line.append(label,reset,contextButton);entry.append(line,context);const control={row,input,reset,line,contextButton,context};controls.set(row.recordIndex,control);
   input.addEventListener('input',()=>accept(control));reset.addEventListener('click',()=>{input.value=String(row.original.initialLevel);accept(control);});contextButton.addEventListener('click',()=>toggleContext(control));return entry;
  }));
  count.textContent=`로스터 생성 ${rows.length}곳 · 초기 구성·인계 포함 · 초기 레벨만 편집`;sync();
 }
 return {refresh,sync,validate,focus(id){const c=controls.get(id);c?.input.focus();return Boolean(c);}};
}
