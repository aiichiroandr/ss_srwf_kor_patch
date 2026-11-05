import {planUnitConceptUpgrade,applyUnitConceptUpgrade} from './editor-unit-upgrade.mjs?v=20261105-part3';
import {CONSTRUCTION_WEAPON_ROLES} from './editor-unit-construction.mjs?v=20261105-part3';
import {GRADE_CHOICES} from './editor-grades.mjs?v=20261105-part3';

export function createUnitUpgradeUI(host){
 const $=id=>document.getElementById(id),dialog=$('unitUpgradeDialog');let plan=null,selected=new Set(),checks=new Map();
 const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const active=item=>item.kind!=='role'||item.existingClone||plan.units.some(u=>CONSTRUCTION_WEAPON_ROLES.find(r=>r.role===item.role)?.slots[u.preset]&&selected.has(`unit:${u.recordIndex}:weapons`));
 const effective=()=>new Set([...selected].filter(key=>active(plan.items.find(i=>i.key===key))));
 function status(){
  for(const item of plan.items){const input=checks.get(item.key);input.disabled=!active(item);input.checked=selected.has(item.key);input.closest('label')?.classList.toggle('is-inactive',input.disabled);}
  const count=effective().size;$('unitUpgradeApply').textContent=`선택 ${count}개 적용`;$('unitUpgradeApply').disabled=!count;
 }
 function value(item,v,column){
  if(item.field==='abilities')return v.filter(([id])=>id).map(([id,aux])=>`${host.abilityName(id)}${aux?` (${aux})`:''}`).join(' · ')||'없음';
  if(item.field==='weapons')return v.map((id,index)=>{const role=column==='next'?CONSTRUCTION_WEAPON_ROLES.find(r=>r.slots[item.preset]===index+1):null;if(role)return `${role.name} (독립)`;const w=host.session().weapons.find(w=>w.recordIndex===id);return `${w?.name||'무기'} #${id}`;}).join(' · ');
  if(['air','ground','sea','space'].includes(item.field))return GRADE_CHOICES.find(c=>c.value===v)?.label??String(v);
  if(typeof v==='boolean')return v?'있음':'없음';return String(v??'—');
 }
 function group(title,items){
  const section=node('details',undefined,'unit-upgrade-group');section.open=true;
  section.append(node('summary',title));
  const headings=node('div',undefined,'unit-upgrade-head');for(const name of ['적용 · 항목','이전 기본값','현재 값','새 제안값'])headings.append(node('span',name));section.append(headings);
  for(const item of items){
   const row=node('label',undefined,`unit-upgrade-row${item.custom?' is-custom':''}`),name=node('span',undefined,'unit-upgrade-name');
   const input=node('input');input.type='checkbox';input.dataset.upgradeKey=item.key;input.setAttribute('aria-label',`${item.name} ${host.label(item.field)}`);checks.set(item.key,input);
   input.addEventListener('change',()=>{input.checked?selected.add(item.key):selected.delete(item.key);status();});
   name.append(input,node('span',item.field==='weapons'?'무장 세트':item.field==='abilities'?'특수능력':host.label(item.field)));
   if(item.custom)name.append(node('small','기본값과 다름'));
   row.append(name);
   for(const [key,caption]of [['previous','이전'],['current','현재'],['next','제안']]){const cell=node('span',value(item,item[key],key),'unit-upgrade-value');cell.dataset.caption=caption;row.append(cell);}
   section.append(row);
  }
  return section;
 }
 function open(){
  if(!host.canEdit()||host.beforeOpen?.()===false)return;
  try{
   plan=planUnitConceptUpgrade(host.session());selected=new Set(plan.items.filter(i=>i.checked).map(i=>i.key));checks=new Map();
   const content=$('unitUpgradeItems');content.replaceChildren();
   if(!plan.units.length){host.announce('먼저 미사용 기체가 추가된 ROM을 열어 주세요.');return;}
   for(const u of plan.units){const items=plan.items.filter(i=>i.kind==='unit'&&i.unit===u.recordIndex);if(items.length)content.append(group(`${u.name} #${u.recordIndex}`,items));}
   for(const role of CONSTRUCTION_WEAPON_ROLES){const items=plan.items.filter(i=>i.kind==='role'&&i.role===role.role);if(items.length)content.append(group(`${role.name} · ${role.role==='smart-gun'?'S/Ex-S 공유':'독립 무기'}`,items));}
   if(!plan.items.length)content.append(node('p','모든 항목이 새 기본값과 같습니다.'));
   $('unitUpgradeError').hidden=true;status();dialog.showModal();
  }catch(e){host.announce(e.message);}
 }
 for(const id of ['unitUpgradeClose','unitUpgradeCancel'])$(id).addEventListener('click',()=>dialog.close());
 for(const [id,mode]of [['unitUpgradeDefaults','defaults'],['unitUpgradeNone','none'],['unitUpgradeAll','all']])$(id).addEventListener('click',()=>{selected=new Set(plan.items.filter(i=>mode==='all'||mode==='defaults'&&i.checked).map(i=>i.key));status();});
 $('unitUpgradeApply').addEventListener('click',()=>{
  if(!plan||!host.canEdit())return;
  if(host.beforeApply?.()===false){$('unitUpgradeError').hidden=false;$('unitUpgradeError').textContent='적용되지 않은 입력이 있습니다. 창을 닫고 수정하거나 복원한 뒤 다시 시도해 주세요.';return;}
  try{const result=applyUnitConceptUpgrade(plan,host.session(),effective());host.afterApply();dialog.close();host.announce(`기체 ${result.units.length}종 · 무기 ${result.weapons.length}종 · 선택 ${result.selected}개 갱신. BIN/CUE 저장으로 반영하세요.`);}
  catch(e){$('unitUpgradeError').hidden=false;$('unitUpgradeError').textContent=e.message;}
 });
 return {open,getPlan:()=>plan};
}
