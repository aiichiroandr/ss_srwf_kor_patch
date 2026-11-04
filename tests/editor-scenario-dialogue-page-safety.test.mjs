import test from 'node:test';
import assert from 'node:assert/strict';
import {readScenarioDialogue,writeScenarioDialogue,validateScenarioDialoguePages,normalizeScenarioDialogues} from '../assets/editor-scenario-dialogue.mjs';
import {writeScenarioDialogue as oldWrite} from './helpers/legacy-scenario-dialogue.mjs';
import {encodeEditorText} from '../assets/editor-text-codec.mjs';
const gameId='srwf-final';
const options={speakerOptions:[{pilotId:1,faceId:1,variantCount:4,identity:'p1'},{pilotId:2,faceId:2,variantCount:4,identity:'p2'}]};
function fixture({interrupt=false,shared=false,game=gameId}={}){
 const decoded=new Uint8Array(640),v=new DataView(decoded.buffer),roots=[360,56,56,56,64,120,150,160,170,180,190,200,210,220];roots.forEach((p,i)=>v.setInt32(i*4,p-i*4));
 for(const [at,target]of [[64,400],[69,shared?400:450]]){decoded[at]=0xb1;v.setInt16(at+1,target-at-1);v.setUint16(at+3,4|(interrupt&&at===69?0x8000:0));}decoded[74]=0xea;decoded[120]=0xea;
 decoded.set(encodeEditorText('아무로',{gameId:game}),400);decoded.set(encodeEditorText('가나',{gameId:game}),450);
 return {physicalIndex:5,slots:[102],decoded,roots};
}
const wrap=(b,decoded)=>({...b,decoded});
const pages=(row,values)=>({recordIndex:row.recordIndex,pagesJson:JSON.stringify(values)});
const target=(b,owner=64)=>owner+1+new DataView(b.buffer,b.byteOffset,b.byteLength).getInt16(owner+1);
const magic=b=>String.fromCharCode(...b.subarray(b.length-32,b.length-24));

test('new pages use an explicit v6 format and F7 first-line 00, while F6 uses only engine indentation',()=>{
 const body=fixture(),row=readScenarioDialogue(body,gameId,options).rows[0],values=['아무로','가\n나\n다',' 라',''];
 const out=writeScenarioDialogue(body,gameId,[pages(row,values)],options),at=target(out),expected=[...encodeEditorText('아무로',{gameId}).slice(0,-1),0xf7,0,...encodeEditorText('가',{gameId}).slice(0,-1),0xf6,...encodeEditorText('나',{gameId}).slice(0,-1),0xf6,...encodeEditorText('다',{gameId}).slice(0,-1),0xf7,0,...encodeEditorText('라',{gameId}).slice(0,-1),0xf7,0,255];
 assert.equal(magic(out),'SRWDIA06');assert.deepEqual(out.subarray(at,at+expected.length),Uint8Array.from(expected));
 const read=readScenarioDialogue(wrap(body,out),gameId,options);assert.equal(read.rows[0].pagesJson,JSON.stringify(values));assert.equal(read.rows[0].pageEncoding,'fixed-window-v1');assert.deepEqual(read.body.decoded,body.decoded);assert.deepEqual(writeScenarioDialogue(wrap(body,out),gameId,[],options),out);
});

test('Final window measures 12/8/6px advances plus stored/engine indent, at most 3 lines and 108 emitted bytes',()=>{
 const body=fixture(),row=readScenarioDialogue(body,gameId,options).rows[0];
 const valid=[['A'.repeat(32),'A'.repeat(31)],['가'.repeat(21),'가'.repeat(21)],['가\n나\n다','라'],[Array(3).fill('가'.repeat(17)).join('\n'),Array(3).fill('가'.repeat(17)).join('\n')]];
 for(const value of valid){assert.equal(validateScenarioDialoguePages(row,JSON.stringify(value),{gameId}).valid,true,JSON.stringify(value));assert.doesNotThrow(()=>writeScenarioDialogue(body,gameId,[pages(row,value)],options));}
 const invalid=[['A'.repeat(33),'가'],['가','A'.repeat(32)],['가\n'+'A'.repeat(32),'나'],['가\n나\n다\n라','마'],['가',Array(3).fill('가'.repeat(17)).join('\n')+'A']];
 for(const value of invalid){assert.equal(validateScenarioDialoguePages(row,JSON.stringify(value),{gameId}).valid,false,JSON.stringify(value));assert.throws(()=>writeScenarioDialogue(body,gameId,[pages(row,value)],options),{code:'EDITOR_DIALOGUE_INVALID'});}
});

test('any shared original bit15 descriptor blocks new pages without blocking fixed text',()=>{
 for(const game of ['srwf-f','srwf-final']){
  const body=fixture({interrupt:true,shared:true,game}),before=body.decoded.slice(),row=readScenarioDialogue(body,game,options).rows[0];
  assert.equal(row.pagesEditable,false);assert.match(row.pagesReadOnlyReason,/자동 진행/);assert.equal(row.editable,true);
  assert.throws(()=>writeScenarioDialogue(body,game,[pages(row,['가','나'])],options),{code:'EDITOR_DIALOGUE_INVALID'});
  const out=writeScenarioDialogue(body,game,[{recordIndex:row.recordIndex,text:'가'}],options);assert.equal(new DataView(out.buffer).getUint16(72),0x8004);assert.deepEqual(body.decoded,before);
 }
});

