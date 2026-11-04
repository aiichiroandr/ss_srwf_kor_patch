import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeEditorText} from '../assets/editor-text-codec.mjs';
import {readScenarioDialogue,writeScenarioDialogue,validateScenarioDialogueText} from '../assets/editor-scenario-dialogue.mjs';

function fixture(gameId='srwf-final',{text='아무로',targets=[400,400],length=640,raw}={}) {
 const bytes=new Uint8Array(length),v=new DataView(bytes.buffer),roots=[360,56,56,56,64,120,150,160,170,180,190,200,210,220];
 roots.forEach((p,i)=>v.setInt32(i*4,p-i*4));bytes.set(raw??encodeEditorText(text,{gameId}),400);
 targets.forEach((target,i)=>{const p=64+i*5;bytes[p]=0xb1;v.setInt16(p+1,target-p-1);});bytes[64+targets.length*5]=0xea;bytes[120]=0xea;
 return {physicalIndex:5,slots:[102],decoded:bytes,roots};
}
const bodyWith=(body,decoded)=>({...body,decoded});
const raw=(text,gameId)=>encodeEditorText(text,{gameId}).slice(0,-1);
function footer(bytes){return new DataView(bytes.buffer,bytes.byteOffset+bytes.length-32,32);}
for(const gameId of ['srwf-f','srwf-final'])test(`${gameId}: expanding a shared whole B1 string changes only proved owners and append data`,()=>{
 const body=fixture(gameId),source=body.decoded.slice(),row=readScenarioDialogue(body,gameId).rows[0];
 assert.equal(row.expandable,true);assert.equal(row.maxBytes,6);assert.equal(row.maxExpandedBytes,107);
 const text='아무로가나다';assert.equal(validateScenarioDialogueText(row,text,{gameId}).valid,true);
 const out=writeScenarioDialogue(body,gameId,[{recordIndex:row.recordIndex,text}]);
 assert.equal(String.fromCharCode(...out.subarray(out.length-32,out.length-24)),'SRWDIA02');
 assert.deepEqual(body.decoded,source);assert.deepEqual(out.subarray(400,407),source.subarray(400,407),'original string is retained');
 const view=new DataView(out.buffer),target=65+view.getInt16(65);assert.equal(target,source.length);assert.equal(70+view.getInt16(70),target);
 assert.deepEqual(out.subarray(target,target+13),encodeEditorText(text,{gameId}));
 for(let p=0;p<source.length;p++)if(![65,66,70,71].includes(p))assert.equal(out[p],source[p]);
 const read=readScenarioDialogue(bodyWith(body,out),gameId);assert.deepEqual(read.body.decoded,source);assert.equal(read.rows[0].identity,row.identity);assert.equal(read.rows[0].text,text);
 assert.deepEqual(writeScenarioDialogue(bodyWith(body,out),gameId,[]),out);
 assert.deepEqual(writeScenarioDialogue(bodyWith(body,out),gameId,[{recordIndex:row.recordIndex,text:'가'}]),writeScenarioDialogue(body,gameId,[{recordIndex:row.recordIndex,text:'가'}]));
 assert.deepEqual(writeScenarioDialogue(bodyWith(body,out),gameId,[],{replace:true}),source);
});

test('relocation preserves F6/F7/FF and applies other edits of the same owner in its copied record',()=>{
 const gameId='srwf-final',bytes=Uint8Array.of(...raw('아무로',gameId),0xf6,...raw('크리스',gameId),0xf7,...raw('가나',gameId),0xff),body=fixture(gameId,{raw:bytes}),rows=readScenarioDialogue(body,gameId).rows;
 const first=rows[0],second=rows[1],text='아무로가나다';assert.ok(first.expandable);assert.ok(second.expandable);
 const out=writeScenarioDialogue(body,gameId,[{recordIndex:first.recordIndex,text},{recordIndex:second.recordIndex,text:'가'}]);
 const target=65+new DataView(out.buffer).getInt16(65),expected=Uint8Array.of(...raw(text,gameId),0xf6,...raw('가',gameId),0xf7,...raw('가나',gameId),0xff);
 assert.deepEqual(out.subarray(target,target+expected.length),expected);assert.deepEqual(out.subarray(400,400+bytes.length),bytes);
 assert.deepEqual(readScenarioDialogue(bodyWith(body,out),gameId).body.decoded,body.decoded);
});

test('all possible interior/head aliases and variable or unknown tokens close expansion',()=>{
 for(const target of [402,406]){
  const body=fixture('srwf-final',{targets:[400,target]}),row=readScenarioDialogue(body,'srwf-final').rows.find(r=>r.byteOffset===400);
  assert.equal(row.expandable,false);assert.throws(()=>writeScenarioDialogue(body,'srwf-final',[{recordIndex:row.recordIndex,text:'가나다라마'}]),/바이트|참조/);
 }
 const head=fixture();head.decoded[250]=0xb3;new DataView(head.decoded.buffer).setInt16(251,400-251);
 assert.equal(readScenarioDialogue(head,'srwf-final').rows[0].expandable,false);
 const rooted=fixture();new DataView(rooted.decoded.buffer).setInt32(0,400);rooted.roots[0]=400;
 assert.equal(readScenarioDialogue(rooted,'srwf-final').rows[0].expandable,false);
 for(const token of [0xf8,0xf9,0xfa]){
  const body=fixture('srwf-final',{raw:Uint8Array.of(...raw('아무로','srwf-final'),token,1,255)}),row=readScenarioDialogue(body,'srwf-final').rows[0];assert.equal(row.expandable,false);assert.ok(row.expansionReason);
 }
});

