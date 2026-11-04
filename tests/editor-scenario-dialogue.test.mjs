import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeEditorText} from '../assets/editor-text-codec.mjs';
import {readScenarioDialogue,writeScenarioDialogue,validateScenarioDialogueText} from '../assets/editor-scenario-dialogue.mjs';
import {readScenarioDialogueOwners} from '../assets/editor-scenario-display.mjs';

function fixture(gameId='srwf-final',{targets=[400,400],text,unknown=false,length=640}={}){
 const b=new Uint8Array(length),v=new DataView(b.buffer),roots=[360,56,56,56,64,120,150,160,170,180,190,200,210,220];
 roots.forEach((p,i)=>v.setInt32(i*4,p-i*4));
 const raw=s=>encodeEditorText(s,{gameId}).slice(0,-1);
 b.set(text??Uint8Array.of(...raw('아무로'),0xf6,...raw('크리스'),0xf9,2,...raw('가나'),0xff),400);
 if(unknown)b.set([0xfa,0x01,0xff],400);
 targets.forEach((target,i)=>{const p=64+i*5;b[p]=0xb1;v.setInt16(p+1,target-(p+1));});
 b[64+targets.length*5]=0xea;b[120]=0xea;
 return {physicalIndex:5,slots:[102],decoded:b,roots};
}
for(const gameId of ['srwf-f','srwf-final'])test(`${gameId}: reached owners, shared runs, immutable controls, trailer normalization and exact reset`,()=>{
 const body=fixture(gameId),parsed=readScenarioDialogue(body,gameId);assert.equal(parsed.coverage.owners,2);assert.equal(parsed.coverage.complete,false);
 const row=parsed.rows.find(r=>r.originalText==='아무로');assert.ok(row?.editable);assert.equal(row.owners.length,2);assert.equal(row.maxBytes,6);assert.ok(row.controlTokens.some(t=>t.kind==='F6'));assert.ok(row.controlTokens.some(t=>t.kind==='F9'&&t.argument===2));
 const result=writeScenarioDialogue(body,gameId,[{recordIndex:row.recordIndex,identity:row.identity,text:'아'}]),read=readScenarioDialogue({...body,decoded:result},gameId);
 assert.deepEqual(read.body.decoded,body.decoded);assert.deepEqual(read.body.roots,body.roots);assert.equal(read.rows.find(r=>r.recordIndex===row.recordIndex).text,'아');assert.equal(read.edits.length,1);
 assert.deepEqual(result.slice(row.byteOffset+2,row.byteOffset+row.maxBytes),new Uint8Array(4));
 const mutable=new Set(Array.from({length:row.maxBytes},(_,i)=>row.byteOffset+i));for(let i=0;i<body.decoded.length;i++)if(!mutable.has(i))assert.equal(result[i],body.decoded[i]);
 assert.deepEqual(writeScenarioDialogue({...body,decoded:result},gameId,read.edits),result);
 assert.deepEqual(writeScenarioDialogue({...body,decoded:result},gameId,[]),result);
 assert.deepEqual(writeScenarioDialogue({...body,decoded:result},gameId,[],{replace:true}),body.decoded);
 assert.deepEqual(writeScenarioDialogue({...body,decoded:result},gameId,[{recordIndex:row.recordIndex,text:row.originalText}]),body.decoded);
 assert.equal(validateScenarioDialogueText(row,'아무로가',{gameId}).valid,false);assert.equal(validateScenarioDialogueText(row,'아\n무',{gameId}).valid,false);assert.equal(validateScenarioDialogueText(row,'',{gameId}).valid,true);
});
test('interior alias starts split shared runs at the original byte boundary',()=>{
 const body=fixture('srwf-final',{targets:[400,404],text:encodeEditorText('아무로',{gameId:'srwf-final'})}),read=readScenarioDialogue(body,'srwf-final');
 const head=read.rows.find(r=>r.byteOffset===400),tail=read.rows.find(r=>r.byteOffset===404);
 assert.equal(head.maxBytes,4);assert.equal(head.originalText,'아무');assert.equal(tail.originalText,'로');assert.equal(tail.owners.length,2);
 const out=writeScenarioDialogue(body,'srwf-final',[{recordIndex:head.recordIndex,text:'가'}]);assert.deepEqual(out.slice(404,407),body.decoded.slice(404,407));
 assert.throws(()=>writeScenarioDialogue(body,'srwf-final',[{recordIndex:head.recordIndex,text:'가나다'}]),/4바이트/);
});
test('a target in the low byte of a glyph and unknown glyphs are never writable',()=>{
 const body=fixture('srwf-final',{targets:[400,401],text:encodeEditorText('아무로',{gameId:'srwf-final'})}),read=readScenarioDialogue(body,'srwf-final');
 assert.equal(read.rows.find(r=>r.byteOffset===400).editable,false);
 assert.throws(()=>writeScenarioDialogue(body,'srwf-final',[{recordIndex:'5:400',text:'가'}]),/참조|미해석/);
 const unknown=readScenarioDialogue(fixture('srwf-final',{unknown:true}),'srwf-final');assert.equal(unknown.rows[0].editable,false);assert.match(unknown.rows[0].text,/FA01/);
});
test('glyph-trail FF is text and a supplied new glyph mapping survives reopen',()=>{
 const body=fixture('srwf-final',{targets:[400],text:Uint8Array.of(0xf0,0xff,0xf6,0xec,0x26,0xff)}),glyphMap=new Map([['F0FF','가'],['F5FC','힣']]);
 const read=readScenarioDialogue(body,'srwf-final',{glyphMap});assert.equal(read.rows[0].originalText,'가');assert.equal(read.rows[0].maxBytes,2);
 const row=read.rows[0];assert.equal(validateScenarioDialogueText(row,'힣',{gameId:'srwf-final',glyphMap}).valid,true);
 const out=writeScenarioDialogue(body,'srwf-final',[{recordIndex:row.recordIndex,text:'힣'}],{glyphMap});assert.equal(readScenarioDialogue({...body,decoded:out},'srwf-final',{glyphMap}).rows[0].text,'힣');
 assert.throws(()=>readScenarioDialogue({...body,decoded:out},'srwf-final'),/글자|기록|정규/);
});
test('partial updates merge while complete snapshots remove omitted edits; identity/duplicates/controls validate',()=>{
 const body=fixture(),rows=readScenarioDialogue(body,'srwf-final').rows.filter(r=>r.editable);const edits=rows.slice(0,2).map(r=>({recordIndex:r.recordIndex,text:'가'}));
 const first=writeScenarioDialogue(body,'srwf-final',edits),merged=writeScenarioDialogue({...body,decoded:first},'srwf-final',edits.slice(1));assert.deepEqual(merged,first);
 const second=writeScenarioDialogue({...body,decoded:first},'srwf-final',edits.slice(1),{replace:true}),again=readScenarioDialogue({...body,decoded:second},'srwf-final');assert.equal(again.edits.length,1);assert.equal(again.rows.find(r=>r.recordIndex===rows[0].recordIndex).text,rows[0].originalText);
 assert.throws(()=>writeScenarioDialogue(body,'srwf-final',[{...edits[0],identity:'wrong'}]));assert.throws(()=>writeScenarioDialogue(body,'srwf-final',[edits[0],edits[0]]));assert.throws(()=>writeScenarioDialogue(body,'srwf-final',[{recordIndex:rows[0].recordIndex,text:'😀'}]),/없는 글자/);
});
test('tampered trailer lengths, preimage, current text, padding, field order and reserved bytes reject',()=>{
 const body=fixture(),row=readScenarioDialogue(body,'srwf-final').rows.find(r=>r.editable),out=writeScenarioDialogue(body,'srwf-final',[{recordIndex:row.recordIndex,text:'가'}]);
 for(const at of [row.byteOffset,row.byteOffset+2,body.decoded.length,body.decoded.length+8,body.decoded.length+40,out.length-24,out.length-20,out.length-12,out.length-1]){
  const bad=out.slice();bad[at]^=1;assert.throws(()=>readScenarioDialogue({...body,decoded:bad},'srwf-final'),`tamper ${at}`);
 }
});
test('a body without RAM room stays readable, while unknown command boundaries do not create rows',()=>{
 const body=fixture('srwf-f',{length:0x8000-4}),row=readScenarioDialogue(body,'srwf-f').rows[0];assert.equal(row.editable,false);assert.throws(()=>writeScenarioDialogue(body,'srwf-f',[{recordIndex:row.recordIndex,text:'가'}]),/공간/);
 const hidden=fixture();hidden.decoded[64]=0xff;const read=readScenarioDialogue(hidden,'srwf-final');assert.equal(read.rows.length,0);assert.ok(read.coverage.frontiers.length);
 const conflict=fixture();conflict.decoded.set([0xf2,0,2,0,1],64);assert.equal(readScenarioDialogueOwners(conflict,'srwf-final').owners.length,0);
});
