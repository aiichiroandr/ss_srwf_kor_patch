// Limited B1 dialogue editing. Proven complete strings may append-relocate;
// other normal glyph runs keep their byte footprint;
// control tokens, ambiguous glyphs and every detected interior entry stay
// fixed. A reversible trailer restores the body before existing provenance
// validation. This module does not grant scenario/archive write authority.
import {readScenarioDialogueOwners} from './editor-scenario-display.mjs?v=20261113-alicecopies1';
import {nameMap} from './editor-text-codec.mjs?v=20261113-alicecopies1';
import {sha256Hex} from './sha256.mjs?v=20261113-alicecopies1';
import {bytesEqual as same,bytesToHex,dataView as view,scenarioRootOffsets,sha256Digest as digest} from './editor-bytes.mjs?v=20261113-alicecopies1';
import {ownData,readDenseList} from './editor-own.mjs?v=20261113-alicecopies1';
import {readAfterDialogueJson} from './editor-dialogue-sequence.mjs?v=20261113-alicecopies1';
import {normalizeScenarioDeadlineBody} from './editor-scenario-deadlines.mjs?v=20261113-alicecopies1';

const MAGIC=Uint8Array.of(83,82,87,68,73,65,48,49),MAGIC2=Uint8Array.of(83,82,87,68,73,65,48,50),MAGIC3=Uint8Array.of(83,82,87,68,73,65,48,51),MAGIC4=Uint8Array.of(83,82,87,68,73,65,48,52),MAGIC5=Uint8Array.of(83,82,87,68,73,65,48,53),MAGIC6=Uint8Array.of(83,82,87,68,73,65,48,54),FOOTER=32;
const PAGE_BUDGET=108,MAX_PAGES=4,MAX_PAGE_LINES=3;
// Final: reviewed 260px B1 window. F: conservative 246px envelope from the
// approved F dialogue-layout calibration (2026-08-19); its maximum is not asserted.
// The 8px single-byte upper bound also deliberately overestimates F half-cell glyphs.
const PAGE_WIDTH=Object.freeze({'srwf-f':246,'srwf-final':260});
// Opaque retention for authenticated old pages and historical empty follow-ups.
const legacyPageAuthorities=new WeakMap();
const CAPACITY=Object.freeze({'srwf-f':0x8000,'srwf-final':0x9000});
const MAX_BODY=256*1024,MAX_EDITS=8192,MAX_READ=4096;
const utf8=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
const hex=b=>bytesToHex(b).toUpperCase();
function fail(message){const e=new Error(message);e.code='EDITOR_DIALOGUE_INVALID';throw e;}
function rootsOf(b){
 if(b.length<57||b.length>MAX_BODY)fail('지원하지 않는 대사 본문 크기입니다.');
 const roots=scenarioRootOffsets(b);
 if(roots.some(p=>p<56||p>=b.length))fail('대사 본문의 루트 참조가 잘못되었습니다.');
 return Object.freeze(roots);
}
function bodyOf(body,decoded){if(!Number.isInteger(body.physicalIndex)||body.physicalIndex<0||body.physicalIndex>255)fail('대사 본문 번호가 잘못되었습니다.');return Object.freeze({...body,decoded,roots:rootsOf(decoded)});}
function glyphs(gameId,options){
 if(!Object.hasOwn(CAPACITY,gameId))fail('지원하지 않는 대사 게임입니다.');
 const map=new Map(nameMap(gameId,'weapon'));
 if(options.glyphMap!==undefined){if(!(options.glyphMap instanceof Map))fail('글자표는 Map이어야 합니다.');for(const[k,v]of options.glyphMap)map.set(k,v);}
 return map;
}
function tokens(b,start,map){
 const out=[];let p=start;
 while(p<b.length&&p-start<MAX_READ){
  const lead=b[p],kind=({246:'F6',247:'F7',248:'F8',249:'F9',255:'FF'})[lead];
  const width=kind?(kind==='F8'||kind==='F9'?2:1):lead>0xea?2:1;
  if(p+width>b.length||p+width-start>MAX_READ)return null;
  const code=hex(b.subarray(p,p+width)),text=kind?null:map.get(code);
  out.push({start:p,end:p+width,kind:kind??(typeof text==='string'&&text.length?'text':'unknown'),code,text,argument:width===2&&kind?b[p+1]:undefined});
  p+=width;if(kind==='FF')return out;
 }
 return null;
}
function referenceInventory(b,confirmed){
 const cuts=new Set(confirmed.map(o=>o.targetOffset)),possible=[],rootTargets=[],v=view(b);
 // A negative-only guard. Raw B-like bytes never create a row or authorize a
 // write. Include every operand alignment of B1..B9, covering the sealed
 // B1/B3/B4 +1 and B6/B9 +2 consumers and uncertain descriptor shapes.
 for(let p=56;p<b.length;p++)if(b[p]>=0xb1&&b[p]<=0xb9)for(const delta of [1,2,3]){
  const c=p+delta;if(c+2<=b.length){const t=c+v.getInt16(c);if(t>=56&&t<b.length){cuts.add(t);possible.push({marker:p,operand:c,target:t});}}
 }
 for(let c=0;c<56;c+=4){const t=c+v.getInt32(c);if(t>=56&&t<b.length){cuts.add(t);rootTargets.push(t);}}
 return {cuts,possible,rootTargets};
}
// Mirror the original text expander's page accounting: F6 emits two bytes,
// its third occurrence emits the terminator and advances past that F6.
// Native: F 0601C8D4 / Final 0601CF24 increment the consumed byte count.
// F7 and FF also emit a terminator. F8/F9 have variable sizes and are excluded.
function pageGeometry(ts){
 const pages=[],pageOf=new Map();let index=0,emitted=0,newlines=0;
 for(const t of ts){
  if(!['text','F6','F7','FF'].includes(t.kind))return null;
  if(t.kind==='F6'&&newlines===2){pageOf.set(t.start,index);pages[index++]=emitted+1;emitted=0;newlines=0;continue;}
  pageOf.set(t.start,index);
  if(t.kind==='text')emitted+=t.end-t.start;
  else if(t.kind==='F6'){emitted+=2;newlines++;}
  else {pages[index++]=emitted+1;emitted=0;newlines=0;}
 }
 return {pages,pageOf};
}
function relocationGroups(body,streams,inventory){
 const b=body.decoded,v=view(b),groups=new Map();
 for(const {owner,ts}of streams){let group=groups.get(owner.targetOffset);if(!group){group={start:owner.targetOffset,end:ts.at(-1).end,ts,owners:[],reason:'',geometry:pageGeometry(ts)};groups.set(group.start,group);}group.owners.push(owner);}
 for(const group of groups.values()){
  const known=new Set(group.owners.map(o=>o.byteOffset+1));
  if(!group.geometry)group.reason='동적 삽입 또는 미해석 토큰이 있는 전체 문구는 늘리지 않습니다.';
  else if(group.geometry.pages.some(n=>n>PAGE_BUDGET))group.reason='원문 페이지가 보수적인 108바이트 예산을 넘어 확장하지 않습니다.';
  else if(inventory.rootTargets.some(t=>t>=group.start&&t<group.end))group.reason='본문 루트가 가리키는 문구는 이동하지 않습니다.';
  else if(inventory.possible.some(r=>r.target>group.start&&r.target<group.end))group.reason='가능한 중간 참조가 있어 전체 문구를 이동하지 않습니다.';
  else if(inventory.possible.some(r=>r.target===group.start&&!known.has(r.operand)))group.reason='확인되지 않은 공유 참조가 있어 전체 문구를 이동하지 않습니다.';
  else if(streams.some(({owner,ts})=>owner.targetOffset!==group.start&&owner.targetOffset<group.end&&ts.at(-1).end>group.start))group.reason='다른 문구와 겹치는 참조를 보존합니다.';
  else if(group.owners.some(o=>o.byteOffset+3>b.length||b[o.byteOffset]!==0xb1||o.byteOffset+1+v.getInt16(o.byteOffset+1)!==group.start))group.reason='이벤트 확장이 바꾼 대사 호출 위치는 이동하지 않습니다.';
  else if(group.owners.some(o=>body.decoded.length-(o.byteOffset+1)>32767||body.decoded.length-(o.byteOffset+1)<-32768))group.reason='추가 위치가 기존 대사 참조의 signed16 범위를 벗어납니다.';
 }
 return groups;
}
function possibleVmEntries(b){
 const targets=new Set(),v=view(b),add=t=>{if(Number.isInteger(t)&&t>=56&&t<b.length)targets.add(t);};
 for(let p=56;p+2<=b.length;p++)add(p+v.getInt16(p));
 for(let p=0;p+4<=b.length;p++){const n=v.getInt32(p);add(p+n);const raw=v.getUint32(p);for(const base of[0x20200000,0x20204000])add(raw-base);}
 return targets;
}
function afterFields(row,body,reference,found,possible){
 let reason=row.speakerEditable?'':row.speakerReadOnlyReason;
 const known=new Map(found.owners.map(owner=>[owner.byteOffset,owner]));
 if(!reason&&row.owners.some(owner=>!known.has(owner.byteOffset+5)))reason='원래 다음 명령도 확인된 B1인 연속 발화 경계에서만 새 발화를 넣습니다.';
 if(!reason&&row.owners.some(owner=>[1,2,3,4].some(delta=>possible.has(owner.byteOffset+delta))))reason='원래 대사 호출 내부를 가리킬 수 있는 참조가 있어 새 발화를 넣지 않습니다.';
 if(!reason&&row.owners.some(owner=>body.decoded.length-owner.byteOffset-1>32767))reason='새 발화 위치가 원래 호출의 signed16 범위를 벗어납니다.';
 if(!reason&&body.decoded.length+FOOTER+64+row.owners.length*31>CAPACITY[body.gameId??'srwf-final'])reason='새 발화 기록을 저장할 RAM 작업 공간이 부족합니다.';
 return {afterDialogueJson:'',afterDialogueEditable:!reason,afterDialogueReadOnlyReason:reason,maxAfterDialogues:4,maxAfterDialogueBytes:PAGE_BUDGET-1};
}
function control(t){return Object.freeze({kind:t.kind,byteOffset:t.start,endOffset:t.end,argument:t.argument,code:t.code,
 label:({F6:'줄바꿈',F7:'페이지',F8:`동적 수치 #${t.argument}`,F9:`동적 이름 #${t.argument}`,FF:'문장 끝',unknown:`미해석 ${t.code}`,alias:'중간 참조'})[t.kind]??t.kind});}
