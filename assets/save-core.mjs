import {canEditSaveNames,SAVE_NAME_SUPPORT_MESSAGE} from './save-name-support.mjs?v=20261110-part1';
import {SAVE_NAME_FIELDS,saveNameFields,saveNameSpec,savedHeroUnitId,decodeSaveName,encodeSaveName} from './save-names.mjs?v=20261110-part1';
import { requireSaveScalar } from './save-field-rules.mjs?v=20261110-part1';
import { saveUnitGroup } from './save-unit-groups.mjs?v=20261110-part1';
import { checkSaveBytes, repairSaveBytes } from './save-check.mjs?v=20261110-part1';
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
  const records=parse(raw),changes=new Map(),models=new WeakMap(),addedBindings=new Map();
  const unitBinding=unit=>JSON.stringify([unit.recordIndex,unit.identity??null,unit.construction?.preset??null,
    unit.saveUnitKind??null,unit.saveUnitForm??null,unit.constructionGroupRoot??null]);
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
    need(!before.units.some(u=>u.id===id),'이미 보유한 기체입니다.');
    const group=saveUnitGroup(id,[...unitCatalog.values()],before.units.map(u=>u.id));
    const slots=new Map(before.units.map(u=>[u.id,u.slot])),added=[];
    const empty=Array.from({length:128},(_,i)=>i).filter(i=>u16(b,0x100+i*30)===0);
    const missing=group.members.filter(member=>!slots.has(member));need(empty.length>=missing.length,`연결 기체를 포함해 빈 칸 ${missing.length}개가 필요합니다.`);
    for(const member of missing){
      const unit=unitCatalog.get(member);need(unit,'연결할 기체가 ROM에 없습니다.');
      integer(unit.hp,0,65535);integer(unit.en,0,65535);
      const slot=empty.shift(),p=0x100+slot*30;slots.set(member,slot);added.push(slot);
      b.fill(0,p,p+30);put(b,p,member,2);b[p+2]=0x40;b[p+15]=255;b[p+16]=255;b[p+26]=255;
      put(b,p+22,unit.hp,2);put(b,p+24,unit.en,2);
    }
    for(const [child,parent] of group.links)b[0x100+slots.get(child)*30+16]=slots.get(parent);
    if(group.pilotSource&&added.includes(slots.get(group.root)))b[0x100+slots.get(group.root)*30+15]=b[0x100+slots.get(group.pilotSource)*30+15];
    put(b,0,saveChecksum(b),4);changes.set(key,b);
    const bindings=new Map(addedBindings.get(key));
    for(const member of missing)bindings.set(member,unitBinding(unitCatalog.get(member)));
    addedBindings.set(key,bindings);
    return {record:model(r,b),slot:slots.get(id),added:added.length};
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
  // Structural check against the verified ROM; repair only makes broken references safe.
  function check(key){const r=get(key),b=current(r);return checkSaveBytes(b,{gameId:r.gameId,upgradeLimit:model(r,b).upgradeLimit},catalog);}
  function repair(key){
    const r=get(key);need(r.editable,r.reason);
    const b=current(r).slice(),fixed=repairSaveBytes(b,{gameId:r.gameId,upgradeLimit:model(r,b).upgradeLimit},catalog);
    if(!fixed)return 0;
    put(b,0,saveChecksum(b),4);
    if(b.every((v,i)=>v===r.payload[i]))changes.delete(key);else changes.set(key,b);
    return fixed;
  }
  async function exportFile(){
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
  return Object.freeze({format:Object.freeze({bytes:raw.length,blockSize:SIZES.get(raw.length),gzipLayers:layers,interleaved}),list,edit,editName,editNames,editUnit,addUnit,setUpgradeMode,diff,check,repair,
    canEditNames:key=>{const r=records.find(r=>r.key===key);return !!r&&r.editable&&canEditSaveNames(catalog,r.gameId);},
    updateCatalog:next=>{const units=new Map((next.units??[]).map(u=>[u.recordIndex,structuredClone(u)]));catalog={...next};unitCatalog=units;},
    reset:key=>{if(key===undefined){changes.clear();addedBindings.clear();}else{get(key);changes.delete(key);addedBindings.delete(key);}},exportFile});
}
