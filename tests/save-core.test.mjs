import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync,gunzipSync } from 'node:zlib';
import {openSave,saveChecksum} from '../assets/save-core.mjs';
import {syntheticSave} from './helpers/synthetic-save.mjs';

test('fragmented cartridge: edit, checksum, exact unrelated bytes, reset',async()=>{
  const {raw,payloadPositions}=syntheticSave(),source=raw.slice();const s=await openSave(raw);
  assert.equal(s.list().length,2);const r=s.list().find(r=>r.editable);assert.equal(r.pilots[0].id,74);assert.equal(r.pilots[0].level,30);
  s.edit(r.key,'level',7,0);s.edit(r.key,'experience',499,0);s.edit(r.key,'money',999999);
  assert.equal(s.diff().length,3);const out=await s.exportFile();const allowed=new Set([...payloadPositions.slice(0,4),...payloadPositions.slice(10,13),payloadPositions[0x1002],...payloadPositions.slice(0x1004,0x1006)]);
  out.forEach((v,i)=>{if(!allowed.has(i))assert.equal(v,source[i],`unexpected byte ${i}`);});
  assert.deepEqual(raw,source);const again=await openSave(out);const next=again.list().find(r=>r.editable);assert.equal(next.pilots[0].level,7);assert.equal(next.money,999999);
  const payload=Uint8Array.from(payloadPositions,p=>out[p]);assert.equal(new DataView(payload.buffer).getUint32(0),saveChecksum(payload));
  s.reset();assert.deepEqual(await s.exportFile(),source);assert.equal(s.diff().length,0);
});
test('F and Final namespaces share verified cartridge record ABI',async()=>{
  for(const [name,game] of [['SROBOT_F_32','srwf-f'],['SROBOTFC_02','srwf-final']]){const s=await openSave(syntheticSave({name}).raw);assert.equal(s.list()[0].gameId,game);assert.equal(s.list()[0].pilots[0].experience,321);}
});

test('saved hero faces use the selection words and remain read-only during edits',async()=>{
 for(const name of ['SROBOT_F_32','SROBOTFC_02']){
  const f=syntheticSave({name}),view=new DataView(f.payload.buffer);
  view.setUint16(0x34,(317<<7)|0x6f);view.setUint16(0x38,(305<<7)|17);
  view.setUint32(0,saveChecksum(f.payload));f.payloadPositions.forEach((p,i)=>f.raw[p]=f.payload[i]);
  const original=f.raw.slice(),s=await openSave(f.raw),r=s.list().find(r=>r.editable);
  assert.deepEqual(r.heroFaceIds,{302:305,303:317});assert.ok(Object.isFrozen(r.heroFaceIds));
  assert.deepEqual(await s.exportFile(),original);
  s.edit(r.key,'level',31,0);
  assert.deepEqual(s.list().find(v=>v.key===r.key).heroFaceIds,r.heroFaceIds);
  const out=await s.exportFile();
  for(let i=0x34;i<0x5e;i++)assert.equal(out[f.payloadPositions[i]],original[f.payloadPositions[i]]);
 }
});
test('gzip layers and Ymir interleaved bytes round-trip',async()=>{
  const {raw}=syntheticSave();const lane=new Uint8Array(raw.length*2).fill(255);raw.forEach((v,i)=>lane[i*2+1]=v);
  const input=new Uint8Array(gzipSync(gzipSync(lane))),s=await openSave(input);assert.equal(s.format.gzipLayers,2);assert.equal(s.format.interleaved,true);
  assert.deepEqual(await s.exportFile(),input);s.edit(2,'level',29,0);const result=await s.exportFile();const decoded=gunzipSync(gunzipSync(result));
  for(let i=0;i<decoded.length;i+=2)assert.equal(decoded[i],255);
  assert.equal((await openSave(result)).list()[0].pilots[0].level,29);
});
test('larger Ymir cartridges and short blocks use chained allocation lists',async()=>{
  for(const [size,blockSize] of [[0x8000,64],[0x100000,512],[0x200000,512],[0x400000,1024]]){const s=await openSave(syntheticSave({size,blockSize}).raw);s.edit(2,'level',24,0);assert.equal((await openSave(await s.exportFile())).list()[0].pilots[0].level,24);}
});
test('bad checksum is read-only, never silently repaired',async()=>{
  const f=syntheticSave();f.raw[f.payloadPositions[10]]^=1;const s=await openSave(f.raw);assert.equal(s.list()[0].editable,false);assert.throws(()=>s.edit(2,'money',1));assert.deepEqual(await s.exportFile(),f.raw);
});
test('reject cycles, reserved/out-of-range blocks, overlaps and unknown format',async()=>{
  for(const ref of [1,2,65535]){const f=syntheticSave();f.raw[2*512+34]=ref>>>8;f.raw[2*512+35]=ref&255;await assert.rejects(openSave(f.raw));}
  const f=syntheticSave();f.raw[2*512+34]=0;f.raw[2*512+35]=3;await assert.rejects(openSave(f.raw));
  await assert.rejects(openSave(new Uint8Array(0x80000)));await assert.rejects(openSave(new Uint8Array(20)));
});
test('strict values, empty pilot slots, and other games cannot be written',async()=>{
  const s=await openSave(syntheticSave().raw);
  for(const n of [-1,0,100,1.5,NaN,'30'])assert.throws(()=>s.edit(2,'level',n,0));
  assert.throws(()=>s.edit(2,'level',30,1));assert.throws(()=>s.edit(3,'money',1));assert.throws(()=>s.edit(2,'id',8,0));assert.throws(()=>s.edit(2,'money',0x1000000));
  assert.equal(s.diff().length,0);s.edit(2,'level',7,0);s.edit(2,'level',30,0);assert.equal(s.diff().length,0);
});

