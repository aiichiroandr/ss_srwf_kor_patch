import test from 'node:test';
import assert from 'node:assert/strict';
import {SCENARIO_ARCHIVE_FORMATS} from '../assets/editor-scenario-archive.mjs';
import {inspectScenarioScopes} from '../assets/editor-scenario-provenance.mjs';
import {repackScenarioDeployments} from '../assets/editor-deployments.mjs';
import {encodeEditorText} from '../assets/editor-text-codec.mjs';
import {makeScenarioArchive,makeMapArchives} from './helpers/synthetic-scenario.mjs';
import {packGreedy} from './helpers/synthetic-iso.mjs';
const speakerOptions=[{pilotId:10,faceId:10,variantCount:4,identity:'pilot10-face10'},{pilotId:71,faceId:71,variantCount:4,identity:'pilot71-face71'},{pilotId:80,faceId:80,variantCount:4,identity:'pilot80-face80'}];
const tables={unitCount:448,pilotCount:400,speakerOptions};
function fixture(gameId,{controls=false,different=false}={}){
 const raw=makeScenarioArchive(gameId,{withEvents:true,withDeadline:true}).raw,v=new DataView(raw.buffer),descriptor=0x3800|(10<<2)|2;
 for(const p of[94,99]){raw[p]=0xb1;v.setInt16(p+1,240-p-1);v.setUint16(p+3,different&&p===99?descriptor^(1<<2):descriptor);}raw[104]=0xea;
 raw.set(controls?Uint8Array.of(...encodeEditorText('아무로',{gameId}).slice(0,-1),246,...encodeEditorText('크리스',{gameId})):encodeEditorText('아무로',{gameId}),240);
 const packed=packGreedy(raw),format=SCENARIO_ARCHIVE_FORMATS[gameId],start=format.slots*8,bytes=new Uint8Array(start+packed.length+2048),av=new DataView(bytes.buffer);for(let slot=0;slot<format.slots;slot++){const cell=slot*8;av.setUint32(cell,start-cell);av.setUint32(cell+4,bytes.length-cell-format.endCellBias);}bytes.set(packed,start);
 const map=makeMapArchives(gameId),inspect=(scenarioBytes,selected=tables)=>inspectScenarioScopes({gameId,scenarioBytes,mapBytes:map.bytes,bankBytes:map.bankBytes,sectorMode:gameId==='srwf-f'?1:2,tables:selected});return {raw,bytes,inspect,opened:inspect(bytes)};
}
for(const gameId of['srwf-f','srwf-final'])test(`${gameId}: trusted speaker provenance survives text/pages merge, other edits, numeric re-edit and independent resets`,async()=>{
 const f=fixture(gameId),before=f.bytes.slice(),row=f.opened.dialogues.find(r=>r.originalText==='아무로'),placement=f.opened.deployments.rows[0],deadline=f.opened.deadlines[0];assert.ok(row.speakerEditable);
 const first=await repackScenarioDeployments(f.bytes,gameId,f.opened.maps,tables,[{recordIndex:placement.recordIndex,x:5}],{dialogueEdits:[{recordIndex:row.recordIndex,speakerId:71}],deadlineEdits:[{recordIndex:deadline.recordIndex,deadline:3}]});const a=f.inspect(first.bytes);
 assert.deepEqual(a.scope,f.opened.scope);assert.equal(a.dialogues.find(r=>r.recordIndex===row.recordIndex).speakerId,71);assert.deepEqual(a.dialogueEdits,[{recordIndex:row.recordIndex,speakerId:71}]);assert.equal(a.deadlines[0].deadline,3);assert.equal(a.deployments.rows[0].x,5);assert.deepEqual(f.bytes,before);
 assert.throws(()=>f.inspect(first.bytes,{unitCount:448,pilotCount:400}),/초상화|화자/);
 const second=await repackScenarioDeployments(first.bytes,gameId,a.maps,tables,[],{dialogueEdits:[{recordIndex:row.recordIndex,text:'아무로가나다'}]});const b=f.inspect(second.bytes);assert.equal(b.dialogues[0].speakerId,71);assert.equal(b.dialogues[0].text,'아무로가나다');
 const pagesJson='["아무로","크리스",""]',third=await repackScenarioDeployments(second.bytes,gameId,b.maps,tables,[],{dialogueEdits:[{recordIndex:row.recordIndex,pagesJson,speakerId:80}]});const c=f.inspect(third.bytes);assert.equal(c.dialogues[0].speakerId,80);assert.equal(c.dialogues[0].pagesJson,pagesJson);assert.deepEqual(c.scope,f.opened.scope);
 const numeric=await repackScenarioDeployments(third.bytes,gameId,c.maps,tables,[{recordIndex:placement.recordIndex,y:0}]);const d=f.inspect(numeric.bytes);assert.equal(d.dialogues[0].speakerId,80);assert.equal(d.dialogues[0].pagesJson,pagesJson);assert.equal(d.deadlines[0].deadline,3);
 const speakerReset=await repackScenarioDeployments(numeric.bytes,gameId,d.maps,tables,[],{dialogueEdits:[{recordIndex:row.recordIndex,speakerId:10}]});const e=f.inspect(speakerReset.bytes);assert.equal(e.dialogues[0].speakerId,10);assert.equal(e.dialogues[0].pagesJson,pagesJson);
 const reset=await repackScenarioDeployments(speakerReset.bytes,gameId,e.maps,tables,[],{dialogueEdits:[{recordIndex:row.recordIndex,text:row.originalText}]});const done=f.inspect(reset.bytes);assert.equal(done.dialogueEdits.length,0);assert.equal(done.dialogues[0].speakerId,10);assert.deepEqual(done.scope,f.opened.scope);assert.equal(done.deployments.rows[0].x,5);assert.equal(done.deployments.rows[0].y,0);assert.equal(done.deadlines[0].deadline,3);assert.equal(reset.bytes.length,f.bytes.length);
});

