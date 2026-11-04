import test from 'node:test';
import {writeScenarioDialogue as oldWrite} from './helpers/legacy-scenario-dialogue.mjs';
import assert from 'node:assert/strict';
import {readScenarioDialogue,writeScenarioDialogue,validateScenarioAfterDialogue} from '../assets/editor-scenario-dialogue.mjs';
import {createHash} from 'node:crypto';
import {encodeEditorText,decodeEditorText} from '../assets/editor-text-codec.mjs';
const speakerOptions=[{pilotId:10,faceId:10,variantCount:4,identity:'pilot10-face10'},{pilotId:71,faceId:71,variantCount:4,identity:'pilot71-face71'},{pilotId:72,faceId:72,variantCount:1,identity:'pilot72-face72'}];
function fixture(gameId='srwf-final',{length=640,variant=0,shared=false,controls=false,terminal=false}={}){
 const decoded=new Uint8Array(length),v=new DataView(decoded.buffer),roots=[360,56,56,56,64,120,150,160,170,180,190,200,210,220];roots.forEach((p,i)=>v.setInt32(i*4,p-i*4));
 const calls=shared?[[64,400],[69,450],[74,400],[79,470]]:[[64,400],[69,450]];
 for(const[p,t]of calls){decoded[p]=0xb1;v.setInt16(p+1,t-p-1);v.setUint16(p+3,0x8000|(10<<2)|variant);}decoded[shared?84:74]=0xea;decoded[120]=0xea;if(terminal)decoded[69]=0xea;
 decoded.set(controls?Uint8Array.of(...encodeEditorText('아무로',{gameId}).slice(0,-1),246,...encodeEditorText('크리스',{gameId})):encodeEditorText('아무로',{gameId}),400);decoded.set(encodeEditorText('가나',{gameId}),450);if(shared)decoded.set(encodeEditorText('다라',{gameId}),470);
 return {physicalIndex:5,slots:[102],decoded,roots};
}
const wrap=(body,decoded)=>({...body,decoded});
const options=gameId=>({gameId,speakerOptions});
function trace(decoded,first,stop,gameId){
 const v=new DataView(decoded.buffer,decoded.byteOffset,decoded.byteLength),calls=[];let pc=first;
 for(let steps=0;steps<32;steps++){if(pc===stop)return calls;const op=decoded[pc];if(op===1){pc=pc+1+v.getInt16(pc+1);continue;}assert.equal(op,0xb1,`unexpected opcode at ${pc}`);const target=pc+1+v.getInt16(pc+1);let end=target;while(decoded[end]!==255)end++;calls.push({speakerId:v.getUint16(pc+3)>>>2&511,descriptor:v.getUint16(pc+3),target,text:decodeEditorText(decoded.subarray(target,end+1),{gameId})});pc+=5;}
 assert.fail('trampoline did not return within its bounded instruction count');
}
for(const gameId of['srwf-f','srwf-final'])test(`${gameId}: different-speaker calls use original VM instructions at a proven adjacent B1 boundary`,()=>{
 const body=fixture(gameId),original=body.decoded.slice(),row=readScenarioDialogue(body,gameId,options(gameId)).rows.find(r=>r.byteOffset===400),next=readScenarioDialogue(body,gameId,options(gameId)).rows.find(r=>r.byteOffset===450),afterDialogueJson='[{"speakerId":71,"text":"크리스"},{"speakerId":10,"text":"가나"}]';
 assert.equal(row.afterDialogueEditable,true);assert.equal(next.afterDialogueEditable,false);assert.equal(validateScenarioAfterDialogue(row,afterDialogueJson,options(gameId)).valid,true);
 const output=writeScenarioDialogue(body,gameId,[{recordIndex:row.recordIndex,afterDialogueJson}],options(gameId));assert.equal(String.fromCharCode(...output.subarray(output.length-32,output.length-24)),'SRWDIA05');assert.equal(output[64],1);
 const calls=trace(output,64,69,gameId);assert.deepEqual(calls.map(c=>[c.speakerId,c.text]),[[10,'아무로'],[71,'크리스'],[10,'가나']]);for(const call of calls)assert.equal(call.descriptor&0xf803,new DataView(original.buffer).getUint16(67)&0xf803);
 for(let p=0;p<original.length;p++)if(p<64||p>66)assert.equal(output[p],original[p],`unrelated byte ${p}`);assert.deepEqual(body.decoded,original);
 const read=readScenarioDialogue(wrap(body,output),gameId,options(gameId));assert.deepEqual(read.body.decoded,original);assert.equal(read.rows.find(r=>r.recordIndex===row.recordIndex).afterDialogueJson,afterDialogueJson);assert.equal(read.rows.find(r=>r.recordIndex===row.recordIndex).identity,row.identity);assert.deepEqual(read.edits,[{recordIndex:row.recordIndex,afterDialogueJson}]);
 assert.deepEqual(writeScenarioDialogue(wrap(body,output),gameId,[],options(gameId)),output);assert.deepEqual(writeScenarioDialogue(wrap(body,output),gameId,[{recordIndex:row.recordIndex,afterDialogueJson:''}],options(gameId)),original);assert.deepEqual(writeScenarioDialogue(wrap(body,output),gameId,[],{...options(gameId),replace:true}),original);assert.throws(()=>readScenarioDialogue(wrap(body,output),gameId),/초상화|화자/);
});

