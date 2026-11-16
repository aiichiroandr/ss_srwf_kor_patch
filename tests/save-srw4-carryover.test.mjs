import assert from 'node:assert/strict';
import {test} from 'node:test';
import {gzipSync,gunzipSync} from 'node:zlib';
import {openSave,saveChecksum} from '../assets/save-core.mjs';
import {syntheticSave} from './helpers/synthetic-save.mjs';

const PRESETS=['s-gundam','s-g-cruiser','ex-s-gundam','g-cruiser','sirbine','zwauss','blood-temple'];
const names=['S건담','S-G크루저','Ex-S','Ex-S G크루저','서바인','즈와우스','블러드템플'];
const FO=[348,349,350,351,354,355,356], TO=[439,440,424,425,430,423,429];
function catalog(gameId,ids,{alice=true}={}){
  const unitRows=ids.map((recordIndex,i)=>({
    recordIndex,name:names[i],srw4Native:true,recordKind:'regular',
    construction:{preset:PRESETS[i]},saveUnitKind:i<4?1:0,saveUnitForm:i<4?i%2:0,partSlots:2,
    ...(i<4?{constructionGroup:i<2?'s-cruiser':'ex-s-cruiser',constructionGroupRoot:ids[i-i%2]}:{}),
    weaponList:{entries:[{slot:1,weaponIndex:gameId==='srwf-f'?303:887}]}
  }));
  return {gameId,targetHash:gameId==='srwf-f'?'f'.repeat(64):'c'.repeat(64),srw4Installed:{aliceEnabled:alice},
    units:[{recordIndex:23,recordKind:'regular',name:'순정 기체'},...unitRows],
    weapons:[{recordIndex:gameId==='srwf-f'?303:887,saveIdentity:'verified slot weapon'}],partNames:Array.from({length:23},(_,i)=>`part ${i}`)};
}
function catalogs(){return [catalog('srwf-f',FO),catalog('srwf-final',TO)];}
const put16=(p,at,id)=>new DataView(p.buffer).setUint16(at,id);
function fixture({clear=true,name='SROBOT_F_01',roster=FO,alice=true}={}){
  const f=syntheticSave({name,completedCounter:clear?35:34,titleIndex:67,foreign:true}),p=f.payload;
  p[6]=clear?73:67;
  p[0x100+15]=255;p[0x100+16]=255;
  roster.forEach((id,i)=>{
    const at=0x100+(i+1)*30;
    put16(p,at,id);p[at+2]=0x40;p[at+7]=0x40;p[at+15]=i===0?0:255;p[at+16]=255;p[at+17]=10;p[at+26]=255;
    put16(p,at+22,4000+i*7);put16(p,at+24,250+i);
  });
  if(alice){
    p[0x1008]=1;
    put16(p,0x100c,399);p[0x100e]=47;p[0x100f]=8;p[0x1014]=255;
  }
  new DataView(p.buffer).setUint32(0,saveChecksum(p));f.payloadPositions.forEach((at,i)=>{f.raw[at]=p[i];});
  return f;
}
const packed=buffer=>new Uint8Array(buffer);
function expected(f,roster){
  const payload=f.payload.slice(),raw=f.raw.slice();
  roster.forEach((id,i)=>put16(payload,0x100+(i+1)*30,id));
  new DataView(payload.buffer).setUint32(0,saveChecksum(payload));
  f.payloadPositions.forEach((at,i)=>{raw[at]=payload[i];});
  return raw;
}
test('auth preset name and forms map independently allocated numbers; only selected IDs + checksum byte differences',async()=>{
  const f=fixture({roster:[...FO,FO[0]]}),original=f.raw.slice();
  const save=await openSave(f.raw),before=save.list(),key=before[0].key;
  const result=await save.exportSrw4CarryoverCopy(key,...catalogs());
  assert.deepEqual(result.edits.map(({from,to})=>[from,to]),[...FO,FO[0]].map((from,i)=>[from,[...TO,TO[0]][i]]));
  assert.deepEqual(result.bytes,expected(f,[...TO,TO[0]]));
  assert.deepEqual(f.raw,original);
  assert.deepEqual(save.list(),before);
  assert.deepEqual(await save.exportFile(),original);
  const reopened=await openSave(result.bytes);
  assert.equal(reopened.list()[0].editable,true);
  assert.equal(reopened.list()[0].completedEpisode,34);
  assert.equal(reopened.list()[0].units[1].pilotSlot,0);
  assert.equal(reopened.list()[0].pilots[1].id,399);
  await assert.rejects(reopened.exportSrw4CarryoverCopy(key,...catalogs()),/이미 변환한 파일/);
});
test('physical interleaved/gzip representation, untouched padding, unrelated record and checksums round-trip',async()=>{
  const f=fixture(),rawExpected=expected(f,TO);
  const interleave=src=>Uint8Array.from({length:src.length*2},(_,i)=>i%2?src[i>>1]:255);
  const save=await openSave(packed(gzipSync(gzipSync(interleave(f.raw)))));
  assert.equal(save.format.gzipLayers,2);
  const result=await save.exportSrw4CarryoverCopy(save.list()[0].key,...catalogs());
  assert.deepEqual(packed(gunzipSync(gunzipSync(result.bytes))),interleave(rawExpected));
});
test('wrong route/type/name, unchecked target, missing or duplicate preset, non-Rev1 extras, occupied or stock clash refuse',async()=>{
  async function verify(f,pattern,modify=()=>{}){
    const save=await openSave(f.raw),parts=catalogs();modify(parts);
    await assert.rejects(save.exportSrw4CarryoverCopy(save.list()[0].key,...parts),pattern);
    assert.deepEqual(await save.exportFile(),f.raw);
  }
  await verify(fixture({clear:false}),/34화/);
  await verify(fixture({name:'SROBOTFC_01'}),/34화/);
  await verify(fixture(),/완결편의 제4차 연동/,([,b])=>{b.srw4Installed=null;});
  await verify(fixture(),/5대와 변형/,([,b])=>{b.units.pop();});
  await verify(fixture(),/신원/,([,b])=>{b.units.at(-1).construction.preset='s-gundam';});
  await verify(fixture(),/ALICE/,([,b])=>{b.srw4Installed.aliceEnabled=false;});
  await verify(fixture(),/번호가 겹쳐/,([a])=>{a.units.push({recordIndex:TO[0],recordKind:'regular'});});
  await verify(fixture({roster:[...FO,357]}),/다른 BIN/,()=>{});
  await verify(fixture({roster:[...FO,357]}),/연동 외의 추가/,([a])=>{a.units.push({recordIndex:357,recordKind:'regular',construction:{preset:'custom'}});});
  await verify(fixture(),/무기 개조 슬롯/,([,b])=>{b.weapons[0].saveIdentity='not same';});
  await verify(fixture(),/장착 파츠/,([,b])=>{b.units[1].partSlots=0;});
  await verify(fixture({roster:[]}),/승계할 제4차/);
});
test('open editor pending changes cannot leak into a transfer copy; same IDs in distinct discs need no unnecessary byte changes',async()=>{
  const f=fixture(),save=await openSave(f.raw),key=save.list()[0].key;
  save.edit(key,'money',666);
  await assert.rejects(save.exportSrw4CarryoverCopy(key,...catalogs()),/클리어 원본/);
  save.reset(key);
  const result=await save.exportSrw4CarryoverCopy(key,catalog('srwf-f',FO),catalog('srwf-final',FO));
  assert.deepEqual(result.bytes,f.raw);
});

