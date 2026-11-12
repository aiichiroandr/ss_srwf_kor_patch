import test from 'node:test';
import assert from 'node:assert/strict';
import {ALICE_F_PROFILE,aliceFAvailable,isAliceFBase} from '../assets/editor-alice-f-profile.mjs';
import {inspectAliceFFace,inspectAliceFFaceHeader,repackAliceFFace} from '../assets/editor-alice-f-face.mjs';
import {planAliceFData,readAliceFData,getAliceFSavePilotState,ALICE_F_CREW_DEFAULTS,aliceFDataLayout} from '../assets/editor-alice-f-data.mjs';
import {aliceCrewConfig} from '../assets/editor-alice-crew-data.mjs';

test('F profile pins all accepted bases and exposes only local pending-runtime export availability',()=>{
 assert.equal(ALICE_F_PROFILE.developmentOnly,true);assert.equal(ALICE_F_PROFILE.pendingRuntime,true);assert.equal(ALICE_F_PROFILE.availability,true);assert.equal(aliceFAvailable(),true);
 for(const hash of ALICE_F_PROFILE.baseSha256)assert.equal(isAliceFBase(hash),true);
 const pins=[...ALICE_F_PROFILE.baseSha256,ALICE_F_PROFILE.ip.sha256,ALICE_F_PROFILE.exec.sha256,ALICE_F_PROFILE.sourceFaceSha256,ALICE_F_PROFILE.sourceRoot2HeaderSha256,ALICE_F_PROFILE.candidateFaceSha256,ALICE_F_PROFILE.candidateFaceHeaderSha256];
 for(const pin of pins)assert.match(pin,/^[0-9a-f]{64}$/);
 assert.equal(ALICE_F_PROFILE.candidateFaceSha256,'4ea3c56662d814ff65effa4c03ddf76a04d958f866619ee72800a3d1c54c62bc');
 assert.equal(isAliceFBase('0'.repeat(64)),false);assert.equal(ALICE_F_PROFILE.faceId,338);
 assert.equal(ALICE_F_CREW_DEFAULTS.spirits.at(-1).level,40);
});
test('F spirit schema retains shared defaults and permits level 40 but rejects 0 and 100',()=>{
 assert.equal(ALICE_F_CREW_DEFAULTS.spirits.at(-1).id,14);
 const crew=()=>({enabled:false,spBase:25,unitIds:[0,0],spirits:ALICE_F_CREW_DEFAULTS.spirits.map(s=>({...s}))});
 const good=crew();good.spirits[5].level=40;assert.equal(aliceCrewConfig(good).spirits[5].level,40);
 for(const level of [0,100]){const bad=crew();bad.spirits[5].level=level;assert.throws(()=>aliceCrewConfig(bad));}
});
test('F envelope layout always puts an aligned FACE header after all metadata',()=>{
 for(let residue=0;residue<4;residue++){const length=1600+residue,l=aliceFDataLayout(length);
  assert.equal(l.header%4,0);assert.ok(l.header>=length+80);assert.equal(l.tail,l.header+2712);assert.equal(l.end,l.tail+20);
 }
 assert.throws(()=>aliceFDataLayout(-1));assert.throws(()=>aliceFDataLayout(Number.MAX_SAFE_INTEGER));
});
test('F FACE inspectors reject truncated, foreign, and compact headers before codec work',async()=>{
 assert.throws(()=>inspectAliceFFace(new Uint8Array(ALICE_F_PROFILE.faceBytes-1)));
 assert.throws(()=>inspectAliceFFace(new Uint8Array(ALICE_F_PROFILE.faceBytes)));
 assert.throws(()=>inspectAliceFFaceHeader(new Uint8Array(2712)));
 const compact=new Uint8Array(ALICE_F_PROFILE.faceBytes);new DataView(compact.buffer).setUint32(0,8);
 await assert.rejects(repackAliceFFace(compact,{decode:x=>x,encode:async()=>new Uint8Array()}));
});
test('F reader capability rejects forged state-shaped objects',()=>{
 const base=ALICE_F_PROFILE.baseSha256[0],forged=Object.freeze({decoded:new Uint8Array(144),enabled:true,crew:Object.freeze({enabled:true,spBase:25,unitIds:Object.freeze([]),spirits:Object.freeze([])}),gameId:'srwf-f',baseSha256:base});
 assert.equal(getAliceFSavePilotState(forged,{gameId:'srwf-f',baseSha256:base}),null);
 assert.equal(getAliceFSavePilotState(forged,{gameId:'srwf-final',baseSha256:base}),null);
 assert.equal(getAliceFSavePilotState(forged,{gameId:'srwf-f',baseSha256:'0'.repeat(64)}),null);
});
test('F TSR envelope rejects foreign game/base, malformed source roots, and non-envelope input',()=>{
 const b=new Uint8Array(1600);assert.equal(readAliceFData(b,{baseSha256:ALICE_F_PROFILE.baseSha256[0]}),null);
 assert.throws(()=>readAliceFData(b,{gameId:'srwf-final',baseSha256:ALICE_F_PROFILE.baseSha256[0]}));
 assert.throws(()=>readAliceFData(b,{baseSha256:'0'.repeat(64)}));
 assert.throws(()=>planAliceFData(b,{gameId:'srwf-final',baseSha256:ALICE_F_PROFILE.baseSha256[0],faceHeader:new Uint8Array(2712)}));
 assert.throws(()=>planAliceFData(b,{baseSha256:'0'.repeat(64),faceHeader:new Uint8Array(2712)}));
 assert.throws(()=>planAliceFData(b,{baseSha256:ALICE_F_PROFILE.baseSha256[0],faceHeader:new Uint8Array(2712)}));
});
