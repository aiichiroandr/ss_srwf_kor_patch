import test from 'node:test';
import assert from 'node:assert/strict';
import {compressTsr} from '../assets/editor-core.mjs';
import {readScenarioArchive} from '../assets/editor-scenario-archive.mjs';
import {changeSrw4StartScenario,normalizeSrw4StartScenario} from '../assets/editor-srw4-start-image.mjs';
import {departureFixture} from './helpers/srw4-departure.mjs';

const gameId='srwf-final';
const config={version:1,unitIds:[432,433,430,431,434,435,436],aliceEnabled:true,alicePilotId:399,aliceLevel:31};
function body(length,roots=Array(14).fill(56)){
 const bytes=new Uint8Array(length),view=new DataView(bytes.buffer);
 roots.forEach((p,i)=>view.setInt32(i*4,p-i*4));return bytes;
}
async function fixture(){
 const start=body(3000);new DataView(start.buffer).setInt32(8,1975-8);
 start.set([0xbf,0,100,0xbf,3,30,0xe7,3,0xe9,1,255,254],2240);
 start.set([0xbf,0,102,0xbf,3,67,0xe7,3,0xe9,1,255,254],2258);
 start.set([0xd0,2,0,53],2270);
 for(const at of [2237,2255]){start[at]=3;new DataView(start.buffer).setInt16(at+1,2270-at-1);}
 const retention=body(19498,[6027,104,1975,104,2523,2563,548,104,2567,2614,2616,2618,2620,6021]);
 retention.set([0xc2,0x13],2477);
 [80,82,31,33,35,321,37,77,78,79,319,221,222,65535].forEach((id,i)=>new DataView(retention.buffer).setUint16(2479+i*2,id));
 const raws=Array.from({length:89},(_,i)=>i===2?start:i===88?retention:[36,60].includes(i)?departureFixture(i).decoded:body(100));
 const packed=await Promise.all(raws.map(raw=>compressTsr(raw,{completeNearMatches:true})));
 const spans=[];let end=1600;
 for(const bytes of packed){const start=end;end=(start+bytes.length+512+3)&~3;spans.push({start,end,bytes});}
 const bytes=new Uint8Array(end),view=new DataView(bytes.buffer),slots=Array(200).fill(0);
 slots[74]=2;slots[185]=88;slots[133]=36;slots[157]=60;let slot=0;
 for(let i=1;i<88;i++){if([2,36,60].includes(i))continue;while([74,133,157,185].includes(slot))slot++;slots[slot++]=i;}
 slots.forEach((index,i)=>{const span=spans[index];view.setUint32(i*8,span.start-i*8);view.setUint32(i*8+4,span.end-i*8);});
 spans.forEach(span=>bytes.set(span.bytes,span.start));
 return bytes;
}

test('archive writer preserves every other body and directory, reopens all four exact templates and stays idempotent',async()=>{
 const source=await fixture(),original=readScenarioArchive(source,gameId),written=await changeSrw4StartScenario(source,config,{gameId});
 const after=readScenarioArchive(written.bytes,gameId);
 assert.deepEqual(written.bytes.slice(0,1600),source.slice(0,1600));
 for(let i=0;i<89;i++)if(![2,36,60,88].includes(i))assert.deepEqual(after.bodies[i].decoded,original.bodies[i].decoded);
 const normalized=await normalizeSrw4StartScenario(written.bytes,{gameId});assert.deepEqual(normalized.config,config);
 const restored=readScenarioArchive(normalized.bytes,gameId);
 for(let i=0;i<89;i++)assert.deepEqual(restored.bodies[i].decoded,original.bodies[i].decoded);
 assert.equal((await changeSrw4StartScenario(written.bytes,config,{gameId})).bytes,written.bytes);
 const removed=await changeSrw4StartScenario(written.bytes,null,{gameId});
 assert.equal((await normalizeSrw4StartScenario(removed.bytes,{gameId})).config,null);
});

test('any missing initial/retention/departure template is rejected; F and stock archives are unchanged',async()=>{
 const source=await fixture(),written=await changeSrw4StartScenario(source,config,{gameId}),archive=readScenarioArchive(source,gameId);
 for(const index of [2,36,60,88]){
  const bad=written.bytes.slice(),span=archive.bodies[index];bad.set(source.subarray(span.start,span.end),span.start);
  await assert.rejects(normalizeSrw4StartScenario(bad,{gameId}),{code:'EDITOR_SRW4_START_INVALID'});
 }
 for(const options of [{gameId:'srwf-f'},{gameId,scenarioLayout:'stock'}]){
  assert.equal((await normalizeSrw4StartScenario(source,options)).bytes,source);
  assert.equal((await changeSrw4StartScenario(source,null,options)).bytes,source);
  await assert.rejects(changeSrw4StartScenario(source,config,options),{code:'EDITOR_SRW4_START_INVALID'});
 }
 const controller=new AbortController();controller.abort();
 await assert.rejects(changeSrw4StartScenario(source,config,{gameId,signal:controller.signal}),{name:'AbortError'});
});
