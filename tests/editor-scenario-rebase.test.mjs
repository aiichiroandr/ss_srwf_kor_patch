import test from 'node:test';
import assert from 'node:assert/strict';
import {validateScenarioRebase,readScenarioArchive} from '../assets/editor-scenario-archive.mjs';
import {makeScenarioArchive} from './helpers/synthetic-scenario.mjs';
import {packGreedy} from './helpers/synthetic-iso.mjs';

function fixture() {
 const raw=makeScenarioArchive('srwf-f').raw, packed=packGreedy(raw), start=74*8;
 const mid=(start+packed.length+128+3)&~3,end=mid+packed.length+128,src=new Uint8Array(end),view=new DataView(src.buffer);
 for(let slot=0;slot<74;slot++){const cell=slot*8,s=slot===73?mid:start,e=slot===73?end:mid;view.setUint32(cell,s-cell);view.setUint32(cell+4,e-cell-4)}
 src.set(packed,start);src.set(packed,mid);
 const out=src.slice(),dv=new DataView(out.buffer),next=mid+4;
 out.fill(0,mid,end);out.set(packed,next);
 for(let slot=0;slot<73;slot++)dv.setUint32(slot*8+4,next-slot*8-4);
 dv.setUint32(73*8,next-73*8);
 const before={scenario:{immutableCarrierSha256:'base',bodies:[{immutable:'a'},{immutable:'b'}]},maps:{pinned:'m'}};
 const after=structuredClone(before);after.scenario.immutableCarrierSha256='changed';
 return {src,out,before,after};
}
test('authenticated scenario rebase preserves aliases and rejects unrelated changes',()=>{
 const {src,out,before,after}=fixture(),valid=()=>validateScenarioRebase(src,out,before,after,'srwf-f');
 assert.equal(readScenarioArchive(src,'srwf-f').bodies.length,2);
 assert.equal(valid().growth,4);
 const forged=structuredClone(after);forged.scenario.bodies[1].immutable='other';
 assert.throws(()=>validateScenarioRebase(src,out,before,forged,'srwf-f'));
 const bad=out.slice();bad[0]^=1;assert.throws(()=>validateScenarioRebase(src,bad,before,after,'srwf-f'));
 assert.throws(()=>validateScenarioRebase(src,out,before,after,'srwf-final'));
 assert.throws(()=>validateScenarioRebase(src,out,before,null,'srwf-f'));
 // Changing only one end boundary is not the supported two-body shape.
 const partial=src.slice(),pv=new DataView(partial.buffer);
 for(let slot=0;slot<73;slot++)pv.setUint32(slot*8+4,pv.getUint32(slot*8+4)-1);
 assert.throws(()=>validateScenarioRebase(src,partial,before,after,'srwf-f'));
});
