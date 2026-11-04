import test from 'node:test';
import assert from 'node:assert/strict';
import {readAlicePilot,writeAlicePilot,ALICE_ART} from '../assets/editor-alice.mjs';
import {ALICE_CREW_DEFAULTS} from '../assets/editor-alice-crew-data.mjs';
import {ALICE_FACE_COPIES,normalizeAliceFaceCopies} from '../assets/editor-alice-face-copies.mjs';
function source(){
 const b=new Uint8Array(0x6c100),v=new DataView(b.buffer),rel=(a,t)=>v.setInt32(a,t-a);
 rel(8,8000);rel(48,200);rel(52,2000);rel(112,4000);v.setUint32(4000,1600);
 rel(4000+399*4,6100);rel(4000+246*4,6000);rel(200+399*4,6300);rel(2000+399*4,6310);b[6300]=b[6310]=255;
 b.set(Uint8Array.from('00000000ff4460602f444404c800c803e703e703e703e700010000'.match(/../g),s=>parseInt(s,16)),6100);
 b.set(Array.from({length:23},(_,i)=>i),6000);v.setUint32(8000,2736);
 for(const x of ALICE_FACE_COPIES){v.setUint32(8000+x.id*8,0x12340000+x.id);v.setUint32(8000+x.id*8+4,0x12340100+x.id);b.set(b.subarray(8000+x.id*8,8000+x.id*8+8),x.at);}
 return b;
}
for(const version of [1,2,4])test(`ALICE v${version} repairs all three portrait copies and reopens historical BIN metadata without increasing its size`,()=>{
 const before=source(),options={version,...version===1?{}:{crew:{...ALICE_CREW_DEFAULTS,enabled:true,unitIds:[430,431]}}};
 const written=writeAlicePilot(before,true,'srwf-final',options),read=readAlicePilot(written),header=Uint8Array.from(atob(ALICE_ART.faceHeader),c=>c.charCodeAt(0));
 assert.deepEqual(read.decoded,before);assert.notEqual(read.faceCopiesNeedFix,true);
 assert.ok(new DataView(written.buffer).getUint32(written.length-4)&8);
 for(const x of ALICE_FACE_COPIES)assert.deepEqual(written.subarray(x.at,x.at+8),header.subarray(x.id*8,x.id*8+8));
 const historical=normalizeAliceFaceCopies(written).stored;
 assert.equal(historical.length,written.length,'no extra tail or runtime memory is reserved');
 const old=readAlicePilot(historical);assert.equal(old.faceCopiesNeedFix,true);assert.deepEqual(old.decoded,before);
 assert.deepEqual(writeAlicePilot(old.decoded,true,'srwf-final',options),written,'a normal re-save upgrades the old layout');
 for(const x of ALICE_FACE_COPIES){const bad=written.slice();bad[x.at]^=1;assert.throws(()=>readAlicePilot(bad),{code:'EDITOR_ALICE_INVALID'});}
 const unknown=written.slice();new DataView(unknown.buffer).setUint32(unknown.length-4,0x18);assert.throws(()=>readAlicePilot(unknown),{code:'EDITOR_ALICE_INVALID'});
});
test('an unrecognized alternate portrait table is rejected before changing the supplied source',()=>{
 const before=source();before[ALICE_FACE_COPIES[1].at]^=1;const copy=before.slice();
 assert.throws(()=>writeAlicePilot(before,true),{code:'EDITOR_ALICE_INVALID'});assert.deepEqual(before,copy);
});