const unitCatalog=gameId=>({gameId,units:[{recordIndex:23,partSlots:2,weaponList:{status:'known',entries:[{slot:1},{slot:2},{slot:16}]}}]});
test('added units remain bound to their verified ROM form when the live catalog changes',async()=>{
 const f=syntheticSave(),unit={recordIndex:430,identity:'unit:430',construction:{preset:'s-gundam'},saveUnitKind:1,saveUnitForm:0,constructionGroupRoot:430,hp:4000,en:180};
 const catalog={gameId:'srwf-final',units:[unit]},s=await openSave(f.raw,catalog);s.addUnit(2,430);
 const output=await s.exportFile();assert.ok((await openSave(output)).list()[0].units.some(u=>u.id===430));
 s.updateCatalog({gameId:'srwf-final',units:[]});await assert.rejects(s.exportFile(),/ROM 구성이 바뀌/);
 s.updateCatalog({...catalog,units:[{...unit,construction:{preset:'sirbine'}}]});await assert.rejects(s.exportFile(),/ROM 구성이 바뀌/);
 s.updateCatalog(catalog);assert.deepEqual(await s.exportFile(),output);
 s.reset();s.updateCatalog({gameId:'srwf-final',units:[]});assert.deepEqual(await s.exportFile(),f.raw);
});
test('refreshing the ROM catalog keeps pending edits and the original reset baseline',async()=>{
  const {raw}=syntheticSave();const s=await openSave(raw,unitCatalog('srwf-final'));
  s.edit(2,'level',31,0);const diff=s.diff();
  s.updateCatalog({gameId:'srwf-final',units:[{recordIndex:23,name:'한글 기체',partSlots:4,weaponList:{status:'known',entries:[{slot:1}]}}]});
  assert.deepEqual(s.diff(),diff);assert.equal(s.list()[0].pilots[0].level,31);
  s.editUnit(2,'parts',1,0,3);assert.equal(s.list()[0].units[0].parts[3],1);
  s.reset();assert.deepEqual(await s.exportFile(),raw);
});
test('unit fields: independent packed-byte expectations, all allowed levels, unrelated bits preserved',async()=>{
  for(const [name,gameId,max] of [['SROBOT_F_32','srwf-f',5],['SROBOTFC_02','srwf-final',10]]){
    const f=syntheticSave({name,upgradeUnlocked:gameId==='srwf-final'});
    f.payload.fill(0xa5,0x102,0x11e);
    new DataView(f.payload.buffer).setUint32(0,saveChecksum(f.payload));
    f.payloadPositions.forEach((p,i)=>f.raw[p]=f.payload[i]);
    const s=await openSave(f.raw,unitCatalog(gameId));
    const u=s.list()[0].units[0];
    assert.equal(u.hpUpgrade,11);assert.equal(u.enUpgrade,4);assert.equal(u.armorUpgrade,11);assert.equal(u.limitUpgrade,4);assert.equal(u.mobilityUpgrade,11);
    assert.deepEqual(u.weaponUpgrades,[10,5,10,5,10,5,10,5,10,5,10,5,10,5,10,5]);
    const cases=[['hpUpgrade',3,0x07,4,0x80],['enUpgrade',4,0x78,null,0],['armorUpgrade',4,0x07,5,0x80],['limitUpgrade',5,0x78,null,0],['mobilityUpgrade',5,0x07,6,0x80]];
    for(const [field,offset,mask,second,secondMask] of cases)for(let value=0;value<=max;value++){
      s.reset();s.editUnit(2,field,value,0);
      const expected=f.payload.slice();
      expected[0x100+offset]=(expected[0x100+offset]&~mask)|(second===null?value<<3:value>>1);
      if(second!==null)expected[0x100+second]=(expected[0x100+second]&~secondMask)|((value&1)<<7);
      new DataView(expected.buffer).setUint32(0,saveChecksum(expected));
      const out=await s.exportFile();const actual=Uint8Array.from(f.payloadPositions,p=>out[p]);assert.deepEqual(actual,expected,field);
      const again=await openSave(out,unitCatalog(gameId));assert.equal(again.list()[0].units[0][field],value);
      if(value!==u[field])assert.equal(s.diff()[0].type,'unit');
      const allowed=new Set(f.payloadPositions);out.forEach((v,i)=>{if(!allowed.has(i))assert.equal(v,f.raw[i]);});
    }
    s.reset();assert.deepEqual(await s.exportFile(),f.raw);
  }
});
test('weapon slots, equipped parts, diff and checksum round-trip',async()=>{
  const f=syntheticSave({upgradeUnlocked:true}),s=await openSave(f.raw,unitCatalog('srwf-final'));
  s.editUnit(2,'weaponUpgrades',8,0,0);s.editUnit(2,'weaponUpgrades',9,0,1);s.editUnit(2,'weaponUpgrades',10,0,15);
  s.editUnit(2,'parts',22,0,0);s.editUnit(2,'parts',3,0,1);
  const out=await s.exportFile(),actual=Uint8Array.from(f.payloadPositions,p=>out[p]);
  assert.equal(actual[0x107],0x89);assert.equal(actual[0x10e],10);assert.equal(actual[0x111],22);assert.equal(actual[0x112],3);
  assert.deepEqual(s.diff().map(d=>[d.field,d.index,d.after]),[['weaponUpgrades',0,8],['weaponUpgrades',1,9],['weaponUpgrades',15,10],['parts',0,22],['parts',1,3]]);
  const next=(await openSave(out)).list()[0];assert.equal(next.editable,true);assert.deepEqual(next.units[0].parts,[22,3,0,0]);assert.deepEqual(next.pilots,s.list()[0].pilots);
  const allowed=new Set([0,1,2,3,0x107,0x10e,0x111,0x112].map(i=>f.payloadPositions[i]));out.forEach((v,i)=>{if(!allowed.has(i))assert.equal(v,f.raw[i]);});
});
test('unit writes fail closed without matching ROM catalog and valid slot/field/range',async()=>{
  const f=syntheticSave({upgradeUnlocked:true}),s=await openSave(f.raw,unitCatalog('srwf-final'));
  for(const args of [['id',24,0],['hpUpgrade',11,0],['hpUpgrade',2,1],['weaponUpgrades',3,0,2],['weaponUpgrades',3,0,16],['parts',23,0,0],['parts',1,0,2],['parts',1.5,0,0]])assert.throws(()=>s.editUnit(2,...args));
  for(const c of [{},unitCatalog('srwf-f')]){const locked=await openSave(f.raw,c);assert.throws(()=>locked.editUnit(2,'hpUpgrade',1,0));}
  assert.equal(s.diff().length,0);
});
test('early 10-stage unlock changes only its bit and checksum, original mode preserves edited levels',async()=>{
  const f=syntheticSave(),s=await openSave(f.raw,unitCatalog('srwf-final'));
  assert.equal(s.list()[0].upgradeLimit,5);assert.throws(()=>s.editUnit(2,'hpUpgrade',6,0));
  s.setUpgradeMode(2,'early10');assert.equal(s.list()[0].upgradeLimit,10);
  const out=await s.exportFile(),allowed=new Set([0,1,2,3,0x9c].map(i=>f.payloadPositions[i]));
  out.forEach((v,i)=>{if(!allowed.has(i))assert.equal(v,f.raw[i]);});assert.equal(out[f.payloadPositions[0x9c]],8);
  assert.equal((await openSave(out)).list()[0].upgradeLimit,10);
  s.editUnit(2,'hpUpgrade',10,0);s.setUpgradeMode(2,'original');assert.equal(s.list()[0].upgradeLimit,5);assert.equal(s.list()[0].units[0].hpUpgrade,10);
  assert.throws(()=>s.editUnit(2,'enUpgrade',10,0));s.reset();assert.deepEqual(await s.exportFile(),f.raw);
  const unlocked=await openSave(syntheticSave({upgradeUnlocked:true}).raw);unlocked.setUpgradeMode(2,'original');assert.equal(unlocked.list()[0].upgradeLimit,10);assert.equal(unlocked.diff().length,0);
  const fGame=await openSave(syntheticSave({name:'SROBOT_F_32'}).raw);assert.throws(()=>fGame.setUpgradeMode(2,'early10'));
});
test('add unit uses empty slot, leaves pilots and existing units untouched, supports subsequent edits/reset',async()=>{
  const f=syntheticSave(),catalog=unitCatalog('srwf-final');
  catalog.units.push({recordIndex:100,name:'sample',editable:true,recordKind:'regular',saveUnitKind:0,saveUnitForm:0,hp:3300,en:120,partSlots:2,weaponList:{status:'known',entries:[{slot:1}]}});
  const s=await openSave(f.raw,catalog),added=s.addUnit(2,100);assert.equal(added.slot,1);
  assert.equal(s.diff()[0].field,'unitAdded');assert.throws(()=>s.addUnit(2,100));
  s.editUnit(2,'hpUpgrade',5,1);s.editUnit(2,'parts',1,1,0);
  assert.equal(s.diff().length,3);const out=await s.exportFile();
  const allowed=new Set([...f.payloadPositions.slice(0,4),...f.payloadPositions.slice(0x11e,0x13c)]);
  out.forEach((v,i)=>{if(!allowed.has(i))assert.equal(v,f.raw[i]);});
  const bytes=Uint8Array.from(f.payloadPositions,p=>out[p]),p=0x11e;
  assert.equal(bytes[p+2],64);assert.equal(bytes[p+15],255);assert.equal(bytes[p+16],255);assert.equal(bytes[p+26],255);
  assert.equal(bytes[p+22]*256+bytes[p+23],3300);assert.equal(bytes[p+24]*256+bytes[p+25],120);
  const read=(await openSave(out)).list()[0];assert.equal(read.editable,true);assert.equal(read.units[1].id,100);assert.equal(read.units[1].hpUpgrade,5);
  s.reset();assert.deepEqual(await s.exportFile(),f.raw);
  for(const kind of [6,8,9]){catalog.units[1].saveUnitKind=kind;const locked=await openSave(f.raw,catalog);assert.throws(()=>locked.addUnit(2,100));}
});
test('multiple same-game slots are independently editable and untouched slots stay byte-identical',async()=>{
  const a=syntheticSave({foreign:false}),b=syntheticSave({name:'SROBOTFC_02',foreign:false});
  const shift=40,bs=512,raw=a.raw.slice();
  for(const block of b.blocks)raw.set(b.raw.subarray(block*bs,(block+1)*bs),(block+shift)*bs);
  b.blocks.slice(1).forEach((block,i)=>{const p=(2+shift)*bs+34+i*2;raw[p]=(block+shift)>>>8;raw[p+1]=(block+shift)&255;});
  const s=await openSave(raw,unitCatalog('srwf-final'));assert.equal(s.list().length,2);
  s.setUpgradeMode(2,'early10');s.editUnit(2,'hpUpgrade',10,0);s.edit(42,'level',28,0);
  assert.equal(s.list()[0].upgradeLimit,10);assert.equal(s.list()[1].upgradeLimit,5);
  s.reset(42);const out=await s.exportFile();for(const block of b.blocks)assert.deepEqual(out.subarray((block+shift)*bs,(block+shift+1)*bs),raw.subarray((block+shift)*bs,(block+shift+1)*bs));
});
