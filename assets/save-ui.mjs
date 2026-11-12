import {canEditSaveNames,SAVE_NAME_SUPPORT_MESSAGE} from './save-name-support.mjs?v=20261113-froster1';
import {canAddSavePilots} from './save-pilot-support.mjs?v=20261113-froster1';
import { createUpgradeBar } from './save-upgrade-bar.mjs?v=20261113-froster1';
import { requestEditorNotice } from './editor-notice.mjs?v=20261113-froster1';
import { SAVE_SCALAR_RULES, requireSaveScalar } from './save-field-rules.mjs?v=20261113-froster1';
import { saveSummary, saveHeroName } from './save-metadata.mjs?v=20261113-froster1';
import { openSave } from './save-core.mjs?v=20261113-froster1';
import { pageItems,fitPages } from './save-pages.mjs?v=20261113-froster1';
import { SAVE_NAME_FIELDS,saveNameFields,saveNameSpec,savedHeroUnitId,decodeSaveName,encodeSaveName } from './save-names.mjs?v=20261113-froster1';
import { saveUnitGroup } from './save-unit-groups.mjs?v=20261113-froster1';

export function createSaveEditor(context=()=>({}), {prepare,verifyOutputCatalog}={}) {
  const $=id=>document.getElementById(id),dialog=$('saveEditorDialog');
  if(!dialog)return;
  let session=null,key=null,slot=null,kind='pilot',unitTab='stats',fileName='',busy=false,invalid=false,generation=0,downloadedChanges='[]',catalogOpening=null;
  const drafts=new Map();let portraitKey='',portraitGeneration=0,listPortraitGeneration=0;
  let listPage=0,unitPage=0,slotsPage=0,changesPage=0,layoutFrame=null,commonTab='money';
  const capacity=(id,row,gap=8)=>Math.max(1,Math.floor((($(id).clientHeight||row)+gap)/(row+gap)));
  function pager(prefix,page,count){
    $(prefix+'Prev').disabled=busy||page===0;$(prefix+'Next').disabled=busy||page>=count-1;
    $(prefix+'PageLabel').textContent=`${page+1} / ${count}`;
  }
  const labels={...Object.fromEntries(SAVE_NAME_FIELDS.map(s=>[s.field,s.label])),money:'자금',pilotAdded:'파일럿 추가',level:'레벨',experience:'다음 레벨까지 EXP',hpUpgrade:'HP 개조',enUpgrade:'EN 개조',armorUpgrade:'장갑 개조',limitUpgrade:'한계 개조',mobilityUpgrade:'운동성 개조',weaponUpgrades:'무기 개조',parts:'장착 파츠',upgradeLimit:'게임 개조 상한',unitAdded:'기체 추가',unitRemoved:'깨진 기체 칸 비움',pilotRemoved:'깨진 파일럿 칸 비움',pilotSlot:'탑승 파일럿 칸',linkedSlot:'연결 기체 칸'};
  const records=()=>session?.list().filter(r=>r.gameId===context().gameId)??[];
  const active=()=>records().find(r=>r.key===key);
  const addRowsOpen=()=>$('saveAddPilotRow').open||$('saveAddUnitRow').open;
  const changeSignature=()=>JSON.stringify(session?.diff()??[]);
  const hasUnsavedEdits=()=>{const changes=session?.diff()??[];return drafts.size>0||(changes.length>0&&JSON.stringify(changes)!==downloadedChanges);};
  const summary=r=>saveSummary(r,context().saveTitles??[],{glyphMap:context().glyphMap??r.glyphMap});
  const slotLabel=r=>{const m=summary(r);return `슬롯 ${r.name.slice(-2)} · ${m.progress}${r.editable?'':' · 읽기 전용'}`;};
  function slotCards(){
    const rows=records(),r=active(),list=$('saveSlotCards');list.replaceChildren();
    if($('saveSlotBrowser').open){
      const used=$('saveSlotCount').getBoundingClientRect().height+dialog.querySelector('.save-slot-filters').getBoundingClientRect().height+$('saveSlotsPager').getBoundingClientRect().height+32;
      list.style.height=`${Math.max(0,$('saveSlotBrowser').clientHeight-used)}px`;
    }
    $('saveSlotBrowser').hidden=!rows.length;$('saveSlotCount').textContent=`다른 저장 고르기 · ${rows.length}개 슬롯`;
    $('saveSlotSummary').hidden=!r;
    const query=$('saveSlotSearch').value.trim().toLowerCase(),order=$('saveSlotSort').value;
    const changes=session?.diff()??[];
    const filtered=rows.map(item=>({item,m:summary(item)})).filter(({item,m})=>`${item.name} ${m.progress} ${m.title} ${m.hero}`.toLowerCase().includes(query));
    filtered.sort((a,b)=>order==='recent'?b.item.dateMinutes-a.item.dateMinutes:order==='progress'?(b.item.completedEpisode??-1)-(a.item.completedEpisode??-1):a.item.name.localeCompare(b.item.name));
    const columns=Math.max(1,Math.floor((($('saveSlotCards').clientWidth||220)+8)/228));
    const page=pageItems(filtered,slotsPage,capacity('saveSlotCards',132)*columns);slotsPage=page.page;pager('saveSlots',page.page,page.count);
    for(const {item,m} of page.items){const button=document.createElement('button');button.type='button';button.className='save-slot-card';button.disabled=busy;
      button.setAttribute('aria-pressed',String(item.key===key));
      for(const [tag,text] of [['small',`슬롯 ${item.name.slice(-2)}${changes.some(d=>d.key===item.key)?' · 수정됨':''}${item.editable?'':' · 읽기 전용'}`],['strong',m.progress],['span',m.title],['small',`${m.hero} · ${m.date}`]]){const el=document.createElement(tag);el.textContent=text;button.append(el);}
      button.addEventListener('click',()=>selectRecord(item.key));list.append(button);
    }
    if(!filtered.length){const empty=document.createElement('p');empty.textContent='검색에 맞는 저장이 없습니다.';list.append(empty);}
    if(r){const m=summary(r);$('saveSlotProgress').textContent=m.progress;$('saveSlotTitle').textContent=m.title;$('saveSlotHero').textContent=m.hero;$('saveSlotDate').textContent=m.date;$('saveSlotIdentity').textContent=`슬롯 ${r.name.slice(-2)} · ${r.gameId==='srwf-final'?'F완결편':'F'} · 파일럿 ${r.pilots.length} · 기체 ${r.units.length}`;}
  }
  function selectRecord(nextKey){
    key=nextKey;slot=null;listPage=unitPage=0;invalid=false;$('saveRecordSelect').value=String(key);$('saveSlotBrowser').open=false;
    $('saveRecordLayout').dataset.mobileView='list';$('saveSearch').value='';render();
  }
  function name(row,type,saved=active()){const c=context();const names=c.gameId===saved?.gameId?(type==='pilot'?c.pilots:c.units):null;
    if(type==='pilot'&&[302,303].includes(row.id)&&saved){
      const hero=saveHeroName(saved,row.id===303?'heroName':'partnerName',{glyphMap:c.glyphMap??saved.glyphMap});
      if(!hero.includes('미기록')&&!hero.includes('해독 불가'))return hero;
      return row.id===303?'주인공':'주인공 슬롯 302';
    }
    if(type==='unit'&&saved)for(let i=0;i<saved.heroUnitNameCount;i++)if(row.id===savedHeroUnitId(saved,i)){
      const text=decodeSaveName(saved,`heroUnitName${i+1}`,{glyphMap:c.glyphMap??saved.glyphMap});
      if(text)return text;
    }
    const match=names?.find(r=>r.recordIndex===row.id);
    // Added Final rows may be absent from the ordinary inspected pilot list
    // (notably ALICE).  Use their authenticated save catalog only as a display
    // fallback; add/write authorization remains in save-core.
    const addedPilot=type==='pilot'&&canAddSavePilots(c)?c.savePilotCatalog?.pilots.find(p=>p.id===row.id):null;
    return match?.name||match?.alias||addedPilot?.name||`${type==='pilot'?'파일럿':'기체'} #${row.id}`;
  }
  function message(text,error=false){$('saveEditorStatus').textContent=text;$('saveEditorStatus').classList.toggle('is-error',error);}
  function controls(){
    invalid=drafts.size>0||Array.from(dialog.querySelectorAll('input[type=number],select[data-save-field]')).some(input=>!input.disabled&&!input.closest('[hidden]')&&(input.value.trim()===''||!input.validity.valid||input.getAttribute('aria-invalid')==='true'));
    const changes=session?.diff()??[];
    $('saveDownload').disabled=busy||invalid||!changes.length;
    $('saveReset').disabled=busy||(!changes.length&&!drafts.size);
    $('saveFileInput').disabled=busy;$('saveRecordSelect').disabled=busy||!session;
    $('saveChangeCount').textContent=drafts.size?`입력 오류 ${drafts.size}건 · 저장 전 수정하세요`:changes.length?`변경 ${changes.length}건 · 내역 보기`:'변경 없음';
    const list=$('saveChanges');list.replaceChildren();
    const entries=[...[...drafts].map(([id,draft])=>({draftId:id,draft})),...changes.map(change=>({change}))];
    const page=pageItems(entries,changesPage,3);changesPage=page.page;pager('saveChanges',page.page,page.count);
    for(const entry of page.items){const li=document.createElement('li');
      if(entry.draft){
        const [recordKey,rowSlot,field,index]=entry.draftId.split(':');
        const record=records().find(item=>String(item.key)===recordKey);
        const button=document.createElement('button');button.type='button';button.className='record-tool save-draft-link';button.disabled=busy;
        button.textContent=`입력 오류 · ${record?.name??`저장 ${recordKey}`} · ${labels[field]??field}${rowSlot==='null'?'':` (칸 ${rowSlot})`}${index==='null'?'':` ${Number(index)+1}칸`}`;
        button.title=entry.draft.error;button.addEventListener('click',()=>focusDraft(entry.draftId));li.append(button);
      }else{const c=entry.change,saved=session?.list().find(item=>item.key===c.key);li.textContent=`${c.name}${c.id===undefined?'':` · ${name({id:c.id},c.type??'pilot',saved)} (칸 ${c.slot})`} · ${labels[c.field]}${c.index===undefined?'':` ${c.index+1}칸`} ${c.before} → ${c.after}`;}
      list.append(li);
    }
  }
  function listRows(){
    const r=active(),q=$('saveSearch').value.trim().normalize('NFKC').toLowerCase(),list=$('saveRecordList');list.replaceChildren();
    const generation=++listPortraitGeneration,token=context().sessionToken;
    const rows=(kind==='pilot'?r?.pilots:kind==='unit'?r?.units:[])??[];
    const filtered=rows.filter(v=>`${name(v,kind)} ${v.id} ${v.slot}`.normalize('NFKC').toLowerCase().includes(q));
    if(!filtered.some(v=>v.slot===slot))slot=filtered[0]?.slot??null;
    const page=pageItems(filtered,listPage,capacity('saveRecordList',52,6));listPage=page.page;pager('saveList',page.page,page.count);
    for(const row of page.items){const button=document.createElement('button');button.type='button';button.className='record-option';
      button.classList.toggle('is-selected',row.slot===slot);button.setAttribute('aria-pressed',String(row.slot===slot));
      const n=document.createElement('span');n.className='record-option-name';n.textContent=name(row,kind);
      const meta=document.createElement('span');meta.className='record-option-meta';meta.textContent=kind==='pilot'?`Lv ${row.level} · EXP ${row.experience}`:row.pilotSlot===255?'미탑승':name(r.pilots.find(p=>p.slot===row.pilotSlot)??{id:-1},'pilot');
      if(kind==='pilot'){
        button.classList.add('has-portrait');
        const portrait=document.createElement('span');portrait.className='save-list-portrait';portrait.setAttribute('aria-hidden','true');
        const canvas=document.createElement('canvas');canvas.width=canvas.height=32;canvas.hidden=true;portrait.append(canvas);button.append(portrait);
        Promise.resolve().then(()=>portraitRequest('pilot',row.id,r)).then(result=>{
          if(generation!==listPortraitGeneration||token!==context().sessionToken||button.parentNode!==list)return;
          if(paintPortrait(canvas,result)){portrait.classList.add('has-image');portrait.title=`${name(row,'pilot')} · ${result.imageSource==='reference'?'참고 초상화':'초상화'}`;}
          else portrait.title=[302,303].includes(row.id)?'저장에 유효한 얼굴 정보 없음':'지정된 초상화 없음';
        }).catch(()=>{if(generation===listPortraitGeneration)portrait.title='초상화를 읽지 못했습니다';});
      }
      button.append(n,meta);button.addEventListener('click',()=>{slot=row.slot;unitPage=0;invalid=false;$('saveRecordLayout').dataset.mobileView='detail';render();});list.append(button);
    }
    $('saveListCount').textContent=`${filtered.length}명 / ${rows.length}명`.replaceAll('명',kind==='unit'?'기':'명');
    $('saveListHeading').textContent=kind==='unit'?'보유 기체':'파일럿 목록';
  }
  // Structural check of the selected slot; the summary also counts every other slot with errors.
  function checkPanel(r){
    const panel=$('saveCheckPanel');panel.hidden=!r||!session;if(panel.hidden)return;
    const issues=session.check(r.key),errors=issues.filter(i=>i.level==='error'),warns=issues.length-errors.length;
    const others=records().filter(x=>x.key!==r.key&&session.check(x.key).some(i=>i.level==='error')).length;
    panel.classList.toggle('is-error',errors.length>0);panel.classList.toggle('is-warn',!errors.length&&warns>0);
    $('saveCheckSummary').textContent=`세이브 검사 · ${issues.length?`오류 ${errors.length} · 주의 ${warns}`:'이 슬롯 정상'}${others?` · 다른 슬롯 ${others}개에 오류`:''}`;
    const list=$('saveCheckList');list.replaceChildren();
    for(const issue of issues){const li=document.createElement('li');li.className=issue.level==='error'?'is-error':'is-warn';
      li.textContent=issue.type==='money'?`${issue.level==='error'?'오류':'주의'} · 보유 자금 · ${issue.message}`:`${issue.level==='error'?'오류':'주의'} · ${issue.type==='unit'?'기체':'파일럿'} 칸 ${issue.slot+1} · ${name({id:issue.id},issue.type,r)} · ${issue.message}`;list.append(li);}
    $('saveCheckRepair').disabled=busy||!r.editable||!errors.length;
    $('saveCheckRepairAll').disabled=busy||!(errors.length||others);
  }
  function repairSlots(keys){
    if(busy||!session)return;let fixed=0,slots=0;
    try{for(const k of keys){const r=records().find(x=>x.key===k);if(!r?.editable)continue;const n=session.repair(k);if(n){fixed+=n;slots++;}}
      message(fixed?`${slots}개 슬롯에서 문제 ${fixed}건을 정리했습니다. 변경 내역을 확인한 뒤 수정본을 저장하세요.`:'고칠 오류가 없습니다.');}
    catch(e){message(e.message,true);}
    render();
  }
  function render(){
    slotCards();const r=active();checkPanel(r);$('saveEditorBody').hidden=!r||$('saveSlotBrowser').open;$('saveEditorEmpty').hidden=!!r;
    if(commonTab==='unitNames'&&r?.gameId!=='srwf-final')commonTab='names';
    $('savePilotTab').setAttribute('aria-pressed',String(kind==='pilot'));
    $('saveUnitTab').setAttribute('aria-pressed',String(kind==='unit'));
    $('saveCommonTab').setAttribute('aria-pressed',String(kind==='common'));
    $('saveNamesPanel').hidden=commonTab!=='names';$('saveCommonNamesTab').setAttribute('aria-pressed',String(commonTab==='names'));
    $('saveUnitNamesPanel').hidden=commonTab!=='unitNames';$('saveCommonUnitNamesTab').hidden=r?.gameId!=='srwf-final';$('saveCommonUnitNamesTab').setAttribute('aria-pressed',String(commonTab==='unitNames'));
    $('saveMoneyPanel').hidden=commonTab!=='money';$('saveUpgradePanel').hidden=commonTab!=='upgrade';
    $('saveCommonMoneyTab').setAttribute('aria-pressed',String(commonTab==='money'));$('saveCommonUpgradeTab').setAttribute('aria-pressed',String(commonTab==='upgrade'));
    const addOpen=addRowsOpen();dialog.dataset.addOpen=String(addOpen);
    $('saveRecordLayout').hidden=kind==='common'||addOpen;$('saveCommonFields').hidden=kind!=='common';
    if(!r){controls();return;}
    $('saveAddPilotRow').hidden=kind!=='pilot';
    const pilotOptions=$('saveAddPilotSelect'),pilotSelected=pilotOptions.value;pilotOptions.replaceChildren();
    const pilotQuery=$('saveAddPilotSearch').value.trim().normalize('NFKC').toLowerCase(),pilotProof=canAddSavePilots(context());
    for(const pilot of context().savePilotCatalog?.pilots??[]){if(!`${pilot.name} ${pilot.id}`.normalize('NFKC').toLowerCase().includes(pilotQuery)||r.pilots.some(p=>p.id===pilot.id))continue;const option=document.createElement('option');option.value=String(pilot.id);option.textContent=`${pilot.name} #${pilot.id}${pilot.subpilot?' · 서브파일럿':''}`;pilotOptions.append(option);}
    if(Array.from(pilotOptions.options).some(o=>o.value===pilotSelected))pilotOptions.value=pilotSelected;
    $('saveAddPilotLevel').disabled=busy||!r.editable||!pilotProof;$('saveAddPilotSelect').disabled=busy||!r.editable||!pilotProof;$('saveAddPilotButton').disabled=busy||!r.editable||!pilotProof||!pilotOptions.options.length||r.pilots.length>=128||!$('saveAddPilotLevel').validity.valid;
    $('saveAddUnitRow').hidden=kind!=='unit';
    const options=$('saveAddUnitSelect'),selected=options.value;options.replaceChildren();
    const unitQuery=$('saveAddUnitSearch').value.trim().normalize('NFKC').toLowerCase();
    for(const unit of context().units??[]){
      if($('saveAddUnitFilter').value==='unused'&&unit.recordKind==='regular')continue;
      if(!`${unit.name??''} ${unit.recordIndex}`.normalize('NFKC').toLowerCase().includes(unitQuery))continue;
      if(!Number.isInteger(unit.hp)||!Number.isInteger(unit.en)||r.units.some(u=>u.id===unit.recordIndex))continue;
      // Do not advertise SRW4 cruiser alternates (or an already represented
      // cruiser family). Core repeats this check before writing.
      let group;try{group=saveUnitGroup(unit.recordIndex,context().units??[],r.units.map(u=>u.id));}catch{continue;}
      if(group.familyMembers&&r.units.some(u=>group.familyMembers.includes(u.id)))continue;
      const option=document.createElement('option');option.value=String(unit.recordIndex);option.textContent=`${unit.name||'이름 없는 기체'} #${unit.recordIndex}${unit.construction?' · 추가 기체':unit.recordKind==='regular'?'':' · 빈/미완성 레코드'}`;options.append(option);
    }
    if(Array.from(options.options).some(o=>o.value===selected))options.value=selected;
    options.disabled=busy||!r.editable;$('saveAddUnitButton').disabled=busy||!r.editable||!options.options.length||r.units.length>=128;
    listRows();const row=(kind==='pilot'?r.pilots:kind==='unit'?r.units:[]).find(v=>v.slot===slot);
    $('saveRecordTitle').textContent=row?name(row,kind):'선택할 데이터가 없습니다';
    $('saveSelectedSlot').textContent=row?`저장 칸 ${row.slot} · ID ${row.id}`:'';
    $('savePilotFields').hidden=kind!=='pilot'||!row;
    $('saveUnitNote').hidden=kind!=='unit'||unitTab!=='parts';$('saveUnitTabs').hidden=kind!=='unit'||!row;
    $('saveUnitPager').hidden=kind!=='unit'||!row;
    for(const [id,type] of [['saveUnitStatsTab','stats'],['saveUnitWeaponsTab','weapons'],['saveUnitPartsTab','parts']])$(id).setAttribute('aria-pressed',String(unitTab===type));
    renderPortraits(r,row);
    $('saveUpgradeModeRow').hidden=r.gameId!=='srwf-final';
    $('saveUpgradeMode').value=session.diff().some(d=>d.key===key&&d.field==='upgradeLimit')?'early10':'original';
    $('saveUpgradeMode').disabled=busy||!r.editable;
    $('saveUpgradeStatus').textContent=`현재 저장의 게임 개조 한도: ${r.upgradeLimit}단`;
    unitControls(r,row);
    for(const spec of SAVE_NAME_FIELDS){
      const {inputId:id,field}=spec,input=$(id),enabled=!!saveNameSpec(r,field),text=decodeSaveName(r,field,{glyphMap:context().glyphMap??r.glyphMap});
      input.parentElement.hidden=!enabled;
      if(document.activeElement!==input)input.value=text??'';
      input.disabled=!enabled||!r.editable||busy||!canEditSaveNames(context(),r.gameId)||!session.canEditNames(r.key);input.title=`${spec.label} · 종료 문자 포함 ${spec.maxBytes}바이트`;
      if(spec.unitSlot!==undefined){const id=savedHeroUnitId(r,spec.unitSlot),original=context().units?.find(u=>u.recordIndex===id)?.name;input.placeholder=original||`기체 #${id} 기본 이름`;$('saveHeroUnitLabel'+(spec.unitSlot+1)).textContent=original||`형태 ${spec.unitSlot+1}`;}
      restoreDraft(input,field,null);nameCount(input,field);
    }
    $('saveMoney').value=r.money??'';$('saveMoney').disabled=!r.editable||busy;restoreDraft($('saveMoney'),'money',null);
    for(const [id,field] of [['saveLevel','level'],['saveExperience','experience']]){
      $(id).value=row?.[field]??'';$(id).disabled=!r.editable||busy||!row||row.id>=400;$(id).removeAttribute('aria-invalid');restoreDraft($(id),field,slot);
    }
    $('saveRecordNote').textContent=r.reason||'체크섬 정상';
    nameNotice(r);
    controls();
  }
  function draftKey(field,rowSlot,index=null){return `${key}:${rowSlot}:${field}:${index}`;}
  function focusDraft(id){
    const [recordKey,rowSlot,field,index]=id.split(':'),record=records().find(item=>String(item.key)===recordKey);
    if(!record||!drafts.has(id)||busy)return;
    key=record.key;slot=rowSlot==='null'?null:Number(rowSlot);listPage=unitPage=0;
    $('saveRecordSelect').value=String(key);$('saveSlotBrowser').open=false;$('saveAddUnitRow').open=false;$('saveSearch').value='';
    const spec=SAVE_NAME_FIELDS.find(item=>item.field===field);
    if(spec){kind='common';commonTab=spec.unitSlot===undefined?'names':'unitNames';}
    else if(field==='money'){kind='common';commonTab='money';}
    else if(field==='parts'){kind='unit';unitTab='parts';}
    else kind='pilot';
    $('saveRecordLayout').dataset.mobileView='detail';dialog.querySelector('.save-diff').open=false;render();
    let target=spec?$(spec.inputId):field==='money'?$('saveMoney'):field==='level'?$('saveLevel'):field==='experience'?$('saveExperience'):null;
    if(field==='parts'){
      const row=active()?.units.find(item=>item.slot===slot);
      while(row){target=$('saveUnitFields').querySelector(`[data-save-field="parts"][data-save-index="${index}"]`);if(target||$('saveUnitNext').disabled)break;unitPage++;unitControls(active(),row);}
    }
    target?.focus();
  }
  function nameNotice(r=active()){
    const c=context(),notes=[];if(!canEditSaveNames(c,r?.gameId))notes.push(SAVE_NAME_SUPPORT_MESSAGE);if(r&&(c.gameId!==r.gameId||!c.pilots?.length))notes.push('검증한 ROM에서 이름을 찾지 못한 데이터는 ID로 표시합니다.');
    if(c.glyphPending)notes.push('새 글자는 수정 ROM도 함께 저장해야 표시됩니다.');
    $('saveNameNote').textContent=notes.join(' ');$('saveNameNote').hidden=!notes.length;
    $('saveNamesHelp').textContent=`풀네임과 애칭은 각각 따로 적용합니다. 종료 문자 포함 풀네임 14·애칭 6바이트입니다. ${c.encodeText?'없는 한글은 추가 글리프로 연결합니다.':'현재 패치 글꼴의 글자만 입력할 수 있습니다.'}`;
    $('saveUnitNamesHelp').textContent=`선택한 저장의 주인공 기체${r?.heroUnitNameCount===3?' 세 형태':' 한 형태'}에만 적용합니다. 본문 10바이트까지이며, 빈칸은 ROM 기본 이름을 사용합니다.${r?.heroUnitNameCount===3?' 한 형태만 바꾸면 나머지는 기본 이름으로 함께 기록합니다.':''}${c.glyphPending?' 새 글자는 수정 ROM도 함께 저장해야 합니다.':''}`;
  }
  function syncSaveGlyphTexts(){
    const sync=context().syncSaveGlyphTexts;if(!sync||!session)return;
    const texts=new Map();for(const change of session.diff())if(SAVE_NAME_FIELDS.some(s=>s.field===change.field))texts.set(`save:${change.key}:${change.field}`,change.after);
    sync(texts);
  }
  function reserveNameGlyphCodes(){
    const reserve=context().reserveGlyphCodes;if(!reserve||!session)return;
    const codes=new Set();for(const record of session.list())for(const spec of saveNameFields(record)){
      const bytes=record[spec.field+'Bytes']??[];for(let i=0;i<bytes.length&&bytes[i]!==255;i++)if(bytes[i]>=0xeb&&bytes[i]<=0xf5&&i+1<bytes.length){codes.add(bytes[i].toString(16).padStart(2,'0').toUpperCase()+bytes[++i].toString(16).padStart(2,'0').toUpperCase());}
    }
    reserve(codes);
  }
  function fieldError(input,text){
    let hint=input.parentElement.querySelector('.save-field-message');if(!hint){hint=document.createElement('small');hint.className='save-field-message';hint.id=`save-error-${input.id||input.dataset.saveField}-${input.dataset.saveIndex??''}`;hint.setAttribute('role','alert');input.parentElement.append(hint);input.setAttribute('aria-describedby',hint.id);}
    hint.textContent=text;hint.hidden=!text;if(text)input.setAttribute('aria-invalid','true');else input.removeAttribute('aria-invalid');
  }
  function restoreDraft(input,field,rowSlot,index=null){const draft=drafts.get(draftKey(field,rowSlot,index));if(draft){input.value=draft.value;fieldError(input,draft.error);}else fieldError(input,'');}
  function numericEdit(input,field,rowSlot){
    if(busy||!context().verified)return;
    const dk=draftKey(field,rowSlot);
    try{const value=input.value.trim()===''?NaN:Number(input.value),r=active();requireSaveScalar(field,value,field==='money'?r?.money??undefined:r?.pilots.find(p=>p.slot===rowSlot)?.[field]);session.edit(key,field,value,rowSlot);drafts.delete(dk);fieldError(input,'');listRows();message(drafts.size?'변경했습니다. 남은 입력 오류를 수정한 뒤 저장하세요.':'변경 내역을 확인한 뒤 수정본을 저장하세요.');}
    catch(e){drafts.set(dk,{value:input.value,error:e.message});fieldError(input,e.message);message(e.message,true);}controls();
  }
  function portraitRequest(type,id,r){
    const c=context();
    if(!id||!r||c.gameId!==r.gameId||!c.verified)return null;
    const heroFaceId=type==='pilot'&&[302,303].includes(id)?r.heroFaceIds?.[id]:undefined;
    if(type==='pilot'&&[302,303].includes(id)&&!(heroFaceId>0))return null;
    return c.preview?.(type,id,heroFaceId===undefined?{}:{heroFaceId});
  }
  function paintPortrait(canvas,result){
    if(!result?.image)return false;
    const {image,bounds}=result;canvas.width=bounds?.width??image.width;canvas.height=bounds?.height??image.height;
    canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(image.pixels),image.width,image.height),-(bounds?.x??0),-(bounds?.y??0));canvas.hidden=false;
    return true;
  }
  function renderPortraits(r,row){
    const c=context();let unitId=null,pilotId=null;
    if(kind==='unit'&&row){unitId=row.id;pilotId=r.pilots.find(p=>p.slot===row.pilotSlot)?.id??null;}
    if(kind==='pilot'&&row){pilotId=row.id;unitId=(r.units.find(u=>u.pilotSlot===row.slot&&u.linkedSlot===255)??r.units.find(u=>u.pilotSlot===row.slot))?.id??null;}
    const signature=`${c.sessionToken}:${r.key}:${kind}:${unitId}:${pilotId}`;if(signature===portraitKey)return;portraitKey=signature;
    const generation=++portraitGeneration;
    for(const [type,id] of [['unit',unitId],['pilot',pilotId]]){
      const canvas=$(type==='unit'?'saveUnitImage':'savePilotImage'),note=$(type==='unit'?'saveUnitImageNote':'savePilotImageNote');canvas.hidden=true;canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);
      if(!id){note.textContent=type==='pilot'?'미탑승':'탑승 기체 없음';continue;}
      if(type==='pilot'&&[302,303].includes(id)&&!(r.heroFaceIds?.[id]>0)){note.textContent='저장된 얼굴 정보 없음';continue;}
      note.textContent='그림 불러오는 중';
      Promise.resolve().then(()=>portraitRequest(type,id,r)).then(result=>{
        if(generation!==portraitGeneration)return;
        if(!paintPortrait(canvas,result)){note.textContent='지정된 그림 없음';return;}
        canvas.setAttribute('aria-label',`${name({id},type)} ${type==='unit'?'기체 그래픽':'파일럿 초상화'}`);note.textContent=result.imageSource==='reference'?'참고 초상화':name({id},type);
      }).catch(()=>{if(generation===portraitGeneration)note.textContent='그림을 읽지 못했습니다';});
    }
  }
  function unitControls(r,row){
    const panel=$('saveUnitFields');panel.replaceChildren();panel.hidden=kind!=='unit'||!row;if(panel.hidden)return;
    const c=context(),unit=c.units?.find(u=>u.recordIndex===row.id),max=r.upgradeLimit;
    function upgrade(label,field,index=null){
      const value=index===null?row[field]:row[field][index];
      panel.append(createUpgradeBar(document,{label,value,limit:max,field,index,disabled:busy||!r.editable||!unit,onChange:next=>{
        if(busy||!context().verified)throw new Error('ROM 검증 상태를 확인하세요.');
        try{session.editUnit(key,field,next,row.slot,index);message(`${label}: ${next}단으로 변경했습니다.`);controls();}
        catch(e){message(next>max?`${label}: 현재 한도는 ${max}단입니다. 자금·개조 해금 탭에서 해금 상태를 확인하세요.`:e.message,true);throw e;}
      }}));
    }
    if(unitTab==='stats'){
      for(const f of ['hpUpgrade','enUpgrade','armorUpgrade','mobilityUpgrade','limitUpgrade'])upgrade(labels[f],f);
    }
    if(unitTab==='weapons'){
      if(unit?.weaponList?.status==='known'){
        const groups=new Map();for(const entry of unit.weaponList.entries){const names=groups.get(entry.slot)??[];names.push(c.weapons?.find(w=>w.recordIndex===entry.weaponIndex)?.name||`무기 #${entry.weaponIndex}`);groups.set(entry.slot,names);}
        for(const [slot,names] of groups)upgrade(names.join(' / '),'weaponUpgrades',slot-1);
      }else{const p=document.createElement('p');p.textContent='이 기체의 무기 연결을 확인하지 못해 편집할 수 없습니다.';panel.append(p);}
    }
    if(unitTab==='parts'&&Number.isInteger(unit?.partSlots)&&unit.partSlots>=1&&unit.partSlots<=4){
      let group;
      for(let index=0;index<unit.partSlots;index++){
        if(index%2===0){group=document.createElement('div');group.className='save-parts-row';panel.append(group);}
        const label=document.createElement('label');label.textContent=`장착 파츠 ${index+1}`;const input=document.createElement('select');input.dataset.saveField='parts';input.dataset.saveIndex=String(index);
        for(let id=0;id<=22;id++){const o=document.createElement('option');o.value=String(id);o.textContent=id===0?'없음':c.partNames?.[id]||`파츠 #${id}`;input.append(o);}
        if(row.parts[index]>22){const o=document.createElement('option');o.value=String(row.parts[index]);o.textContent=`미확인 ID ${row.parts[index]} (현재 값)`;o.disabled=true;input.append(o);}
        input.value=String(row.parts[index]);input.disabled=busy||!r.editable;label.append(input);group.append(label);restoreDraft(input,'parts',row.slot,index);
        input.addEventListener('change',()=>{if(busy||!context().verified)return;const dk=draftKey('parts',row.slot,index);try{session.editUnit(key,'parts',Number(input.value),row.slot,index);drafts.delete(dk);fieldError(input,'');message('장착 파츠를 변경했습니다.');}catch(e){drafts.set(dk,{value:input.value,error:e.message});fieldError(input,e.message);message(e.message,true);}controls();});
      }
    }
    const items=Array.from(panel.children),gap=8;
    const pages=fitPages(items,items.map(n=>n.getBoundingClientRect().height||64),panel.clientHeight||320,gap);
    unitPage=Math.max(0,Math.min(unitPage,pages.length-1));panel.replaceChildren(...pages[unitPage]);pager('saveUnit',unitPage,pages.length);
  }
  async function load(file){
    if(!file||!context().verified||busy)return;const token=++generation,sourceToken=context().sessionToken;busy=true;controls();message('카트리지 저장을 검사하고 있습니다.');
    try{
      if(file.size>0x800000)throw new Error('8 MiB 이하의 백업 RAM 파일을 선택하세요.');
      const bytes=await file.arrayBuffer();
      if(!context().verified||context().sessionToken!==sourceToken)throw new Error('게임 ROM이 변경되어 저장 파일을 열지 않았습니다. 현재 게임에서 다시 선택하세요.');
      const next=await openSave(new Uint8Array(bytes),context());if(token!==generation)return;
      if(!context().verified||context().sessionToken!==sourceToken)throw new Error('게임 ROM이 변경되어 저장 파일을 열지 않았습니다. 현재 게임에서 다시 선택하세요.');
      if(hasUnsavedEdits()&&typeof globalThis.confirm==='function'&&!globalThis.confirm('저장하지 않은 세이브 수정이 있습니다. 새 파일을 열면 사라집니다. 계속할까요?')){message('기존 세이브 편집을 유지했습니다.');return;}
      session=next;downloadedChanges='[]';reserveNameGlyphCodes();syncSaveGlyphTexts();fileName=file.name;invalid=false;drafts.clear();portraitKey='';listPage=unitPage=slotsPage=changesPage=0;
      const rows=records(),select=$('saveRecordSelect');select.replaceChildren();
      for(const r of rows){const option=document.createElement('option');option.value=String(r.key);option.textContent=slotLabel(r);select.append(option);}
      key=rows.find(r=>r.editable)?.key??rows[0]?.key??null;select.value=String(key);slot=null;
      $('saveFileName').textContent=fileName;$('saveFileName').title=fileName;
      const f=session.format;$('saveFileFormat').textContent=`${f.bytes/1024} KiB · ${f.gzipLayers?'gzip · ':''}${f.interleaved?'인터리브 · ':''}${rows.length}개 저장 슬롯`;
      const broken=rows.filter(r=>session.check(r.key).some(i=>i.level==='error')).length;
      if(broken)message(`세이브 검사: ${broken}개 슬롯에 게임이 멈출 수 있는 깨진 칸이 있습니다. 「세이브 검사」에서 내용을 보고 고치세요.`,true);
      else message(rows.some(r=>r.editable)?'저장을 고르고 수치를 수정하세요.': '편집 가능한 F/F완결편 일반 저장이 없습니다.');
    }catch(e){message(e.message,true);}
    finally{if(token===generation){busy=false;render();}}
  }
  function open(){
    if(!context().verified)return;
    session?.updateCatalog(context());
    reserveNameGlyphCodes();
    syncSaveGlyphTexts();
    portraitKey='';
    const rows=records();key=rows.some(r=>r.key===key)?key:rows.find(r=>r.editable)?.key??rows[0]?.key??null;
    const select=$('saveRecordSelect');select.replaceChildren();
    for(const r of rows){const option=document.createElement('option');option.value=String(r.key);option.textContent=slotLabel(r);select.append(option);}
    select.value=String(key);render();dialog.showModal();requestLayout();
  }
  async function openPrepared(prepareCatalog){
    if(busy)return;
    open();if(!dialog.open)return;
    const controller=new AbortController(),sourceToken=context().sessionToken;
    catalogOpening=controller;busy=true;render();message('현재 ROM의 추가 기체와 세이브 연결을 확인하고 있습니다… 닫으면 취소됩니다.');
    try{
      await prepareCatalog({signal:controller.signal});controller.signal.throwIfAborted();
      if(context().sessionToken!==sourceToken)throw Error('ROM이 변경되었습니다. 현재 게임에서 세이브를 다시 열어 주세요.');
      session?.updateCatalog(context());
      message(session?'추가 기체 연결을 확인했습니다. 기존 세이브 편집은 유지됩니다.':'기체 연결을 확인했습니다. 세이브 파일을 열어 주세요.');
    }catch(error){if(!controller.signal.aborted&&dialog.open)message(error.message,true);}
    finally{if(catalogOpening===controller){catalogOpening=null;busy=false;render();}}
  }
  $('saveEditorOpen').addEventListener('click',async()=>{
    if(!context().verified)return;
    if(!await requestEditorNotice()||!context().verified)return;
    if(prepare){await prepare();return;}
    open();
  });
  $('saveEditorClose').addEventListener('click',()=>dialog.close());
  $('saveCheckRepair').addEventListener('click',()=>{const r=active();if(r)repairSlots([r.key]);});
  $('saveCheckRepairAll').addEventListener('click',()=>repairSlots(records().map(r=>r.key)));
  dialog.addEventListener('close',()=>{
    if(catalogOpening){catalogOpening.abort(new DOMException('세이브 연결 준비를 취소했습니다.','AbortError'));catalogOpening=null;busy=false;}
    $('saveEditorOpen').focus();
  });
  $('saveFileInput').addEventListener('change',()=>{const f=$('saveFileInput').files?.[0];$('saveFileInput').value='';load(f);});
  $('saveRecordSelect').addEventListener('change',()=>selectRecord(Number($('saveRecordSelect').value)));
  $('saveSlotSearch').addEventListener('input',()=>{slotsPage=0;slotCards();});$('saveSlotSort').addEventListener('change',()=>{slotsPage=0;slotCards();});
  $('saveSlotBrowser').addEventListener('toggle',()=>{$('saveEditorBody').hidden=$('saveSlotBrowser').open||!active();requestLayout();});
  for(const id of ['saveAddPilotRow','saveAddUnitRow'])$(id).addEventListener('toggle',()=>{dialog.dataset.addOpen=String(addRowsOpen());render();requestLayout();});
  $('saveBackToList').addEventListener('click',()=>{$('saveRecordLayout').dataset.mobileView='list';$('saveRecordList').querySelector('[aria-pressed=true]')?.focus({preventScroll:true});});
  $('saveSearch').addEventListener('input',()=>{listPage=0;unitPage=0;invalid=false;render();});
  for(const [id,type] of [['savePilotTab','pilot'],['saveUnitTab','unit'],['saveCommonTab','common']])$(id).addEventListener('click',()=>{kind=type;slot=null;listPage=unitPage=0;invalid=false;$('saveAddUnitRow').open=false;$('saveAddPilotRow').open=false;$('saveSearch').value='';$('saveRecordLayout').dataset.mobileView='list';render();});
  for(const [id,field] of [['saveMoney','money'],['saveLevel','level'],['saveExperience','experience']]){
    const rule=SAVE_SCALAR_RULES[field];$(id).min=String(rule.min);$(id).max=String(rule.max);$(id).step='1';
    $(id).addEventListener('input',()=>numericEdit($(id),field,field==='money'?null:slot));
  }
  for(const [id,type] of [['saveUnitStatsTab','stats'],['saveUnitWeaponsTab','weapons'],['saveUnitPartsTab','parts']])$(id).addEventListener('click',()=>{unitTab=type;unitPage=0;render();});
  for(const [id,type] of [['saveCommonMoneyTab','money'],['saveCommonUpgradeTab','upgrade'],['saveCommonNamesTab','names'],['saveCommonUnitNamesTab','unitNames']])$(id).addEventListener('click',()=>{commonTab=type;render();});
  function nameCount(input,field){
    const r=active();if(!r)return;
    const spec=saveNameSpec(r,field);if(!spec)return;
    try{$(input.id+'Count').textContent=`${encodeSaveName(r,field,input.value,{glyphMap:context().glyphMap??r.glyphMap}).length} / ${spec.maxBytes}바이트`;}
    catch{$(input.id+'Count').textContent=input.value===decodeSaveName(r,field,{glyphMap:context().glyphMap??r.glyphMap})?'원본 표기 유지':'문자·길이 확인';}
  }
  for(const spec of SAVE_NAME_FIELDS){const {inputId:id,field}=spec;$(id).addEventListener('input',()=>{
    if(busy||!context().verified||!session)return;
    const input=$(id),dk=draftKey(field,null);
    try{
      const c=context(),r=active();
      if(!canEditSaveNames(c,r?.gameId)||!session.canEditNames(key))throw new Error(SAVE_NAME_SUPPORT_MESSAGE);
      if(!r?.editable||c.gameId!==r.gameId||!saveNameSpec(r,field))throw new Error('검증한 ROM과 같은 게임의 편집 가능한 이름만 바꿀 수 있습니다.');
      if(input.value!==decodeSaveName(r,field,{glyphMap:c.glyphMap??r.glyphMap})&&!(spec.allowEmpty&&input.value===''))c.encodeText?.(input.value,{kind:spec.kind,maxBytes:spec.maxBytes+(spec.unitSlot===undefined?0:1),owner:`save:${key}:${field}`});
      const next=session.editName(key,field,input.value);
      if(spec.unitSlot!==undefined)for(const other of saveNameFields(next).filter(s=>s.unitSlot!==undefined)){
        const control=$(other.inputId);
        if(other.field!==field&&drafts.has(draftKey(other.field,null)))restoreDraft(control,other.field,null);
        else if(document.activeElement!==control||control.value==='')control.value=decodeSaveName(next,other.field,{glyphMap:c.glyphMap??next.glyphMap})??'';
        nameCount(control,other.field);
      }
      syncSaveGlyphTexts();drafts.delete(dk);fieldError(input,'');slotCards();listRows();nameNotice();
      message(drafts.size?'이름을 변경했습니다. 남은 입력 오류를 수정한 뒤 저장하세요.':`이름을 변경했습니다. 수정본을 저장하면 적용됩니다.${context().glyphPending?' 새 글자는 수정 ROM도 함께 저장해야 표시됩니다.':''}`);
    }
    catch(e){syncSaveGlyphTexts();drafts.set(dk,{value:input.value,error:e.message});fieldError(input,e.message);message(e.message,true);}
    nameCount(input,field);controls();
  });}
  $('saveAddPilotSearch').addEventListener('input',render);
  $('saveAddPilotLevel').addEventListener('input',render);
  $('saveAddPilotButton').addEventListener('click',()=>{if(busy||!context().verified)return;try{const result=session.addPilot(key,Number($('saveAddPilotSelect').value),Number($('saveAddPilotLevel').value));slot=result.slot;$('saveSearch').value='';$('saveAddPilotRow').open=false;$('saveRecordLayout').dataset.mobileView='detail';render();message('파일럿을 추가했습니다. 수정본을 저장하면 적용됩니다.');}catch(e){message(e.message,true);}});
  $('saveAddUnitFilter').addEventListener('change',render);
  $('saveAddUnitSearch').addEventListener('input',render);
  $('saveAddUnitButton').addEventListener('click',()=>{
    if(busy||!context().verified)return;
    try{const result=session.addUnit(key,Number($('saveAddUnitSelect').value));slot=result.slot;$('saveSearch').value='';$('saveAddUnitRow').open=false;$('saveRecordLayout').dataset.mobileView='detail';render();message(`연결 기체를 포함해 ${result.added}기를 추가했습니다. 게임에서 탑승·변형·합체를 확인하세요.`);}
    catch(e){message(e.message,true);}
  });
  $('saveUpgradeMode').addEventListener('change',()=>{
    if(busy||!context().verified)return;
    try{session.setUpgradeMode(key,$('saveUpgradeMode').value);render();message('개조 해금 상태를 변경했습니다. 기존 개조 단수는 유지합니다.');}
    catch(e){message(e.message,true);}
  });
  $('saveReset').addEventListener('click',()=>{session?.reset();reserveNameGlyphCodes();syncSaveGlyphTexts();invalid=false;drafts.clear();render();message('모든 저장을 불러왔을 때의 값으로 복원했습니다.');});
  for(const [prefix,change] of [
    ['saveList',delta=>{listPage+=delta;listRows();}],
    ['saveUnit',delta=>{unitPage+=delta;const r=active();if(r)unitControls(r,r.units.find(u=>u.slot===slot));}],
    ['saveSlots',delta=>{slotsPage+=delta;slotCards();}],
    ['saveChanges',delta=>{changesPage+=delta;controls();}]
  ])for(const [suffix,delta] of [['Prev',-1],['Next',1]])$(prefix+suffix).addEventListener('click',()=>change(delta));
  function requestLayout(){
    if(layoutFrame!==null)return;
    layoutFrame=requestAnimationFrame(()=>{layoutFrame=null;if(dialog.open&&active())render();});
  }
  if(typeof ResizeObserver!=='undefined'){
    const observer=new ResizeObserver(requestLayout);
    for(const id of ['saveRecordList','saveUnitFields','saveSlotCards'])observer.observe($(id));
  }
  $('saveDownload').addEventListener('click',async()=>{
    if(!context().verified||busy||invalid||!session?.diff().length)return;
    const sourceToken=context().sessionToken,sourceSession=session;busy=true;render();message('체크섬과 출력 파일을 검증하고 있습니다.');
    try{
      if(verifyOutputCatalog){await verifyOutputCatalog();sourceSession.updateCatalog(context());}
      const output=await sourceSession.exportFile();
      if(!context().verified||context().sessionToken!==sourceToken||session!==sourceSession)throw new Error('게임 ROM이 변경되어 수정본을 저장하지 않았습니다. 현재 게임을 확인한 뒤 다시 저장하세요.');
      const url=URL.createObjectURL(new Blob([output],{type:'application/octet-stream'}));
      const a=document.createElement('a');a.href=url;const dot=fileName.lastIndexOf('.');a.download=dot>0?`${fileName.slice(0,dot)}-edited${fileName.slice(dot)}`:`${fileName}-edited.bin`;
      document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
      downloadedChanges=changeSignature();
      message(`수정본 다운로드를 시작했습니다. 에뮬레이터를 종료한 뒤 원본을 백업하고 교체하세요.${sourceSession.diff().some(c=>c.field==='unitAdded')?' 추가 기체는 현재 편집한 BIN/CUE도 함께 저장해 사용하세요.':''}${context().glyphPending?' 새 글자는 수정 ROM도 함께 저장해야 표시됩니다.':''}`);
    }catch(e){message(e.message,true);}finally{busy=false;render();}
  });
  return {load,open,openPrepared,hasUnsavedEdits,isBusy:()=>busy};
}
