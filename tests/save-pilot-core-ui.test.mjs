import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createSavePilotAuthority, getSavePilotDefinitions } from '../assets/save-pilot-support.mjs?v=20261113-alicecopies1';
import { openSave } from '../assets/save-core.mjs';
import { createSaveEditor } from '../assets/save-ui.mjs';
import { FakeElement, installFakeDom, loadHtml } from './helpers/fake-dom.mjs';
import { syntheticSave } from './helpers/synthetic-save.mjs';

const hash='b'.repeat(64);
const catalog=Object.freeze({version:1,gameId:'srwf-final',growth:{supported:true,experience:Array.from({length:100},(_,i)=>1000+i),spCurves:Array.from({length:16},(_,kind)=>Array(99).fill(kind+1))},pilots:[
  {id:246,name:'Normal',identity:'pilot:246',mp:30,mindGrowth:4,subpilot:false},
  {id:399,name:'ALICE',identity:'alice:1:test',mp:25,mindGrowth:2,subpilot:true},
]});

async function authenticated(t,{sourceToken=`${hash}:output`,originalToken=`${hash}:editor`}={}){
  const {port1,port2}=new MessageChannel();
  port1.addEventListener('message',event=>Object.defineProperties(event,{isTrusted:{value:true},currentTarget:{value:port1}}));
  const authority=createSavePilotAuthority(port1);
  t.after(()=>{authority.dispose();port1.close();port2.close();});
  const view={gameId:'srwf-final',sessionToken:sourceToken,targetHash:hash,baseTargetSha256:hash,baseImageKind:'korean',provenanceMode:'registered-editor-output',savePilotCatalog:catalog};
  const proof=await new Promise(resolve=>{port1.addEventListener('message',event=>resolve(authority.accept(event,{gameId:'srwf-final',sessionToken:originalToken,sourceSessionToken:sourceToken,targetHash:hash,baseTargetSha256:hash})),{once:true});port2.postMessage({type:'ANIMATION_SOURCE_COMPLETE',saveCatalog:view});});
  return {authority,proof,originalToken,sourceToken};
}
const context=auth=>({verified:true,gameId:'srwf-final',sessionToken:auth.originalToken,savePilotSupport:auth.proof,savePilotCatalog:catalog,pilots:catalog.pilots,units:[]});
const payload=(fixture,out)=>Uint8Array.from(fixture.payloadPositions,p=>out[p]);

test('authority has snapshot semantics and denies forged, plain, cloned, mutated, wrong-game and source-token proof uses',async t=>{
  const auth=await authenticated(t);
  assert.deepEqual(getSavePilotDefinitions(auth.proof,{gameId:'srwf-final',sessionToken:auth.originalToken,catalog}),catalog);
  assert.notStrictEqual(getSavePilotDefinitions(auth.proof,{gameId:'srwf-final',sessionToken:auth.originalToken,catalog}),catalog);
  for(const [token,options] of [
    [{},{}], [Object.freeze({}),{}], [structuredClone(auth.proof),{}], [auth.proof,{gameId:'srwf-f'}], [auth.proof,{sessionToken:auth.sourceToken}],
    [auth.proof,{catalog:{...catalog,pilots:[...catalog.pilots,{id:12,name:'forged',identity:'x',mp:1,mindGrowth:1,subpilot:false}]}}],
  ]) assert.equal(getSavePilotDefinitions(token,{gameId:'srwf-final',sessionToken:auth.originalToken,catalog,...options}),null);
  auth.authority.clear();
  assert.equal(getSavePilotDefinitions(auth.proof,{gameId:'srwf-final',sessionToken:auth.originalToken,catalog}),null);
});