test('speaker requests snapshot values and cannot replace trusted tables through request options',async()=>{
 const gameId='srwf-final',f=fixture(gameId),row=f.opened.dialogues[0],before=f.bytes.slice(),request={recordIndex:row.recordIndex,speakerId:71};
 const output=await repackScenarioDeployments(f.bytes,gameId,f.opened.maps,tables,[],{dialogueEdits:[request],onProgress(){request.speakerId=511;}});assert.equal(f.inspect(output.bytes).dialogues[0].speakerId,71);
 const untrusted={unitCount:448,pilotCount:400};await assert.rejects(repackScenarioDeployments(f.bytes,gameId,f.opened.maps,untrusted,[],{speakerOptions,dialogueEdits:[{recordIndex:row.recordIndex,speakerId:71}]}),/초상화|화자/);
 let calls=0;const getter={recordIndex:row.recordIndex};Object.defineProperty(getter,'speakerId',{get(){calls++;return 71;}});
 for(const edits of[[getter],[{recordIndex:row.recordIndex,speakerId:71.5}],[{recordIndex:row.recordIndex,speakerId:71,pagesJson:'["가","나"]',text:'가'}],[{recordIndex:row.recordIndex,speakerId:71,extra:1}]])await assert.rejects(repackScenarioDeployments(f.bytes,gameId,f.opened.maps,tables,[],{dialogueEdits:edits}));
 assert.equal(calls,0);assert.deepEqual(f.bytes,before);
});

test('shared owner speaker conflicts reject before compression and retain source bytes',async()=>{
 const gameId='srwf-final',f=fixture(gameId,{controls:true}),rows=f.opened.dialogues,before=f.bytes.slice();assert.equal(rows.length,2);let progress=0;
 await assert.rejects(repackScenarioDeployments(f.bytes,gameId,f.opened.maps,tables,[],{dialogueEdits:[{recordIndex:rows[0].recordIndex,speakerId:71},{recordIndex:rows[1].recordIndex,speakerId:80}],onProgress(){progress++;}}),/같은 대사/);assert.equal(progress,0);assert.deepEqual(f.bytes,before);
 const mixed=fixture(gameId,{different:true});assert.equal(mixed.opened.dialogues[0].speakerEditable,false);await assert.rejects(repackScenarioDeployments(mixed.bytes,gameId,mixed.opened.maps,tables,[],{dialogueEdits:[{recordIndex:mixed.opened.dialogues[0].recordIndex,speakerId:71}]}),/공유/);
});
