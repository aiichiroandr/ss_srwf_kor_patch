import test from 'node:test';
import assert from 'node:assert/strict';
import {preflightEditedImage,exportEditedImage} from '../assets/editor-core.mjs';
import {makeBase} from './helpers/synthetic-game.mjs';
import {echoRequest} from './helpers/synthetic-iso.mjs';
import {createEditorStorageUI} from '../assets/editor-storage-ui.mjs';
import {FakeDocument} from './helpers/fake-dom.mjs';
import {editorStorageBudget} from '../assets/editor-storage-budget.mjs';
import {PILOT_LAYOUT_PROFILES} from '../assets/editor-pilot-layout-profiles.mjs';

for(const gameId of ['srwf-f','srwf-final'])test(`${gameId}: capacity uses the real composer and compressor without an output write`,async()=>{
 const {opened:{session,view}}=await makeBase({gameId,units:4}),before=session.decoded.slice(),request=echoRequest(session,view);
 const weapon=view.weapons.find(r=>r.editable&&r.nameEditable);request.weaponNameEdits=[{recordIndex:weapon.recordIndex,text:'천지인'}];
 let writes=0;const reports=[];
 const report=await preflightEditedImage(session,request,{onBudget:b=>reports.push(b),testSeam:{afterWrite(){writes++;throw Error('preflight wrote an image');}}});
 assert.equal(writes,0);assert.equal(reports.length,1);assert.equal(report.schema,'srwf.editor-storage-budget.v1');assert.equal(report.canExport,true);
 assert.deepEqual(session.decoded,before);assert.ok(!('outputBlob'in report));
 const result=await exportEditedImage(session,request),disk=report.rows.find(r=>r.id==='tsr-disk');
 assert.equal(disk.usedBytes,result.tsr.packedBytes);assert.equal(disk.limitBytes,result.tsr.writableBytes);
 assert.ok(report.metadata.nameBytes>0);assert.ok(report.rows.every(r=>r.remainingBytes===r.limitBytes-r.usedBytes));
});
test('an over-capacity or cancelled preflight cannot create output or change the session',async()=>{
 const {opened:{session,view}}=await makeBase(),request=echoRequest(session,view),before=session.decoded.slice();let writes=0;
 await assert.rejects(preflightEditedImage(session,request,{testSeam:{pack:({slot})=>({packed:new Uint8Array(slot.writableLength+1)}),afterWrite(){writes++;}}}),e=>e.code==='EDITOR_TSR_GROWTH_UNSUPPORTED');
 const c=new AbortController();c.abort();await assert.rejects(preflightEditedImage(session,request,{signal:c.signal}),e=>e.name==='AbortError');
 assert.equal(writes,0);assert.deepEqual(session.decoded,before);
});
test('budget display marks a checked result stale after editing and handles zero-sized shared pools',()=>{
 const doc=new FakeDocument(),root=doc.createElement('section'),status=doc.createElement('p'),list=doc.createElement('div'),note=doc.createElement('p');
 const ui=createEditorStorageUI({root,status,list,note});
 ui.show({schema:'srwf.editor-storage-budget.v1',canExport:true,rows:[{label:'파일럿 추가 공간',usedBytes:0,limitBytes:0,remainingBytes:0,fixed:false}],metadata:{nameBytes:16,glyphBytes:218,glyphCount:2}},3);
 assert.match(status.textContent,/확인 완료/);assert.equal(Number(list.querySelector('progress').max),1);assert.match(note.textContent,/218 B/);
 ui.invalidate();assert.equal(root.dataset.state,'stale');assert.match(status.textContent,/다시 확인/);ui.pending();ui.cancelled();assert.equal(list.children.length,0);
 ui.reset('이전 F 꼬리를 복구해야 합니다.');assert.equal(root.dataset.state,'warning');assert.match(note.textContent,/복구/);ui.reset();assert.equal(note.textContent,'');
});
test('reserved hero-head padding is never advertised as room for learning additions',()=>{
 const profile=PILOT_LAYOUT_PROFILES['srwf-final'],segment=new Uint8Array(profile.tableLength),v=new DataView(segment.buffer);
 profile.offsets.forEach((at,id)=>v.setInt32(id*4,at-id*4));
 const rows=profile.offsets.map((_,recordIndex)=>({recordIndex,skillEditable:recordIndex===2,spiritEditable:false,tailPaddingBytes:0,spirits:[],specialAbilities:[]}));
 const root={28:{bytes:segment},29:{bytes:new Uint8Array(8)}},bytes=new Uint8Array(164);
 const report=editorStorageBudget({session:{descriptor:{gameId:'srwf-final'},root},logical:bytes,stored:bytes,root,unitStorage:null,pilots:rows,sourcePilots:rows});
 assert.ok(report.rows.some(r=>r.id==='pilot-2-301'));
 assert.ok(!report.rows.some(r=>r.id==='pilot-304-307'));
});