test('authenticated Final pilot additions write all twelve fields, preserve ALICE subpilot SP, and are atomic',async t=>{
  const auth=await authenticated(t),fixture=syntheticSave(),save=await openSave(fixture.raw,context(auth));
  assert.throws(()=>save.addPilot(2,246,100));
  assert.throws(()=>save.addPilot(2,12,31));
  assert.equal(save.diff().length,0);
  const normal=save.addPilot(2,246,31);assert.equal(normal.slot,1);
  assert.throws(()=>save.addPilot(2,246,31));
  const alice=save.addPilot(2,399,1);assert.equal(alice.slot,2);
  const out=await save.exportFile(),bytes=payload(fixture,out);
  assert.deepEqual([...bytes.slice(0x100c,0x1024)],[
    0,246,31,16,4,7,0,60,255,100,0,180,
    1,143,1,24,3,233,0,0,255,100,0,25,
  ]);
  const reparsed=await openSave(out,context(auth));
  assert.deepEqual(reparsed.list()[0].pilots.slice(-2).map(p=>[p.id,p.level,p.experience]),[[246,31,1031],[399,1,1001]]);
  // A pending ALICE grant cannot survive an inspected catalog where ALICE was
  // disabled/removed; reset removes the binding and restores the exact input.
  save.updateCatalog({...context(auth),savePilotCatalog:Object.freeze({...catalog,pilots:[catalog.pilots[0]]})});
  await assert.rejects(save.exportFile(),/파일럿.*정보가 바뀌/);
  save.reset(2);assert.deepEqual(await save.exportFile(),fixture.raw);
  const full=syntheticSave();for(let slot=1;slot<128;slot++){full.payload[0x1000+slot*12]=0;full.payload[0x1001+slot*12]=slot;}
  new DataView(full.payload.buffer).setUint32(0,0); // Replace with a valid checksum before opening.
  const {saveChecksum}=await import('../assets/save-core.mjs');new DataView(full.payload.buffer).setUint32(0,saveChecksum(full.payload));full.payloadPositions.forEach((p,i)=>full.raw[p]=full.payload[i]);
  const fullSave=await openSave(full.raw,context(auth));assert.throws(()=>fullSave.addPilot(2,246,31));assert.equal(fullSave.diff().length,0);
});

test('generic pilot UI hides the record view while adding, uses the authenticated catalog, and removes ALICE when the inspected catalog no longer carries it',async t=>{
  const auth=await authenticated(t),doc=installFakeDom();loadHtml(doc,await readFile(new URL('../index.html',import.meta.url),'utf8'));
  Object.defineProperty(FakeElement.prototype,'parentElement',{configurable:true,get(){return this.parentNode;}});
  globalThis.requestAnimationFrame=fn=>{queueMicrotask(fn);return 1;};
  const $=id=>doc.getElementById(id),live=context(auth),fixture=syntheticSave(),ui=createSaveEditor(()=>live);
  await ui.load({name:'pilot.bcr',size:fixture.raw.length,arrayBuffer:async()=>fixture.raw.buffer});
  assert.match($('saveEditorEmpty').textContent,/저장 선택 → 파일럿 탭 → ＋ 파일럿 추가/);assert.match($('saveEditorEmpty').textContent,/저장 선택 → 보유 기체 탭 → ＋ 기체 추가/);assert.match($('saveEditorEmpty').textContent,/자동으로 준비합니다/);
  assert.equal($('saveAddPilotRow').hidden,false);assert.equal($('saveAddPilotLevel').getAttribute('value'),'31');
  $('saveAddPilotRow').open=true;$('saveAddPilotRow').dispatchEvent({type:'toggle'});
  assert.equal($('saveRecordLayout').hidden,true);assert.equal($('saveEditorDialog').dataset.addOpen,'true');
  assert.equal($('saveAddPilotLevel').disabled,false);assert.equal($('saveAddPilotSelect').disabled,false);assert.equal($('saveAddPilotButton').disabled,false);
  $('saveAddPilotRow').open=false;$('saveAddPilotRow').dispatchEvent({type:'toggle'});
  assert.equal($('saveRecordLayout').hidden,false);assert.equal($('saveEditorDialog').dataset.addOpen,'false');
  $('saveAddPilotRow').open=true;$('saveAddPilotRow').dispatchEvent({type:'toggle'});$('saveUnitTab').click();
  assert.equal($('saveAddPilotRow').open,false);assert.equal($('saveAddUnitRow').open,false);assert.equal($('saveRecordLayout').hidden,false);assert.equal($('saveEditorDialog').dataset.addOpen,'false');
  $('savePilotTab').click();$('saveAddPilotLevel').value='31';$('saveAddPilotRow').open=true;$('saveAddPilotRow').dispatchEvent({type:'toggle'});
  assert.equal($('saveAddPilotButton').disabled,false);$('saveAddPilotSelect').value='399';$('saveAddPilotLevel').value='2';$('saveAddPilotLevel').dispatchEvent({type:'input'});$('saveAddPilotButton').click();
  assert.match($('saveRecordTitle').textContent,/ALICE/);assert.match($('saveEditorStatus').textContent,/확인된 설치 상태/);assert.equal(ui.hasUnsavedEdits(),true);
  live.savePilotCatalog=Object.freeze({...catalog,pilots:[catalog.pilots[0]]});
  $('savePilotTab').click();assert.equal($('saveAddPilotButton').disabled,true);
});
