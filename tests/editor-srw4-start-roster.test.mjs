import test from 'node:test';
import assert from 'node:assert/strict';
import {applySrw4StartRosterBody,normalizeSrw4StartRosterBody,makeSrw4StartRosterConfig,SRW4_START_PRESETS} from '../assets/editor-srw4-start-roster.mjs';

function fixture(){
 const decoded=new Uint8Array(3000),v=new DataView(decoded.buffer),roots=Array(14).fill(56);roots[2]=1975;
 roots.forEach((n,i)=>v.setInt32(i*4,n-i*4));
 decoded.set([0xbf,0,100,0xbf,3,30,0xe7,3,0xe9,1,255,254],2240);
 decoded.set([0xbf,0,102,0xbf,3,67,0xe7,3,0xe9,1,255,254],2258);
 decoded.set([0xd0,2,0,53],2270);
 for(const p of [2237,2255]){decoded[p]=3;v.setInt16(p+1,2270-p-1);}
 return {decoded,roots,slots:[74],physicalIndex:2};
}
function rows(){return SRW4_START_PRESETS.map((preset,i)=>({recordIndex:430+i,srw4Native:true,construction:{preset},...(i<4?{saveUnitKind:1,saveUnitForm:i%2,constructionGroupRoot:i<2?430:432}:{})}));}
const config=enabled=>makeSrw4StartRosterConfig(rows(),{gameId:'srwf-final',aliceEnabled:enabled});
// This is a bounded model of the authored VM sequence, not an emulator or a
// claim of native gameplay. Preserve payload-like row objects to detect writes
// to existing owners, upgrade values, pilot assignments and SP.
function run(body,state,hook=2237){
 const b=body.decoded,v=new DataView(b.buffer,b.byteOffset,b.byteLength);let pc=hook+1+v.getInt16(hook+1),found=false,steps=0,originalCalls=0;
 while(++steps<100){
  if(b[pc]===3){assert.equal(pc+1+v.getInt16(pc+1),2270);originalCalls++;pc+=3;}
  else if(b[pc]===0xc0){assert.equal(b[pc+1],13);const id=v.getUint16(pc+3),mode=b[pc+2];assert([0,128].includes(mode));found=(mode?state.units:state.pilots).some(r=>r.id===id);pc+=5;}
  else if(b[pc]===0xf0){assert.equal(b[pc+1],0);pc=found?pc+2+v.getInt16(pc+2):pc+4;}
  else if(b[pc]===0xc2){assert.equal(b[pc+1],4);if(state.units.length<128)state.units.push({id:v.getUint16(pc+2),pilot:255,side:1});pc+=4;}
  else if(b[pc]===0xc1){assert.equal(b[pc+1],6);const packed=v.getUint16(pc+2);if(state.pilots.length<128)state.pilots.push({id:packed&511,level:packed>>>9,subpilot:true});pc+=4;}
  else if(b[pc]===4){assert.equal(originalCalls,1);return;}
  else assert.fail(`unexpected opcode ${b[pc]} at ${pc}`);
 }
 assert.fail('unterminated grant program');
}

test('Final no-save super and real hooks grant five base units and one dedicated ALICE',()=>{
 for(const hook of [2237,2255]){
  const base=fixture(),before=base.decoded.slice(),patched=applySrw4StartRosterBody(base,config(true)),state={units:[{id:1,pilot:5,upgrades:[5,4,3]}],pilots:[{id:303,level:31}]};
  run(patched,state,hook);
  assert.deepEqual(state.units.map(u=>u.id),[1,430,432,434,435,436]);
  assert.deepEqual(state.pilots.at(-1),{id:399,level:31,subpilot:true});
  assert.deepEqual(state.units[0],{id:1,pilot:5,upgrades:[5,4,3]});
  assert.deepEqual(base.decoded,before,'input is immutable');
  const changed=Array.from(before).flatMap((n,i)=>n===patched.decoded[i]?[]:[i]);assert(changed.every(i=>[2238,2239,2256,2257].includes(i)));
 }
});

test('both forms suppress a second grant; repeated entry and modeled save reload preserve current rows and SP',()=>{
 const patched=applySrw4StartRosterBody(fixture(),config(true));
 const state={units:[{id:431,upgrades:[9],pilot:4},{id:433,upgrades:[7],pilot:6}],pilots:[{id:399,level:40,subpilot:true,sp:17}]};
 run(patched,state);const once=structuredClone(state);
 run(patched,state,2255);assert.deepEqual(state,once);
 const reloaded=JSON.parse(JSON.stringify(state));run(patched,reloaded);assert.deepEqual(reloaded,once);
 assert.deepEqual(state.units.map(u=>u.id),[431,433,434,435,436]);
 assert.equal(state.pilots[0].sp,17);
});