test('new calls preserve simultaneous current text/pages/speaker edits and independent resets',()=>{
 const gameId='srwf-final',body=fixture();for(const p of[67,72])new DataView(body.decoded.buffer).setUint16(p,new DataView(body.decoded.buffer).getUint16(p)&0x7fff);
 const row=readScenarioDialogue(body,gameId,options(gameId)).rows.find(r=>r.byteOffset===400),afterDialogueJson='[{"speakerId":10,"text":"다라"}]';
 for(const content of[{text:'가'},{text:'아무로가나다'},{pagesJson:'["아무로","크리스"]'}]){
  const output=writeScenarioDialogue(body,gameId,[{recordIndex:row.recordIndex,...content,speakerId:71,afterDialogueJson}],options(gameId)),read=readScenarioDialogue(wrap(body,output),gameId,options(gameId)),actual=read.rows.find(r=>r.recordIndex===row.recordIndex);assert.deepEqual(read.body.decoded,body.decoded);assert.equal(actual.speakerId,71);assert.equal(actual.text,content.text??'아무로');assert.equal(actual.afterDialogueJson,afterDialogueJson);assert.deepEqual(trace(output,64,69,gameId).map(c=>c.speakerId),[71,10]);
  const reset=writeScenarioDialogue(wrap(body,output),gameId,[{recordIndex:row.recordIndex,afterDialogueJson:'[]'}],options(gameId)),expected=writeScenarioDialogue(body,gameId,[{recordIndex:row.recordIndex,...content,speakerId:71}],options(gameId));assert.deepEqual(reset,expected);
  const changed=writeScenarioDialogue(wrap(body,output),gameId,[{recordIndex:row.recordIndex,text:'나'}],options(gameId)),again=readScenarioDialogue(wrap(body,changed),gameId,options(gameId)).rows.find(r=>r.recordIndex===row.recordIndex);assert.equal(again.speakerId,71);assert.equal(again.text,'나');assert.equal(again.afterDialogueJson,afterDialogueJson);
 }
});

test('trusted FACE, byte budgets, raw shape, next-B1 boundary and possible interior references fail closed',()=>{
 const gameId='srwf-final',body=fixture(gameId,{variant:2}),row=readScenarioDialogue(body,gameId,options(gameId)).rows[0],good='[{"speakerId":71,"text":"가"}]';assert.equal(validateScenarioAfterDialogue(row,good,options(gameId)).valid,true);
 for(const value of['[{"speakerId":72,"text":"가"}]','[{"speakerId":71,"text":"😀"}]',JSON.stringify([{speakerId:71,text:'가'.repeat(54)}]),JSON.stringify(Array.from({length:5},()=>({speakerId:71,text:'가'}))),'[{"speakerId":71,"text":"가","extra":1}]'])assert.throws(()=>writeScenarioDialogue(body,gameId,[{recordIndex:row.recordIndex,afterDialogueJson:value}],options(gameId)));
 assert.throws(()=>writeScenarioDialogue(body,gameId,[{recordIndex:row.recordIndex,afterDialogueJson:good}],{gameId}));
 for(const candidate of[fixture(gameId,{terminal:true}),fixture(gameId,{length:33000})]){const r=readScenarioDialogue(candidate,gameId,options(gameId)).rows.find(r=>r.byteOffset===400);assert.equal(r.afterDialogueEditable,false);assert.throws(()=>writeScenarioDialogue(candidate,gameId,[{recordIndex:r.recordIndex,afterDialogueJson:good}],options(gameId)));}
 for(const width of[2,4]){const b=fixture(gameId),v=new DataView(b.decoded.buffer);if(width===2)v.setInt16(300,65-300);else v.setInt32(300,66-300);const r=readScenarioDialogue(b,gameId,options(gameId)).rows.find(r=>r.byteOffset===400);assert.equal(r.afterDialogueEditable,false);assert.match(r.afterDialogueReadOnlyReason,/内部|내부/);}
});