test('unknown/aliased part identity and malformed incoming, outgoing or pilot edges block only transfer',async()=>{
  for(const mode of ['part-different','part-alias','bad-outgoing','bad-incoming','bad-pilot','shared-pilot']){
    const f=fixture(),p=f.payload,parts=catalogs(),edit=0x100+30;
    if(mode==='part-different')parts[1].partNames[10]='different part';
    if(mode==='part-alias')parts[1].partNames[11]=parts[1].partNames[10];
    if(mode==='bad-outgoing')p[edit+16]=2;
    if(mode==='bad-incoming')p[0x100+16]=1;
    if(mode==='bad-pilot')p[edit+15]=127;
    if(mode==='shared-pilot')p[edit+30+15]=0;
    new DataView(p.buffer).setUint32(0,saveChecksum(p));f.payloadPositions.forEach((at,i)=>{f.raw[at]=p[i];});
    const save=await openSave(f.raw),key=save.list()[0].key;
    await assert.rejects(save.exportSrw4CarryoverCopy(key,...parts),/파츠 신원|링크|연결/);
    assert.deepEqual(await save.exportFile(),f.raw,mode);
  }
});

test('the Uint8Array API cannot mutate a caller’s Node Buffer through its aliasing slice',async()=>{
  const f=fixture(),input=Buffer.from(f.raw),save=await openSave(input);
  const {bytes}=await save.exportSrw4CarryoverCopy(save.list()[0].key,...catalogs());
  assert.deepEqual(input,Buffer.from(f.raw));
  assert.deepEqual(await save.exportFile(),f.raw);
  assert.deepEqual(bytes,expected(f,TO));
});