function inspect(body,gameId,options){
 // Existing verified wrappers may replace an event condition or relocate a
 // callback. Find the original B1 owners after those wrappers are regenerated
 // and removed. Text offsets are retained; render checks their stored bytes.
 const reference=normalizeScenarioDeadlineBody(body,gameId,options).body;
 const b=reference.decoded,map=glyphs(gameId,options),found=readScenarioDialogueOwners(reference,gameId),inventory=referenceInventory(b,found.owners),cuts=inventory.cuts;
 const streams=[],byteTokens=new Map(),conflicts=new Set();let invalidReads=0;
 for(const owner of found.owners){const ts=tokens(b,owner.targetOffset,map);if(!ts){invalidReads++;continue;}streams.push({owner,ts});
  for(const t of ts)for(let p=t.start;p<t.end;p++){if(byteTokens.has(p)&&byteTokens.get(p)!==t.start){conflicts.add(p);conflicts.add(byteTokens.get(p));conflicts.add(t.start);}else byteTokens.set(p,t.start);}
 }
 const groups=relocationGroups(body,streams,inventory),rows=new Map();
 for(const {owner,ts}of streams){
  const controlTokens=ts.filter(t=>t.kind!=='text').map(control);
  for(const p of cuts)if(p>owner.targetOffset&&p<ts.at(-1).start)controlTokens.push(Object.freeze({kind:'alias',byteOffset:p,endOffset:p,label:'가능한 중간 참조'}));
  let run=[];
  const flush=()=>{if(!run.length)return;const start=run[0].start,end=run.at(-1).end,key=`${body.physicalIndex}:${start}`,text=run.map(t=>t.text).join('');
   const blocked=run.some(t=>t.kind==='unknown'||Array.from({length:t.end-t.start},(_,i)=>t.start+i).some(p=>conflicts.has(p)||p>t.start&&cuts.has(p)));
   const editable=!blocked&&body.decoded.length+FOOTER+32+8+(end-start)<=CAPACITY[gameId];
   let row=rows.get(key);
   if(row&&row.maxBytes!==end-start){row.editable=false;row.expandable=false;row.pagesEditable=false;row.readOnlyReason='겹치는 참조의 글자 경계를 확인하지 못했습니다.';run=[];return;}
   if(!row){
    const group=groups.get(owner.targetOffset),room=group?.geometry?PAGE_BUDGET-group.geometry.pages[group.geometry.pageOf.get(start)]:0;
    const minimum=body.decoded.length+(group?.end-group?.start||0)+1+FOOTER+32+8+(end-start)+utf8.encode(text).length+group.owners.length*8;
    const expandedLimit=Math.min(end-start+room,MAX_READ-(group.end-group.start)+(end-start));
    const expandable=editable&&!group.reason&&expandedLimit>end-start&&minimum<=CAPACITY[gameId];
    const interrupt=group.owners.some(o=>view(reference.decoded).getUint16(o.byteOffset+3)&0x8000);
    const pagesEditable=editable&&!interrupt&&Boolean(PAGE_WIDTH[gameId])&&!group.reason&&group.ts.every(t=>['text','FF'].includes(t.kind))&&start===group.start&&end===group.end-1&&minimum+16<=CAPACITY[gameId];
    row={recordIndex:key,identity:`dialogue:1:${sha256Hex(utf8.encode(JSON.stringify([gameId,body.physicalIndex,start,end,hex(b.subarray(start,end))])))}`,
     physicalIndex:body.physicalIndex,byteOffset:start,text,originalText:text,maxBytes:end-start,editable,
     pagesEditable,maxPages:MAX_PAGES,maxPageBytes:PAGE_BUDGET-1,maxPageLines:MAX_PAGE_LINES,maxPageWidth:PAGE_WIDTH[gameId]??null,pagesJson:'',
     pagesReadOnlyReason:pagesEditable?'':interrupt?'자동 진행 대사에는 다음 페이지가 표시되지 않아 페이지를 추가하지 않습니다.':!PAGE_WIDTH[gameId]?'이 게임의 고정 대사창 폭 확인 전에는 새 페이지를 추가하지 않습니다.':group.reason||'제어 토큰이 없는 전체 단일 문구에서만 다음 페이지를 추가합니다.',
     expandable,maxExpandedBytes:expandable?expandedLimit:end-start,expansionTarget:group.start,
     expansionReason:expandable?'':group.reason||(!room?'이 페이지에는 추가 글자를 넣을 여유가 없습니다.':'대사 확장 기록을 저장할 RAM 공간이 부족합니다.'),
     readOnlyReason:blocked?'미해석 글자 또는 글자 중간 참조를 보존합니다.':editable?'':'이 본문에는 대사 편집 기록을 저장할 작업 공간이 부족합니다.',owners:[],controlTokens:[]};rows.set(key,row);}
   if(!row.owners.some(o=>o.recordIndex===owner.recordIndex))row.owners.push(owner);
   for(const t of controlTokens)if(!row.controlTokens.some(x=>x.byteOffset===t.byteOffset))row.controlTokens.push(t);
   run=[];
  };
  for(const t of ts){
   if(t.kind!=='text'&&t.kind!=='unknown'){flush();continue;}
   if(cuts.has(t.start))flush();
   const blocked=t.kind==='unknown'||Array.from({length:t.end-t.start},(_,i)=>t.start+i).some(p=>conflicts.has(p)||p>t.start&&cuts.has(p));
   if(blocked){flush();run=[{...t,text:t.text??`⟦${t.code}⟧`}];flush();continue;}
   run.push(t);
  }flush();
 }
 const list=[...rows.values()].sort((a,b)=>a.byteOffset-b.byteOffset),catalog=speakerCatalog(options),possible=catalog?possibleVmEntries(b):null;
 for(const row of list){Object.assign(row,speakerFields(row,body,reference,catalog));Object.assign(row,afterFields(row,{...body,gameId},reference,found,possible));row.owners=Object.freeze(row.owners);row.controlTokens=Object.freeze(row.controlTokens.sort((a,b)=>a.byteOffset-b.byteOffset));Object.freeze(row);}
 return {rows:Object.freeze(list),coverage:Object.freeze({kind:'reached-b1-normal-text-runs',owners:found.owners.length,readableOwners:streams.length,invalidReads,frontiers:found.frontiers,complete:false}),map,reference,groups};
}
function speakerCatalog(options){
 if(options.speakerOptions===undefined)return null;
 const {list,problem}=readDenseList(options.speakerOptions,511);if(problem)fail('검증된 화자 목록이 잘못되었습니다.');const catalog=new Map();
 for(const item of list){const pilotId=ownData(item,'pilotId'),faceId=ownData(item,'faceId'),variantCount=ownData(item,'variantCount'),identity=ownData(item,'identity');
  if(!Number.isInteger(pilotId)||pilotId<1||pilotId>511||!Number.isInteger(faceId)||faceId<1||faceId>511||!Number.isInteger(variantCount)||variantCount<1||variantCount>64||typeof identity!=='string'||!identity.length||identity.length>256||catalog.has(pilotId))fail('검증된 화자 또는 초상화 출처가 잘못되었습니다.');
  catalog.set(pilotId,{pilotId,faceId,variantCount,identity});
 }return catalog;
}
function speakerFields(row,body,reference,catalog){
 const b=reference.decoded,v=view(b),descriptors=row.owners.map(owner=>v.getUint16(owner.byteOffset+3)),packed=descriptors[0],speakerId=packed>>>2&511,variant=packed&3;
 let reason='';
 if(!catalog)reason='파일럿과 실제 초상화 검증이 필요합니다.';
 else if(!row.editable)reason=row.readOnlyReason||'이 대사는 읽기 전용입니다.';
 else if(descriptors.some(word=>word!==packed))reason='공유된 문구의 원래 화자가 서로 달라 함께 변경하지 않습니다.';
 else if(!catalog.has(speakerId)||variant>=catalog.get(speakerId).variantCount)reason='원래 화자와 초상화 변형의 연결을 확인하지 못했습니다.';
 else if(row.owners.some(owner=>body.decoded[owner.byteOffset]!==0xb1||view(body.decoded).getUint16(owner.byteOffset+3)!==packed))reason='검증된 이벤트 확장이 바꾼 대사 호출은 변경하지 않습니다.';
 return {speakerId,originalSpeakerId:speakerId,speakerVariant:variant,speakerEditable:!reason,speakerReadOnlyReason:reason,
  speakerIdentity:`speaker:1:${sha256Hex(utf8.encode(JSON.stringify([body.physicalIndex,row.owners.map(owner=>[owner.byteOffset,v.getUint16(owner.byteOffset+3)])])))}`};
}
export function validateScenarioDialogueSpeaker(row,speakerId,options={}){
 try{const catalog=speakerCatalog(options);if(!catalog)fail('파일럿과 실제 초상화 검증이 필요합니다.');if(!row?.speakerEditable)fail(row?.speakerReadOnlyReason||'이 대사의 화자는 읽기 전용입니다.');const candidate=catalog.get(speakerId);
  if(!candidate||!Number.isInteger(speakerId))fail('검증된 파일럿을 화자로 선택하세요.');if(row.speakerVariant>=candidate.variantCount)fail('선택한 파일럿에는 원래 초상화 변형이 없습니다.');return Object.freeze({valid:true,message:'',faceId:candidate.faceId});
 }catch(error){return Object.freeze({valid:false,message:error.message,faceId:null});}
}
function encode(text,map){
 if(typeof text!=='string'||/[\u0000-\u001f\u007f\u2028\u2029]/u.test(text)||text.normalize('NFC')!==text)fail('대사는 일반 글자만 입력하세요. 줄바꿈과 동적 삽입은 원본을 유지합니다.');
 const reverse=new Map();
 for(const [code,value]of [...map].sort((a,b)=>a[0].length-b[0].length||a[0].localeCompare(b[0]))){
  if(typeof code!=='string'||!/^([0-9A-F]{2}|[0-9A-F]{4})$/.test(code)||typeof value!=='string')continue;
  const raw=Uint8Array.from(code.match(/../g),s=>parseInt(s,16)),lead=raw[0];
  if([0xf6,0xf7,0xf8,0xf9,0xff].includes(lead)||raw.length!==(lead>0xea?2:1))continue;
  for(const ch of [value.normalize('NFC'),value.normalize('NFKC')])if([...ch].length===1&&!reverse.has(ch))reverse.set(ch,raw);
 }
 const out=[];for(const ch of text){const bytes=reverse.get(ch);if(!bytes)fail(`현재 글꼴에 없는 글자: ${ch}`);out.push(...bytes);}return Uint8Array.from(out);
}
export function validateScenarioDialogueText(row,text,{gameId,glyphMap}={}){
 try{
  if(!row||typeof row.originalText!=='string'||!Number.isInteger(row.maxBytes)||row.maxBytes<1)fail('대사 행이 잘못되었습니다.');
  if(text===row.originalText)return Object.freeze({valid:true,message:'',bytes:row.maxBytes});
  if(!row.editable)fail(row.readOnlyReason||'이 대사는 읽기 전용입니다.');
  const bytes=encode(text,glyphs(gameId,{glyphMap})).length;
  if(bytes>row.maxBytes&&(!row.expandable||bytes>row.maxExpandedBytes))fail(row.expandable?`이 행은 최대 ${row.maxExpandedBytes}바이트까지 늘릴 수 있습니다 (현재 ${bytes}바이트).`:`원래 ${row.maxBytes}바이트 안에서 입력하세요 (현재 ${bytes}바이트). ${row.expansionReason??''}`);
  return Object.freeze({valid:true,message:'',bytes});
 }catch(error){return Object.freeze({valid:false,message:error.message,bytes:null});}
}
function parsePages(value,map,{legacy=false,gameId}={}){
 if(typeof value!=='string'||value.length>8192)fail('페이지는 JSON 문자열 배열로 입력하세요.');
 let parsed;try{parsed=JSON.parse(value);}catch{fail('페이지 JSON 문자열 배열을 확인하세요.');}
 const {list,problem}=readDenseList(parsed,MAX_PAGES);
 if(problem||list.length<2)fail('같은 화자의 페이지는 2~4개로 입력하세요.');
 let bytes=0;
 const encoded=list.map((text,pageIndex)=>{
  if(typeof text!=='string')fail('각 페이지는 일반 본문 문자열이어야 합니다.');
  if(legacy){const raw=encode(text,map);if(raw.length+1>PAGE_BUDGET)fail('각 페이지는 종결자를 제외하고 107바이트 이내여야 합니다.');bytes+=raw.length+1;return raw;}
  if(!PAGE_WIDTH[gameId])fail('이 게임의 고정 대사창 폭 확인 전에는 새 페이지를 추가하지 않습니다.');
  const lines=text.split('\n');if(lines.length>MAX_PAGE_LINES)fail('대사 한 페이지는 최대 3줄입니다.');
  const chunks=[];let consumed=1;
  for(const [lineIndex,line]of lines.entries()){
   const raw=encode(line,map),indent=pageIndex>0&&lineIndex===0&&raw[0]!==0;
   let width=lineIndex>0||indent?6:0;
   for(let p=0;p<raw.length;){const lead=raw[p],size=lead>0xea?2:1;width+=lead===0?6:size===2?12:8;p+=size;}
   if(width>PAGE_WIDTH[gameId])fail(`${pageIndex+1}쪽 ${lineIndex+1}줄은 들여쓰기를 포함해 ${PAGE_WIDTH[gameId]}px 이내여야 합니다 (현재 ${width}px).`);
   // F6 itself causes the engine to insert 00: only F7's first line stores it.
   if(lineIndex){chunks.push(0xf6);consumed+=2;}else if(indent){chunks.push(0);consumed++;}
   chunks.push(...raw);consumed+=raw.length;
  }
  if(consumed>PAGE_BUDGET)fail('각 페이지는 자동 들여쓰기와 종결자를 포함해 108바이트 이내여야 합니다.');
  bytes+=consumed;return Uint8Array.from(chunks);
 });
 return {pages:list,encoded,pagesJson:JSON.stringify(list),bytes};
}
export function validateScenarioDialoguePages(row,pagesJson,{gameId,glyphMap}={}){
 try{
  if(pagesJson==='')return Object.freeze({valid:true,message:'',pages:0,bytes:0});
  // An authenticated old page is a retained value, not a new page request.
  const legacy=row?.pageEncoding==='legacy'&&pagesJson===row.pagesJson;
  if(!legacy&&!row?.pagesEditable)fail(row?.pagesReadOnlyReason||'이 문구에는 다음 페이지를 추가할 수 없습니다.');
  const parsed=parsePages(pagesJson,glyphs(gameId,{glyphMap}),{legacy,gameId});
  return Object.freeze({valid:true,message:'',pages:parsed.pages.length,bytes:parsed.bytes});
 }catch(error){return Object.freeze({valid:false,message:error.message,pages:null,bytes:null});}
}
function retainedLegacy(legacyPages,id,value){return legacyPages?.get(id)===value;}
function makeLegacyAuthority(normalized,gameId,options){
 const emptyAfter=new Map(normalized.edits.filter(e=>e.afterDialogueJson&&hasEmptyAfter(e.afterDialogueJson)).map(e=>[e.recordIndex,e.afterDialogueJson]));
 if(!normalized.legacyPages?.size&&!emptyAfter.size)return null;
 const info=inspect(normalized.body,gameId,options),entries=new Map();
 for(const row of info.rows)if(normalized.legacyPages.has(row.recordIndex)||emptyAfter.has(row.recordIndex))entries.set(row.recordIndex,{pagesJson:normalized.legacyPages.get(row.recordIndex),afterDialogueJson:emptyAfter.get(row.recordIndex),identity:row.identity,owners:row.owners.map(o=>[o.byteOffset,view(info.reference.decoded).getUint16(o.byteOffset+3)])});
 const authority=Object.freeze({});legacyPageAuthorities.set(authority,{gameId,physicalIndex:normalized.body.physicalIndex,entries});return authority;
}
function importLegacyAuthority(authority,body,gameId,options,field='pagesJson'){
 if(!authority)return new Map();
 const retained=legacyPageAuthorities.get(authority);
 if(!retained||retained.gameId!==gameId||retained.physicalIndex!==body.physicalIndex)fail('기존 대사의 인증된 출처가 일치하지 않습니다.');
 const info=inspect(body,gameId,options),result=new Map();
 for(const row of info.rows){const old=retained.entries.get(row.recordIndex);if(old&&old[field]!==undefined&&old.identity===row.identity&&JSON.stringify(old.owners)===JSON.stringify(row.owners.map(o=>[o.byteOffset,view(info.reference.decoded).getUint16(o.byteOffset+3)])))result.set(row.recordIndex,old[field]);}
 return result;
}
function hasEmptyAfter(value){return readAfterDialogueJson(value).some(entry=>!entry.text.trim());}
function parseAfter(row,value,gameId,options){
 const entries=readAfterDialogueJson(value);if(!entries.length)return {entries:[],encoded:[],afterDialogueJson:'',bytes:0};
 if(!row?.afterDialogueEditable)fail(row?.afterDialogueReadOnlyReason||'이 위치에는 새 발화를 넣을 수 없습니다.');
 const map=glyphs(gameId,options),encoded=[];
 for(const entry of entries){const valid=validateScenarioDialogueSpeaker(row,entry.speakerId,options);if(!valid.valid)fail(valid.message);const text=encode(entry.text,map);if(text.length+1>PAGE_BUDGET)fail('추가 발화는 각각 종결자를 제외하고 107바이트 이내여야 합니다.');encoded.push(Uint8Array.of(...text,255));}
 return {entries,encoded,afterDialogueJson:JSON.stringify(entries),bytes:encoded.reduce((sum,b)=>sum+b.length,0)};
}
export function validateScenarioAfterDialogue(row,value,{gameId,...options}={}){
 try{if(hasEmptyAfter(value)&&value!==row?.afterDialogueJson)fail('추가 발화의 본문을 입력해주세요.');const parsed=parseAfter(row,value,gameId,options);return Object.freeze({valid:true,message:'',count:parsed.entries.length,bytes:parsed.bytes});}
 catch(error){return Object.freeze({valid:false,message:error.message,count:null,bytes:null});}
}
function requestData(item){
 if(!item||typeof item!=='object'||Array.isArray(item)||Reflect.ownKeys(item).some(k=>!['recordIndex','text','pagesJson','speakerId','afterDialogueJson','identity'].includes(k)))fail('알 수 없는 대사 편집 항목입니다.');
 const out={};for(const key of Reflect.ownKeys(item)){const descriptor=Object.getOwnPropertyDescriptor(item,key);if(!descriptor||!Object.hasOwn(descriptor,'value'))fail('대사 편집 항목은 직접 입력값이어야 합니다.');out[key]=descriptor.value;}return out;
}
function snapshot(submitted,rows,options,gameId,legacyPages){
 const {list,problem}=readDenseList(submitted,MAX_EDITS);if(problem)fail('대사 편집 목록이 잘못되었습니다.');
 const catalog=new Map(rows.map(r=>[r.recordIndex,r])),seen=new Set(),out=[],ownerSpeakers=new Map(),ownerAfter=new Map();
 for(const item of list){
  const data=requestData(item),{recordIndex:id,text,pagesJson,speakerId,afterDialogueJson}=data,row=catalog.get(id),hasText=Object.hasOwn(data,'text'),hasPages=Object.hasOwn(data,'pagesJson'),hasSpeaker=Object.hasOwn(data,'speakerId'),hasAfter=Object.hasOwn(data,'afterDialogueJson');
  if(!row||seen.has(id)||hasPages&&(hasText||typeof pagesJson!=='string')||hasText&&typeof text!=='string'||hasAfter&&typeof afterDialogueJson!=='string'||!hasText&&!hasPages&&!hasSpeaker&&!hasAfter||Object.hasOwn(data,'identity')&&data.identity!==row.identity)fail('대사 행 또는 출처가 일치하지 않습니다.');seen.add(id);
  if(hasPages&&!retainedLegacy(legacyPages,id,pagesJson)&&!row.pagesEditable)fail(row.pagesReadOnlyReason||'이 문구에는 다음 페이지를 추가할 수 없습니다.');
  const textChanged=hasPages||hasText&&text!==row.originalText,speakerChanged=hasSpeaker&&speakerId!==row.originalSpeakerId;
  if(textChanged&&!row.editable)fail(row.readOnlyReason||'이 대사는 읽기 전용입니다.');
  if(hasSpeaker){const result=validateScenarioDialogueSpeaker(row,speakerId,options);if(!result.valid)fail(result.message);for(const owner of row.owners){if(ownerSpeakers.has(owner.byteOffset)&&ownerSpeakers.get(owner.byteOffset)!==speakerId)fail('같은 대사 호출의 화자를 서로 다르게 지정할 수 없습니다.');ownerSpeakers.set(owner.byteOffset,speakerId);}}
  const after=hasAfter?parseAfter(row,afterDialogueJson,gameId,options):null;if(hasAfter)for(const owner of row.owners){if(ownerAfter.has(owner.byteOffset)&&ownerAfter.get(owner.byteOffset)!==after.afterDialogueJson)fail('같은 대사 호출 뒤에 서로 다른 발화를 추가할 수 없습니다.');ownerAfter.set(owner.byteOffset,after.afterDialogueJson);}
  if(!textChanged&&!speakerChanged&&!after?.entries.length)continue;
  out.push({recordIndex:id,identity:row.identity,...(textChanged?(hasPages?{pagesJson}:{text}):{}),...(speakerChanged?{speakerId}:{}),...(after?.entries.length?{afterDialogueJson:after.afterDialogueJson}:{}),row});
 }
 for(const row of rows)if(row.owners.some(owner=>ownerSpeakers.has(owner.byteOffset))&&new Set(row.owners.map(owner=>ownerSpeakers.get(owner.byteOffset)??row.originalSpeakerId)).size>1)fail('일부 호출만 바꾸면 공유된 문구의 화자가 서로 달라집니다. 연결된 호출을 함께 변경하세요.');
 for(const row of rows)if(row.owners.some(owner=>ownerAfter.has(owner.byteOffset))&&new Set(row.owners.map(owner=>ownerAfter.get(owner.byteOffset)??'')).size>1)fail('일부 호출만 바꾸면 공유된 문구 뒤의 발화가 서로 달라집니다. 연결된 호출을 함께 변경하세요.');
 return out.sort((a,b)=>a.row.byteOffset-b.row.byteOffset);
}
function renderBase(body,gameId,submitted,options,legacyPages){
 const info=inspect(body,gameId,options),edits=snapshot(submitted,info.rows,options,gameId,legacyPages),b=body.decoded;
 if(!edits.length)return b.slice();
 const space=info.map.get('00');if(typeof space!=='string'||!/^\s+$/u.test(space))fail('확인된 공백 토큰이 없습니다.');
 const relocated=new Map(),main=b.slice(),parts=[],hasPages=edits.some(edit=>Object.hasOwn(edit,'pagesJson')),hasSpeakers=edits.some(edit=>Object.hasOwn(edit,'speakerId')),typed=hasPages||hasSpeakers,modernPages=edits.some(edit=>Object.hasOwn(edit,'pagesJson')&&!retainedLegacy(legacyPages,edit.recordIndex,edit.pagesJson));let payloadLength=32;
 for(const edit of edits){
  const row=edit.row,pageEdit=Object.hasOwn(edit,'pagesJson'),textEdit=pageEdit||Object.hasOwn(edit,'text');
  if(pageEdit){const legacy=retainedLegacy(legacyPages,edit.recordIndex,edit.pagesJson),parsed=parsePages(edit.pagesJson,info.map,{legacy,gameId});edit.legacyPage=legacy;edit.pagesJson=parsed.pagesJson;edit.pages=parsed.pages;edit.encodedPages=parsed.encoded;relocated.set(row.expansionTarget,info.groups.get(row.expansionTarget));}
  const encoded=textEdit?(pageEdit?edit.encodedPages[0]:encode(edit.text,info.map)):null;edit.encoded=encoded;
  if(textEdit&&!pageEdit&&encoded.length>row.maxBytes){
   if(!row.expandable||encoded.length>row.maxExpandedBytes)fail(`대사 ${row.recordIndex}: 원래 ${row.maxBytes}바이트 안에서 입력하세요 (현재 ${encoded.length}바이트). ${row.expansionReason||`확장 상한 ${row.maxExpandedBytes}바이트`}`);
   relocated.set(row.expansionTarget,info.groups.get(row.expansionTarget));
  }
  if(!same(b.subarray(row.byteOffset,row.byteOffset+row.maxBytes),info.reference.decoded.subarray(row.byteOffset,row.byteOffset+row.maxBytes)))fail('검증된 이벤트 확장이 이 대사 원문과 겹칩니다.');
  const before=b.slice(row.byteOffset,row.byteOffset+row.maxBytes),text=utf8.encode(textEdit?(pageEdit?edit.pagesJson:edit.text):'');if(text.length>65535)fail('대사 입력이 너무 깁니다.');
  const prefix=typed?4:0,header=8+prefix,part=new Uint8Array(header+before.length+text.length),v=view(part);if(typed){v.setUint16(0,hasSpeakers&&Object.hasOwn(edit,'speakerId')?(textEdit?(pageEdit?(edit.legacyPage?4:6):3):2):(pageEdit?(edit.legacyPage?1:5):0));if(hasSpeakers&&Object.hasOwn(edit,'speakerId'))v.setUint16(2,edit.speakerId);}v.setUint32(prefix,row.byteOffset);v.setUint16(prefix+4,before.length);v.setUint16(prefix+6,text.length);part.set(before,header);part.set(text,header+before.length);parts.push(part);payloadLength+=part.length;
 }
 const copies=[],patches=[];let dataLength=0;
 for(const group of [...relocated.values()].sort((a,b)=>a.start-b.start)){
  const members=edits.filter(edit=>edit.encoded&&edit.row.expansionTarget===group.start),chunks=[];let cursor=group.start,size=0;
  for(const edit of members){const start=edit.row.byteOffset,end=start+edit.row.maxBytes;if(start<cursor||end>group.end)fail('이동할 전체 대사의 구간이 겹칩니다.');const prefix=b.slice(cursor,start);chunks.push(prefix);size+=prefix.length;
   if(edit.encodedPages){for(const [index,page]of edit.encodedPages.entries()){if(index){chunks.push(Uint8Array.of(0xf7));size++;}chunks.push(page);size+=page.length;}}
   else{chunks.push(edit.encoded);size+=edit.encoded.length;}cursor=end;}
  const tail=b.slice(cursor,group.end);chunks.push(tail);size+=tail.length;
  if(size>MAX_READ)fail('이동할 대사가 최대 읽기 길이를 넘습니다.');
  const record=new Uint8Array(size);let p=0;for(const chunk of chunks){record.set(chunk,p);p+=chunk.length;}
  const ts=tokens(record,0,info.map),pages=ts&&pageGeometry(ts);
  if(!ts||ts.at(-1).end!==record.length||!pages||pages.pages.some(n=>n>PAGE_BUDGET))fail('늘린 대사의 페이지가 보수적인 108바이트 예산을 넘습니다. 다른 행도 함께 확인하세요.');
  const target=b.length+dataLength;
  for(const owner of group.owners){
   const operand=owner.byteOffset+1,delta=target-operand;
   if(delta<-32768||delta>32767)fail('늘린 대사의 추가 위치가 signed16 참조 범위를 벗어납니다.');
   if(b[owner.byteOffset]!==0xb1||operand+view(b).getInt16(operand)!==group.start)fail('이동할 대사의 B1 원래 참조가 일치하지 않습니다.');
   const original=view(b).getUint16(operand);view(main).setInt16(operand,delta);patches.push({offset:operand,original,kind:0});
  }
  copies.push(record);dataLength+=record.length;
 }
 for(const edit of edits)if(edit.encoded&&!relocated.has(edit.row.expansionTarget)){
  main.fill(0,edit.row.byteOffset,edit.row.byteOffset+edit.row.maxBytes);main.set(edit.encoded,edit.row.byteOffset);
 }
 const speakerPatches=new Map();
 for(const edit of edits)if(Object.hasOwn(edit,'speakerId'))for(const owner of edit.row.owners){const offset=owner.byteOffset+3,original=view(b).getUint16(offset),after=(original&0xf803)|(edit.speakerId<<2);const previous=speakerPatches.get(offset);if(previous&&previous.after!==after)fail('같은 대사 호출의 화자를 서로 다르게 지정할 수 없습니다.');speakerPatches.set(offset,{offset,original,after,kind:1});}
 for(const patch of speakerPatches.values()){view(main).setUint16(patch.offset,patch.after);patches.push(patch);}
 patches.sort((a,b)=>a.offset-b.offset);if(patches.length>MAX_EDITS)fail('대사 참조와 화자 원복 기록이 최대 개수를 넘습니다.');payloadLength+=patches.length*8;
 const length=b.length+dataLength+payloadLength+FOOTER;
 if(length>CAPACITY[gameId])fail('대사 편집 기록이 확인된 시나리오 RAM 작업 공간을 넘습니다.');
 const result=new Uint8Array(length);result.set(main);let cursor=b.length;
 for(const copy of copies){result.set(copy,cursor);cursor+=copy.length;}
 result.set(digest(b),cursor);cursor+=32;for(const part of parts){result.set(part,cursor);cursor+=part.length;}
 for(const patch of patches){const v=view(result);v.setUint32(cursor,patch.offset);v.setUint16(cursor+4,patch.original);v.setUint16(cursor+6,patch.kind??0);cursor+=8;}
 const footer=result.subarray(cursor),v=view(footer);footer.set(modernPages?MAGIC6:hasSpeakers?MAGIC4:hasPages?MAGIC3:patches.length?MAGIC2:MAGIC);v.setUint32(8,b.length);v.setUint32(12,edits.length);v.setUint32(16,payloadLength);v.setUint32(20,body.physicalIndex);v.setUint32(24,dataLength);v.setUint32(28,patches.length);
 return result;
}
function relativeWord(target,cell){const delta=target-cell;if(delta<-32768||delta>32767)fail('추가 발화의 signed16 참조 범위를 벗어납니다.');return delta;}
function render(body,gameId,submitted,options,legacyPages){
 const list=readDenseList(submitted,MAX_EDITS);if(list.problem)fail('대사 편집 목록이 잘못되었습니다.');if(!list.list.some(item=>item&&typeof item==='object'&&Object.hasOwn(item,'afterDialogueJson')))return renderBase(body,gameId,submitted,options,legacyPages);
 const info=inspect(body,gameId,options),edits=snapshot(submitted,info.rows,options,gameId,legacyPages),afterEdits=edits.filter(edit=>Object.hasOwn(edit,'afterDialogueJson'));
 if(!afterEdits.length)return renderBase(body,gameId,submitted,options,legacyPages);
 const baseEdits=edits.map(({row,afterDialogueJson,...edit})=>edit).filter(edit=>['text','pagesJson','speakerId'].some(key=>Object.hasOwn(edit,key))),inner=renderBase(body,gameId,baseEdits,options,legacyPages),main=inner.slice(),heads=new Map(),entries=[],copies=[],patches=[];let dataLength=0,payloadLength=32;
 for(const edit of afterEdits){const parsed=parseAfter(edit.row,edit.afterDialogueJson,gameId,options),encoded=utf8.encode(parsed.afterDialogueJson),part=new Uint8Array(8+encoded.length),v=view(part);v.setUint32(0,edit.row.byteOffset);v.setUint32(4,encoded.length);part.set(encoded,8);entries.push(part);payloadLength+=part.length;
  for(const owner of edit.row.owners){const previous=heads.get(owner.byteOffset);if(previous&&previous.afterDialogueJson!==parsed.afterDialogueJson)fail('같은 대사 호출 뒤에 서로 다른 발화를 추가할 수 없습니다.');heads.set(owner.byteOffset,{owner,...parsed,variant:edit.row.speakerVariant});}
 }
 for(const [offset,plan]of [...heads].sort((a,b)=>a[0]-b[0])){
  if(inner[offset]!==0xb1)fail('추가 발화의 원래 B1 호출이 일치하지 않습니다.');
  const base=inner.length+dataLength,count=plan.entries.length,codeLength=8+count*5,textLength=plan.encoded.reduce((n,b)=>n+b.length,0),record=new Uint8Array(codeLength+textLength),v=view(record),descriptor=view(inner).getUint16(offset+3),originalTarget=offset+1+view(inner).getInt16(offset+1);
  record[0]=0xb1;v.setInt16(1,relativeWord(originalTarget,base+1));v.setUint16(3,descriptor);
  let cursor=codeLength;
  for(const [index,entry]of plan.entries.entries()){const p=5+index*5;record[p]=0xb1;v.setInt16(p+1,relativeWord(base+cursor,base+p+1));v.setUint16(p+3,(descriptor&0xf803)|(entry.speakerId<<2));record.set(plan.encoded[index],cursor);cursor+=plan.encoded[index].length;}
  const back=5+count*5;record[back]=1;v.setInt16(back+1,relativeWord(offset+5,base+back+1));
  main[offset]=1;view(main).setInt16(offset+1,relativeWord(base,offset+1));
  for(const delta of[0,2])patches.push({offset:offset+delta,original:view(inner).getUint16(offset+delta)});
  copies.push(record);dataLength+=record.length;
 }
 patches.sort((a,b)=>a.offset-b.offset);if(patches.length>MAX_EDITS)fail('추가 발화 원복 기록이 최대 개수를 넘습니다.');payloadLength+=patches.length*8;
 const length=inner.length+dataLength+payloadLength+FOOTER;if(length>CAPACITY[gameId])fail('추가 발화와 편집 기록이 확인된 시나리오 RAM 작업 공간을 넘습니다.');
 const result=new Uint8Array(length);result.set(main);let cursor=inner.length;for(const copy of copies){result.set(copy,cursor);cursor+=copy.length;}result.set(digest(inner),cursor);cursor+=32;for(const entry of entries){result.set(entry,cursor);cursor+=entry.length;}
 for(const patch of patches){const v=view(result);v.setUint32(cursor,patch.offset);v.setUint16(cursor+4,patch.original);cursor+=8;}
 const footer=result.subarray(cursor),v=view(footer);footer.set(MAGIC5);v.setUint32(8,inner.length);v.setUint32(12,entries.length);v.setUint32(16,payloadLength);v.setUint32(20,body.physicalIndex);v.setUint32(24,dataLength);v.setUint32(28,patches.length);return result;
}
function normalizeAfter(body,gameId,options){
 const b=body.decoded,footer=b.subarray(b.length-FOOTER),v=view(footer),length=v.getUint32(8),count=v.getUint32(12),payloadLength=v.getUint32(16),physicalIndex=v.getUint32(20),dataLength=v.getUint32(24),patchCount=v.getUint32(28);
 if(!Object.hasOwn(CAPACITY,gameId)||length<57||payloadLength<32||length+dataLength+payloadLength+FOOTER!==b.length||b.length>CAPACITY[gameId]||!count||count>MAX_EDITS||physicalIndex!==body.physicalIndex||!dataLength||!patchCount||patchCount>MAX_EDITS)fail('추가 발화 기록의 경계가 잘못되었습니다.');
 const payloadStart=length+dataLength,entriesEnd=b.length-FOOTER-patchCount*8,inner=b.slice(0,length),after=[];let p=payloadStart+32,previousOffset=55;
 for(let i=0;i<count;i++){if(p+8>entriesEnd)fail('추가 발화 기록이 잘렸습니다.');const offset=view(b).getUint32(p),size=view(b).getUint32(p+4);p+=8;if(offset<=previousOffset||offset>=length||!size||size>32768||p+size>entriesEnd)fail('추가 발화 목록의 범위가 잘못되었습니다.');let afterDialogueJson;try{afterDialogueJson=decoder.decode(b.subarray(p,p+size));}catch{fail('추가 발화 문자가 잘못되었습니다.');}after.push({recordIndex:`${physicalIndex}:${offset}`,afterDialogueJson});p+=size;previousOffset=offset;}
 if(p!==entriesEnd)fail('추가 발화 목록 뒤에 알 수 없는 데이터가 있습니다.');let previousPatch=55;
 for(let i=0;i<patchCount;i++){const offset=view(b).getUint32(p),original=view(b).getUint16(p+4),reserved=view(b).getUint16(p+6);if(offset<=previousPatch||offset<56||offset+2>length||reserved)fail('추가 발화 원복 기록의 범위가 잘못되었습니다.');view(inner).setUint16(offset,original);p+=8;previousPatch=offset+1;}
 if(p!==b.length-FOOTER||!same(digest(inner),b.subarray(payloadStart,payloadStart+32))||inner.length>=FOOTER&&same(inner.subarray(inner.length-FOOTER,inner.length-FOOTER+8),MAGIC5))fail('추가 발화의 원래 본문 또는 중첩 기록이 잘못되었습니다.');
 const normalized=normalize(bodyOf(body,inner),gameId,options),edits=new Map(normalized.edits.map(edit=>[edit.recordIndex,edit]));for(const edit of after)edits.set(edit.recordIndex,{...edits.get(edit.recordIndex),...edit});const combined=[...edits.values()].sort((a,b)=>Number(a.recordIndex.split(':')[1])-Number(b.recordIndex.split(':')[1])),expected=render(normalized.body,gameId,combined,options,normalized.legacyPages);
 if(!same(expected,b))fail('추가 발화 기록이 정규 출력과 일치하지 않습니다.');return {body:normalized.body,edits:combined,legacyPages:normalized.legacyPages};
}
function normalize(body,gameId,options){
 const b=body.decoded;if(!(b instanceof Uint8Array))fail('대사 본문이 없습니다.');
 const footer=b.subarray(Math.max(0,b.length-FOOTER));if(b.length>=FOOTER&&same(footer.subarray(0,8),MAGIC5))return normalizeAfter(body,gameId,options);const modern=b.length>=FOOTER&&same(footer.subarray(0,8),MAGIC6),old=b.length>=FOOTER&&same(footer.subarray(0,8),MAGIC),speakers=modern||b.length>=FOOTER&&same(footer.subarray(0,8),MAGIC4),paged=speakers||b.length>=FOOTER&&same(footer.subarray(0,8),MAGIC3),expanded=paged||b.length>=FOOTER&&same(footer.subarray(0,8),MAGIC2);
 if(!old&&!expanded)return {body:bodyOf(body,b),edits:[],legacyPages:new Map()};
 const v=view(footer),length=v.getUint32(8),count=v.getUint32(12),payloadLength=v.getUint32(16),physicalIndex=v.getUint32(20),dataLength=v.getUint32(24),patchCount=v.getUint32(28);
 if(!Object.hasOwn(CAPACITY,gameId)||length<57||payloadLength<32||length+dataLength+payloadLength+FOOTER!==b.length||b.length>CAPACITY[gameId]||!count||count>MAX_EDITS||physicalIndex!==body.physicalIndex||old&&(dataLength||patchCount)||expanded&&(!patchCount||patchCount>MAX_EDITS||!speakers&&!dataLength))fail('대사 편집 기록의 경계가 잘못되었습니다.');
 const payloadStart=length+dataLength,entriesEnd=b.length-FOOTER-patchCount*8,original=b.slice(0,length),entries=[],legacyPages=new Map();let p=payloadStart+32,previousEnd=56;
 for(let i=0;i<count;i++){
  if(p+(paged?12:8)>entriesEnd)fail('대사 편집 기록이 잘렸습니다.');let kind=0,speakerId;if(paged){kind=view(b).getUint16(p);speakerId=view(b).getUint16(p+2);if(kind>(modern?6:speakers?4:1)||[0,1,5].includes(kind)&&speakerId||[2,3,4,6].includes(kind)&&(!speakers||speakerId<1||speakerId>511))fail('대사 편집 종류가 잘못되었습니다.');p+=4;}const offset=view(b).getUint32(p),size=view(b).getUint16(p+4),textSize=view(b).getUint16(p+6);p+=8;
  if(!size||offset<previousEnd||offset+size>length||p+size+textSize>entriesEnd)fail('대사 편집 원문 범위가 잘못되었습니다.');
  original.set(b.subarray(p,p+size),offset);p+=size;let text;try{text=decoder.decode(b.subarray(p,p+textSize));}catch{fail('대사 편집 문자가 잘못되었습니다.');}p+=textSize;
  if(kind===2&&textSize)fail('화자 전용 기록에 알 수 없는 본문이 있습니다.');entries.push({recordIndex:`${physicalIndex}:${offset}`,...([1,4,5,6].includes(kind)?{pagesJson:text}:kind===2?{}:{text}),...([2,3,4,6].includes(kind)?{speakerId}:{})});if(kind===1||kind===4)legacyPages.set(`${physicalIndex}:${offset}`,text);previousEnd=offset+size;
 }
 if(p!==entriesEnd)fail('대사 편집 기록 뒤에 알 수 없는 데이터가 있습니다.');
 let previousPatch=55;
 for(let i=0;i<patchCount;i++){
  const offset=view(b).getUint32(p),before=view(b).getUint16(p+4),reserved=view(b).getUint16(p+6);
  if(offset<=previousPatch||offset+2>length||offset<57||reserved>(speakers?1:0))fail('대사 참조 원복 기록의 범위가 잘못되었습니다.');
  view(original).setUint16(offset,before);previousPatch=offset+1;p+=8;
 }
 if(p!==b.length-FOOTER||!same(digest(original),b.subarray(payloadStart,payloadStart+32)))fail('복원한 대사 원문의 해시가 편집 기록과 다릅니다.');
 const canonical=bodyOf(body,original),expected=render(canonical,gameId,entries,options,legacyPages);
 if(!same(expected,b))fail('대사 편집 기록이 정규 출력과 일치하지 않습니다.');
 return {body:canonical,edits:entries,legacyPages};
}
export function readScenarioDialogue(body,gameId,options={}){
 const normalized=normalize(body,gameId,options),info=inspect(normalized.body,gameId,options),edits=new Map(normalized.edits.map(e=>[e.recordIndex,e])),ownerSpeakers=new Map(),ownerAfter=new Map(),afterSources=new Map();
 for(const edit of normalized.edits)if(Object.hasOwn(edit,'afterDialogueJson'))for(const owner of info.rows.find(row=>row.recordIndex===edit.recordIndex).owners){ownerAfter.set(owner.byteOffset,edit.afterDialogueJson);if(!afterSources.has(owner.byteOffset))afterSources.set(owner.byteOffset,new Set());afterSources.get(owner.byteOffset).add(edit.recordIndex);}
 for(const edit of normalized.edits)if(Object.hasOwn(edit,'speakerId'))for(const owner of info.rows.find(row=>row.recordIndex===edit.recordIndex).owners)ownerSpeakers.set(owner.byteOffset,edit.speakerId);
 return Object.freeze({body:normalized.body,legacyPageAuthority:makeLegacyAuthority(normalized,gameId,options),edits:Object.freeze(normalized.edits.map(Object.freeze)),rows:Object.freeze(info.rows.map(row=>{const edit=edits.get(row.recordIndex),ids=new Set(row.owners.map(owner=>ownerSpeakers.get(owner.byteOffset)??row.originalSpeakerId)),sources=[...new Set(row.owners.flatMap(owner=>[...(afterSources.get(owner.byteOffset)??[])]))],speaker={...(ids.size===1?{speakerId:[...ids][0]}:{}),...(row.owners.some(owner=>ownerAfter.has(owner.byteOffset))?{afterDialogueJson:ownerAfter.get(row.owners.find(owner=>ownerAfter.has(owner.byteOffset)).byteOffset)}:{}),afterDialogueOwnerRecordIndices:Object.freeze(sources),afterDialogueInherited:sources.length>0&&!sources.includes(row.recordIndex)};if(!edit)return Object.freeze({...row,...speaker});if(edit.pagesJson){const legacy=retainedLegacy(normalized.legacyPages,edit.recordIndex,edit.pagesJson),parsed=parsePages(edit.pagesJson,info.map,{legacy,gameId});return Object.freeze({...row,...speaker,text:parsed.pages[0],pagesJson:parsed.pagesJson,pageEncoding:legacy?'legacy':'fixed-window-v1'});}return Object.freeze({...row,...speaker,...(Object.hasOwn(edit,'text')?{text:edit.text}:{})});})),coverage:info.coverage});
}
// Restore text before existing scope authentication. The caller still owns
// outer source authority; this helper never expands mutable decoded masks.
export function normalizeScenarioDialogues(archive,options={}){
 const dialogues=[],dialogueEdits=[],dialogueCoverage=[],legacyPageAuthorities=new Map();
 const bodies=archive.bodies.map(body=>{const read=readScenarioDialogue(body,archive.gameId,{...options,scenarioLayout:archive.scenarioLayout});if(read.legacyPageAuthority)legacyPageAuthorities.set(body.physicalIndex,read.legacyPageAuthority);dialogues.push(...read.rows);dialogueEdits.push(...read.edits);dialogueCoverage.push(Object.freeze({physicalIndex:body.physicalIndex,...read.coverage}));return read.body;});
 return Object.freeze({archive:Object.freeze({...archive,bodies:Object.freeze(bodies),totalDecoded:bodies.reduce((n,b)=>n+b.decoded.length,0)}),dialogues:Object.freeze(dialogues),dialogueEdits:Object.freeze(dialogueEdits),dialogueCoverage:Object.freeze(dialogueCoverage),legacyPageAuthorities});
}
// Default: merge this session's changed rows with retained trailer edits.
// Explicit originalText removes that row. replace:true accepts a complete
// snapshot; with [] it removes this trailer and restores the original body.
export function writeScenarioDialogue(body,gameId,submitted,options={}){
 const normalized=normalize(body,gameId,options),legacyPages=new Map([...normalized.legacyPages,...importLegacyAuthority(options.legacyPageAuthority,normalized.body,gameId,options)]);
 const {list,problem}=readDenseList(submitted,MAX_EDITS);if(problem)fail('대사 편집 목록이 잘못되었습니다.');
 // Only an authenticated existing BIN can retain a historical empty follow-up.
 // New requests (including presets) cannot manufacture that authority.
 const retainedAfter=new Map([...normalized.edits.filter(e=>e.afterDialogueJson&&hasEmptyAfter(e.afterDialogueJson)).map(e=>[e.recordIndex,e.afterDialogueJson]),...importLegacyAuthority(options.legacyPageAuthority,normalized.body,gameId,options,'afterDialogueJson')]);
 for(const item of list){const data=requestData(item);if(Object.hasOwn(data,'afterDialogueJson')&&hasEmptyAfter(data.afterDialogueJson)&&JSON.stringify(readAfterDialogueJson(data.afterDialogueJson))!==retainedAfter.get(data.recordIndex))fail('추가 발화의 본문을 입력해주세요.');}
 if(options.replace===true)return render(normalized.body,gameId,submitted,options,legacyPages);
 const edits=new Map(normalized.edits.map(e=>[e.recordIndex,e])),seen=new Set();
 for(const item of list){const data=requestData(item),id=data.recordIndex;if(seen.has(id))fail('대사 편집 행이 중복되었습니다.');seen.add(id);const previous=edits.get(id),merged={...previous,...data};if(Object.hasOwn(data,'text'))delete merged.pagesJson;if(Object.hasOwn(data,'pagesJson'))delete merged.text;edits.set(id,merged);}
 return render(normalized.body,gameId,[...edits.values()],options,legacyPages);
}
