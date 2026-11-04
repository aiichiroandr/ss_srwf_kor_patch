// ALICE's reopen check pins one whole-disc hash (FACE carrier excluded) per
// provenance mask set of each accepted base. SRW4 imports reopen through the
// unit-storage/loadout/scenario profiles, whose mask set differs from the
// ordinary profile, so every base needs a value for both. Final v0.3 a/b had
// only the ordinary one, and an output with SRW4 units + ALICE was refused as
// EDITOR_CUSTOM_PROVENANCE. The synthetic part checks the pinned tables
// against the shipped profiles (hashes only). The golden part runs only when
// SRWF_GOLDEN_IMAGE_DIR holds final-v0.3-{a,b,c}.bin and SRWF_GOLDEN_SRW4_ROM
// points at a SRW4 Rev 1 ROM; it asserts statuses and hashes only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import * as core from '../assets/editor-core.mjs';
const {inspectPatchedImage}=core;
import {createEditorWorker} from '../assets/editor-worker.mjs';
import {aliceFaceMasks} from '../assets/editor-alice.mjs';
import {ALICE_ART,ALICE_V03_DISC_MASKS} from '../assets/editor-alice-art.mjs';
import {ACCEPTED_EDITOR_TARGETS} from '../assets/editor-provenance-profiles.mjs';
import {UNIT_STORAGE_PROFILES} from '../assets/editor-unit-storage-profiles.mjs';
import {LOADOUT_EDITOR_PROFILES} from '../assets/editor-loadout-profiles.mjs';
import {SCENARIO_EDITOR_PROFILES} from '../assets/editor-scenario-profiles.mjs';
import {EDITOR_PROVENANCE_PROFILES} from '../assets/editor-provenance-profiles.mjs';
import {TERRAIN_EDITOR_PROFILES} from '../assets/editor-terrain-profiles.mjs';
import {installFakeDom,loadHtml} from './helpers/fake-dom.mjs';

const FACE={extentLba:714,byteLength:ALICE_ART.faceBytes};
const releaseOf=hash=>ACCEPTED_EDITOR_TARGETS[hash]?.releaseId;

test('every provenance mask set of each Final v0.3 base has a pinned ALICE disc hash',()=>{
 const v03=Object.keys(ALICE_V03_DISC_MASKS);
 assert.deepEqual(v03.map(releaseOf).sort(),['srwf-final-20261005-v0-3-a','srwf-final-20261005-v0-3-b','srwf-final-20261005-v0-3-c']);
 const profiles=[...UNIT_STORAGE_PROFILES,...LOADOUT_EDITOR_PROFILES,...SCENARIO_EDITOR_PROFILES,...EDITOR_PROVENANCE_PROFILES,...TERRAIN_EDITOR_PROFILES]
  .filter(p=>v03.includes(p.baseTargetSha256));
 const sets=new Map();
 for(const p of profiles){
  const masks=aliceFaceMasks(p,FACE);
  assert.ok(masks,`${releaseOf(p.baseTargetSha256)}: a profile has no pinned ALICE value`);
  assert.match(masks.expected,/^[0-9a-f]{64}$/);
  const key=JSON.stringify(p.rawMasks);sets.set(key,(sets.get(key)??new Set()).add(p.baseTargetSha256));
 }
 // Both mask sets occur on all three bases, with a distinct pinned value per base.
 assert.equal(sets.size,2);
 for(const bases of sets.values())assert.equal(bases.size,3);
 for(const table of Object.values(ALICE_V03_DISC_MASKS))assert.equal(Object.keys(table).length,2);
 const values=Object.values(ALICE_V03_DISC_MASKS).flatMap(t=>Object.values(t));
 assert.equal(new Set(values).size,values.length);
});

// -------- real images (optional) --------
const IMAGE_DIR=process.env.SRWF_GOLDEN_IMAGE_DIR,SRW4=process.env.SRWF_GOLDEN_SRW4_ROM;
const LANES=['a','b','c'].map(v=>({lane:`final-v0.3-${v}`,releaseId:`srwf-final-20261005-v0-3-${v}`}));
const available=lane=>Boolean(IMAGE_DIR)&&fs.existsSync(`${IMAGE_DIR}/${lane}.bin`);
const anyLane=LANES.some(l=>available(l.lane));

