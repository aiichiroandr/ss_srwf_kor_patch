// Small independent form: the stock pilot stats stay read-only; only the
// proposed AI support loadout and explicit subpilot connection are editable.
export function createAliceCrewEditor({root,getRow,getChoices,canConnect,isBusy,onChange,onInvalid=()=>{},onReveal=()=>{}}){
 if(!root)return {render(){},validate(){return true;},reset(){}};
 const crew=root.querySelector('[data-alice-field="crewEnabled"]'),sp=root.querySelector('[data-alice-field="spBase"]'),grid=root.querySelector('[data-alice-spirits]'),note=root.querySelector('[data-alice-note]');
 if(!crew||!sp||!grid||!note)return {render(){},validate(){return true;},reset(){}};
 const controls=[crew,sp],drafts=new Map();let signature='';
 const status=document.createElement('p');status.className='alice-crew-note alice-crew-error';status.setAttribute('role','status');root.insertBefore(status,sp.closest('label'));
 for(let i=1;i<=6;i++){
  const line=document.createElement('div');line.className='alice-spirit-row';
  const label=document.createElement('label');label.textContent=`정신기 ${i}`;
  const select=document.createElement('select');select.dataset.aliceField=`spirit${i}`;select.setAttribute('aria-label',`정신커맨드 ${i}`);label.append(select);
  const levelLabel=document.createElement('label');levelLabel.textContent='습득 Lv';
  const level=document.createElement('input');level.type='number';level.min='1';level.max='99';level.step='1';level.inputMode='numeric';level.dataset.aliceField=`spiritLevel${i}`;level.setAttribute('aria-label',`정신커맨드 ${i} 습득 레벨`);levelLabel.append(level);line.append(label,levelLabel);grid.append(line);controls.push(select,level);
 }
 function duplicates(){const row=getRow();for(const select of controls.filter(c=>c?.tagName==='SELECT'))for(const option of select.options??[]){const id=Number(option.value);option.disabled=Array.from({length:6},(_,i)=>`spirit${i+1}`).some(key=>key!==select.dataset.aliceField&&row?.[key]===id);}}
 function message(control,value,row){
  const field=control.dataset.aliceField;
  if(field==='spBase')return Number.isInteger(value)&&value>=0&&value<=999?'':'기본 SP는 0~999의 정수를 입력해 주세요.';
  if(field.startsWith('spiritLevel'))return Number.isInteger(value)&&value>=1&&value<=99?'':'정신기 습득 레벨은 1~99의 정수를 입력해 주세요.';
  if(field.startsWith('spirit'))return Number.isInteger(value)&&value>=1&&value<=30&&!Array.from({length:6},(_,i)=>`spirit${i+1}`).some(key=>key!==field&&row[key]===value)?'':'정신기는 서로 다른 항목으로 선택해 주세요.';
  return '';
 }
 function paint(control,error){control.setCustomValidity(error);if(error)control.setAttribute('aria-invalid','true');else control.removeAttribute('aria-invalid');}
 function validate({report=false}={}){
  const first=drafts.values().next().value;
  if(!first)return true;
  status.textContent=first.error;
  if(report){onReveal();first.control.focus({preventScroll:true});first.control.scrollIntoView?.({block:'nearest'});first.control.reportValidity();}
  return false;
 }
 for(const control of controls)control?.addEventListener('input',()=>{
  const row=getRow();if(!row||isBusy())return;const field=control.dataset.aliceField;
  const value=control.type==='checkbox'?Number(control.checked):/^\d+$/.test(control.value)?Number(control.value):NaN;
  const error=message(control,value,row);
  if(error){drafts.set(field,{control,value:control.value,error});paint(control,error);status.textContent=error;onInvalid();return;}
  drafts.delete(field);paint(control,'');status.textContent=drafts.values().next().value?.error??'';
  row[field]=value;duplicates();onChange(row,field);
 });
 return {validate,reset(){drafts.clear();status.textContent='';for(const control of controls)paint(control,'');},render(record){
  const active=Boolean(record?.aliceIdentity),row=getRow();root.hidden=!active;
  root.parentElement?.setAttribute('data-alice',String(active));if(!active||!row)return;
  const choices=getChoices(),next=choices.map(c=>`${c.id}:${c.name}`).join('|');
  if(next!==signature){signature=next;for(const select of controls.filter(c=>c?.tagName==='SELECT'))select.replaceChildren(...choices.map(c=>{const option=document.createElement('option');option.value=String(c.id);option.textContent=c.name||`정신기 ${c.id}`;return option;}));}
  for(const control of controls){if(!control)continue;const draft=drafts.get(control.dataset.aliceField),value=row[control.dataset.aliceField];if(control.type==='checkbox')control.checked=value===1;else control.value=draft?.value??String(value);paint(control,draft?.error??'');control.disabled=isBusy()||(control===crew&&!canConnect());}
  note.textContent=canConnect()?'주파일럿은 기존 배정을 유지합니다. ALICE의 레벨은 첫 동승 때 맞추고 SP는 따로 관리합니다.':'먼저 S건담 또는 Ex-S건담을 추가하세요.';
  duplicates();
 }};
}
