import test from 'node:test';
import assert from 'node:assert/strict';
import {applySrw4RosterDepartureBody as apply,normalizeSrw4RosterDepartureBody as normalize} from '../assets/editor-srw4-roster-departure.mjs';
import {departureFixture} from './helpers/srw4-departure.mjs';
const gameId='srwf-final',unitIds=[430,431,432,433,434,435,436];
// Execute the emitted branch grammar, modeling only the independently tested
// native query/destructor contract. This is not a gameplay/saving test.
function trace(b,at,unitId,{present=true,stale=430}={}){
 const view=new DataView(b.buffer,b.byteOffset,b.byteLength),target=p=>p+view.getInt16(p);let pc=at,value=stale,success=false;const removals=[];
 for(let step=0;step<30;step++){
  if(pc===at+4)return removals;
  if(b[pc]===1){pc=target(pc+1);continue;}
  if(b[pc]===0xc0&&b[pc+1]===0x0b){success=present&&unitId!==null;if(success)value=unitId;pc+=4;continue;}
  if(b[pc]===0xf1){pc=!success?target(pc+2):pc+4;continue;}
  if(b[pc]===0xf2){pc=value===view.getUint16(pc+3)?target(pc+1):pc+5;continue;}
  if(b[pc]===0xc1&&b[pc+1]===2){removals.push(view.getUint16(pc+2));pc+=4;continue;}
  assert.fail(`unexpected command ${pc}`);
 }assert.fail('departure did not return');
}
for(const physical of [36,60])test(`bounded departure guards for body ${physical} preserve only a present authored form`,()=>{
 const source=departureFixture(physical),before=source.decoded.slice(),patched=apply(source,{unitIds},{gameId});
 const sites=physical===36?[[5003,28]]:[[3768,22],[3797,26],[3868,22]];
 for(const [at,pilot]of sites){
  for(const id of unitIds)assert.deepEqual(trace(patched.decoded,at,id),[0x8000|pilot]);
  for(const id of [1,128,429,437,511,null])assert.deepEqual(trace(patched.decoded,at,id),[pilot]);
  assert.deepEqual(trace(patched.decoded,at,430,{present:false,stale:430}),[pilot]);
 }
 assert.deepEqual(source.decoded,before);assert.deepEqual(normalize(patched,{gameId}).body.decoded,before);
 assert.deepEqual(normalize(patched,{gameId}).config,{unitIds});assert.equal(apply(patched,{unitIds},{gameId}),patched);
 const allowed=new Set(sites.flatMap(([at])=>[at,at+1,at+2]));for(let i=0;i<before.length;i++)if(!allowed.has(i))assert.equal(patched.decoded[i],before[i]);
 const ids=unitIds.map(n=>n+10),updated=apply(patched,{unitIds:ids},{gameId});assert.deepEqual(normalize(updated,{gameId}).config,{unitIds:ids});assert.equal(updated.decoded.length,patched.decoded.length);
});
test('departure normalization cannot bless changed programs, redirects, source context or malformed configuration',()=>{
 const source=departureFixture(),patched=apply(source,{unitIds},{gameId});
 for(const at of [3768,3769,3771,3201,13378,13378+6,13378+11,13378+48,patched.decoded.length-1]){
  const decoded=patched.decoded.slice();decoded[at]^=1;
  assert.throws(()=>normalize({...patched,decoded},{gameId}),{code:'EDITOR_SRW4_DEPARTURE_INVALID'});
 }
 for(const body of [{...source,slots:[158]},{...source,physicalIndex:59}])assert.throws(()=>apply(body,{unitIds},{gameId}),{code:'EDITOR_SRW4_DEPARTURE_INVALID'});
 assert.throws(()=>apply(source,{unitIds},{gameId:'srwf-f'}),{code:'EDITOR_SRW4_DEPARTURE_INVALID'});
 assert.throws(()=>apply(source,{unitIds:[430]},{gameId}),{code:'EDITOR_SRW4_DEPARTURE_INVALID'});
 const changed=source.decoded.slice();changed[3772]^=1;assert.throws(()=>apply({...source,decoded:changed},{unitIds},{gameId}),{code:'EDITOR_SRW4_DEPARTURE_INVALID'});
 const unmarked={...patched,decoded:patched.decoded.slice(0,-1)};assert.equal(normalize(unmarked,{gameId}).config,null);
});
