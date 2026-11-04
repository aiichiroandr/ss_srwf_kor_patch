import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeScenarioReinforcementBodyCodec as encode,decodeScenarioReinforcementBodyCodec as decode,normalizeScenarioReinforcementBody,updateScenarioReinforcementBody,inspectScenarioReinforcement} from '../assets/editor-scenario-spawns.mjs';
import {recordTable,unitRecordWithWeapons,pilotRecord} from './helpers/synthetic-tsr.mjs';
import {dataRecordOffsets} from '../assets/editor-core.mjs';
import {sha256Hex} from '../assets/sha256.mjs';

const originalObjective=Uint8Array.of(0xd3,0xfc,0xf2,0,15,0,0,0xd3,0xfb,0xf2,0,11,0,0,0xe9,1,255,240,0xec,1,0xea,0xec,2,0xea);
const rootsOf=bytes=>Array.from({length:14},(_,i)=>i*4+new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getInt32(i*4));
const opened=(body,decoded)=>({...body,decoded,roots:rootsOf(decoded)});
function fixture(){
 const root=[];root[27]={bytes:recordTable([0,1],[0,1].map(()=>unitRecordWithWeapons({graphic:2,hp:3000,en:100,entries:[{slot:1,weapon:1}]})))};
 root[28]={bytes:recordTable([0,1],[0,1].map(id=>pilotRecord({header:[0x30,id,0,1]})))};
 root[29]={bytes:recordTable([0,1],[new Uint8Array(17),new Uint8Array(17)])};
 const decoded=new Uint8Array(160).fill(0xaa),view=new DataView(decoded.buffer);
 for(let i=0;i<14;i++)view.setInt32(i*4,(i===8?80:i===9?120:56)-i*4);
 decoded.set([0xd0,2,0,250,0xf0,0,0,28,0xd0,2,0,241,0xf1,0,0,16],80);
 decoded.set(originalObjective,96);view.setInt16(112,80-112);
 const body={physicalIndex:0,slots:[1,2],decoded,roots:rootsOf(decoded)},context={gameId:'srwf-f',physicalIndex:0,scenarioSlots:[1,2],mapIndex:3,mapPhysicalIndex:2,mapSlots:[3,4],width:32,height:24,identity:'1'.repeat(64)};
 const options={reinforcementRoot:root,reinforcementCapacityRequirements:{pilots:24,units:23,actors:42},unitCount:368,scenarioLayout:'latest',regionContexts:[context]};
 const config={enabled:1,pilotId:1,unitId:1,level:20,triggerX:4,triggerY:5,x:11,y:15};
 return {body,root,context,options,config};
}

test('pure SP04 codec changes only the pending loop and exactly restores its guarded source',()=>{
 const {body,options,config}=fixture(),original=body.decoded.slice(),bytes=encode(body,'srwf-f',config,options);
 assert.equal(bytes.length,original.length+258);assert.deepEqual(rootsOf(bytes),body.roots);
 for(let i=0;i<original.length;i++)if(i<110||i>=114)assert.equal(bytes[i],original[i],`original byte ${i}`);
 assert.deepEqual(bytes.subarray(80,110),original.subarray(80,110));
 assert.deepEqual(bytes.subarray(114,120),original.subarray(114,120));
 assert.equal(111+new DataView(bytes.buffer).getInt16(111),original.length);
 assert.equal(new TextDecoder().decode(bytes.subarray(bytes.length-176,bytes.length-168)),'SRWFSP04');
 const result=decode(opened(body,bytes),'srwf-f',options);
 assert.deepEqual(result.reinforcement,config);assert.deepEqual(result.body.decoded,original);assert.deepEqual(result.body.roots,body.roots);
 assert.equal(result.permissions.pilotLifetime,false);assert.equal(result.permissions.productionWrite,false);
 assert.deepEqual(encode(opened(body,bytes),'srwf-f',config,options),bytes,'same config reproduces every byte');
 assert.deepEqual(encode(opened(body,bytes),'srwf-f',{...config,enabled:0},options),original);
 const changed={...config,level:37,x:19,triggerY:9},next=encode(opened(body,bytes),'srwf-f',changed,options);
 assert.deepEqual(decode(opened(body,next),'srwf-f',options).reinforcement,changed);
 assert.deepEqual(body.decoded,original,'source remains immutable');
});

test('SP04 code and recognized metadata corruption cannot normalize by self-consistency alone',()=>{
 const {body,options,config}=fixture(),bytes=encode(body,'srwf-f',config,options),metadata=bytes.length-176;
 for(const offset of [56,79,128,129,154,171,183,204,223,metadata+8,metadata+12,metadata+16,metadata+18,metadata+19,metadata+20,metadata+21,metadata+22,metadata+24,metadata+26,metadata+27,metadata+28,metadata+29,metadata+30,metadata+31,metadata+32,metadata+64,metadata+96,metadata+128,bytes.length-1]){
  const bad=bytes.slice();bad[offset]^=1;assert.throws(()=>decode(opened(body,bad),'srwf-f',options),`tamper ${offset}`);
 }
 const rooted=bytes.slice();new DataView(rooted.buffer).setInt32(32,81-32);assert.throws(()=>decode(opened(body,rooted),'srwf-f',options),/original root/);
 const extra=new Uint8Array(bytes.length+1);extra.set(bytes);assert.throws(()=>decode(opened(body,extra),'srwf-f',options),/foreign trailing/);
 assert.throws(()=>decode(opened(body,bytes.subarray(0,bytes.length-1)),'srwf-f',options),/truncated/);
});

