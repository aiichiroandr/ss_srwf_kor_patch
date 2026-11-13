import {canEditSaveNames,SAVE_NAME_SUPPORT_MESSAGE} from './save-name-support.mjs?v=20261113-alicecopies1';
import {SAVE_NAME_FIELDS,saveNameFields,saveNameSpec,savedHeroUnitId,decodeSaveName,encodeSaveName} from './save-names.mjs?v=20261113-alicecopies1';
import { requireSaveScalar } from './save-field-rules.mjs?v=20261113-alicecopies1';
import { saveUnitGroup } from './save-unit-groups.mjs?v=20261113-alicecopies1';
import {initializeSavePilotRow} from './editor-save-pilot-init.mjs?v=20261113-alicecopies1';
import {getSavePilotDefinitions} from './save-pilot-support.mjs?v=20261113-alicecopies1';
import { checkSaveBytes, repairSaveBytes } from './save-check.mjs?v=20261113-alicecopies1';
// Saturn backup RAM containers; original bytes and unrelated saves stay private.
// Contracts and source references: docs/SAVE_EDITOR.md.
const MAGIC = new TextEncoder().encode('BackUpRam Format');
const SIZES = new Map([[0x8000,64],[0x80000,512],[0x100000,512],[0x200000,512],[0x400000,1024]]);
const LIMIT = 0x800000;
const u16 = (b,p) => b[p]*256+b[p+1];
const u32 = (b,p) => (b[p]*0x1000000+b[p+1]*65536+b[p+2]*256+b[p+3])>>>0;
function put(b,p,v,n) { for(let i=n-1;i>=0;i--) { b[p+i]=v&255; v=Math.floor(v/256); } }
function need(ok,message) { if(!ok) throw new Error(message); }
function integer(v,min,max) { need(Number.isSafeInteger(v)&&v>=min&&v<=max,`${min}~${max} 사이의 정수를 입력하세요.`); }
const SAME=value=>JSON.stringify(value);
function sameAliceDependent(left,right){return !!left&&!!right&&left.pilotId===399&&right.pilotId===399&&SAME(left.targetIds)===SAME(right.targetIds)&&SAME(left.roots)===SAME(right.roots);}
// Existing #399 rows are never rewritten.  A prepared row is an orphan; an
// attached row must end one unambiguous human crew chain. Empty table entries
// have no outgoing links even when their unused next byte happens to be zero.
function inspectAliceRows(bytes){
  const rows=Array.from({length:128},(_,slot)=>{const at=0x1000+slot*12;return {slot,id:u16(bytes,at),level:bytes[at+2],flags:bytes[at+3],next:bytes[at+8]};});
  const active=new Set(rows.filter(row=>row.id!==0).map(row=>row.slot)),incoming=Array.from({length:128},()=>[]);
  for(const row of rows){
    if(!row.id||row.next===255)continue;
    if(row.id===399)throw new Error('ALICE가 파일럿 뒤에 연결되어 있어 안전하게 준비할 수 없습니다.');
    if(row.next>=128||!active.has(row.next))continue;
    incoming[row.next].push(row);
  }
  const eligible=[],companionByHuman=new Map(),headByHuman=new Map();
  for(const row of rows.filter(row=>row.id===399)){
    need(row.level>=1&&row.level<=99&&(row.flags&8)!==0&&row.next===255,'ALICE 연결 상태가 안전하지 않아 준비하지 않았습니다.');
    let cursor=row.slot,owner=null;const seen=new Set([cursor]),chain=[];
    for(let depth=0;;depth++){
      const parents=incoming[cursor];
      need(parents.length<=1,'ALICE 연결이 둘 이상으로 갈려 준비하지 않았습니다.');
      if(!parents.length)break;
      const parent=parents[0];
      // The native walker visits five rows including ALICE, hence at most
      // four preceding humans. Longer chains are unsafe to reuse.
      need(depth<4&&parent.id!==399&&!seen.has(parent.slot),'ALICE 앞의 파일럿 연결 상태가 안전하지 않아 준비하지 않았습니다.');
      seen.add(parent.slot);chain.push(parent.slot);owner=parent;cursor=parent.slot;
    }
    if(owner){
      need(!companionByHuman.has(owner.slot),'한 인간 파일럿에 ALICE가 둘 이상 연결되어 있어 준비하지 않았습니다.');
      companionByHuman.set(owner.slot,row);
      for(const slot of chain)headByHuman.set(slot,owner.slot);
    }
    eligible.push({...row,ownerSlot:owner?.slot??null});
  }
  function humanHead(slot){
    const row=rows[slot];need(row&&row.id!==0&&row.id!==399,'ALICE를 주 파일럿으로 쓰는 기체가 있어 안전하게 준비할 수 없습니다.');
    if(headByHuman.has(slot))return headByHuman.get(slot);
    let cursor=slot,depth=0;const seen=new Set([slot]);
    for(;;){
      const parents=incoming[cursor];
      need(parents.length<=1,'대상 기체의 인간 파일럿 연결이 둘 이상으로 갈려 준비하지 않았습니다.');
      if(!parents.length)return cursor;
      const parent=parents[0];
      need(depth++<3&&parent.id!==399&&!seen.has(parent.slot),'대상 기체의 인간 파일럿 연결 상태가 안전하지 않아 준비하지 않았습니다.');
      seen.add(parent.slot);cursor=parent.slot;
    }
  }
  return {rows,eligible,companionByHuman,humanHead,empty:rows.filter(row=>row.id===0).map(row=>row.slot)};
}
export function saveChecksum(b) { let n=0; for(let i=4;i<b.length-4;i++) n=(n+b[i])>>>0; return n; }
async function transform(bytes,kind) {
  const C=kind==='decode'?globalThis.DecompressionStream:globalThis.CompressionStream;
  need(C,'이 브라우저는 압축 세이브를 지원하지 않습니다. 최신 브라우저를 사용하세요.');
  const reader=new Blob([bytes]).stream().pipeThrough(new C('gzip')).getReader();
  const chunks=[];let size=0;
  try { for(;;) { const {value,done}=await reader.read();if(done)break;size+=value.length;
    if(size>LIMIT){await reader.cancel();throw new Error('세이브 크기 제한을 넘었습니다.');}chunks.push(value); } }
  finally { reader.releaseLock(); }
  const result=new Uint8Array(size);let p=0;for(const c of chunks){result.set(c,p);p+=c.length;}return result;
}
function parse(raw) {
  const bs=SIZES.get(raw.length);need(bs,'지원하지 않는 백업 RAM 크기입니다. 카트리지 저장 파일을 선택하세요.');
  need(MAGIC.every((v,i)=>raw[i]===v),'Saturn 백업 RAM 헤더를 찾지 못했습니다. 스테이트 파일은 지원하지 않습니다.');
  // Some older Mednafen images repeat the signature only over the first 64 bytes.
  need(Array.from({length:64},(_,i)=>raw[i]===MAGIC[i%16]).every(Boolean),'백업 RAM 헤더가 손상되었습니다.');
  const records=[], used=new Set([0,1]), starts=[];
  for(let n=2;n<raw.length/bs;n++)if(raw[n*bs]===128)starts.push(n);
  for(const block of starts) {
    const base=block*bs;
    need(raw[base+1]===0&&raw[base+2]===0&&raw[base+3]===0,'알 수 없는 저장 블록 표식입니다.');
    const name=String.fromCharCode(...raw.subarray(base+4,base+15)).replace(/\0+$/,'');
    const size=u32(raw,base+30);need(size>0&&size<=raw.length,'저장 데이터 길이가 잘못되었습니다.');
    const positions=[];for(let p=base+34;p<base+bs;p++)positions.push(p);
    const chain=[block], seen=new Set(chain);let cursor=0;
    for(;;){need(cursor+2<=positions.length,'저장 블록 목록이 끊겼습니다.');
      const ref=raw[positions[cursor]]*256+raw[positions[cursor+1]];cursor+=2;if(ref===0)break;
      need(ref>=2&&ref<raw.length/bs&&!seen.has(ref),'순환하거나 잘못된 저장 블록 목록입니다.');
      seen.add(ref);chain.push(ref);for(let p=ref*bs+4;p<(ref+1)*bs;p++)positions.push(p);
    }
    need(cursor+size<=positions.length,'저장 데이터가 블록 범위를 벗어납니다.');
    for(const n of chain){need(!used.has(n),'저장 데이터의 블록이 서로 겹칩니다.');used.add(n);}
    const offsets=positions.slice(cursor,cursor+size),payload=Uint8Array.from(offsets,p=>raw[p]);
    const match=/^SROBOT(_F|FC)_[0-9]{2}$/.exec(name);
    const supported=!!match&&size===0x1600;
    const checksumOK=supported&&u32(payload,0)===saveChecksum(payload);
    records.push({key:block,name,size,offsets,payload,gameId:match?(match[1]==='_F'?'srwf-f':'srwf-final'):null,
      editable:supported&&checksumOK,reason:!match?'다른 게임의 저장':!supported?'일반 카트리지 저장(0x1600)만 편집할 수 있습니다.':!checksumOK?'체크섬이 맞지 않아 읽기 전용입니다.':'',dateMinutes:u32(raw,base+26)});
  }
  need(new Set(records.map(r=>r.name)).size===records.length,'같은 이름의 저장이 중복되었습니다.');
  return records;
}
const UNIT_UPGRADES = Object.freeze({hpUpgrade:[3,7],enUpgrade:[4,11],armorUpgrade:[4,7],limitUpgrade:[5,11],mobilityUpgrade:[5,7]});
function unitFields(b,p) {
  const fields={};
  for(const [key,[offset,shift]] of Object.entries(UNIT_UPGRADES))fields[key]=(u16(b,p+offset)>>>shift)&15;
  fields.weaponUpgrades=Object.freeze(Array.from({length:16},(_,i)=>(b[p+7+(i>>1)]>>>(i%2?0:4))&15));
  fields.parts=Object.freeze(Array.from(b.subarray(p+17,p+21)));
  return fields;
}
function saveModel(r,b,glyphMap) {
  const pilots=[],units=[];
  const valid=!!r.gameId&&b.length===0x1600;
  // The same saved selection byte is restored to profile+0x4D6. Its low
  // bit selects the single #DD name or the three #DE/#DF/#E0 form names.
  const heroUnitNameCount=valid&&r.gameId==='srwf-final'?(b[0x36]&1?3:1):0;
  const names=Object.fromEntries(SAVE_NAME_FIELDS.filter(s=>s.unitSlot===undefined||r.gameId==='srwf-final').map(spec=>
    [spec.field+'Bytes',Object.freeze(valid?Array.from(b.subarray(spec.offset,spec.offset+spec.maxBytes)):[])]));
  if(r.gameId&&b.length===0x1600){
    for(let slot=0;slot<128;slot++){
      const p=0x1000+slot*12,id=u16(b,p);
      if(id!==0)pilots.push(Object.freeze({slot,id,level:b[p+2],experience:u16(b,p+4)}));
      const u=0x100+slot*30,unitId=u16(b,u);
      if(unitId!==0)units.push(Object.freeze({slot,id:unitId,...unitFields(b,u),pilotSlot:b[u+15],linkedSlot:b[u+16]}));
    }
  }
  return Object.freeze({key:r.key,name:r.name,gameId:r.gameId,size:r.size,editable:r.editable,reason:r.reason,dateMinutes:r.dateMinutes,...(glyphMap instanceof Map?{glyphMap}:{}),
    completedEpisode:r.gameId&&b.length===0x1600&&b[5]>0?b[5]-1:null,
    completedTitleIndex:r.gameId&&b.length===0x1600?b[7]:null,
    ...names,heroUnitNameCount,
    // Game restoration takes the upper nine bits of each saved selection word.
    // These are FACE ids, not pilot ids, and remain read-only metadata.
    heroFaceIds:Object.freeze(r.gameId&&b.length===0x1600?{303:u16(b,0x34)>>>7,302:u16(b,0x38)>>>7}:{}),
    upgradeLimit:r.gameId==='srwf-final'&&(b[0x9c]&8)?10:5,
    money:r.gameId&&b.length===0x1600?b[10]*65536+b[11]*256+b[12]:null,pilots:Object.freeze(pilots),units:Object.freeze(units)});
}
export async function openSave(input, catalog={}) {
  catalog={...catalog};
  let unitCatalog=new Map((catalog.units??[]).map(u=>[u.recordIndex,structuredClone(u)]));
  need(input instanceof Uint8Array&&input.length>0&&input.length<=LIMIT,'파일이 비어 있거나 너무 큽니다.');
  const original=input.slice();let unpacked=original,layers=0;
  while(unpacked[0]===31&&unpacked[1]===139){need(layers<4,'압축 중첩이 너무 많습니다.');unpacked=await transform(unpacked,'decode');layers++;}
  let interleaved=false,raw=unpacked;
  if(!MAGIC.every((v,i)=>raw[i]===v)&&MAGIC.every((v,i)=>raw[i*2+1]===v)){
    need(raw.length%2===0,'잘못된 인터리브 파일입니다.');
    for(let i=0;i<raw.length;i+=2)need(raw[i]===255,'인터리브의 빈 바이트가 예상과 다릅니다.');
    interleaved=true;raw=Uint8Array.from({length:raw.length/2},(_,i)=>raw[2*i+1]);
  }
  const records=parse(raw),changes=new Map(),models=new WeakMap(),addedBindings=new Map(),addedPilotBindings=new Map(),aliceDependentBindings=new Map();
  const unitBinding=unit=>JSON.stringify([unit.recordIndex,unit.identity??null,unit.construction?.preset??null,
    unit.saveUnitKind??null,unit.saveUnitForm??null,unit.constructionGroupRoot??null]);
  const pilotBinding=(row,defs)=>JSON.stringify([row.id,row.identity,row.subpilot,row.id===399?defs.aliceDependent??null:null]);
  function currentPilotDefinitions(key){const defs=getSavePilotDefinitions(catalog.savePilotSupport,{gameId:catalog.gameId,sessionToken:catalog.sessionToken,catalog:catalog.savePilotCatalog});need(defs&&catalog.gameId===get(key).gameId,'추가 파일럿의 검증된 ROM 정보가 바뀌었습니다.');return defs;}
  function validateAddedPilots(){
    for(const [key,bindings]of addedPilotBindings){
      const defs=currentPilotDefinitions(key);
      for(const [id,binding]of bindings){const row=defs.pilots.find(p=>p.id===id);need(row&&pilotBinding(row,defs)===binding,'추가한 파일럿의 ROM 구성 또는 ALICE 동승 상태가 바뀌었습니다.');}
    }
  }
  function validateAliceDependent(){
    for(const [key,binding]of aliceDependentBindings){const defs=currentPilotDefinitions(key);need(sameAliceDependent(defs.aliceDependent,binding),'ALICE 지원 기체 구성이 바뀌어 이 저장을 내보낼 수 없습니다.');}
  }
  function validateAddedUnits(){
    for(const [key,bindings]of addedBindings){
      need(catalog.gameId===get(key).gameId,'추가 기체와 현재 ROM의 게임이 다릅니다.');
      for(const [id,binding]of bindings){const unit=unitCatalog.get(id);
        need(unit&&unitBinding(unit)===binding,`추가한 기체 #${id}의 ROM 구성이 바뀌었습니다. 해당 기체가 포함된 편집 상태로 되돌린 뒤 저장하세요.`);
      }
    }
  }
  // Payloads are private immutable snapshots: every edit makes a fresh slice.
  // Rendering a name asks for the save list repeatedly, so decoding all 56
  // records on each lookup made combined edits stall the desktop UI.
  const model=(record,bytes)=>{
    // Writers also inspect a scratch copy before mutating it. Only published
    // payloads can be reused; a scratch buffer must never enter this cache.
    if(bytes!==record.payload&&bytes!==changes.get(record.key))return saveModel(record,bytes,catalog.glyphMap);
    const cached=models.get(bytes);
    if(cached&&cached.glyphMap===catalog.glyphMap)return cached.value;
    const value=saveModel(record,bytes,catalog.glyphMap);
    models.set(bytes,{glyphMap:catalog.glyphMap,value});return value;
  };
  const get=key=>{const r=records.find(r=>r.key===key);need(r,'저장을 찾을 수 없습니다.');return r;};
  const current=r=>changes.get(r.key)??r.payload;
  function list(){return Object.freeze(records.map(r=>model(r,current(r))));}
  function edit(key,field,value,slot=null){
    const r=get(key);need(r.editable,r.reason);const b=current(r).slice();let p,n;
    // The value already stored may be echoed unchanged even above the screen limit (save-field-rules.mjs).
    if(field==='money'){p=10;n=3;requireSaveScalar('money',value,b[10]*65536+b[11]*256+b[12]);}
    else{
      integer(slot,0,127);p=0x1000+slot*12;
      need(u16(b,p)>0&&u16(b,p)<400,'이 파일럿 번호는 편집을 지원하지 않습니다.');
      if(field==='level'){requireSaveScalar('level',value,b[p+2]);p+=2;n=1;}
      else if(field==='experience'){requireSaveScalar('experience',value,u16(b,p+4));p+=4;n=2;}
      else throw new Error('지원하지 않는 세이브 항목입니다.');
    }
    put(b,p,value,n);put(b,0,saveChecksum(b),4);
    if(b.every((v,i)=>v===r.payload[i]))changes.delete(key);else changes.set(key,b);
    return model(r,b);
  }
  function editNames(key,edits){
    const r=get(key);need(r.editable,r.reason);
    need(catalog.gameId===r.gameId,'검증한 ROM과 같은 게임의 저장만 편집할 수 있습니다.');
    need(canEditSaveNames(catalog,r.gameId),SAVE_NAME_SUPPORT_MESSAGE);
    need(edits&&typeof edits==='object'&&!Array.isArray(edits),'이름 편집 항목이 잘못되었습니다.');
    const record=model(r,current(r)),entries=Object.entries(edits),b=current(r).slice();
    need(entries.length>0&&entries.length<=7,'이름 편집 항목 수가 잘못되었습니다.');
    const selected=entries.map(([field,text])=>{
      const spec=saveNameSpec(record,field);need(spec&&typeof text==='string','이 저장에서 지원하지 않는 이름 항목입니다.');return {spec,text};
    });
    for(const {spec,text}of selected.filter(e=>e.spec.unitSlot===undefined)){
      // A native default can expand beyond its byte budget. An unchanged
      // displayed name must retain that exact original token.
      if(text===decodeSaveName(record,spec.field,{glyphMap:catalog.glyphMap}))continue;
      const encoded=encodeSaveName(record,spec.field,text,{glyphMap:catalog.glyphMap});
      b.fill(255,spec.offset,spec.offset+spec.maxBytes);b.set(encoded,spec.offset);
    }
    const unitEdits=new Map(selected.filter(e=>e.spec.unitSlot!==undefined).map(e=>[e.spec.field,e.text]));
    if([...unitEdits].some(([field,text])=>text!==decodeSaveName(record,field,{glyphMap:catalog.glyphMap}))){
      const specs=saveNameFields(record).filter(s=>s.unitSlot!==undefined);
      const defaults=specs.map(s=>unitCatalog.get(savedHeroUnitId(record,s.unitSlot)));
      const texts=specs.map(s=>unitEdits.has(s.field)?unitEdits.get(s.field):decodeSaveName(record,s.field,{glyphMap:catalog.glyphMap}));
      need(texts.every(t=>typeof t==='string'),'기존 주인공 기체명을 읽지 못했습니다.');
      // Stock gates the complete three-name copy on the first name, then
      // copies every form. Fill omitted forms with the verified ROM bodies.
      const custom=texts.some((t,i)=>t!==''&&t!==defaults[i]?.name);
      for(const [i,spec]of specs.entries()){
        if(!custom){b.fill(0,spec.offset,spec.offset+spec.maxBytes);continue;}
        const native=defaults[i]?.saveNameDefaultBytes;
        need(Array.isArray(native)&&native.length===10,'검증한 ROM에서 주인공 기체의 10바이트 이름 칸과 종료 문자를 확인하지 못했습니다.');
        const encoded=texts[i]===''||texts[i]===defaults[i].name?Uint8Array.from(native):encodeSaveName(record,spec.field,texts[i],{glyphMap:catalog.glyphMap});
        b.fill(255,spec.offset,spec.offset+spec.maxBytes);b.set(encoded,spec.offset);
      }
    }
    put(b,0,saveChecksum(b),4);
    if(b.every((v,i)=>v===r.payload[i]))changes.delete(key);else changes.set(key,b);
    return model(r,b);
  }
  function editName(key,field,text){return editNames(key,{[field]:text});}
  function addUnit(key,id){
    const r=get(key);need(r.editable,r.reason);integer(id,1,65535);
    need(catalog.gameId===r.gameId,'검증한 ROM과 같은 게임의 저장만 편집할 수 있습니다.');
    const b=current(r).slice(),before=model(r,b);
    // Definitions and save rows are deliberately separate: a save may own more
    // than one copy of a definition.  Every add receives a complete fresh group;
    // never borrow a similarly numbered legacy row as a component.
    const group=saveUnitGroup(id,[...unitCatalog.values()]);
    const slots=new Map(),added=[];
    const missing=[...group.members];
    const empty=Array.from({length:128},(_,i)=>i).filter(i=>u16(b,0x100+i*30)===0);
    let alice=null,aliceRows=[],aliceDefs=null;
    const availableDefs=getSavePilotDefinitions(catalog.savePilotSupport,{gameId:catalog.gameId,sessionToken:catalog.sessionToken,catalog:catalog.savePilotCatalog});
    if(group.familyMembers){
      // A known S/Ex-S family is never added as a misleading unit-only grant:
      // both transform coordinates and the inspected ALICE capability are needed.
      need(availableDefs,'이 S/Ex-S 기체는 ALICE 동승 패치를 확인하지 못해 추가할 수 없습니다.');
      aliceDefs=availableDefs;const dependent=aliceDefs.aliceDependent;
      need(dependent&&dependent.pilotId===399&&Array.isArray(dependent.families),'이 S/Ex-S 기체에는 확인된 ALICE 동승 설정과 지원 기체 정보가 필요합니다.');
      for(const proof of dependent.families){
        const verified=saveUnitGroup(proof.root,[...unitCatalog.values()]);
        need(verified.familyMembers&&verified.root===proof.root&&JSON.stringify(verified.familyMembers)===JSON.stringify(proof.members)&&proof.members.every(member=>dependent.targetIds.includes(member)),'ALICE 지원 기체의 변형 좌표가 현재 ROM과 다릅니다.');
      }
      const requested=dependent.families.find(proof=>proof.root===group.root);
      need(requested&&JSON.stringify(requested.members)===JSON.stringify(group.familyMembers),'이 S/Ex-S 기체에는 확인된 ALICE 동승 설정과 지원 기체 정보가 필요합니다.');
      const inspected=inspectAliceRows(b),hulls=[];
      for(const proof of dependent.families){
        // Save rows are physical hulls. A base/cruiser row and duplicate ids are
        // independent only when their human heads are distinct.
        for(const unit of before.units.filter(row=>proof.members.includes(row.id)))hulls.push({proof,unit,existing:true});
        if(proof.root===group.root)hulls.push({proof,unit:{id:proof.root,pilotSlot:255,added:true},existing:false});
      }
      const attachedByHull=new Map(),heads=new Map(),attachedAlice=new Set();
      for(const hull of hulls){
        if(hull.unit.pilotSlot===255)continue;
        const head=inspected.humanHead(hull.unit.pilotSlot);
        need(!heads.has(head),'같은 인간 파일럿(또는 동승자 체인)이 S/Ex-S 기체 둘에 배정되어 ALICE SP 소유권이 모호합니다.');
        heads.set(head,hull);
        const companion=inspected.companionByHuman.get(head);
        if(companion){need(!attachedAlice.has(companion.slot),'같은 ALICE가 S/Ex-S 기체 둘에 연결되어 있어 준비하지 않았습니다.');attachedAlice.add(companion.slot);attachedByHull.set(hull,companion);}
      }
      // The native sync releases a terminal #399 attached to a human that is
      // outside every target hull before it allocates standby rows.  That row is
      // therefore available without touching its bytes here.  A row attached to
      // a target head remains owned progress and is not reusable.  This is not
      // a permanent hull ownership pairing: runtime may choose a support row.
      const unbound=hulls.filter(hull=>!attachedByHull.has(hull)).sort((a,b)=>Number(b.existing)-Number(a.existing)||a.proof.root-b.proof.root);
      const reusable=inspected.eligible.filter(row=>row.ownerSlot===null||!heads.has(row.ownerSlot));
      const reclaimable=reusable.filter(row=>row.ownerSlot!==null);
      const prepareFor=unbound.slice(Math.min(reusable.length,unbound.length));
      const needed=prepareFor.length;
      need(empty.length>=missing.length,`연결 기체를 포함해 빈 칸 ${missing.length}개가 필요합니다.`);
      need(inspected.empty.length>=needed,`ALICE 준비에 빈 파일럿 칸 ${needed}개가 필요합니다.`);
      const alicePilot=aliceDefs.pilots.find(pilot=>pilot.id===399&&pilot.subpilot===true);need(alicePilot,'ALICE 파일럿 정보를 확인하지 못했습니다.');
      const levelFor=hull=>{const slot=hull.unit.pilotSlot,pilot=slot===255?null:inspected.rows[slot];return pilot&&pilot.id!==399&&pilot.level>=1&&pilot.level<=99?pilot.level:1;};
      alice={dependent,required:hulls.length,needed,prepareFor,levelFor,pilot:alicePilot,empty:inspected.empty,totalBefore:inspected.eligible.length,reusable:reusable.length,reclaimable:reclaimable.length};aliceRows=inspected.eligible;
    }else need(empty.length>=missing.length,`연결 기체를 포함해 빈 칸 ${missing.length}개가 필요합니다.`);
    for(const member of missing){
      const unit=unitCatalog.get(member);need(unit,'연결할 기체가 ROM에 없습니다.');
      integer(unit.hp,0,65535);integer(unit.en,0,65535);
      const slot=empty.shift(),p=0x100+slot*30;slots.set(member,slot);added.push(slot);
      b.fill(0,p,p+30);put(b,p,member,2);b[p+2]=0x40;b[p+15]=255;b[p+16]=255;b[p+26]=255;
      put(b,p+22,unit.hp,2);put(b,p+24,unit.en,2);
    }
    for(const [child,parent] of group.links)b[0x100+slots.get(child)*30+16]=slots.get(parent);
    if(group.pilotSource&&added.includes(slots.get(group.root)))b[0x100+slots.get(group.root)*30+15]=b[0x100+slots.get(group.pilotSource)*30+15];
    if(alice){for(let index=0;index<alice.needed;index++){const family=alice.prepareFor[index],row=initializeSavePilotRow({id:399,level:alice.levelFor(family),mp:alice.pilot.mp,mindGrowth:alice.pilot.mindGrowth,subpilot:true},aliceDefs.growth,aliceDefs.gameId),slot=alice.empty[index];b.set(row,0x1000+slot*12);aliceRows.push({slot,id:399});}}
    put(b,0,saveChecksum(b),4);changes.set(key,b);
    const bindings=new Map(addedBindings.get(key));
    for(const member of missing)bindings.set(member,unitBinding(unitCatalog.get(member)));
    addedBindings.set(key,bindings);
    if(alice){aliceDependentBindings.set(key,alice.dependent);if(alice.needed){const pilotBindings=new Map(addedPilotBindings.get(key));pilotBindings.set(399,pilotBinding(alice.pilot,aliceDefs));addedPilotBindings.set(key,pilotBindings);}}
    return {record:model(r,b),slot:slots.get(id),added:added.length,
      aliceRequired:alice?.required??null,alicePrepared:alice?.needed??null,
      aliceTotal:alice?alice.totalBefore+alice.needed:null,
      aliceReusable:alice?.reusable??null,aliceReclaimable:alice?.reclaimable??null,
      freePilotSlots:alice?alice.empty.length-alice.needed:null,
      freeUnitSlots:empty.length};
  }
  function addPilot(key,id,level=31){
    const r=get(key);need(r.editable,r.reason);integer(id,1,511);integer(level,1,99);
    const defs=getSavePilotDefinitions(catalog.savePilotSupport,{gameId:catalog.gameId,sessionToken:catalog.sessionToken,catalog:catalog.savePilotCatalog});
    need(defs&&catalog.gameId===r.gameId,'검증된 게임 파일럿 정보가 필요합니다.');
    const pilot=defs.pilots.find(p=>p.id===id);need(pilot,'추가할 수 없는 파일럿입니다.');
    const b=current(r).slice(),before=model(r,b);need(!before.pilots.some(p=>p.id===id),'이미 보유한 파일럿입니다.');
    const slot=Array.from({length:128},(_,i)=>i).find(i=>u16(b,0x1000+i*12)===0);need(slot!==undefined,'빈 파일럿 칸이 없습니다.');
    const row=initializeSavePilotRow({id,level,mp:pilot.mp,mindGrowth:pilot.mindGrowth,subpilot:pilot.subpilot},defs.growth,defs.gameId);
    b.set(row,0x1000+slot*12);put(b,0,saveChecksum(b),4);changes.set(key,b);
    const bindings=new Map(addedPilotBindings.get(key));bindings.set(id,pilotBinding(pilot,defs));addedPilotBindings.set(key,bindings);
    return {record:model(r,b),slot};
  }
  function setUpgradeMode(key,mode){
    const r=get(key);need(r.editable,r.reason);need(r.gameId==='srwf-final','10단 조기 해금은 완결편에서만 지원합니다.');
    need(mode==='original'||mode==='early10','알 수 없는 개조 모드입니다.');
    const b=current(r).slice();
    b[0x9c]=(b[0x9c]&~8)|(mode==='early10'?8:r.payload[0x9c]&8);
    put(b,0,saveChecksum(b),4);
    if(b.every((v,i)=>v===r.payload[i]))changes.delete(key);else changes.set(key,b);
    return model(r,b);
  }
  function editUnit(key,field,value,slot,index=null){
    const r=get(key);need(r.editable,r.reason);integer(slot,0,127);
    const b=current(r).slice(),p=0x100+slot*30,id=u16(b,p),unit=unitCatalog.get(id);
    need(id>0&&unit&&catalog.gameId===r.gameId,'검증한 ROM에서 기체 정보를 찾을 수 없습니다.');
    const max=model(r,b).upgradeLimit;
    if(Object.hasOwn(UNIT_UPGRADES,field)){
      integer(value,0,max);const [offset,shift]=UNIT_UPGRADES[field],old=u16(b,p+offset);
      put(b,p+offset,(old&~(15<<shift))|(value<<shift),2);
    }else if(field==='weaponUpgrades'){
      integer(index,0,15);integer(value,0,max);
      need(unit.weaponList?.status==='known'&&unit.weaponList.entries.some(e=>e.slot===index+1),'확인된 무기 개조 칸이 아닙니다.');
      const pos=p+7+(index>>1),shift=index%2?0:4;b[pos]=(b[pos]&~(15<<shift))|(value<<shift);
    }else if(field==='parts'){
      integer(index,0,3);integer(value,0,22);
      need(Number.isInteger(unit.partSlots)&&unit.partSlots>=1&&unit.partSlots<=4&&index<unit.partSlots,'이 기체의 장착 가능 칸이 아닙니다.');
      b[p+17+index]=value;
    }else throw new Error('지원하지 않는 기체 항목입니다.');
    put(b,0,saveChecksum(b),4);
    if(b.every((v,i)=>v===r.payload[i]))changes.delete(key);else changes.set(key,b);
    return model(r,b);
  }
  function diff(){const out=[];for(const r of records){const b=current(r);if(b===r.payload)continue;
    const a=model(r,r.payload),z=model(r,b);
    if(a.upgradeLimit!==z.upgradeLimit)out.push({key:r.key,name:r.name,field:'upgradeLimit',before:a.upgradeLimit,after:z.upgradeLimit});
    for(const {field} of saveNameFields(a))if(a[field+'Bytes'].some((v,i)=>v!==z[field+'Bytes'][i])){
      out.push({key:r.key,name:r.name,field,before:decodeSaveName(a,field,{glyphMap:catalog.glyphMap})??'해독 불가',after:decodeSaveName(z,field,{glyphMap:catalog.glyphMap})??'해독 불가'});
    }
    if(a.money!==z.money)out.push({key:r.key,name:r.name,field:'money',before:a.money,after:z.money});
    for(const next of z.pilots)if(!a.pilots.some(p=>p.slot===next.slot))out.push({key:r.key,name:r.name,slot:next.slot,id:next.id,field:'pilotAdded',before:0,after:next.id});
    for(const before of a.pilots){const after=z.pilots.find(p=>p.slot===before.slot);
      if(!after){out.push({key:r.key,name:r.name,slot:before.slot,id:before.id,field:'pilotRemoved',before:before.id,after:0});continue;}
      for(const field of ['level','experience'])if(before[field]!==after[field])out.push({key:r.key,name:r.name,slot:before.slot,id:before.id,field,before:before[field],after:after[field]});}
    for(const old of a.units)if(!z.units.some(u=>u.slot===old.slot))out.push({key:r.key,name:r.name,type:'unit',slot:old.slot,id:old.id,field:'unitRemoved',before:old.id,after:0});
    for(const next of z.units){
      let old=a.units.find(u=>u.slot===next.slot);
      if(!old){out.push({key:r.key,name:r.name,type:'unit',slot:next.slot,id:next.id,field:'unitAdded',before:0,after:next.id});old={...next,...unitFields(new Uint8Array(30),0)};}
      for(const field of [...Object.keys(UNIT_UPGRADES),'pilotSlot','linkedSlot'])if(old[field]!==next[field])out.push({key:r.key,name:r.name,type:'unit',slot:old.slot,id:old.id,field,before:old[field],after:next[field]});
      for(const field of ['weaponUpgrades','parts'])for(let index=0;index<old[field].length;index++)if(old[field][index]!==next[field][index])out.push({key:r.key,name:r.name,type:'unit',slot:old.slot,id:old.id,field,index,before:old[field][index],after:next[field][index]});
    }
  }return out;}
  // Structural repair must see authenticated #399 too: the ordinary display
  // catalog deliberately omits this special pilot, but a valid prepared row is
  // neither an error nor disposable progress.
  function checkedCatalog(r,b=current(r)){
    const known=new Map((catalog.pilots??[]).map(row=>[row.recordIndex,row]));
    // #399 is intentionally absent from ordinary display catalogs.  Preserve a
    // structurally valid special row even after a catalog/session loss; an
    // unsafe special chain is not silently cleared by the generic repairer.
    if(Array.from({length:128},(_,slot)=>u16(b,0x1000+slot*12)).includes(399)){
      try{inspectAliceRows(b);}catch(error){throw new Error(`ALICE 상태를 확인하지 못해 안전한 수리를 중단했습니다: ${error.message}`);}
      known.set(399,{recordIndex:399});
    }
    const defs=getSavePilotDefinitions(catalog.savePilotSupport,{gameId:catalog.gameId,sessionToken:catalog.sessionToken,catalog:catalog.savePilotCatalog});
    if(defs&&catalog.gameId===r.gameId)for(const pilot of defs.pilots){const authenticatedSubpilot=pilot.id===399&&pilot.subpilot===true;known.set(pilot.id,{recordIndex:pilot.id,...(authenticatedSubpilot?{subpilot:true,authenticatedSubpilot:true}:{})});}
    return {...catalog,pilots:[...known.values()]};
  }
  // Structural check against the verified ROM; repair only makes broken references safe.
  function check(key){const r=get(key),b=current(r);return checkSaveBytes(b,{gameId:r.gameId,upgradeLimit:model(r,b).upgradeLimit},checkedCatalog(r,b));}
  function repair(key){
    const r=get(key);need(r.editable,r.reason);
    const b=current(r).slice(),fixed=repairSaveBytes(b,{gameId:r.gameId,upgradeLimit:model(r,b).upgradeLimit},checkedCatalog(r,b));
    if(!fixed)return 0;
    // A repair may remove an added row; its proof must not survive that removal.
    const bindings=addedPilotBindings.get(key);if(bindings)for(const id of [...bindings.keys()])if(!model(r,b).pilots.some(p=>p.id===id))bindings.delete(id);if(bindings?.size===0)addedPilotBindings.delete(key);
    put(b,0,saveChecksum(b),4);
    if(b.every((v,i)=>v===r.payload[i]))changes.delete(key);else changes.set(key,b);
    return fixed;
  }
  async function exportFile(){
    validateAddedPilots();
    validateAliceDependent();
    validateAddedUnits();
    if(!changes.size)return original.slice();
    for(const r of records)if(!canEditSaveNames(catalog,r.gameId)){
      const b=current(r);
      need(saveNameFields(model(r,b)).every(spec=>b.subarray(spec.offset,spec.offset+spec.maxBytes).every((v,i)=>v===r.payload[spec.offset+i])),SAVE_NAME_SUPPORT_MESSAGE);
    }
    const out=raw.slice();for(const r of records){const b=current(r);if(b===r.payload)continue;need(u32(b,0)===saveChecksum(b),'출력 체크섬 검증에 실패했습니다.');r.offsets.forEach((p,i)=>out[p]=b[i]);}
    const check=parse(out);need(check.length===records.length,'출력 저장 목록이 달라졌습니다.');
    for(let i=0;i<records.length;i++)need(check[i].name===records[i].name&&check[i].payload.every((v,j)=>v===current(records[i])[j]),'출력 재검사에 실패했습니다.');
    let result=out;if(interleaved){result=unpacked.slice();out.forEach((v,i)=>result[2*i+1]=v);}
    const wrapped=result;
    for(let i=0;i<layers;i++)result=await transform(result,'encode');
    // Verify every byte after decoding the delivered gzip/interleaved wrapper,
    // including untouched padding, rather than only its visible save headers.
    let delivered=result;
    for(let i=0;i<layers;i++)delivered=await transform(delivered,'decode');
    need(delivered.length===wrapped.length&&delivered.every((v,i)=>v===wrapped[i]),'출력 파일의 압축·배치 재검사에 실패했습니다.');
    return result;
  }
  return Object.freeze({format:Object.freeze({bytes:raw.length,blockSize:SIZES.get(raw.length),gzipLayers:layers,interleaved}),list,edit,editName,editNames,editUnit,addUnit,addPilot,setUpgradeMode,diff,check,repair,
    canEditNames:key=>{const r=records.find(r=>r.key===key);return !!r&&r.editable&&canEditSaveNames(catalog,r.gameId);},
    updateCatalog:next=>{const units=new Map((next.units??[]).map(u=>[u.recordIndex,structuredClone(u)]));catalog={...next};unitCatalog=units;},
    reset:key=>{if(key===undefined){changes.clear();addedBindings.clear();addedPilotBindings.clear();aliceDependentBindings.clear();}else{get(key);changes.delete(key);addedBindings.delete(key);addedPilotBindings.delete(key);aliceDependentBindings.delete(key);}},exportFile});
}
