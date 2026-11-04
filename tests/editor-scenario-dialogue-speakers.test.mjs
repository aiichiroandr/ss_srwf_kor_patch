import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeEditorText} from '../assets/editor-text-codec.mjs';
import {readScenarioDialogue,writeScenarioDialogue,validateScenarioDialogueSpeaker} from '../assets/editor-scenario-dialogue.mjs';
const options={speakerOptions:[{pilotId:10,faceId:10,variantCount:4,identity:'pilot10-face10'},{pilotId:71,faceId:71,variantCount:4,identity:'pilot71-face71'},{pilotId:72,faceId:72,variantCount:1,identity:'pilot72-face72'},{pilotId:80,faceId:80,variantCount:4,identity:'pilot80-face80'}]};
function fixture(gameId='srwf-final',{different=false,controls=false}={}){
 const decoded=new Uint8Array(640),v=new DataView(decoded.buffer),roots=[360,56,56,56,64,120,150,160,170,180,190,200,210,220];roots.forEach((p,i)=>v.setInt32(i*4,p-i*4));
 const word=0x8000|0x3800|(10<<2)|2;for(const p of[64,69]){decoded[p]=0xb1;v.setInt16(p+1,400-p-1);v.setUint16(p+3,p===69&&different?word^(1<<2):word);}decoded[74]=0xea;decoded[120]=0xea;
 if(controls)decoded.set(Uint8Array.of(...encodeEditorText('아무로',{gameId}).slice(0,-1),246,...encodeEditorText('크리스',{gameId})),400);else decoded.set(encodeEditorText('아무로',{gameId}),400);
 return {physicalIndex:5,slots:[102],decoded,roots};
}
const wrap=(body,decoded)=>({...body,decoded});
for(const gameId of['srwf-f','srwf-final'])test(`${gameId}: speaker-only edits change exactly the nine pilot bits and restore all original bytes`,()=>{
 const body=fixture(gameId),original=body.decoded.slice(),plain=readScenarioDialogue(body,gameId).rows[0],row=readScenarioDialogue(body,gameId,options).rows[0];
 assert.equal(plain.speakerId,10);assert.equal(plain.speakerEditable,false);assert.equal(row.speakerId,10);assert.equal(row.speakerVariant,2);assert.equal(row.speakerEditable,true);
 assert.equal(validateScenarioDialogueSpeaker(row,71,options).valid,true);assert.equal(validateScenarioDialogueSpeaker(row,72,options).valid,false);assert.equal(validateScenarioDialogueSpeaker(row,71).valid,false);
 const output=writeScenarioDialogue(body,gameId,[{recordIndex:row.recordIndex,speakerId:71,identity:row.identity}],options),v=new DataView(output.buffer);
 assert.equal(String.fromCharCode(...output.subarray(output.length-32,output.length-24)),'SRWDIA04');
 for(const p of[67,72]){assert.equal(v.getUint16(p)>>>2&511,71);assert.equal(v.getUint16(p)&0xf803,new DataView(original.buffer).getUint16(p)&0xf803);}
 for(let p=0;p<original.length;p++)if(![67,68,72,73].includes(p))assert.equal(output[p],original[p],`unrelated byte ${p}`);
 const reopened=readScenarioDialogue(wrap(body,output),gameId,options);assert.deepEqual(reopened.body.decoded,original);assert.equal(reopened.rows[0].speakerId,71);assert.equal(reopened.rows[0].originalSpeakerId,10);assert.equal(reopened.rows[0].text,row.originalText);assert.deepEqual(reopened.edits,[{recordIndex:row.recordIndex,speakerId:71}]);assert.deepEqual(body.decoded,original);
 assert.throws(()=>readScenarioDialogue(wrap(body,output),gameId),/초상화|화자/);assert.deepEqual(writeScenarioDialogue(wrap(body,output),gameId,[],options),output);assert.deepEqual(writeScenarioDialogue(wrap(body,output),gameId,[],{...options,replace:true}),original);assert.deepEqual(writeScenarioDialogue(wrap(body,output),gameId,[{recordIndex:row.recordIndex,speakerId:10}],options),original);
});

test('speaker edits compose with short text, relocated text and explicit pages; partial updates keep the other field',()=>{
 const gameId='srwf-final',body=fixture();for(const p of[67,72])new DataView(body.decoded.buffer).setUint16(p,new DataView(body.decoded.buffer).getUint16(p)&0x7fff);
 const row=readScenarioDialogue(body,gameId,options).rows[0];
 for(const content of[{text:'가'},{text:'아무로가나다'},{pagesJson:'["아무로","크리스",""]'}]){
  const output=writeScenarioDialogue(body,gameId,[{recordIndex:row.recordIndex,...content,speakerId:71}],options),read=readScenarioDialogue(wrap(body,output),gameId,options);
  assert.equal(read.rows[0].speakerId,71);assert.equal(read.rows[0].text,content.text??'아무로');assert.deepEqual(read.body.decoded,body.decoded);
  const changed=writeScenarioDialogue(wrap(body,output),gameId,[{recordIndex:row.recordIndex,speakerId:80}],options),again=readScenarioDialogue(wrap(body,changed),gameId,options);assert.equal(again.rows[0].speakerId,80);assert.equal(again.rows[0].text,read.rows[0].text);assert.equal(again.rows[0].pagesJson,read.rows[0].pagesJson);
  const textReset=writeScenarioDialogue(wrap(body,output),gameId,[{recordIndex:row.recordIndex,text:row.originalText}],options),textResetRead=readScenarioDialogue(wrap(body,textReset),gameId,options);assert.equal(textResetRead.rows[0].speakerId,71);assert.equal(textResetRead.rows[0].text,row.originalText);assert.equal(textResetRead.rows[0].pagesJson,'');
  const speakerReset=writeScenarioDialogue(wrap(body,output),gameId,[{recordIndex:row.recordIndex,speakerId:10}],options),speakerResetRead=readScenarioDialogue(wrap(body,speakerReset),gameId,options);assert.equal(speakerResetRead.rows[0].speakerId,10);assert.equal(speakerResetRead.rows[0].text,read.rows[0].text);assert.equal(speakerResetRead.rows[0].pagesJson,read.rows[0].pagesJson);
 }
 const speaker=writeScenarioDialogue(body,gameId,[{recordIndex:row.recordIndex,speakerId:71}],options),text=writeScenarioDialogue(wrap(body,speaker),gameId,[{recordIndex:row.recordIndex,text:'가'}],options);assert.equal(readScenarioDialogue(wrap(body,text),gameId,options).rows[0].speakerId,71);
});

