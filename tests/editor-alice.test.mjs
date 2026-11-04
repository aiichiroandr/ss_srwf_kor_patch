import test from 'node:test';
import assert from 'node:assert/strict';
import {readAlicePilot,writeAlicePilot,aliceAvailable,alicePortrait,decorateAlicePilot,ALICE_ART} from '../assets/editor-alice.mjs';
import {buildPreset,parsePreset,planPresetApplication,applyPresetPlan} from '../assets/editor-preset.mjs';
function source(){
 const b=new Uint8Array(12000),v=new DataView(b.buffer),relative=(cell,to)=>v.setInt32(cell,to-cell);
 relative(8,8000);v.setUint32(8000,2736);
 relative(48,200);relative(52,2000);relative(112,4000);v.setUint32(4000,1600);
 relative(4000+399*4,6100);relative(4000+246*4,6000);
 relative(200+399*4,6300);relative(2000+399*4,6310);b[6300]=b[6310]=255;
 b.set(Uint8Array.from('00000000ff4460602f444404c800c803e703e703e703e700010000'.match(/../g),h=>parseInt(h,16)),6100);
 b.set(Uint8Array.from({length:23},(_,i)=>i===0?0x30:i===1?247:i),6000);
 return b;
}
test('ALICE writes a distinct pilot/face and two ordinary name fields, without painting text into the portrait',()=>{
 const before=source(),after=writeAlicePilot(before,true),read=readAlicePilot(after);
 // New registrations use the pointer form: #399 keeps its reserved record and
 // its table cell points at a new record after the original data.
 assert.equal(read.enabled,true);assert.deepEqual(read.decoded,before);assert.equal(after.length,before.length+2844);
 assert.equal(new TextDecoder().decode(after.subarray(-16,-8)),'SRWALC02');
 const record=before.length+46,v=new DataView(after.buffer);
 assert.equal(4000+399*4+v.getInt32(4000+399*4),record);assert.equal(((after[record]&1)<<8)|after[record+1],342);
 assert.deepEqual(after.subarray(before.length+40,before.length+46),Uint8Array.from([0x16,0x21,0x1e,0x18,0x1a,255]));
 const changed=after.subarray(0,before.length).reduce((a,x,i)=>x!==before[i]?[...a,i]:a,[]);
 assert.ok(changed.length&&changed.every(i=>i>=8&&i<12||i>=1796&&i<1800||i>=3596&&i<3600||i>=5596&&i<5600));
 assert.equal(aliceAvailable(before,'srwf-final',ALICE_ART.baseSha256),true);
 assert.equal(aliceAvailable(before,'srwf-f',ALICE_ART.baseSha256),false);
 assert.equal(aliceAvailable(before,'srwf-final','unknown'),false);
 const image=alicePortrait();assert.deepEqual([image.width,image.height,image.pixels.length],[40,40,6400]);
 assert.ok(image.pixels.every((v,i)=>i%4===3?v===255:v%8===0));
 assert.equal(new Set(Array.from({length:1600},(_,i)=>image.pixels.slice(i*4,i*4+3).join(','))).size,11);
 assert.equal(decorateAlicePilot({recordIndex:10,name:'기존'},true).name,'기존');
 assert.equal(decorateAlicePilot({recordIndex:399},true).name,'ALICE');
});
test('occupied slots, malformed registrations and arbitrary replacement portrait IDs are rejected',()=>{
 const b=source(),occupied=b.slice();occupied[6100]=1;assert.throws(()=>writeAlicePilot(occupied,true),e=>e.code==='EDITOR_ALICE_INVALID');
 assert.throws(()=>writeAlicePilot(b,true,'srwf-f'));
 for(const at of [6101,b.length+12,b.length+20,writeAlicePilot(b,true).length-1]){const edited=writeAlicePilot(b,true);edited[at]^=1;assert.throws(()=>readAlicePilot(edited),e=>e.code==='EDITOR_ALICE_INVALID');}
 assert.deepEqual(writeAlicePilot(b,false),b);
});
test('the native FACE mirror remains word-aligned after other variable-length name edits',()=>{
 for(let extra=0;extra<4;extra++){
  const before=new Uint8Array(source().length+extra);before.set(source());
  const after=writeAlicePilot(before,true),v=new DataView(after.buffer),at=8+v.getInt32(8);
  assert.equal(at%4,0);assert.equal(v.getUint32(at),2744);
  assert.deepEqual(readAlicePilot(after).decoded,before);
  const disabled=writeAlicePilot(before,false,'srwf-final',{faceInstalled:true});
  assert.equal(readAlicePilot(disabled).faceInstalled,true);assert.equal(readAlicePilot(disabled).enabled,false);
 }
});
test('ALICE registration is a reversible, optional preset change and never renames a stock pilot',()=>{
 const row={recordIndex:1,name:'ALICE 이름·초상',enabled:1,editable:true,original:{enabled:0}};
 const preset=buildPreset({gameId:'srwf-final'},{alice:[row]});
 assert.deepEqual(preset.aiPilots[0].fields,{enabled:{from:0,to:1}});
 const parsed=parsePreset(JSON.stringify(preset),{gameId:'srwf-final'});
 const target={...row,enabled:0},session={gameId:'srwf-final',units:[],pilots:[],weapons:[],aiPilots:[target]};
 const plan=planPresetApplication(parsed,session);assert.equal(plan.items.find(x=>x.kind==='alice').status,'apply');
 applyPresetPlan(plan,session,'matching');assert.equal(target.enabled,1);
 const unavailable=planPresetApplication(parsed,{...session,aiPilots:[]});assert.equal(unavailable.items.find(x=>x.kind==='alice').status,'skip');
 const empty=buildPreset({gameId:'srwf-final'},{});assert.equal(Object.hasOwn(empty,'aiPilots'),false);
});