test('the original page model caps final terminators, newline emission and third-newline page breaks',()=>{
 const gameId='srwf-final',body=fixture(gameId),row=readScenarioDialogue(body,gameId).rows[0];
 assert.equal(validateScenarioDialogueText(row,'가'.repeat(53),{gameId}).valid,true);
 assert.equal(validateScenarioDialogueText(row,'가'.repeat(54),{gameId}).valid,false);
 assert.doesNotThrow(()=>writeScenarioDialogue(body,gameId,[{recordIndex:row.recordIndex,text:'가'.repeat(53)}]));
 assert.throws(()=>writeScenarioDialogue(body,gameId,[{recordIndex:row.recordIndex,text:'가'.repeat(54)}]),/바이트/);
 const controls=fixture(gameId,{raw:Uint8Array.of(...raw('가',gameId),246,...raw('나',gameId),246,...raw('다',gameId),246,...raw('라',gameId),255)}),rs=readScenarioDialogue(controls,gameId).rows;
 assert.equal(rs[0].maxExpandedBytes,99);assert.equal(rs[3].maxExpandedBytes,107);
 // Each row alone fits; their combined first-page edits do not.
 assert.throws(()=>writeScenarioDialogue(controls,gameId,[{recordIndex:rs[0].recordIndex,text:'가'.repeat(40)},{recordIndex:rs[1].recordIndex,text:'나'.repeat(40)}]),/108바이트/);
});

test('page overflow in an untouched page and lack of signed16/RAM space refuse expansion',()=>{
 const gameId='srwf-final',tooWide=fixture(gameId,{raw:Uint8Array.of(...raw('가'.repeat(54),gameId),247,...raw('나',gameId),255)}),rows=readScenarioDialogue(tooWide,gameId).rows;
 assert.equal(rows[1].expandable,false);assert.match(rows[1].expansionReason,/108바이트/);
 const distant=fixture(gameId,{length:33000}),far=readScenarioDialogue(distant,gameId).rows[0];assert.equal(far.expandable,false);assert.match(far.expansionReason,/signed16/);
 const full=fixture('srwf-f',{length:0x8000-100}),near=readScenarioDialogue(full,'srwf-f').rows[0];assert.equal(near.expandable,false);
});

test('multiple whole strings append in original target order and cross-string signed16 drift is checked',()=>{
 const gameId='srwf-final',body=fixture(gameId,{targets:[400,450]}),v=new DataView(body.decoded.buffer);body.decoded.set(encodeEditorText('가나',{gameId}),450);
 const rows=readScenarioDialogue(body,gameId).rows,out=writeScenarioDialogue(body,gameId,[{recordIndex:rows[1].recordIndex,text:'가나다라'},{recordIndex:rows[0].recordIndex,text:'아무로가나다'}]);
 const vv=new DataView(out.buffer),one=65+vv.getInt16(65),two=70+vv.getInt16(70);assert.equal(one,640);assert.equal(two,653);assert.deepEqual(readScenarioDialogue(bodyWith(body,out),gameId).body.decoded,body.decoded);
 const edge=fixture(gameId,{targets:[400,450],length:32830});edge.decoded.set(encodeEditorText('가나',{gameId}),450);const er=readScenarioDialogue(edge,gameId).rows;assert.ok(er.every(r=>r.expandable));
 assert.throws(()=>writeScenarioDialogue(edge,gameId,[{recordIndex:er[0].recordIndex,text:'아무로가나다'},{recordIndex:er[1].recordIndex,text:'가나다라'}]),/signed16/);
});

test('expanded metadata rejects modified current operands, copy bytes, original operands and trailer fields',()=>{
 const body=fixture(),row=readScenarioDialogue(body,'srwf-final').rows[0],out=writeScenarioDialogue(body,'srwf-final',[{recordIndex:row.recordIndex,text:'아무로가나다'}]),fv=footer(out),payload=640+fv.getUint32(24),patchStart=out.length-32-fv.getUint32(28)*8;
 for(const at of [65,66,70,640,650,payload,payload+32,patchStart,patchStart+4,patchStart+6,out.length-8,out.length-4]){
  const bad=out.slice();bad[at]^=1;assert.throws(()=>readScenarioDialogue(bodyWith(body,bad),'srwf-final'),`tamper ${at}`);
 }
});
test('glyph-trail FF and a newly allocated Hangul remain full tokens during relocation',()=>{
 const gameId='srwf-final',glyphMap=new Map([['F0FF','가'],['F5FC','힣']]),body=fixture(gameId,{raw:Uint8Array.of(0xf0,0xff,0xff)}),row=readScenarioDialogue(body,gameId,{glyphMap}).rows[0];
 assert.ok(row.expandable);const out=writeScenarioDialogue(body,gameId,[{recordIndex:row.recordIndex,text:'힣힣'}],{glyphMap});const start=65+new DataView(out.buffer).getInt16(65);
 assert.deepEqual(out.subarray(start,start+5),Uint8Array.of(0xf5,0xfc,0xf5,0xfc,0xff));assert.equal(readScenarioDialogue(bodyWith(body,out),gameId,{glyphMap}).rows[0].text,'힣힣');assert.deepEqual(readScenarioDialogue(bodyWith(body,out),gameId,{glyphMap}).body.decoded,body.decoded);
});
