// Preview conditions are session-local. Applying them never changes a disc,
// an editor record, a preset, or the selected unit's learned abilities.
let nextFormId=0;
export function battleCombatTerrainHint(combat){
 if(combat?.status!=='ready')return null;
 const b=combat.breakdown,domains={ground:'육지',air:'공중',sea:'바다',space:'우주'};
 if(b?.weaponTerrainPercent===0&&domains[b.defenderDomain])
  return `무기 ${domains[b.defenderDomain]} 적응 0% · 지형 확인`;
 if(b?.attackerTerrainPercent===0&&domains[b.attackDomain])
  return `사용 기체·파일럿 ${domains[b.attackDomain]} 적응 0%`;
 return null;
}
export function battleCombatReasonLabel(reason){
 return ({'combat-pilot-selection-required':'파일럿을 선택하면 피해를 계산합니다.',
  'combat-attack-en-insufficient':'공격에 필요한 EN이 부족합니다.',
  'combat-attack-morale-insufficient':'공격에 필요한 기력이 부족합니다.',
  'combat-defense-weapon-ineligible':'이 무기에는 선택한 방어가 발동하지 않습니다.',
  'combat-defense-en-insufficient':'방어에 필요한 EN이 부족합니다.',
  'combat-defense-morale-insufficient':'분신에는 기력 130 이상이 필요합니다.',
  'combat-at-field-pierced':'이 공격은 AT필드를 관통합니다.',
  'combat-miracle-activation-unresolved':'기적 효과는 아직 해석 중입니다.',
  'combat-event-flag-context-required':'이벤트 플래그가 필요한 조건입니다.',
  'combat-hero-runtime-profile-required':'주인공의 조립 조건이 필요한 계산입니다.',
  'combat-attack-required-skill-unavailable':'사용 파일럿이 무기의 필요 기능을 충족하지 않습니다.',
  'combat-required-skill-power-unresolved':'이 무기의 필요 기능 보정은 아직 해석 중입니다.'})[reason]??'이 조건의 피해 계산은 아직 지원하지 않습니다.';
}
export function createBattleSimulationUI({root,getActors,onApply}={}){
 const d=root.ownerDocument,make=(tag,cls,text)=>{const n=d.createElement(tag);n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const button=make('button','bp-conditions-toggle','전투 조건');button.type='button';button.setAttribute('aria-expanded','false');
 root.querySelector('.bp-transport').append(button);
 const panel=make('section','bp-conditions');panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-label','전투 시뮬레이션 조건');
 const head=make('header','bp-conditions-head'),title=make('strong','','전투 조건'),close=make('button','bp-conditions-close','×');close.type='button';close.setAttribute('aria-label','전투 조건 닫기');head.append(title,close);
 const form=make('form','bp-conditions-form'),grid=make('div','bp-conditions-grid'),inputs=new Map();form.id='bp-conditions-'+(++nextFormId);
 const eventGroup=make('fieldset','bp-event-skills'),eventLegend=make('legend','','이벤트 습득 능력');
 eventGroup.append(eventLegend);eventGroup.hidden=true;grid.append(eventGroup);
 const eventFlags={attacker:new Set(),defender:new Set()},eventSignatures={attacker:null,defender:null},eventControls=[];
 const syncEvents=next=>{
  let changed=false;
  for(const side of['attacker','defender']){
   const pilot=next[side]?.pilot,rows=(pilot?.specialAbilities??[]).filter(row=>Number.isInteger(row.level)&&row.level>=100&&row.level<=255);
   const signature=JSON.stringify([pilot?.recordIndex??null,rows.map(row=>[row.id,row.level,row.name??row.label])]);
   if(signature===eventSignatures[side])continue;
   if(actors?.[side]?.pilot?.recordIndex!==pilot?.recordIndex)eventFlags[side].clear();
   const available=new Set(rows.map(row=>row.level-100));
   for(const flag of eventFlags[side])if(!available.has(flag))eventFlags[side].delete(flag);
   if(applied)applied={...applied,[side+'EventFlags']:[...eventFlags[side]].sort((a,b)=>a-b)};
   eventSignatures[side]=signature;changed=true;
  }
  if(!changed)return;
  eventGroup.replaceChildren(eventLegend);eventControls.length=0;
  for(const side of['attacker','defender'])for(const row of(next[side]?.pilot?.specialAbilities??[])){
   if(!Number.isInteger(row.level)||row.level<100||row.level>255)continue;
   const flag=row.level-100,label=make('label',''),text=make('span','',`${side==='attacker'?'사용':'상대'} · ${row.name??row.label??'특수능력 '+row.id}`),input=make('input','');
   input.type='checkbox';input.checked=eventFlags[side].has(flag);input.setAttribute('aria-label',`${text.textContent} 적용`);
   input.dataset.side=side;input.dataset.eventFlag=String(flag);
   input.addEventListener('change',()=>{input.checked?eventFlags[side].add(flag):eventFlags[side].delete(flag);for(const peer of eventControls)if(peer.dataset.side===side&&Number(peer.dataset.eventFlag)===flag)peer.checked=input.checked;});
   label.append(input,text);eventGroup.append(label);eventControls.push(input);
  }
  eventGroup.hidden=eventControls.length===0;
 };
 const field=(key,label,{options,min,max,value=0}={})=>{
  const wrapper=make('label','',label),input=make(options?'select':'input','');input.name=key;input.dataset.condition=key;input.setAttribute('aria-label',label);
  if(options)for(const [id,text]of options){const option=make('option','',text);option.value=id;input.append(option);}
  else{input.type='number';input.min=min;input.max=max;input.step='1';input.inputMode='numeric';}
  input.value=value;input.setAttribute('form',form.id);inputs.set(key,input);wrapper.append(input);grid.append(wrapper);return input;
 };
 field('attackerLevel','사용 Lv',{min:1,max:99,value:1});field('defenderLevel','상대 Lv',{min:1,max:99,value:1});
 field('attackerMorale','사용 기력',{min:50,max:150,value:100});field('defenderMorale','상대 기력',{min:50,max:150,value:100});
 field('attackerHp','사용 HP',{min:0,max:65535});field('defenderHp','상대 HP',{min:1,max:65535});
 field('attackerEn','사용 EN',{min:0,max:65535});field('defenderEn','상대 EN',{min:0,max:65535});
 field('spirit','공격 정신기',{options:[['none','없음'],['hot-blood','열혈'],['soul','혼'],['miracle','기적']],value:'none'});
 field('defense','상대 방어',{options:[['none','일반 대응'],['guard','방어'],['shield','실드 방어'],['parry','베어내기 성공'],['afterimage','분신 성공'],['beam-coat','빔 코트'],['i-field','I 필드'],['aura','오라 배리어'],['at-field','AT 필드']],value:'none'});
 field('critical','크리티컬',{options:[['0','발생 안 함'],['1','발생']],value:'0'});
 field('dialogueSeed','대사 선택',{min:0,max:65535,value:0});
 field('attackerDomain','사용 지형',{options:[['ground','육지'],['air','공중'],['sea','바다'],['space','우주']],value:'ground'});
 field('defenderDomain','상대 지형',{options:[['ground','육지'],['air','공중'],['sea','바다'],['space','우주']],value:'ground'});
 const lightLabel=make('label','bp-counter-display',''),light=make('input','');light.type='checkbox';light.name='lightCorrection';light.dataset.condition='lightCorrection';light.checked=true;light.setAttribute('aria-label','효과 외곽 보정 · 웹 표시만');light.setAttribute('form',form.id);inputs.set('lightCorrection',light);lightLabel.append(light,d.createTextNode('효과 외곽 보정 · 웹 표시만'));
 const note=make('p','bp-conditions-note','특수 방어는 장착·습득 여부와 별개로 성공을 재현합니다. 무기 속성과 EN 조건은 적용합니다. 反은 일반 대응 표시이며 반격 연출은 포함하지 않습니다.');
 const status=make('p','bp-conditions-result',''),submit=make('button','bp-conditions-apply','조건 적용 · 재생');submit.type='submit';status.setAttribute('role','status');form.append(grid,lightLabel,note,status,submit);panel.append(head,form);root.append(panel);
 const quick=make('div','bp-quick-conditions'),quickFields=['spirit','defense','critical'].map(key=>inputs.get(key).parentElement),tall=d.defaultView.matchMedia('(max-width:760px) and (min-height:700px)');
 root.querySelector('.bp-main').insertBefore(quick,root.querySelector('.bp-viewer'));
 const mountQuick=()=>{quick.hidden=!tall.matches;for(const field of quickFields)(tall.matches?quick:grid).append(field);};
 for(const key of ['spirit','defense','critical'])inputs.get(key).addEventListener('change',()=>{if(tall.matches){applied={...(applied??read()),[key]:read()[key]};onApply?.();}});
 tall.addEventListener('change',mountQuick);mountQuick();
 const defaults=new Map([...inputs].map(([key,input])=>[key,input.type==='checkbox'?input.checked:input.value]));
 let actors=null,applied=null;const manual=new Set();
 for(const [key,input]of inputs)for(const event of ['input','change'])input.addEventListener(event,()=>manual.add(key));
 const hide=()=>{panel.hidden=true;button.setAttribute('aria-expanded','false');button.focus();};
 button.addEventListener('click',()=>{panel.hidden=!panel.hidden;button.setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden)inputs.get('attackerLevel').focus();});close.addEventListener('click',hide);
 panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();hide();}if(event.key==='Tab'){const nodes=[close,...inputs.values(),...eventControls,submit].filter(n=>panel.contains(n)&&n.getClientRects().length&&!n.disabled),first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&d.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&d.activeElement===last){event.preventDefault();first.focus();}}});
 const read=()=>{
  const values=Object.fromEntries([...inputs].map(([key,input])=>[key,input.type==='checkbox'?input.checked:input.tagName==='SELECT'&&['spirit','defense','attackerDomain','defenderDomain'].includes(key)?input.value:Number(input.value)]));
  return {...values,critical:Boolean(values.critical),forcedDefense:true,attackerEventFlags:[...eventFlags.attacker].sort((a,b)=>a-b),defenderEventFlags:[...eventFlags.defender].sort((a,b)=>a-b)};
 };
 form.addEventListener('submit',event=>{event.preventDefault();if(!form.reportValidity())return;applied=read();hide();onApply?.();});
 function sync(){
  const next=getActors();if(!next)return;
  for(const side of ['attacker','defender']){
   const current=next[side],previous=actors?.[side];
   for(const [suffix,key]of [['Hp','hp'],['En','en']]){
    const input=inputs.get(side+suffix),max=Number(current?.unit?.[key])||0;input.max=max;
    if(current?.unit?.recordIndex!==previous?.unit?.recordIndex||Number(input.value)>max){input.value=max;if(applied)applied={...applied,[side+suffix]:max};}
   }
  }
  syncEvents(next);actors=next;
 }
 const set=values=>{for(const [key,value]of Object.entries(values)){const input=inputs.get(key);if(input){if(input.type==='checkbox')input.checked=Boolean(value);else input.value=String(value);applied={...(applied??read()),[key]:read()[key]};}}};
 return {sync,set,suggest(values){set(Object.fromEntries(Object.entries(values).filter(([key])=>!manual.has(key))));},read(){sync();applied??=read();return {...applied};},result(combat){
  if(!combat){status.textContent='';return;}
  status.textContent=combat.status==='ready'?`예상 피해 ${combat.damage.toLocaleString()} · 상대 HP ${combat.defender.hpAfter.toLocaleString()}`:battleCombatReasonLabel(combat.reason);
  root.dataset.combatStatus=combat.status;
 },clear(){panel.hidden=true;actors=null;applied=null;manual.clear();for(const [key,input]of inputs){if(input.type==='checkbox')input.checked=defaults.get(key);else input.value=defaults.get(key);}for(const side of['attacker','defender']){eventFlags[side].clear();eventSignatures[side]=null;}eventGroup.replaceChildren(eventLegend);eventControls.length=0;eventGroup.hidden=true;status.textContent='';delete root.dataset.combatStatus;button.setAttribute('aria-expanded','false');}};
}
