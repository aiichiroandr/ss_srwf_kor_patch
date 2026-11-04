import {ALLY_REINFORCEMENT_FIELDS,validateAllyReinforcement} from './editor-scenario-reinforcement-data.mjs?v=20261105-part2';
const controlIds=Object.freeze({pilotId:'scenarioSpawnPilot',unitId:'scenarioSpawnUnit',level:'scenarioSpawnLevel',triggerX:'scenarioSpawnTriggerX',triggerY:'scenarioSpawnTriggerY',x:'scenarioSpawnX',y:'scenarioSpawnY'});
export function createAllyReinforcementEditor(host){
 const $=host.el,controls=Object.fromEntries(Object.entries(controlIds).map(([field,id])=>[field,$(id)])),toggle=$('scenarioSpawnToggle'),reset=$('scenarioSpawnReset'),art=$('scenarioSpawnArt'),note=$('scenarioSpawnNote'),pickers=[$('scenarioSpawnTriggerPick'),$('scenarioSpawnPick')];
 let current=null,signature=null,artKey=null,invalid=null;
 const search=$('scenarioSpawnSearch'),searchCount=$('scenarioSpawnSearchCount');
 const folded=value=>String(value??'').normalize('NFKC').toLocaleLowerCase().replace(/\s+/gu,'');
 function paintOptions(){
  const r=row(),query=folded(search.value),counts=[];
  for(const [field,key,id]of [['pilotId','pilotOptions','pilotId'],['unitId','unitOptions','unitId']]){
   const selected=invalid?Number(controls[field].value):r?.[field],values=r?.[key]??[];
   const matches=value=>!query||folded(value.name).includes(query)||String(value[id]).includes(query.replace(/^#/u,''));
   counts.push(values.filter(matches).length);
   controls[field].replaceChildren(...values.filter(value=>matches(value)||value[id]===selected).map(value=>{const option=document.createElement('option');option.value=String(value[id]);option.disabled=value.eligible!==true;option.textContent=`${matches(value)?'':'현재 · '}${value.name||'#'+value[id]} · #${value[id]}${option.disabled?' · 사용 불가':''}`;option.title=value.readOnlyReason||value.name||'';return option;}));
   controls[field].value=Number.isInteger(selected)?String(selected):'';
  }
  searchCount.textContent=query?`파일럿 ${counts[0]} · 기체 ${counts[1]}`:'';
 }
 const row=()=>host.row(),available=()=>validateAllyReinforcement(row()).valid,enabled=()=>available()&&host.canEdit()&&host.active();
 function paintArtwork(){const r=row(),pilot=r?.pilotOptions?.find(option=>option.pilotId===Number(controls.pilotId.value)),unit=r?.unitOptions?.find(option=>option.unitId===Number(controls.unitId.value)),key=JSON.stringify([r?.recordIndex,pilot?.identity,unit?.identity]);if(key===artKey)return;artKey=key;art.replaceChildren();if(pilot&&unit)host.appendArtwork?.(art,{pilotId:pilot.pilotId,pilotName:pilot.name,unitId:unit.unitId,unitName:unit.name});}
 function sync(){const r=row(),active=enabled();for(const [field,input]of Object.entries(controls)){input.disabled=!active||!r?.enabled;input.classList.toggle('is-modified',Boolean(r&&r[field]!==r.original?.[field]));}for(const picker of pickers)picker.disabled=!active||!r?.enabled;toggle.disabled=!active;toggle.textContent=r?.enabled?'증원 끄기':'증원 켜기';reset.disabled=!active||!r||ALLY_REINFORCEMENT_FIELDS.every(field=>r[field]===r.original?.[field])&&!invalid;note.textContent='아군 도착 시 발동 · 이미 보유한 파일럿이면 생성하지 않음 · 자리 부족 시 대기 · 막힌 등장 칸은 게임이 주변을 탐색';note.title=note.textContent;}
 function render(){
  const r=row(),changed=r!==current;current=r;if(changed){invalid=null;signature=artKey=null;search.value='';}
  const next=JSON.stringify([r?.recordIndex,r?.pilotId,r?.unitId,...['pilotOptions','unitOptions'].map(key=>(r?.[key]??[]).map(option=>[option.pilotId??option.unitId,option.name,option.identity,option.eligible,option.readOnlyReason]))]);
  if(next!==signature){signature=next;paintOptions();}
  if(!invalid)for(const [field,input]of Object.entries(controls)){const value=r?.[field];input.value=Number.isInteger(value)?String(value):'';input.setCustomValidity('');input.removeAttribute('aria-invalid');}
  for(const field of ['triggerX','x'])controls[field].max=String((r?.width??64)-1);for(const field of ['triggerY','y'])controls[field].max=String((r?.height??64)-1);
  paintArtwork();sync();
 }
 function accept({report=false}={}){
  const r=row();if(!available()||!r.enabled||!host.canEdit()||!host.active())return true;
  const wanted={enabled:r.enabled,...Object.fromEntries(Object.entries(controls).map(([field,input])=>[field,input.value===''?NaN:Number(input.value)]))},result=validateAllyReinforcement(r,wanted);
  for(const input of Object.values(controls)){input.setCustomValidity('');input.removeAttribute('aria-invalid');}invalid=result.valid?null:result;
  if(!result.valid){const input=controls[result.field]??toggle;input.setCustomValidity(result.message);input.setAttribute('aria-invalid','true');host.say(result.message);if(report){host.onInvalid?.(input);input.focus({preventScroll:true});input.reportValidity();}sync();return false;}
  const changed=ALLY_REINFORCEMENT_FIELDS.some(field=>r[field]!==wanted[field]);Object.assign(r,wanted);host.say();paintArtwork();sync();host.redraw();if(changed)host.onChange('reinforcement',r);return true;
 }
 for(const input of Object.values(controls))for(const type of input.tagName==='SELECT'?['change']:['input','change'])input.addEventListener(type,()=>accept());
 search.addEventListener('input',paintOptions);
 search.addEventListener('search',paintOptions);
 toggle.addEventListener('click',()=>{const r=row();if(!enabled())return;if(r.enabled){r.enabled=0;if(!r.original.enabled)Object.assign(r,r.original);invalid=null;}else{const result=validateAllyReinforcement(r,{...r,enabled:1});if(!result.valid){host.say(result.message);return;}r.enabled=1;}render();host.say();host.redraw();host.onChange('reinforcement',r);});
 reset.addEventListener('click',()=>{const r=row();if(!enabled())return;Object.assign(r,r.original);invalid=null;render();host.say();host.redraw();host.onChange('reinforcement',r);host.onReset?.(r.enabled?controls.level:toggle);});
 for(const [index,kind]of ['trigger','appearance'].entries())pickers[index].addEventListener('click',()=>{if(enabled()&&row().enabled&&accept({report:true}))host.onPick(kind);});
 return Object.freeze({render,sync,accept,available,control:field=>controls[field]??toggle,
  applyPoint(kind,x,y){if(!enabled()||!row().enabled)return false;const fields=kind==='trigger'?['triggerX','triggerY']:['x','y'];controls[fields[0]].value=String(x);controls[fields[1]].value=String(y);return accept({report:true});}});
}