test('old v3, v4 and nested v5 pages remain exact and readable on unrelated edits, including oversized and bit15 pages',()=>{
 for(const kind of ['v3','v4','v5'])for(const game of ['srwf-f','srwf-final']){
  const body=fixture({game}),v=new DataView(body.decoded.buffer);if(kind==='v3')v.setUint16(67,0x8004);
  const row=readScenarioDialogue(body,game,options).rows[0],content=pages(row,['가'.repeat(53),'나']);
  const edits=[{...content,...(kind==='v4'?{speakerId:2}:{}),...(kind==='v5'?{afterDialogueJson:'[{"speakerId":2,"text":"가"}]'}:{})}];
  const old=oldWrite(body,game,edits,options),read=readScenarioDialogue(wrap(body,old),game,options);
  assert.equal(magic(old),{v3:'SRWDIA03',v4:'SRWDIA04',v5:'SRWDIA05'}[kind]);assert.equal(read.rows[0].pageEncoding,'legacy');assert.equal(validateScenarioDialoguePages(read.rows[0],content.pagesJson,{gameId:game}).valid,true);
  assert.deepEqual(writeScenarioDialogue(wrap(body,old),game,[],options),old);
  const other=read.rows.find(r=>r.byteOffset===450),updated=writeScenarioDialogue(wrap(body,old),game,[{recordIndex:other.recordIndex,text:'나'}],options),again=readScenarioDialogue(wrap(body,updated),game,options);
  assert.equal(again.rows[0].pagesJson,content.pagesJson);assert.equal(again.rows.find(r=>r.byteOffset===450).text,'나');assert.deepEqual(again.body.decoded,body.decoded);
  assert.throws(()=>writeScenarioDialogue(wrap(body,old),game,[pages(row,['가'.repeat(53),'다'])],options),{code:'EDITOR_DIALOGUE_INVALID'});
  if(kind==='v5')assert.equal(again.rows[0].afterDialogueJson,'[{"speakerId":2,"text":"가"}]');
  const reset=writeScenarioDialogue(wrap(body,old),game,[{recordIndex:row.recordIndex,text:row.originalText}],options);assert.equal(readScenarioDialogue(wrap(body,reset),game,options).rows[0].pagesJson,'');
 }
});

test('legacy and modern page kinds coexist without silently rewriting old pages',()=>{
 const body=fixture(),rows=readScenarioDialogue(body,gameId,options).rows,old=oldWrite(body,gameId,[pages(rows[0],['가'.repeat(53),'나'])],options),oldAt=target(old);
 const out=writeScenarioDialogue(wrap(body,old),gameId,[pages(rows[1],['가','나'])],options),read=readScenarioDialogue(wrap(body,out),gameId,options);
 assert.equal(magic(out),'SRWDIA06');assert.equal(read.rows[0].pageEncoding,'legacy');assert.equal(read.rows[1].pageEncoding,'fixed-window-v1');
 assert.deepEqual(out.subarray(target(out),target(out)+110),old.subarray(oldAt,oldAt+110));assert.deepEqual(writeScenarioDialogue(wrap(body,out),gameId,[],options),out);
 const bad=out.slice();bad[bad.length-25]=51;assert.throws(()=>readScenarioDialogue(wrap(body,bad),gameId,options),{code:'EDITOR_DIALOGUE_INVALID'});
});

test('retained authority comes only from a successfully authenticated old body and is opaque',()=>{
 const body=fixture(),row=readScenarioDialogue(body,gameId,options).rows[0],entry=pages(row,['가'.repeat(53),'나']),old=oldWrite(body,gameId,[entry],options);
 const read=readScenarioDialogue(wrap(body,old),gameId,options),authority=read.legacyPageAuthority;
 assert.equal(Object.isFrozen(authority),true);assert.deepEqual(Reflect.ownKeys(authority),[]);
 assert.deepEqual(writeScenarioDialogue(body,gameId,[entry],{...options,replace:true,legacyPageAuthority:authority}),old);
 assert.throws(()=>writeScenarioDialogue(body,gameId,[entry],{...options,replace:true,legacyPageAuthority:{}}));
 const bad=old.slice();bad[target(old)+1]^=1;assert.throws(()=>readScenarioDialogue(wrap(body,bad),gameId,options));
 const changed=wrap(body,body.decoded.slice());new DataView(changed.decoded.buffer).setUint16(67,0x8004);assert.throws(()=>writeScenarioDialogue(changed,gameId,[entry],{...options,replace:true,legacyPageAuthority:authority}));
});


test('F keeps page editing inside its calibrated conservative 246px envelope',()=>{
 const game='srwf-f',body=fixture({game}),row=readScenarioDialogue(body,game,options).rows[0];
 assert.equal(row.pagesEditable,true);assert.equal(row.maxPageWidth,246);
 for(const value of [['가'.repeat(20),'가'.repeat(20)],['A'.repeat(30),'A'.repeat(30)]]){assert.equal(validateScenarioDialoguePages(row,JSON.stringify(value),{gameId:game}).valid,true);const out=writeScenarioDialogue(body,game,[pages(row,value)],options);assert.deepEqual(writeScenarioDialogue(wrap(body,out),game,[],options),out);}
 for(const value of [['가'.repeat(21),'가'],['A'.repeat(31),'가']])assert.equal(validateScenarioDialoguePages(row,JSON.stringify(value),{gameId:game}).valid,false);
});