test('all shared B1 owners gain one sequence each and split-run conflicts are atomic',()=>{
 const gameId='srwf-final',body=fixture(gameId,{shared:true,controls:true}),rows=readScenarioDialogue(body,gameId,options(gameId)).rows.filter(r=>r.owners.some(o=>o.targetOffset===400)),afterDialogueJson='[{"speakerId":71,"text":"가"}]';assert.equal(rows.length,2);assert.ok(rows.every(r=>r.afterDialogueEditable));
 const output=writeScenarioDialogue(body,gameId,[{recordIndex:rows[0].recordIndex,afterDialogueJson}],options(gameId));for(const [start,stop]of[[64,69],[74,79]])assert.deepEqual(trace(output,start,stop,gameId).map(c=>c.speakerId),[10,71]);assert.ok(readScenarioDialogue(wrap(body,output),gameId,options(gameId)).rows.filter(r=>rows.some(before=>before.recordIndex===r.recordIndex)).every(r=>r.afterDialogueJson===afterDialogueJson));
 assert.throws(()=>writeScenarioDialogue(body,gameId,[{recordIndex:rows[0].recordIndex,afterDialogueJson},{recordIndex:rows[1].recordIndex,afterDialogueJson:'[{"speakerId":10,"text":"나"}]'}],options(gameId)),/같은 대사/);
});

test('v5 head patches, appended code/text, metadata bounds and nested metadata are authenticated',()=>{
 const gameId='srwf-final',body=fixture(),row=readScenarioDialogue(body,gameId,options(gameId)).rows[0],output=writeScenarioDialogue(body,gameId,[{recordIndex:row.recordIndex,afterDialogueJson:'[{"speakerId":71,"text":"가"}]'}],options(gameId)),footer=new DataView(output.buffer,output.length-32,32),length=footer.getUint32(8),start=length+footer.getUint32(24),patch=output.length-32-footer.getUint32(28)*8;
 for(const offset of[64,65,66,length,length+1,length+4,length+5,start,start+32,start+36,patch+4,patch+6,output.length-8]){const bad=output.slice();bad[offset]^=1;assert.throws(()=>readScenarioDialogue(wrap(body,bad),gameId,options(gameId)),`tamper ${offset}`);}
});

test('four historical calls including an empty draft stay bounded and a nested v5 cannot create another permission layer',()=>{
 const gameId='srwf-final',body=fixture(),row=readScenarioDialogue(body,gameId,options(gameId)).rows[0],entries=Array.from({length:4},(_,i)=>({speakerId:i%2?10:71,text:i?'가':''})),afterDialogueJson=JSON.stringify(entries),output=oldWrite(body,gameId,[{recordIndex:row.recordIndex,afterDialogueJson}],options(gameId));assert.throws(()=>writeScenarioDialogue(body,gameId,[{recordIndex:row.recordIndex,afterDialogueJson}],options(gameId)));assert.equal(trace(output,64,69,gameId).length,5);
 const encoded=new TextEncoder().encode(afterDialogueJson),payloadLength=32+8+encoded.length+8,nested=new Uint8Array(output.length+1+payloadLength+32),v=new DataView(nested.buffer),payload=output.length+1; nested.set(output);nested.set(createHash('sha256').update(output).digest(),payload);v.setUint32(payload+32,400);v.setUint32(payload+36,encoded.length);nested.set(encoded,payload+40);const patch=payload+40+encoded.length;v.setUint32(patch,56);v.setUint16(patch+4,new DataView(output.buffer).getUint16(56));const footer=nested.length-32;nested.set(new TextEncoder().encode('SRWDIA05'),footer);v.setUint32(footer+8,output.length);v.setUint32(footer+12,1);v.setUint32(footer+16,payloadLength);v.setUint32(footer+20,5);v.setUint32(footer+24,1);v.setUint32(footer+28,1);
 assert.throws(()=>readScenarioDialogue(wrap(body,nested),gameId,options(gameId)),/중첩/);
});