let hooks,state;
if(anyLane){
 const document=installFakeDom();
 if(!globalThis.ImageData)globalThis.ImageData=class{constructor(d,w,h){this.data=d;this.width=w;this.height=h;}};
 loadHtml(document,await readFile(new URL('../index.html',import.meta.url),'utf8'));
 const quiet=console.error;console.error=()=>{};
 ({__testHooks:hooks}=await import('../assets/app.mjs'));
 await new Promise(r=>setTimeout(r,0));console.error=quiet;state=hooks.state;
 document.getElementById('editorWorkspace').hidden=false;
}
const settle=(ms=5)=>new Promise(r=>setTimeout(r,ms));
class RealWorker{
 static current=null;received=[];#listeners=new Map();#body=null;
 constructor(){RealWorker.current=this;
  const scope={addEventListener:(t,f)=>{if(t==='message')this.#body=f;},postMessage:m=>{this.received.push(m);setTimeout(()=>{for(const f of this.#listeners.get('message')??[])f({data:m});},0);}};
  createEditorWorker(scope,{...core,readBattleDialogue:async()=>{throw new Error('no dialogue here');},previewEditorRecord:async()=>{throw new Error('no preview here');}});}
 addEventListener(t,f){this.#listeners.set(t,[...(this.#listeners.get(t)??[]),f]);}
 removeEventListener(t,f){this.#listeners.set(t,(this.#listeners.get(t)??[]).filter(x=>x!==f));}
 postMessage(m){this.#body({data:m});}
 terminate(){}
 async until(p,label,from=0){for(let i=0;i<120000;i++){const f=this.received.slice(from).find(p);if(f)return f;await settle();}throw new Error('never: '+label);}
}
async function open(blob,releaseId,{local=false}={}){
 const manifest=JSON.parse(await readFile(new URL(`../releases/${releaseId}.json`,import.meta.url),'utf8'));
 globalThis.Worker=RealWorker;state.editorWorker=null;
 state.games=new Map([['srwf-final',{defaultReleaseId:releaseId}]]);
 state.release={id:releaseId,gameId:'srwf-final',target:manifest.target};
 state.editorRelease=null;state.editorBusy=false;state.mode='editor';
 const cueTracks=Object.freeze(['TRACK 01 MODE1/2352','INDEX 01 00:00:00']);
 hooks.beginEditorInspection(blob,local?{localImage:true,cueTracks}:{verifiedTargetSha256:manifest.target.sha256,cueTracks});
 const worker=RealWorker.current,done=await worker.until(m=>m.type==='INSPECT_COMPLETE'||m.type==='ERROR','inspect');
 assert.equal(done.type,'INSPECT_COMPLETE',done.error?.code);await settle(20);
 return worker;
}
async function exportNow(worker,request){
 const jobId=`golden-${Math.random().toString(16).slice(2)}`,from=worker.received.length;
 worker.postMessage({type:'EXPORT',jobId,request});
 const ex=await worker.until(m=>m.jobId===jobId&&['EXPORT_COMPLETE','ERROR','CANCELLED'].includes(m.type),'export',from);
 assert.equal(ex.type,'EXPORT_COMPLETE',ex.error?.code);return ex.result;
}
for(const {lane,releaseId} of LANES){
 test(`golden ${lane}: an unchanged export returns the input image`,{skip:!available(lane),timeout:600000},async()=>{
  const blob=await fs.openAsBlob(`${IMAGE_DIR}/${lane}.bin`),worker=await open(blob,releaseId);
  const result=await exportNow(worker,hooks.buildEditorExportRequest());
  assert.equal(result.bytesChanged,0);assert.equal(result.outputBlob,blob);
 });
 test(`golden ${lane}: SRW4 units + ALICE + dictionary output reopens and an unchanged re-save is byte-identical`,{skip:!available(lane)||!SRW4||!fs.existsSync(SRW4),timeout:900000},async()=>{
  const blob=await fs.openAsBlob(`${IMAGE_DIR}/${lane}.bin`);let worker=await open(blob,releaseId);
  state.editorOutputSwitches.dictionaryPortraits.enabled=true;
  const catalog=await hooks.connectEditorSrw4Source(await fs.openAsBlob(SRW4));
  assert.equal(catalog.addedUnitCount,7);
  if(state.editorAliceRows[0].enabled!==1)hooks.toggleAlicePilot();
  assert.equal(hooks.validateEditorForms({report:false}),true);
  const first=await exportNow(worker,hooks.buildEditorExportRequest());
  const reopened=await inspectPatchedImage(first.outputBlob,{gameId:'srwf-final',targetSize:first.size,targetSha256:first.sha256,imageKind:'local',customOutputReceipts:[first.receipt]});
  assert.equal(reopened.session.alice.enabled,true);assert.equal(reopened.session.unitRestorations.length,7);
  assert.equal(reopened.session.dictionaryPortraits.enabled,true);
  worker=await open(first.outputBlob,releaseId,{local:true});
  assert.equal(state.editorOutputSwitches.dictionaryPortraits.enabled,true);
  const again=await exportNow(worker,hooks.buildEditorExportRequest());
  assert.equal(again.sha256,first.sha256);
 });
}
