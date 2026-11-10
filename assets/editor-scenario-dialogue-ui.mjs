import {canonicalAfterDialogueJson,readAfterDialogueJson} from './editor-dialogue-sequence.mjs?v=20261110-part1';
const originalText=row=>row.original?.text??row.originalText??'';
const originalSpeaker=row=>row.original?.speakerId??row.originalSpeakerId??row.speakerId;
const textUnchanged=row=>row.text===originalText(row)&&(row.pagesJson??'')===(row.original?.pagesJson??'');
const speakerUnchanged=row=>row.speakerId===originalSpeaker(row);
const afterUnchanged=row=>(row.afterDialogueJson??'')===(row.original?.afterDialogueJson??'');
const unchanged=row=>textUnchanged(row)&&speakerUnchanged(row)&&afterUnchanged(row);
const readAfter=row=>{try{return readAfterDialogueJson(row?.afterDialogueJson??'');}catch{return [];}};
const readPages=row=>{try{return row.pagesJson?JSON.parse(row.pagesJson):null;}catch{return null;}};
const displayText=row=>readPages(row)?.join(' / ')??row.text??'';
const caption=(row,index)=>`${index+1}. ${String(displayText(row)).replace(/\s+/gu,' ').slice(0,100)||'(빈 본문)'}${readAfter(row).length?` · 발화 +${readAfter(row).length}`:''}`;
const tokenCaption=token=>typeof token==='string'?token:token?.token??token?.label??token?.text??(Number.isInteger(token?.raw)?`0x${token.raw.toString(16).toUpperCase()}`:JSON.stringify(token));