for(const gameId of ['srwf-f','srwf-final'])test(`${gameId}: empty follow-ups need authenticated historical bytes, and never grant new empty edits`,()=>{
 const body=fixture(gameId),opts=options(gameId),row=readScenarioDialogue(body,gameId,opts).rows.find(r=>r.byteOffset===400);
 for(const text of ['', '   ', '\u3000']){
  const afterDialogueJson=JSON.stringify([{speakerId:71,text}]);
  assert.equal(validateScenarioAfterDialogue(row,afterDialogueJson,opts).valid,false);
  for(const replace of [false,true])assert.throws(()=>writeScenarioDialogue(body,gameId,[{recordIndex:row.recordIndex,afterDialogueJson}],{...opts,replace}),/본문/);
 }
 const afterDialogueJson='[{"speakerId":71,"text":""},{"speakerId":10,"text":"가"}]';
 const bytes=oldWrite(body,gameId,[{recordIndex:row.recordIndex,afterDialogueJson}],opts),historical=wrap(body,bytes),read=readScenarioDialogue(historical,gameId,opts),oldRow=read.rows.find(r=>r.recordIndex===row.recordIndex);
 assert.equal(validateScenarioAfterDialogue(oldRow,afterDialogueJson,opts).valid,true);
 assert.deepEqual(writeScenarioDialogue(historical,gameId,[],opts),bytes);
 assert.deepEqual(writeScenarioDialogue(historical,gameId,[{recordIndex:row.recordIndex,afterDialogueJson}],opts),bytes);
 const unrelated=writeScenarioDialogue(historical,gameId,[{recordIndex:row.recordIndex,text:'나'}],opts),again=readScenarioDialogue(wrap(body,unrelated),gameId,opts);
 assert.equal(again.rows.find(r=>r.recordIndex===row.recordIndex).afterDialogueJson,afterDialogueJson);
 const trusted={...opts,replace:true,legacyPageAuthority:read.legacyPageAuthority};assert.ok(trusted.legacyPageAuthority);
 assert.deepEqual(writeScenarioDialogue(read.body,gameId,read.edits,trusted),bytes);
 const normalizedChanged=writeScenarioDialogue(read.body,gameId,read.edits.map(e=>({...e,text:'나'})),trusted);assert.equal(readScenarioDialogue(wrap(body,normalizedChanged),gameId,opts).rows.find(r=>r.recordIndex===row.recordIndex).afterDialogueJson,afterDialogueJson);
 for(const legacyPageAuthority of [undefined,{},structuredClone(read.legacyPageAuthority)])assert.throws(()=>writeScenarioDialogue(read.body,gameId,read.edits,{...trusted,legacyPageAuthority}),/본문|출처/);
 const modified=wrap(read.body,read.body.decoded.slice()),v=new DataView(modified.decoded.buffer);v.setUint16(67,v.getUint16(67)^1);
 assert.throws(()=>writeScenarioDialogue(modified,gameId,read.edits,trusted),/본문/);
 const changed=JSON.stringify([{speakerId:71,text:''},{speakerId:10,text:'나'}]);
 assert.equal(validateScenarioAfterDialogue(oldRow,changed,opts).valid,false);
 assert.throws(()=>writeScenarioDialogue(historical,gameId,[{recordIndex:row.recordIndex,afterDialogueJson:changed}],opts),/본문/);
 assert.deepEqual(writeScenarioDialogue(historical,gameId,[{recordIndex:row.recordIndex,afterDialogueJson:''}],opts),body.decoded);
 assert.deepEqual(writeScenarioDialogue(read.body,gameId,[],trusted),body.decoded);
 const removed=writeScenarioDialogue(historical,gameId,[{recordIndex:row.recordIndex,afterDialogueJson:'[{"speakerId":10,"text":"가"}]'}],opts);
 assert.equal(readScenarioDialogue(wrap(body,removed),gameId,opts).rows.find(r=>r.recordIndex===row.recordIndex).afterDialogueJson,'[{"speakerId":10,"text":"가"}]');
});