test('full roster never overwrites existing rows; partial availability can resume without duplicating grants',()=>{
 const patched=applySrw4StartRosterBody(fixture(),config(true));
 const state={units:Array.from({length:126},(_,i)=>({id:i+1,pilot:i,upgrades:[2]})),pilots:Array.from({length:128},(_,i)=>({id:i+1,level:30}))};
 const before=structuredClone(state);run(patched,state);
 assert.deepEqual(state.units.slice(0,126),before.units);assert.deepEqual(state.pilots,before.pilots);
 assert.deepEqual(state.units.slice(126).map(u=>u.id),[430,432]);
 state.units.splice(0,3);state.pilots.pop();run(patched,state);
 assert.deepEqual(state.units.slice(-5).map(u=>u.id),[430,432,434,435,436]);assert.equal(state.pilots.at(-1).id,399);
});

test('disabled ALICE does not create a pilot and changing the option replaces the exact overlay',()=>{
 const original=fixture(),withAlice=applySrw4StartRosterBody(original,config(true)),without=applySrw4StartRosterBody(withAlice,config(false));
 const state={units:[],pilots:[]};run(without,state);assert.equal(state.units.length,5);assert.equal(state.pilots.length,0);
 assert.deepEqual(without.decoded,applySrw4StartRosterBody(original,config(false)).decoded);
 assert.deepEqual(applySrw4StartRosterBody(withAlice,null).decoded,original.decoded);
});

test('normalization restores exact canonical bytes and reapplication is idempotent',()=>{
 const original=fixture(),c=config(true),written=applySrw4StartRosterBody(original,c),normalized=normalizeSrw4StartRosterBody(written,{gameId:'srwf-final'});
 assert.deepEqual(normalized.body.decoded,original.decoded);assert.deepEqual(normalized.config,c);
 assert.deepEqual(applySrw4StartRosterBody(written,c).decoded,written.decoded);
 assert.deepEqual(normalized.body.roots,original.roots);
 const malformed=structuredClone(written);malformed.decoded[100]^=8;
 assert.equal(normalizeSrw4StartRosterBody(malformed,{gameId:'srwf-final'}).body.decoded[100],8,'unrelated changes remain for canonical provenance to authenticate');
});

test('recognized authored code is exact; missing markers cannot hide changes from canonical provenance',()=>{
 const original=fixture(),written=applySrw4StartRosterBody(original,config(true));
 for(const at of [2237,2238,2239,2255,2256,2257,...Array.from({length:written.decoded.length-original.decoded.length},(_,i)=>original.decoded.length+i)]){
  const bad={...written,decoded:written.decoded.slice()};bad.decoded[at]^=1;
  if(at>=written.decoded.length-32&&at<written.decoded.length-24){const n=normalizeSrw4StartRosterBody(bad,{gameId:'srwf-final'});assert.equal(n.config,null);assert.equal(n.body,bad);assert.notDeepEqual(n.body.decoded,original.decoded);}
  else assert.throws(()=>normalizeSrw4StartRosterBody(bad,{gameId:'srwf-final'}),{code:'EDITOR_SRW4_START_ROSTER_INVALID'},`byte ${at}`);
 }
 const cut={...written,decoded:written.decoded.slice(0,-32)},n=normalizeSrw4StartRosterBody(cut,{gameId:'srwf-final'});assert.equal(n.config,null);assert.equal(n.body,cut);assert.notDeepEqual(n.body.decoded,original.decoded);
});

test('F, another scenario, bad family or occupied hook cannot acquire this overlay',()=>{
 assert.equal(makeSrw4StartRosterConfig(rows(),{gameId:'srwf-f',aliceEnabled:true}),null);
 assert.equal(makeSrw4StartRosterConfig([],{gameId:'srwf-final'}),null);
 assert.throws(()=>applySrw4StartRosterBody(fixture(),config(false),{gameId:'srwf-f'}));
 assert.throws(()=>applySrw4StartRosterBody({...fixture(),slots:[75]},config(false)));
 const bad=rows();bad[1].saveUnitForm=0;assert.throws(()=>makeSrw4StartRosterConfig(bad,{gameId:'srwf-final'}));
 const duplicate=rows();duplicate[6].recordIndex=430;assert.throws(()=>makeSrw4StartRosterConfig(duplicate,{gameId:'srwf-final'}));
 assert.throws(()=>makeSrw4StartRosterConfig(rows().slice(0,6),{gameId:'srwf-final'}));
 const hook=fixture();hook.decoded[2237]=1;assert.throws(()=>applySrw4StartRosterBody(hook,config(false)));
});