test('current map aliases, unit/pilot identity and native hash are bound to the codec',()=>{
 const {body,root,context,options,config}=fixture(),bytes=encode(body,'srwf-f',config,options),source=opened(body,bytes);
 assert.throws(()=>decode(source,'srwf-f',{...options,reinforcementCapacityRequirements:undefined}));
 assert.throws(()=>decode(source,'srwf-f',{...options,reinforcementCapacityRequirements:{pilots:1,units:1,actors:1}}),/exact regeneration/);
 for(const map of [{...context,identity:'2'.repeat(64)},{...context,width:31},{...context,scenarioSlots:[1]},{...context,mapIndex:4}])assert.throws(()=>decode(source,'srwf-f',{...options,regionContexts:[map]}));
 assert.throws(()=>decode({...source,slots:[1]},'srwf-f',options));
 assert.throws(()=>decode({...source,physicalIndex:1},'srwf-f',options));
 assert.throws(()=>decode(source,'srwf-f',{...options,reinforcementRoot:undefined}));
 assert.throws(()=>decode(source,'srwf-f',{...options,unitCount:367}));
 for(const index of [27,28]){
  const modified=root.map(entry=>entry?{...entry,bytes:entry.bytes.slice()}:entry),data=modified[index].bytes,table=dataRecordOffsets(data,index===27?48:24);
  data[table.offsets[1]+(index===27?25:1)]^=1;
  assert.throws(()=>decode(source,'srwf-f',{...options,reinforcementRoot:modified}));
 }
 const alternate={...options,regionContexts:undefined,regionContext:context};assert.deepEqual(decode(source,'srwf-f',alternate).reinforcement,config);
});

test('pure codec accepts only the exact bounded config and current F objective shape',()=>{
 const {body,options,config}=fixture();
 for(const edits of [{enabled:2},{pilotId:0},{unitId:512},{level:100},{triggerX:32},{triggerY:24},{x:32},{y:24},{extra:1}])assert.throws(()=>encode(body,'srwf-f',{...config,...edits},options));
 let read=false;const accessor={...config};Object.defineProperty(accessor,'level',{enumerable:true,get(){read=true;return 20;}});assert.throws(()=>encode(body,'srwf-f',accessor,options));assert.equal(read,false);
 assert.throws(()=>encode(body,'srwf-final',config,options));assert.throws(()=>encode(body,'srwf-f',config,{...options,scenarioLayout:'stock'}));
 const unknown=body.decoded.slice();unknown[110]=0xea;assert.throws(()=>encode(opened(body,unknown),'srwf-f',config,options));
 const large=new Uint8Array(0x8000-257);large.set(body.decoded);assert.throws(()=>encode(opened(body,large),'srwf-f',config,options),/RAM boundary/);
 const old=new Uint8Array(body.decoded.length+32);old.set(body.decoded);old.set(new TextEncoder().encode('SRWFSP01'),body.decoded.length);
 assert.throws(()=>decode(opened(body,old),'srwf-f',options),/old SRWFSP01/);
 const old2=new Uint8Array(body.decoded.length+160);old2.set(body.decoded);old2.set(new TextEncoder().encode('SRWFSP02'),body.decoded.length);assert.throws(()=>decode(opened(body,old2),'srwf-f',options),/old SRWFSP02/);assert.throws(()=>normalizeScenarioReinforcementBody(opened(body,old2),'srwf-f',options));
});

test('production rejects synthetic codecs without the pinned source contract',()=>{
 const {body,options,config}=fixture(),bytes=encode(body,'srwf-f',config,options);
 assert.equal(inspectScenarioReinforcement(body,'srwf-f',options),null);
 assert.throws(()=>inspectScenarioReinforcement(opened(body,bytes),'srwf-f',options),{code:'EDITOR_REINFORCEMENT_INVALID'});
 assert.throws(()=>updateScenarioReinforcementBody(body,'srwf-f',config,{...options,authorization:true}),{code:'EDITOR_REINFORCEMENT_INVALID'});
 assert.throws(()=>normalizeScenarioReinforcementBody(opened(body,bytes),'srwf-f',options),{code:'EDITOR_REINFORCEMENT_INVALID'});
 assert.throws(()=>updateScenarioReinforcementBody(opened(body,bytes),'srwf-f',{...config,enabled:0},options),{code:'EDITOR_REINFORCEMENT_INVALID'});
 assert.deepEqual(updateScenarioReinforcementBody(body,'srwf-f',{...config,enabled:0},options),body.decoded);
 // A malicious party can recalculate its own source receipt. The pure codec
 // is not an immutable image verifier; the production gate still rejects it.
 const hostile=body.decoded.slice();hostile.set([0xc1,3],56);
 const forged=encode(opened(body,hostile),'srwf-f',config,options),parsed=decode(opened(body,forged),'srwf-f',options);
 assert.notEqual(sha256Hex(parsed.body.decoded),sha256Hex(body.decoded));assert.equal(parsed.permissions.pilotLifetime,false);
 assert.throws(()=>normalizeScenarioReinforcementBody(opened(body,forged),'srwf-f',options),{code:'EDITOR_REINFORCEMENT_INVALID'});
});
