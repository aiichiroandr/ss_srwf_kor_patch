import {encodeEditorText} from './editor-text-codec.mjs?v=20261113-froster1';
export function createWeaponNameControl({container,row,gameId,canEdit,onChange,onInvalid=()=>{},encodeText,textOptions=()=>({})}){
 const label=document.createElement('label');label.className='weapon-name-field';
 const caption=document.createElement('span');caption.textContent='무기명';
 const input=document.createElement('input');input.type='text';input.autocomplete='off';input.spellcheck=false;input.setAttribute('aria-label','무기 명칭');input.dataset.weaponName='';
 const reset=document.createElement('button');reset.type='button';reset.textContent='↶';reset.setAttribute('aria-label','무기 명칭 복원');
 const baseReset=document.createElement('button');baseReset.type='button';baseReset.className='weapon-name-base-reset';baseReset.textContent='기반명';baseReset.setAttribute('aria-label','편집 전 한글패치 무기 명칭으로 복원');baseReset.hidden=true;
 const count=document.createElement('small'),error=document.createElement('small');error.className='weapon-name-error';error.setAttribute('role','alert');
 label.append(caption,input,count,reset,baseReset,error);container.append(label);let key=null,draft=null;
 function refresh(){const current=row(),next=current?.recordIndex??null;if(key!==next){key=next;draft=null;}
  const text=draft??current?.name??'';if(input.value!==text)input.value=text;
  input.disabled=!canEdit()||current?.nameEditable!==true||current?.nameStorageBlocked===true;reset.disabled=input.disabled||draft===null&&current?.name===current?.original?.name;
  reset.hidden=current?.nameStorageBlocked===true;label.classList.toggle('is-storage-blocked',current?.nameStorageBlocked===true);
  baseReset.hidden=!(current?.nameStorageBlocked&&typeof current.baseName==='string'&&current.name!==current.baseName);baseReset.disabled=!canEdit();
  input.classList.toggle('is-modified',current?.name!==current?.original?.name);
  if(draft===null){input.setCustomValidity('');input.removeAttribute('aria-invalid');error.textContent='';}
  try{count.textContent=`${encodeEditorText(text,{...textOptions(),gameId:gameId(),kind:'weapon',maxBytes:32}).length}/32 B`;}catch{count.textContent='문자·길이 확인';}
  label.title=current?.nameStorageBlocked?'F의 새 무기명 저장은 안전 공간 확보 전까지 지원하지 않습니다. 이전 편집 이름은 기반명 버튼으로 한글패치 이름에 복원할 수 있습니다.':`같은 무기 번호를 쓰는 모든 기체에 적용 · ${encodeText?'지원되는 새 글자는 빈 글꼴 칸에 자동 추가':'현재 패치 글꼴의 글자만 입력'}`;
  if(current?.nameStorageBlocked)count.textContent='변경 보류';
 }
 input.addEventListener('input',()=>{
  const current=row();if(input.disabled||!current)return;
  try{if(encodeText)encodeText(input.value,{kind:'weapon',maxBytes:32,owner:`weapon:${current.recordIndex}`});else encodeEditorText(input.value,{...textOptions(),gameId:gameId(),kind:'weapon',maxBytes:32});draft=null;input.setCustomValidity('');input.removeAttribute('aria-invalid');error.textContent='';current.name=input.value.normalize('NFC');onChange(current);}
  catch(e){draft=input.value;input.setCustomValidity(e.message);input.setAttribute('aria-invalid','true');error.textContent=e.message;onInvalid();}
  refresh();
 });
 reset.addEventListener('click',()=>{const current=row();if(input.disabled||!current)return;draft=null;current.name=current.original.name;onChange(current);refresh();});
 baseReset.addEventListener('click',()=>{const current=row();if(baseReset.hidden||baseReset.disabled||!current)return;draft=null;current.name=current.baseName;onChange(current);refresh();});
 return {refresh,reset(){key=null;draft=null;refresh();},validate({report=false}={}){if(draft===null)return true;if(report){input.focus({preventScroll:true});input.reportValidity();}return false;},input};
}