test('a shared owner propagates its new speaker to all text runs and conflicting run requests fail closed',()=>{
 const gameId='srwf-final',body=fixture(gameId,{controls:true}),rows=readScenarioDialogue(body,gameId,options).rows;assert.equal(rows.length,2);assert.ok(rows.every(r=>r.speakerEditable));
 const output=writeScenarioDialogue(body,gameId,[{recordIndex:rows[0].recordIndex,speakerId:71}],options);assert.deepEqual(readScenarioDialogue(wrap(body,output),gameId,options).rows.map(r=>r.speakerId),[71,71]);
 assert.throws(()=>writeScenarioDialogue(body,gameId,[{recordIndex:rows[0].recordIndex,speakerId:71},{recordIndex:rows[1].recordIndex,speakerId:80}],options),/같은 대사/);
 assert.throws(()=>writeScenarioDialogue(body,gameId,[{recordIndex:rows[0].recordIndex,speakerId:71},{recordIndex:rows[1].recordIndex,speakerId:10}],options),/같은 대사/);
});

test('different shared descriptors, unknown pilots, incompatible portrait variants and untrusted options never authorize writes',()=>{
 const gameId='srwf-final',different=fixture(gameId,{different:true}),mixed=readScenarioDialogue(different,gameId,options).rows[0];assert.equal(mixed.speakerEditable,false);assert.throws(()=>writeScenarioDialogue(different,gameId,[{recordIndex:mixed.recordIndex,speakerId:71}],options),/공유/);
 const body=fixture(),row=readScenarioDialogue(body,gameId,options).rows[0];for(const speakerId of[0,512,11,72,'71',NaN,1.1])assert.throws(()=>writeScenarioDialogue(body,gameId,[{recordIndex:row.recordIndex,speakerId}],options));
 assert.throws(()=>writeScenarioDialogue(body,gameId,[{recordIndex:row.recordIndex,speakerId:71}]));assert.throws(()=>writeScenarioDialogue(body,gameId,[{recordIndex:row.recordIndex,speakerId:71,identity:'wrong'}],options));
 const badLists=[[],[options.speakerOptions[0],options.speakerOptions[0]],[{pilotId:10,faceId:0,variantCount:4,identity:'x'}],[{pilotId:10,faceId:10,variantCount:0,identity:'x'}],[{pilotId:10,faceId:10,variantCount:4,identity:''}]];
 for(const speakerOptions of badLists)assert.throws(()=>writeScenarioDialogue(body,gameId,[{recordIndex:row.recordIndex,speakerId:71}],{speakerOptions}));
 let called=false;const accessor={recordIndex:row.recordIndex};Object.defineProperty(accessor,'speakerId',{get(){called=true;return 71;},enumerable:true});assert.throws(()=>writeScenarioDialogue(body,gameId,[accessor],options));assert.equal(called,false);
});

test('v4 speaker metadata authenticates descriptor original bits, patch kind, pilot field and actual changed bytes',()=>{
 const gameId='srwf-final',body=fixture(),row=readScenarioDialogue(body,gameId,options).rows[0],output=writeScenarioDialogue(body,gameId,[{recordIndex:row.recordIndex,speakerId:71,text:'가'}],options),footer=new DataView(output.buffer,output.length-32,32),entries=640+footer.getUint32(24)+32,patch=output.length-32-footer.getUint32(28)*8;
 for(const offset of[67,68,72,73,entries,entries+2,entries+3,patch+4,patch+6,patch+7,output.length-8]){const bad=output.slice();bad[offset]^=1;assert.throws(()=>readScenarioDialogue(wrap(body,bad),gameId,options),`tamper ${offset}`);}
});

test('partial text aliases cannot leave an originally uniform shared run with mixed speakers',()=>{
 const gameId='srwf-final',body=fixture(gameId,{controls:true});new DataView(body.decoded.buffer).setInt16(70,407-70);
 const rows=readScenarioDialogue(body,gameId,options).rows;assert.equal(rows.length,2);assert.deepEqual(rows.map(row=>row.owners.length),[1,2]);
 assert.throws(()=>writeScenarioDialogue(body,gameId,[{recordIndex:rows[0].recordIndex,speakerId:71}],options),/일부 호출/);
 const output=writeScenarioDialogue(body,gameId,rows.map(row=>({recordIndex:row.recordIndex,speakerId:71})),options);assert.deepEqual(readScenarioDialogue(wrap(body,output),gameId,options).rows.map(row=>row.speakerId),[71,71]);
});