// Hand-built legacy SRWALC01 layout (never published): it overwrote #399 in place.
function legacyV1(b,enabled){
 const headerAt=Math.ceil((b.length+20)/4)*4,tail=headerAt+2744,out=new Uint8Array(tail+16),v=new DataView(out.buffer),src=new DataView(b.buffer);out.set(b);
 const full=200+399*4,short=2000+399*4,nameAt=b.length+12;
 if(enabled){out.set(b.subarray(6000,6023),6100);out[6100]=(out[6100]&0xfe)|(342>>8);out[6101]=342&255;v.setInt32(full,nameAt-full);v.setInt32(short,nameAt-short);}
 v.setInt32(b.length,src.getInt32(full));v.setInt32(b.length+4,src.getInt32(short));v.setInt32(b.length+8,src.getInt32(8));
 out.set([0x16,0x21,0x1e,0x18,0x1a,255],nameAt);out.set(Uint8Array.from(atob(ALICE_ART.faceHeader),c=>c.charCodeAt(0)),headerAt);v.setInt32(8,headerAt-8);
 out.set(new TextEncoder().encode('SRWALC01'),tail);v.setUint32(tail+8,b.length);v.setUint32(tail+12,Number(enabled));return out;
}
test('a legacy SRWALC01 registration is recognised and re-saved as is, but cannot be removed',()=>{
 const before=source(),stored=legacyV1(before,true),read=readAlicePilot(stored);
 assert.equal(read.enabled,true);assert.equal(read.legacy,true);assert.equal(read.faceInstalled,true);
 assert.deepEqual(read.decoded.subarray(6100,6104),new Uint8Array(4));assert.deepEqual(read.decoded.subarray(6104,6123),before.subarray(6004,6023));
 assert.deepEqual(read.decoded.subarray(0,6100),before.subarray(0,6100));assert.deepEqual(read.decoded.subarray(6123),before.subarray(6123));
 assert.equal(aliceAvailable(read.decoded,'srwf-final',ALICE_ART.baseSha256),true);
 assert.deepEqual(writeAlicePilot(read.decoded,true),stored,'re-saving keeps the legacy bytes exactly');
 const fixed=e=>e.code==='EDITOR_ALICE_INVALID'&&/원본 파일럿 기록이 없어/.test(e.message);
 assert.throws(()=>writeAlicePilot(read.decoded,false,'srwf-final',{faceInstalled:true}),fixed);
 assert.throws(()=>writeAlicePilot(read.decoded,false),fixed);
 assert.throws(()=>writeAlicePilot(read.decoded,true,'srwf-final',{version:2,crew:{enabled:false,spBase:25,spirits:Array.from({length:6},()=>({id:0,level:0})),unitIds:[]}}),fixed);
 for(const at of [6100,6110,6125,stored.length-1]){const bad=stored.slice();bad[at]^=1;assert.throws(()=>readAlicePilot(bad),e=>e.code==='EDITOR_ALICE_INVALID');}
});
test('a legacy face-only SRWALC01 image restores its base and is re-saved in the pointer form',()=>{
 const before=source(),stored=legacyV1(before,false),read=readAlicePilot(stored);
 assert.equal(read.enabled,false);assert.equal(read.faceInstalled,true);assert.deepEqual(read.decoded,before);
 const resaved=writeAlicePilot(read.decoded,false,'srwf-final',{faceInstalled:true});
 assert.equal(new TextDecoder().decode(resaved.subarray(-16,-8)),'SRWALC02');
 assert.equal(readAlicePilot(resaved).faceInstalled,true);assert.deepEqual(readAlicePilot(resaved).decoded,before);
 assert.deepEqual(writeAlicePilot(read.decoded,true),writeAlicePilot(before,true),'turning ALICE on writes the pointer form');
});