// The host owns encoding, protected-token checks and glyph allocation. This
// component keeps invalid text as a draft; only validated text reaches the row.
export function createScenarioDialogueEditor(host){
 const $=host.el,ui=Object.fromEntries(['scenarioDialoguePanel','scenarioDialogueSearch','scenarioDialogueCount','scenarioDialogueList','scenarioDialogueEmpty','scenarioDialogueTitle','scenarioDialogueChanged','scenarioDialoguePrevious','scenarioDialogueNext','scenarioDialogueReset','scenarioDialogueText','scenarioDialogueBytes','scenarioDialogueTokens','scenarioDialogueOwners','scenarioDialogueStatus','scenarioDialoguePagesRow','scenarioDialoguePagePosition','scenarioDialoguePagePrevious','scenarioDialoguePageNext','scenarioDialoguePageAdd','scenarioDialoguePageRemove','scenarioDialogueSpeakerRow','scenarioDialogueSpeaker','scenarioDialogueSpeakerArt','scenarioDialogueSpeakerVariant','scenarioDialogueSpeakerStatus','scenarioDialogueSequenceRow','scenarioDialogueSequence','scenarioDialogueAfterAdd','scenarioDialogueAfterRemove'].map(id=>[id,$(id)]));
 let source=null,selected=null,current=null,draft='',validation={valid:true},buttons=new Map(),listed=[],pages=null,page=0,after=[],afterIndex=-1,sequenceSignature=null,speakerError='',speakerSignature=null,artworkKey=null;
 const rows=()=>host.rows()??[],row=()=>rows().find(item=>item.recordIndex===selected),editable=item=>Boolean(item?.editable&&host.canEdit()&&host.validateText);
 const speakerEditable=item=>Boolean(item?.speakerEditable&&host.canEdit()&&host.speakerOptions&&host.validateSpeaker&&host.setSpeaker);
 const afterEditable=item=>Boolean(item?.afterDialogueEditable&&host.canEdit()&&host.validateAfter&&host.setAfter);
 // Match the UI model's transitive shared-owner group for the add button only.
 // Existing imported follow-ups still keep their original read/edit/reset path.
 const afterAddBlocked=item=>{
  if(!item)return false;
  const group=new Set([item]),owners=new Set((item.owners??[]).map(o=>o.byteOffset).filter(Number.isInteger));let added=true;
  while(added){added=false;for(const other of rows()){if(group.has(other)||other.physicalIndex!==item.physicalIndex)continue;if((other.owners??[]).some(o=>owners.has(o.byteOffset))){group.add(other);for(const o of other.owners??[])if(Number.isInteger(o.byteOffset))owners.add(o.byteOffset);added=true;}}}
  return [...group].some(other=>!other.afterDialogueEditable);
 };
 const emptyAfterDraft=(item,entries)=>{const saved=readAfter(item);return entries.some((entry,index)=>!entry.text.trim()&&(saved[index]?.text!==entry.text||saved[index]?.speakerId!==entry.speakerId));};
 const currentText=item=>afterIndex>=0?after[afterIndex]?.text??'':pages?.[page]??item?.text??'';
 const setText=(element,text)=>{if(element.textContent!==text)element.textContent=text;};
 const setValue=(element,value)=>{if(element.value!==value)element.value=value;};
 const glyphCount=value=>Array.isArray(value)?value.length:Number.isSafeInteger(value)?value:0;
 function checkSpeaker(item,id){
  if(!(afterIndex>=0?afterEditable(item):speakerEditable(item)))return {valid:false,message:item?.speakerReadOnlyReason||'화자 검증이 준비되지 않아 변경할 수 없습니다.'};
  try{const result=host.validateSpeaker(item,id);return result&&typeof result.then!=='function'?{...result,valid:result.valid===true}:{valid:false,message:'화자 검증 결과를 확인할 수 없습니다.'};}
  catch(error){return {valid:false,message:error?.message||'화자를 변경할 수 없습니다.'};}
 }
 function paintSpeaker(){
  const item=row(),enabled=afterIndex>=0?afterEditable(item):speakerEditable(item),variant=item?.speakerVariant,id=afterIndex>=0?after[afterIndex]?.speakerId:item?.speakerId;
  ui.scenarioDialogueSpeakerRow.hidden=!item||!Number.isInteger(item.speakerId);
  let options=[];try{options=host.speakerOptions?.()??[];}catch{options=[];}
  if(!Array.isArray(options))options=[];
  const candidates=options.filter(option=>Number.isInteger(option?.pilotId)&&option.pilotId>0&&option.pilotId<=511&&Number.isInteger(option.variantCount)&&option.variantCount>0);
  const signature=JSON.stringify([variant,candidates.some(option=>option.pilotId===id)?null:id,candidates.map(option=>[option.pilotId,option.name,option.faceId,option.variantCount,option.identity])]);
  if(signature!==speakerSignature){speakerSignature=signature;ui.scenarioDialogueSpeaker.replaceChildren(...candidates.map(option=>{const entry=document.createElement('option');entry.value=String(option.pilotId);entry.disabled=!Number.isInteger(variant)||option.variantCount<=variant;entry.textContent=`${option.name||'파일럿'} · #${option.pilotId}${entry.disabled?' · 해당 표정 없음':''}`;entry.title=entry.disabled?`원래 표정 슬롯 #${variant}을 표시할 초상화가 없습니다.`:`초상화 #${option.faceId} · ${option.variantCount}개 표정 슬롯`;return entry;}));}
  if(item&&!candidates.some(option=>option.pilotId===id)&&!Array.from(ui.scenarioDialogueSpeaker.children).some(option=>option.value===String(id))){const entry=document.createElement('option');entry.value=String(id);entry.textContent=`원래 화자 · #${id}`;entry.disabled=true;ui.scenarioDialogueSpeaker.append(entry);}
  setValue(ui.scenarioDialogueSpeaker,item?String(id):'');ui.scenarioDialogueSpeaker.disabled=!enabled;ui.scenarioDialogueSpeaker.classList.toggle('is-modified',Boolean(item&&(afterIndex>=0?id!==readAfter({afterDialogueJson:item.original?.afterDialogueJson})[afterIndex]?.speakerId:!speakerUnchanged(item))));
  const reason=speakerError||(!enabled?item?.speakerReadOnlyReason||'현재는 화자를 변경할 수 없습니다.':'');
  ui.scenarioDialogueSpeaker.title=reason||(afterIndex>=0?'추가 발화의 화자입니다. 원래 B1의 표정 슬롯을 유지합니다. 공유 호출 뒤에도 함께 추가됩니다.':'원래 표정 슬롯을 유지하며 화자를 바꿉니다. 연결된 모든 대사 구간에 공통 적용됩니다. 본문에 적힌 이름은 따로 수정하세요.');
  setText(ui.scenarioDialogueSpeakerVariant,Number.isInteger(variant)?`표정 #${variant} 유지`:'표정 미확인');ui.scenarioDialogueSpeakerVariant.title='원래 B1 명령의 표정 슬롯은 변경하지 않습니다. 작은 그림은 파일럿 기본 초상화 견본입니다.';
  setText(ui.scenarioDialogueSpeakerStatus,reason);ui.scenarioDialogueSpeakerStatus.hidden=!reason;ui.scenarioDialogueSpeakerStatus.title=reason;ui.scenarioDialogueSpeakerStatus.dataset.invalid=String(Boolean(speakerError));ui.scenarioDialogueSpeaker.setCustomValidity(speakerError);if(speakerError)ui.scenarioDialogueSpeaker.setAttribute('aria-invalid','true');else ui.scenarioDialogueSpeaker.removeAttribute('aria-invalid');
  const candidate=candidates.find(option=>option.pilotId===id),key=JSON.stringify([source,item?.speakerIdentity,candidate?.identity,id,variant]);
  if(key!==artworkKey){artworkKey=key;ui.scenarioDialogueSpeakerArt.replaceChildren();if(item&&candidate&&host.appendArtwork)host.appendArtwork(ui.scenarioDialogueSpeakerArt,{pilotId:id,pilotName:candidate.name});ui.scenarioDialogueSpeakerArt.hidden=!ui.scenarioDialogueSpeakerArt.children.length;ui.scenarioDialogueSpeakerArt.title=`${candidate?.name||'파일럿'} 기본 초상화 견본 · 원래 표정 슬롯 #${variant} 유지`;}
 }
 function check(item,text){
  if(afterIndex>=0){if(emptyAfterDraft(item,after))return {valid:false,message:'추가 발화의 본문을 입력해주세요.'};try{const result=host.validateAfter?.(item,canonicalAfterDialogueJson(JSON.stringify(after)));return result&&typeof result.then!=='function'?{...result,valid:result.valid===true}:{valid:false,message:'추가 발화 검증이 준비되지 않았습니다.'};}catch(error){return {valid:false,message:error.message};}}
  if(!editable(item))return {valid:false,message:item?.readOnlyReason||'본문 검증이 준비되지 않아 편집할 수 없습니다.'};
  try{const result=pages?host.validatePages?.(item,JSON.stringify(pages)):host.validateText(item,text);if(!result||typeof result.then==='function')return {valid:false,message:'본문 검증 결과를 확인할 수 없습니다.'};return {...result,valid:result.valid===true};}
  catch(error){return {valid:false,message:error?.message||'본문을 저장할 수 없습니다.'};}
 }
 function paintValidation(){
  const item=row(),bytes=Number.isSafeInteger(validation.bytes)?validation.bytes:validation.bytes?.length;
  setText(ui.scenarioDialogueBytes,afterIndex>=0?`추가 ${after.length}개 · 전체 ${Number.isSafeInteger(bytes)?bytes:'—'}바이트 · 발화당 107바이트`:pages?`전체 ${Number.isSafeInteger(bytes)?bytes:'—'}바이트 · 페이지당 ${item?.maxPageWidth??'—'}px · ${item?.maxPageLines??3}줄 · 전개 후 108바이트${item?.maxPageWidth===246?' (F 보수 폭)':''}`:item?`${Number.isSafeInteger(bytes)?bytes:'—'} / ${(pages?107:item.expandable?item.maxExpandedBytes:item.maxBytes)??'—'} 바이트`:'');
  if(validation.valid){ui.scenarioDialogueText.removeAttribute('aria-invalid');ui.scenarioDialogueText.setCustomValidity('');}
  else{ui.scenarioDialogueText.setAttribute('aria-invalid','true');ui.scenarioDialogueText.setCustomValidity(validation.message||'본문을 확인해주세요.');}
  const added=glyphCount(validation.addedGlyphs);
  setText(ui.scenarioDialogueStatus,!item?'':!item.editable?item.readOnlyReason||'이 본문은 읽기 전용입니다.':!host.validateText?'본문 검증이 준비되지 않아 편집할 수 없습니다.':!validation.valid?validation.message||'본문을 확인해주세요.':`${validation.message||(afterIndex>=0?'기존 발화 전체 뒤에 추가 · 최종 압축 공간은 BIN 저장 시 확인':pages?'동일 화자 · 압축 용량은 저장할 때 확인':Number.isSafeInteger(bytes)&&bytes>item.maxBytes?'본문을 확장해 저장합니다 · 최종 압축 공간은 BIN 저장 시 확인':item.expandable?'본문 확장 가능 · 제어 명령은 유지합니다':'원래 본문 공간 안에서 저장합니다.')}${added?` · 글자 ${added}개 추가`:''}`);
  ui.scenarioDialogueStatus.title=ui.scenarioDialogueStatus.textContent;
  ui.scenarioDialogueStatus.dataset.invalid=String(!validation.valid);
 }
 function sync(){
  const items=rows(),indexById=new Map(items.map((item,index)=>[item.recordIndex,index])),item=items[indexById.get(selected)],index=listed.indexOf(item),enabled=afterIndex>=0?afterEditable(item):editable(item);
  ui.scenarioDialogueText.disabled=!enabled;
  ui.scenarioDialogueSequenceRow.hidden=!item;
  const signature=JSON.stringify([item?.recordIndex,after.length]);if(signature!==sequenceSignature){sequenceSignature=signature;ui.scenarioDialogueSequence.replaceChildren(...Array.from({length:after.length+1},(_,i)=>{const option=document.createElement('option');option.value=String(i-1);option.textContent=i?`추가 발화 ${i}`:'기존 발화';return option;}));}
  setValue(ui.scenarioDialogueSequence,String(afterIndex));ui.scenarioDialogueSequence.disabled=!item;
  ui.scenarioDialogueAfterAdd.disabled=!afterEditable(item)||afterAddBlocked(item)||after.length>=4;ui.scenarioDialogueAfterAdd.title=afterAddBlocked(item)?'같은 호출에 읽기 전용 문구가 연결되어 여기서는 발화를 추가할 수 없습니다.':item?.afterDialogueReadOnlyReason||'기존 B1의 전체 문구 뒤에 다른 화자의 발화를 최대 4개 추가합니다. 공유 호출에도 함께 적용됩니다.';
  ui.scenarioDialogueAfterRemove.disabled=!afterEditable(item)||afterIndex<0;
  ui.scenarioDialoguePagesRow.hidden=afterIndex>=0;
  const pageCount=pages?.length??1;
  setText(ui.scenarioDialoguePagePosition,`페이지 ${page+1} / ${pageCount}`);
  ui.scenarioDialoguePagePrevious.disabled=!pages||page===0;ui.scenarioDialoguePageNext.disabled=!pages||page===pageCount-1;
  ui.scenarioDialoguePageAdd.disabled=!enabled||!item?.pagesEditable||!host.validatePages||pageCount>=4;
  ui.scenarioDialoguePageAdd.title=item?.pagesEditable?`같은 화자의 다음 페이지 추가 · ${item.maxPageWidth}px · ${item.maxPageLines}줄${item.maxPageWidth===246?' (F는 확인된 보수 폭 안에서 지원)':''}`:item?.pagesReadOnlyReason||item?.expansionReason||'이 본문은 페이지 추가 조건을 확인하지 못했습니다.';
  ui.scenarioDialoguePageRemove.disabled=!enabled||!pages;
  const storedText=afterIndex>=0?readAfter(item)[afterIndex]?.text:readPages(item??{})?.[page]??item?.text;
  ui.scenarioDialogueReset.disabled=!(item&&((editable(item)||afterEditable(item))&&(!unchanged(item)||!validation.valid||draft!==storedText)||speakerEditable(item)&&!speakerUnchanged(item)));
  ui.scenarioDialoguePrevious.disabled=index<=0;ui.scenarioDialogueNext.disabled=index<0||index===listed.length-1;
  ui.scenarioDialogueChanged.hidden=!item||unchanged(item);ui.scenarioDialogueText.classList.toggle('is-modified',Boolean(item&&!unchanged(item)));
  for(const [id,button]of buttons){const target=items[indexById.get(id)];if(!target)continue;button.setAttribute('aria-selected',String(id===selected));button.classList.toggle('is-modified',!unchanged(target));setText(button,`${caption(target,indexById.get(id))}${unchanged(target)?'':' ▲'}`);}
  setText(ui.scenarioDialogueCount,`${listed.length} / ${items.length}개 · 수정 ${items.filter(item=>!unchanged(item)).length}개`);
  paintSpeaker();
 }
 function renderDetail(){
  const item=row();
  if(item!==current){current=item;speakerError='';pages=readPages(item??{});page=0;after=readAfter(item);afterIndex=-1;draft=currentText(item);validation={valid:true,bytes:item?.byteLength??(item&&textUnchanged(item)?item.maxBytes:undefined)};}
  else if(validation.valid){const actualAfter=readAfter(item),actualPages=readPages(item??{});if(JSON.stringify(actualAfter)!==JSON.stringify(after)||JSON.stringify(actualPages)!==JSON.stringify(pages)||draft!==(afterIndex>=0?actualAfter[afterIndex]?.text:actualPages?.[page]??item?.text)){after=actualAfter;afterIndex=Math.min(afterIndex,after.length-1);pages=actualPages;page=Math.min(page,(pages?.length??1)-1);draft=currentText(item);validation={valid:true,bytes:item?.byteLength??(item&&unchanged(item)?item.maxBytes:undefined)};}}
  ui.scenarioDialogueEmpty.hidden=Boolean(item);ui.scenarioDialogueText.hidden=!item;
  setValue(ui.scenarioDialogueText,draft);setText(ui.scenarioDialogueTitle,item?`본문 ${rows().indexOf(item)+1} · #${item.recordIndex}`:'본문을 선택하세요');
  const tokens=afterIndex>=0?[]:item?.controlTokens??[];ui.scenarioDialogueTokens.hidden=tokens.length===0;setText(ui.scenarioDialogueTokens,tokens.length?`보호 토큰 · ${tokens.map(tokenCaption).join(' · ')}`:'보호 토큰 없음');
  ui.scenarioDialogueTokens.title='제어 토큰은 원래 값과 순서를 유지해야 합니다.';
  const owners=item?.owners??[];setText(ui.scenarioDialogueOwners,[owners.length>1?`공유 본문 · 연결 ${owners.length}곳에 함께 적용`:'',afterIndex>=0?'기존 발화 전체 뒤에 추가':item?.speakerEditable?'화자: 연결된 모든 구간에 공통 적용':''].filter(Boolean).join(' · '));
  ui.scenarioDialogueOwners.title=owners.map(owner=>typeof owner==='string'?owner:owner?.name??owner?.label??`#${owner?.physicalIndex??owner?.recordIndex??'?'}`).join(' · ');
  paintValidation();sync();
 }
 function renderList(){
  const query=ui.scenarioDialogueSearch.value.trim().toLocaleLowerCase();listed=rows().filter(item=>!query||`${item.recordIndex} ${displayText(item)} ${readAfter(item).map(entry=>entry.text).join(' ')}`.toLocaleLowerCase().includes(query));
  buttons=new Map();const controls=listed.map(item=>{const button=document.createElement('button');button.type='button';button.setAttribute('role','option');button.dataset.dialogueId=item.recordIndex;button.title=item.readOnlyReason||displayText(item);button.addEventListener('click',()=>select(item.recordIndex));buttons.set(item.recordIndex,button);return button;});
  const scroll=ui.scenarioDialogueList.scrollTop;ui.scenarioDialogueList.replaceChildren(...controls);ui.scenarioDialogueList.scrollTop=scroll;sync();
 }
 function select(id,{focus=false,field=null}={}){
  if(id!==selected&&!validate({report:true}))return false;
  const target=rows().find(item=>item.recordIndex===id);if(!target)return false;
  selected=id;renderDetail();if(field==='afterDialogueJson'&&after.length&&afterIndex<0){afterIndex=0;draft=currentText(row());validation={valid:true};renderDetail();}if(focus)(field==='speakerId'?ui.scenarioDialogueSpeaker:ui.scenarioDialogueText).focus({preventScroll:true});return true;
 }
 function accept(){
  const item=row();if(!(afterIndex>=0?afterEditable(item):editable(item))){renderDetail();return false;}
  draft=ui.scenarioDialogueText.value;if(afterIndex>=0)after[afterIndex]={...after[afterIndex],text:draft};else if(pages)pages[page]=draft;validation=check(item,draft);paintValidation();
  if(afterIndex>=0){if(validation.valid){try{const json=canonicalAfterDialogueJson(JSON.stringify(after));if(item.afterDialogueJson!==json){host.setAfter(item,json);host.onChange('dialogue',item);}}catch(error){validation={valid:false,message:error.message};paintValidation();}}sync();return validation.valid;}
  if(validation.valid){if(pages){const json=JSON.stringify(pages);if(item.pagesJson!==json){item.pagesJson=json;host.onChange('dialogue',item);}}else if(item.text!==draft){item.text=draft;host.onChange('dialogue',item);}}
  sync();return validation.valid;
 }
 function validate({report=false}={}){
  if(!current||validation.valid)return true;
  if(report){host.onInvalid?.();ui.scenarioDialogueText.focus({preventScroll:true});ui.scenarioDialogueText.reportValidity();}
  return false;
 }
 ui.scenarioDialogueSearch.addEventListener('input',renderList);
 ui.scenarioDialogueText.addEventListener('input',accept);
 ui.scenarioDialogueSpeaker.addEventListener('change',()=>{
  const item=row();if(!item)return;
  if(afterIndex>=0 && !after[afterIndex]?.text?.trim()){
   const id=ui.scenarioDialogueSpeaker.value===''?NaN:Number(ui.scenarioDialogueSpeaker.value),result=checkSpeaker(item,id);
   if(!result.valid){speakerError=result.message||'화자를 확인해주세요.';paintSpeaker();return;}
   after[afterIndex]={...after[afterIndex],speakerId:id};speakerError='';paintSpeaker();return;
  }
  if(!validate({report:true})){setValue(ui.scenarioDialogueSpeaker,String(afterIndex>=0?after[afterIndex]?.speakerId:item.speakerId));return;}
  const id=ui.scenarioDialogueSpeaker.value===''?NaN:Number(ui.scenarioDialogueSpeaker.value);
  if(afterIndex>=0){const result=checkSpeaker(item,id);if(!result.valid){speakerError=result.message||'화자를 확인해주세요.';paintSpeaker();return;}const next=after.map((entry,index)=>index===afterIndex?{...entry,speakerId:id}:entry);commitAfter(next,afterIndex,{speakerOnly:true});return;}
  if(id===item.speakerId){speakerError='';paintSpeaker();return;}
  const result=checkSpeaker(item,id);if(!result.valid){speakerError=result.message||'화자를 확인해주세요.';paintSpeaker();return;}
  try{host.setSpeaker(item,id);speakerError='';host.onChange('dialogue',item);renderDetail();}
  catch(error){speakerError=error?.message||'화자를 변경할 수 없습니다.';paintSpeaker();}
 });
 ui.scenarioDialogueReset.addEventListener('click',()=>{
  const item=row(),canText=editable(item),canSpeaker=speakerEditable(item),canAfter=afterEditable(item);if(!item||!canText&&!canSpeaker&&!canAfter)return;
  const old={text:item.text,pagesJson:item.pagesJson,speakerId:item.speakerId,afterDialogueJson:item.afterDialogueJson??'',pages,page,after,afterIndex,draft,validation};
  const restoreSpeaker=canSpeaker&&!speakerUnchanged(item);
  const restoreAfter=canAfter&&!afterUnchanged(item);
  if(restoreSpeaker){const result=checkSpeaker(item,originalSpeaker(item));if(!result.valid){speakerError=result.message||'원래 화자를 복원할 수 없습니다.';paintSpeaker();return;}}
  if(restoreAfter){const result=host.validateAfter(item,item.original?.afterDialogueJson??'');if(!result?.valid){validation=result??{valid:false,message:'추가 발화를 복원할 수 없습니다.'};paintValidation();return;}}
  afterIndex=-1;
  if(canText){item.text=originalText(item);item.pagesJson=item.original?.pagesJson??'';pages=readPages(item);page=0;draft=pages?.[0]??item.text;validation=check(item,draft);if(!validation.valid){item.text=old.text;item.pagesJson=old.pagesJson;pages=old.pages;page=old.page;afterIndex=old.afterIndex;draft=old.draft;paintValidation();return;}}
  try{if(restoreAfter)host.setAfter(item,item.original?.afterDialogueJson??'');if(restoreSpeaker)host.setSpeaker(item,originalSpeaker(item));speakerError='';after=readAfter(item);}
  catch(error){if(restoreAfter)try{host.setAfter(item,old.afterDialogueJson);}catch{}item.text=old.text;item.pagesJson=old.pagesJson;pages=old.pages;page=old.page;after=old.after;afterIndex=old.afterIndex;draft=old.draft;validation=old.validation;speakerError=error?.message||'대사를 복원할 수 없습니다.';paintSpeaker();return;}
  if(old.text!==item.text||(old.pagesJson??'')!==(item.pagesJson??'')||old.speakerId!==item.speakerId||old.afterDialogueJson!==(item.afterDialogueJson??''))host.onChange('dialogue',item);
  renderDetail();(canText?ui.scenarioDialogueText:ui.scenarioDialogueSpeaker).focus({preventScroll:true});
 });
 function commitAfter(next,index,{discard=false,speakerOnly=false}={}){
  const item=row();if(!afterEditable(item)||!discard&&!validate({report:true}))return false;
  try{if(emptyAfterDraft(item,next)){validation={valid:false,message:'추가 발화의 본문을 입력해주세요.'};paintValidation();return false;}const json=canonicalAfterDialogueJson(JSON.stringify(next)),result=host.validateAfter(item,json);if(!result?.valid){if(speakerOnly)speakerError=result?.message||'화자를 확인해주세요.';else validation=result??{valid:false,message:'추가 발화를 확인해주세요.'};paintValidation();paintSpeaker();return false;}host.setAfter(item,json);after=readAfter(item);afterIndex=Math.max(-1,Math.min(index,after.length-1));draft=currentText(item);validation=afterIndex>=0?result:check(item,draft);speakerError='';setValue(ui.scenarioDialogueText,draft);host.onChange('dialogue',item);renderDetail();return true;}
  catch(error){speakerError=error.message;paintSpeaker();return false;}
 }
 ui.scenarioDialogueSequence.addEventListener('change',()=>{const next=Number(ui.scenarioDialogueSequence.value);if(!Number.isInteger(next)||next< -1||next>=after.length||!validate({report:true})){setValue(ui.scenarioDialogueSequence,String(afterIndex));return;}afterIndex=next;speakerError='';draft=currentText(row());validation=check(row(),draft);setValue(ui.scenarioDialogueText,draft);renderDetail();});
 ui.scenarioDialogueAfterAdd.addEventListener('click',()=>{const item=row();if(!afterEditable(item)||afterAddBlocked(item)||after.length>=4||!validate({report:true}))return;after=[...after,{speakerId:item.speakerId,text:''}];afterIndex=after.length-1;draft='';validation={valid:false,message:'추가 발화의 본문을 입력해주세요.'};setValue(ui.scenarioDialogueText,draft);renderDetail();ui.scenarioDialogueText.focus({preventScroll:true});});
 ui.scenarioDialogueAfterRemove.addEventListener('click',()=>{if(afterIndex<0)return;const next=after.filter((_,index)=>index!==afterIndex);commitAfter(next,Math.min(afterIndex,next.length-1),{discard:true});});
 function commitPages(next,nextPage){const item=row();if(!editable(item)||!validate({report:true}))return false;const prior=pages;pages=next;const result=next?check(item,next[nextPage]):host.validatePages?.(item,'');if(!result?.valid){pages=prior;validation=result??{valid:false,message:'페이지를 확인해주세요.'};paintValidation();return false;}item.pagesJson=next?JSON.stringify(next):'';page=nextPage;draft=next?.[page]??item.text;validation=result;setValue(ui.scenarioDialogueText,draft);host.onChange('dialogue',item);paintValidation();sync();return true;}
 ui.scenarioDialoguePageAdd.addEventListener('click',()=>{const item=row();if(!item?.pagesEditable||(pages?.length??1)>=4)return;const next=pages?[...pages]:[item.text];next.push('');commitPages(next,next.length-1);});
 ui.scenarioDialoguePageRemove.addEventListener('click',()=>{if(!pages)return;const next=pages.filter((_,i)=>i!==page);if(next.length===1){const item=row();const value=next[0];if(!commitPages(null,0))return;setValue(ui.scenarioDialogueText,value);accept();}else commitPages(next,Math.min(page,next.length-1));});
 for(const [id,step]of [['scenarioDialoguePagePrevious',-1],['scenarioDialoguePageNext',1]])ui[id].addEventListener('click',()=>{if(!pages||!validate({report:true}))return;page=Math.max(0,Math.min(pages.length-1,page+step));draft=pages[page];setValue(ui.scenarioDialogueText,draft);validation=check(row(),draft);paintValidation();sync();});
 for(const [id,step]of [['scenarioDialoguePrevious',-1],['scenarioDialogueNext',1]])ui[id].addEventListener('click',()=>{const target=listed[listed.indexOf(row())+step];if(target)select(target.recordIndex);});
 return Object.freeze({
  refresh(nextSource){
   if(source!==nextSource){source=nextSource;selected=null;current=null;draft='';validation={valid:true};after=[];afterIndex=-1;sequenceSignature=null;speakerError='';speakerSignature=artworkKey=null;ui.scenarioDialogueSearch.value='';}
   if(!rows().some(item=>item.recordIndex===selected))selected=rows()[0]?.recordIndex??null;
   renderList();renderDetail();
  },sync,validate,selectedRow:row,visibleRows:()=>[...listed],focus:(id,{field=null}={})=>select(id,{focus:true,field}),
  reset(){source=null;selected=null;current=null;draft='';validation={valid:true};after=[];afterIndex=-1;sequenceSignature=null;speakerError='';speakerSignature=artworkKey=null;ui.scenarioDialogueSearch.value='';renderList();renderDetail();},
 });
}
