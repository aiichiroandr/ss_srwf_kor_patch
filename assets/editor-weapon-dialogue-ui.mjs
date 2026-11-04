// Copy the loaded ROM's existing weapon dialogue key. The game still selects
// a native line for the actual pilot; no BMESS text, audio or pointer is moved.
const keyOf=row=>row?.original?.voiceType??row?.voiceType;
const validKey=value=>Number.isInteger(value)&&value>=0&&value<64;
const normal=value=>String(value??'').normalize('NFKC').toLocaleLowerCase().replace(/[\s#·]/g,'');
export function weaponDialogueSources(rows,query=''){
 const search=normal(query);
 return rows.filter(row=>row.recordIndex>0&&row.name&&row.nameStatus!=='empty'&&row.statsValid!==false
   &&row.recordKind!=='unused-filler'&&!row.weaponClone&&validKey(keyOf(row)))
  .filter(row=>!search||normal(`${row.recordIndex} ${row.name}`).includes(search))
  .map(row=>({id:row.recordIndex,name:row.name,voiceType:keyOf(row)}));
}
export function createWeaponDialogueSource(host){
 const root=document.createElement('div');root.className='weapon-dialogue-source';
 const search=document.createElement('input');search.type='search';search.placeholder='무기나 이름 번호 검색';search.autocomplete='off';
 search.dataset.dialogueSearch='';search.setAttribute('aria-label','기존 공격 대사를 가져올 무기 검색');
 const select=document.createElement('select');select.dataset.dialogueSource='';select.setAttribute('aria-label','기존 무기의 공격 대사 가져오기');
 select.title='선택한 무기의 원래 공격 대사 유형만 가져옵니다. 파일럿·연출·공격력은 유지합니다.';
 const note=document.createElement('small');note.className='weapon-dialogue-note';
 const pilot=document.createElement('select');pilot.dataset.dialoguePilot='';pilot.setAttribute('aria-label','대사를 확인할 파일럿');
 const summary=document.createElement('small');summary.className='weapon-dialogue-note';summary.dataset.dialogueSummary='';
 const lines=document.createElement('ul');lines.className='weapon-dialogue-lines';lines.dataset.dialogueLines='';
 root.append(search,select,note,pilot,summary,lines);host.container.append(root);
 let record=null,signature='',selected='',pilotSignature='',catalog=null,loadKey='',generation=0,loadedRevision=0;
 const dialogueTypes=()=>host.row()?.mapType!=null?catalog?.mapTypes:catalog?.types;
 const locked=()=>!host.canEdit()||host.row()?.editable!==true||host.row()?.statsValid===false||!validKey(host.row()?.voiceType);
 function sync(){search.disabled=select.disabled=locked();}
 function renderLines(){
  const type=dialogueTypes()?.find(type=>type.type===host.row()?.voiceType),name=pilot.options?.find?.(o=>o.value===pilot.value)?.textContent??pilot.selectedOptions?.[0]?.textContent??'';
  lines.replaceChildren();
  if(!catalog)return;
  summary.textContent=`${name} · ${catalog.note|| (type?.common?'공통 공격 대사':'유형별 공격 대사')} · ${type?.lines.length??0}개 후보`;
  for(const line of type?.lines??[]){if(!line.text)continue;const item=document.createElement('li');item.textContent=line.text.replaceAll('\u3000',' ');item.title=`화자 #${line.speaker} · 음성 #${line.voice}`;lines.append(item);}
  for(const warning of type?.warnings??[]){const item=document.createElement('li');item.textContent=warning;lines.append(item);}
  if(!type?.lines.length&&catalog.kind==='native')summary.textContent+=' · 확인된 문장 없음';
 }
 function refresh(){
  const current=host.row(),context=host.pilotContext?.(current)??{},contextKey=`${current?.recordIndex}:${context.key??''}`;
  if(record!==contextKey){record=contextKey;selected='';search.value='';signature='';pilotSignature='';pilot.value='';catalog=null;loadKey='';generation++;}
  const show=typeof host.readDialogue==='function';pilot.hidden=summary.hidden=lines.hidden=!show;
  if(show){
   const choices=context.pilots??[],ps=JSON.stringify(choices),previous=pilot.value;
   if(ps!==pilotSignature){pilot.replaceChildren(...[{id:'',name:'대사를 확인할 파일럿 선택'},...choices].map(row=>{const option=document.createElement('option');option.value=String(row.id);option.textContent=row.name;return option;}));pilot.value=choices.some(row=>String(row.id)===previous)?previous:context.defaultPilot==null?'':String(context.defaultPilot);pilotSignature=ps;}
   const key=`${host.sessionKey?.()??''}:${pilot.value}`;
   if(!pilot.value){if(loadKey){loadKey='';generation++;loadedRevision++;}summary.textContent='파일럿을 선택하면 이 유형의 실제 대사 후보가 나옵니다.';lines.replaceChildren();catalog=null;}
   else if(key!==loadKey){
    loadKey=key;catalog=null;loadedRevision++;lines.replaceChildren();summary.textContent='ROM에서 기존 대사를 읽는 중…';const id=++generation,pilotId=Number(pilot.value);
    Promise.resolve().then(()=>host.readDialogue(pilotId)).then(result=>{if(id!==generation)return;catalog=result;loadedRevision++;refresh();},error=>{if(id!==generation)return;summary.textContent=error?.message||'대사를 읽지 못했습니다.';});
   }
  }
  const sources=weaponDialogueSources(host.rows(),search.value),next=JSON.stringify(sources)+':'+loadedRevision+':'+(current?.mapType!=null?'map':'battle');
  if(next!==signature){
   const empty=document.createElement('option');empty.value='';empty.textContent=sources.length?'기존 무기 대사 가져오기…':'일치하는 무기 없음';
   select.replaceChildren(empty,...sources.map(source=>{const option=document.createElement('option'),example=dialogueTypes()?.find(t=>t.type===source.voiceType)?.lines?.find(line=>line.text)?.text.replaceAll('\u3000',' ').replaceAll('\n',' ');option.value=String(source.id);option.textContent=`#${source.id} ${source.name} · ${example||'유형 '+source.voiceType}`;option.title=example??'';return option;}));signature=next;
  }
  const source=sources.find(source=>String(source.id)===selected&&source.voiceType===current?.voiceType);
  select.value=source?selected:'';
  note.textContent=current&&validKey(current.voiceType)?`현재 유형 #${current.voiceType} · 파일럿의 기존 대사·음성 사용 · 실제 문장은 상황에 따라 선택`:'';
  renderLines();sync();
 }
 search.addEventListener('input',refresh);
 select.addEventListener('change',()=>{
  if(locked()||!select.value)return;
  const source=weaponDialogueSources(host.rows()).find(source=>String(source.id)===select.value);if(!source)return;
  selected=String(source.id);const current=host.row();
  if(current.voiceType!==source.voiceType){current.voiceType=source.voiceType;host.onChange(current);}
  refresh();
 });
 pilot.addEventListener('change',()=>{refresh();if(pilot.value)host.onPilotChange?.(Number(pilot.value));});
 return Object.freeze({refresh,sync,pilot:()=>pilot.value?Number(pilot.value):null,setPilot(id){if(pilot.value===String(id))return;if([...pilot.options].some(o=>o.value===String(id))){pilot.value=String(id);refresh();}},reset(){record=null;selected='';signature='';search.value='';refresh();}});
}
