import test from 'node:test';
import assert from 'node:assert/strict';
import {readScenarioArchive,SCENARIO_ARCHIVE_FORMATS,repackScenarioBodies} from '../assets/editor-scenario-archive.mjs';
import {inspectScenarioScopes} from '../assets/editor-scenario-provenance.mjs';
import {readMapArchive} from '../assets/editor-map-archive.mjs';
import {repackScenarioDeployments} from '../assets/editor-deployments.mjs';
import {encodeEditorText} from '../assets/editor-text-codec.mjs';
import {normalizeScenarioDialogues,readScenarioDialogue,writeScenarioDialogue} from '../assets/editor-scenario-dialogue.mjs';
import {normalizeScenarioDeadlineBody} from '../assets/editor-scenario-deadlines.mjs';
import {EVENT_PHASE_FIELDS,updateScenarioEventPhaseBody} from '../assets/editor-scenario-event-phase.mjs';
import {encodeObjectiveRule} from '../assets/editor-scenario-criteria.mjs';
import {makeScenarioArchive,makeMapArchives} from './helpers/synthetic-scenario.mjs';
import {eventHostArchive} from './helpers/synthetic-event-host.mjs';
import {packGreedy} from './helpers/synthetic-iso.mjs';

const tables={unitCount:448,pilotCount:400};
const rootsOf=decoded=>Array.from({length:14},(_,i)=>i*4+new DataView(decoded.buffer,decoded.byteOffset,decoded.byteLength).getInt32(i*4));
const form=(body,decoded)=>({...body,decoded,roots:rootsOf(decoded)});
function carrier(gameId,raw,extra=2048){
 const format=SCENARIO_ARCHIVE_FORMATS[gameId],start=format.slots*8,packed=packGreedy(raw),bytes=new Uint8Array(start+packed.length+extra),v=new DataView(bytes.buffer);
 for(let slot=0;slot<format.slots;slot++){const cell=slot*8;v.setUint32(cell,start-cell);v.setUint32(cell+4,bytes.length-cell-format.endCellBias);}bytes.set(packed,start);return bytes;
}
function fixture(gameId,{extra=2048,plain=false}={}){
 const raw=makeScenarioArchive(gameId,{withEvents:true,withDeadline:true}).raw;
 raw.set([0xb1,0,0,0,0,0xea],94);new DataView(raw.buffer).setInt16(95,240-95);
 raw.set(plain?encodeEditorText('아무로',{gameId}):Uint8Array.of(...encodeEditorText('아무로',{gameId}).slice(0,-1),0xf6,...encodeEditorText('크리스',{gameId})),240);
 const bytes=carrier(gameId,raw,extra),map=makeMapArchives(gameId);
 const inspect=(scenarioBytes,glyphMap)=>inspectScenarioScopes({gameId,scenarioBytes,mapBytes:map.bytes,bankBytes:map.bankBytes,sectorMode:gameId==='srwf-f'?1:2,tables,glyphMap});
 return {bytes,map,raw,inspect,opened:inspect(bytes)};
}
for(const gameId of ['srwf-f','srwf-final'])test(`${gameId}: dialogue, deployment, event and deadline share one carrier and canonical scope`,async()=>{
 const f=fixture(gameId),before=f.bytes.slice(),row=f.opened.dialogues.find(r=>r.originalText==='아무로'),placement=f.opened.deployments.rows[0],event=f.opened.deployments.conditions[0],deadline=f.opened.deadlines[0];
 assert.ok(row?.editable);assert.ok(deadline?.editable);assert.ok(event?.editable);
 const glyphMap=new Map([['F5FC','힣']]),options={glyphMap,dialogueEdits:[{recordIndex:row.recordIndex,text:'힣'}],eventEdits:[{recordIndex:event.recordIndex,turn:8}],deadlineEdits:[{recordIndex:deadline.recordIndex,deadline:3}]};
 const written=await repackScenarioDeployments(f.bytes,gameId,f.opened.maps,tables,[{recordIndex:placement.recordIndex,x:5,rewardSelector:4}],options),fresh=f.inspect(written.bytes,glyphMap);
 assert.deepEqual(fresh.scope,f.opened.scope);assert.equal(written.bytes.length,f.bytes.length);assert.deepEqual(f.bytes,before);
 assert.equal(fresh.dialogues.find(r=>r.recordIndex===row.recordIndex).text,'힣');assert.equal(fresh.dialogues.find(r=>r.recordIndex===row.recordIndex).originalText,'아무로');assert.equal(fresh.dialogueEdits.length,1);
 assert.equal(fresh.deployments.rows[0].x,5);assert.equal(fresh.deployments.rows[0].rewardSelector,4);assert.equal(fresh.deployments.conditions[0].turn,8);assert.equal(fresh.deadlines[0].deadline,3);
 assert.ok(fresh.rawArchive.bodies[0].decoded.length>fresh.archive.bodies[0].decoded.length);
 const second=await repackScenarioDeployments(written.bytes,gameId,fresh.maps,tables,[{recordIndex:placement.recordIndex,y:0}],{glyphMap});
 const again=f.inspect(second.bytes,glyphMap);assert.deepEqual(again.scope,f.opened.scope);assert.equal(again.dialogues.find(r=>r.recordIndex===row.recordIndex).text,'힣');assert.equal(again.deadlines[0].deadline,3);assert.equal(again.deployments.conditions[0].turn,8);
 const echo=await repackScenarioDeployments(second.bytes,gameId,again.maps,tables,[],{glyphMap,dialogueEdits:[]});assert.deepEqual(echo.bytes,second.bytes);
 await assert.rejects(repackScenarioDeployments(second.bytes,gameId,again.maps,tables,[],{glyphMap:new Map(),sourceGlyphMap:glyphMap}));
 const reset=await repackScenarioDeployments(second.bytes,gameId,again.maps,tables,[],{glyphMap:new Map(),sourceGlyphMap:glyphMap,dialogueEdits:[{recordIndex:row.recordIndex,text:row.originalText}]});
 const restored=f.inspect(reset.bytes);assert.equal(restored.dialogueEdits.length,0);assert.deepEqual(restored.scope,f.opened.scope);assert.equal(restored.deadlines[0].deadline,3);assert.equal(restored.deployments.rows[0].y,0);
});
test('dialogue requests snapshot primitives before compression and reject unknown/accessor/duplicate entries atomically',async()=>{
 const gameId='srwf-final',f=fixture(gameId),row=f.opened.dialogues.find(r=>r.editable),before=f.bytes.slice(),input={recordIndex:row.recordIndex,text:'가'};
 const out=await repackScenarioDeployments(f.bytes,gameId,f.opened.maps,tables,[],{dialogueEdits:[input],onProgress(){input.text='😀';}});assert.equal(f.inspect(out.bytes).dialogues.find(r=>r.recordIndex===row.recordIndex).text,'가');
 let calls=0;const getter={recordIndex:row.recordIndex};Object.defineProperty(getter,'text',{get(){calls++;return'가';}});
 for(const edits of [[getter],[{recordIndex:'0:99999',text:'가'}],[{recordIndex:row.recordIndex,text:'가'},{recordIndex:row.recordIndex,text:'나'}],[{recordIndex:row.recordIndex,text:'가',identity:'wrong'}],[{recordIndex:row.recordIndex,text:'가',extra:1}]])await assert.rejects(repackScenarioDeployments(f.bytes,gameId,f.opened.maps,tables,[],{dialogueEdits:edits}));
 assert.equal(calls,0);assert.deepEqual(f.bytes,before);
});
test('dialogue metadata never authorizes arbitrary decoded growth or a foreign root',async()=>{
 const gameId='srwf-final',f=fixture(gameId),body=f.opened.rawArchive.bodies[0],row=f.opened.dialogues.find(r=>r.editable),edited=writeScenarioDialogue(body,gameId,[{recordIndex:row.recordIndex,text:'가'}]);
 const grown=new Uint8Array(edited.length+4);grown.set(edited);await assert.rejects(repackScenarioBodies(f.bytes,gameId,[{physicalIndex:0,decoded:grown}]));
 const foreign=edited.slice();foreign[3]^=1;await assert.rejects(repackScenarioBodies(f.bytes,gameId,[{physicalIndex:0,decoded:foreign}]));
 const tiny=fixture(gameId,{extra:0}),original=tiny.bytes.slice();await assert.rejects(repackScenarioDeployments(tiny.bytes,gameId,tiny.opened.maps,tables,[],{dialogueEdits:[{recordIndex:row.recordIndex,text:'가'}]}),{code:'EDITOR_SCENARIO_GROWTH_UNSUPPORTED'});assert.deepEqual(tiny.bytes,original);
});
test('B1 owners and text identity survive the existing Final phase/criteria wrappers',()=>{
 const gameId='srwf-final',raw=eventHostArchive().raw,view=new DataView(raw.buffer);
 raw.set([0xb1,0,0,0,0,0xea],2333);view.setInt16(2334,7000-2334);raw.set(encodeEditorText('아무로',{gameId}),7000);raw.set([0xe9,1,255,254],2786);
 const body={decoded:raw,physicalIndex:9,slots:[106],roots:rootsOf(raw)},row=readScenarioDialogue(body,gameId).rows.find(r=>r.byteOffset===7000);assert.ok(row?.editable);
 const fields={eventPhase:1,eventJoin:0,eventRule1:encodeObjectiveRule('turn','eq',5),eventRule2:0,eventRule3:0},wrapped=updateScenarioEventPhaseBody(body,gameId,fields),wrappedBody=form(body,wrapped);
 const out=writeScenarioDialogue(wrappedBody,gameId,[{recordIndex:row.recordIndex,text:'가'}]),read=readScenarioDialogue(form(body,out),gameId);assert.equal(read.rows.find(r=>r.recordIndex===row.recordIndex).text,'가');assert.equal(read.rows.find(r=>r.recordIndex===row.recordIndex).identity,row.identity);
 const checked=normalizeScenarioDeadlineBody(read.body,gameId);assert.deepEqual(checked.body.decoded,raw);for(const key of EVENT_PHASE_FIELDS)assert.equal(checked.eventPhase[key],fields[key]);
});
for(const gameId of ['srwf-f','srwf-final'])test(`${gameId}: a relocated longer dialogue survives shared provenance, physical packing and later numeric edits`,async()=>{
 const f=fixture(gameId),row=f.opened.dialogues.find(r=>r.originalText==='아무로'),placement=f.opened.deployments.rows[0],event=f.opened.deployments.conditions[0],deadline=f.opened.deadlines[0];
 assert.ok(row.expandable);const longer='아무로가나다';
 const first=await repackScenarioDeployments(f.bytes,gameId,f.opened.maps,tables,[{recordIndex:placement.recordIndex,x:5}],{dialogueEdits:[{recordIndex:row.recordIndex,text:longer}],eventEdits:[{recordIndex:event.recordIndex,turn:8}],deadlineEdits:[{recordIndex:deadline.recordIndex,deadline:3}]});
 const fresh=f.inspect(first.bytes);assert.deepEqual(fresh.scope,f.opened.scope);assert.equal(fresh.dialogues.find(r=>r.recordIndex===row.recordIndex).text,longer);assert.equal(fresh.dialogues.find(r=>r.recordIndex===row.recordIndex).maxBytes,row.maxBytes);assert.equal(fresh.deployments.conditions[0].turn,8);assert.equal(fresh.deadlines[0].deadline,3);assert.equal(first.bytes.length,f.bytes.length);
 const next=await repackScenarioDeployments(first.bytes,gameId,fresh.maps,tables,[{recordIndex:placement.recordIndex,y:0}]);const again=f.inspect(next.bytes);assert.equal(again.dialogues.find(r=>r.recordIndex===row.recordIndex).text,longer);assert.deepEqual(again.scope,f.opened.scope);
 const reset=await repackScenarioDeployments(next.bytes,gameId,again.maps,tables,[],{dialogueEdits:[{recordIndex:row.recordIndex,text:row.originalText}]});const restored=f.inspect(reset.bytes);assert.equal(restored.dialogueEdits.length,0);assert.deepEqual(restored.scope,f.opened.scope);assert.equal(restored.deployments.rows[0].x,5);assert.equal(restored.deployments.rows[0].y,0);assert.equal(restored.deadlines[0].deadline,3);
});
for(const gameId of ['srwf-f','srwf-final'])test(`${gameId}: same-speaker pages share physical provenance with glyphs, deployments, deadlines and numeric re-edit`,async()=>{
 const f=fixture(gameId,{plain:true}),row=f.opened.dialogues.find(r=>r.originalText==='아무로'),placement=f.opened.deployments.rows[0],deadline=f.opened.deadlines[0];assert.ok(row.pagesEditable);
 const glyphMap=new Map([['F5FC','힣']]),pagesJson=JSON.stringify(['아무로힣','가나','']);
 const first=await repackScenarioDeployments(f.bytes,gameId,f.opened.maps,tables,[{recordIndex:placement.recordIndex,x:5}],{glyphMap,dialogueEdits:[{recordIndex:row.recordIndex,pagesJson}],deadlineEdits:[{recordIndex:deadline.recordIndex,deadline:3}]});const fresh=f.inspect(first.bytes,glyphMap);
 assert.deepEqual(fresh.scope,f.opened.scope);assert.equal(fresh.dialogues.find(r=>r.recordIndex===row.recordIndex).pagesJson,pagesJson);assert.equal(fresh.dialogues.find(r=>r.recordIndex===row.recordIndex).text,'아무로힣');assert.equal(first.bytes.length,f.bytes.length);
 const second=await repackScenarioDeployments(first.bytes,gameId,fresh.maps,tables,[{recordIndex:placement.recordIndex,y:0}],{glyphMap});const again=f.inspect(second.bytes,glyphMap);assert.equal(again.dialogues.find(r=>r.recordIndex===row.recordIndex).pagesJson,pagesJson);assert.deepEqual(again.scope,f.opened.scope);
 await assert.rejects(repackScenarioDeployments(second.bytes,gameId,again.maps,tables,[],{glyphMap:new Map(),sourceGlyphMap:glyphMap}));
 const reset=await repackScenarioDeployments(second.bytes,gameId,again.maps,tables,[],{glyphMap:new Map(),sourceGlyphMap:glyphMap,dialogueEdits:[{recordIndex:row.recordIndex,text:row.originalText}]});const restored=f.inspect(reset.bytes);assert.equal(restored.dialogueEdits.length,0);assert.equal(restored.deployments.rows[0].x,5);assert.equal(restored.deployments.rows[0].y,0);assert.equal(restored.deadlines[0].deadline,3);assert.deepEqual(restored.scope,f.opened.scope);
});
