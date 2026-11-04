import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeEditorText} from '../assets/editor-text-codec.mjs';
import {readScenarioDialogue,writeScenarioDialogue,validateScenarioDialoguePages} from '../assets/editor-scenario-dialogue.mjs';
function fixture(gameId='srwf-final',{raw,targets=[400,400],length=640}={}){
 const bytes=new Uint8Array(length),v=new DataView(bytes.buffer),roots=[360,56,56,56,64,120,150,160,170,180,190,200,210,220];roots.forEach((p,i)=>v.setInt32(i*4,p-i*4));bytes.set(raw??encodeEditorText('아무로',{gameId}),400);
 targets.forEach((t,i)=>{const p=64+i*5;bytes[p]=0xb1;v.setInt16(p+1,t-p-1);});bytes[64+targets.length*5]=0xea;bytes[120]=0xea;
 return {physicalIndex:5,slots:[102],decoded:bytes,roots};
}
const withBody=(body,decoded)=>({...body,decoded});
for(const gameId of ['srwf-f','srwf-final'])test(`${gameId}: explicit same-speaker pages become F7 within one relocated existing B1`,()=>{
 const body=fixture(gameId),original=body.decoded.slice(),row=readScenarioDialogue(body,gameId).rows[0],pages=['아무로가나다','크리스','가나'],pagesJson=JSON.stringify(pages);
 assert.ok(row.pagesEditable);assert.equal(row.maxPages,4);assert.equal(row.maxPageBytes,107);assert.equal(row.pagesJson,'');assert.equal(validateScenarioDialoguePages(row,pagesJson,{gameId}).valid,true);
 const output=writeScenarioDialogue(body,gameId,[{recordIndex:row.recordIndex,pagesJson:JSON.stringify(pages,null,2)}]);assert.equal(String.fromCharCode(...output.subarray(output.length-32,output.length-24)),'SRWDIA06');
 const at=65+new DataView(output.buffer).getInt16(65),expected=[];for(const [i,text]of pages.entries()){if(i)expected.push(0xf7,0);expected.push(...encodeEditorText(text,{gameId}).slice(0,-1));}expected.push(255);
 assert.deepEqual(output.subarray(at,at+expected.length),Uint8Array.from(expected));assert.deepEqual(output.subarray(400,407),original.subarray(400,407));
 for(let p=0;p<original.length;p++)if(![65,66,70,71].includes(p))assert.equal(output[p],original[p]);assert.deepEqual(body.decoded,original);
 const read=readScenarioDialogue(withBody(body,output),gameId);assert.deepEqual(read.body.decoded,original);assert.equal(read.rows[0].text,pages[0]);assert.equal(read.rows[0].pagesJson,pagesJson);assert.equal(read.rows[0].identity,row.identity);assert.deepEqual(read.edits,[{recordIndex:row.recordIndex,pagesJson}]);assert.deepEqual(writeScenarioDialogue(withBody(body,output),gameId,[]),output);
 assert.deepEqual(writeScenarioDialogue(withBody(body,output),gameId,[{recordIndex:row.recordIndex,text:'가'}]),writeScenarioDialogue(body,gameId,[{recordIndex:row.recordIndex,text:'가'}]));
 assert.deepEqual(writeScenarioDialogue(withBody(body,output),gameId,[{recordIndex:row.recordIndex,text:row.originalText}]),original);assert.deepEqual(writeScenarioDialogue(withBody(body,output),gameId,[],{replace:true}),original);
});

test('page validation has an explicit clear mode, a bounded array, plain text and per-page byte budget',()=>{
 const gameId='srwf-final',body=fixture(),row=readScenarioDialogue(body,gameId).rows[0];
 assert.deepEqual(validateScenarioDialoguePages(row,'',{gameId}),{valid:true,message:'',pages:0,bytes:0});
 assert.equal(validateScenarioDialoguePages(row,'["가",""]',{gameId}).valid,true);
 assert.equal(validateScenarioDialoguePages(row,'["",""]',{gameId}).valid,true);
 assert.equal(validateScenarioDialoguePages(row,JSON.stringify(['가'.repeat(21),'나'.repeat(21)]),{gameId}).valid,true);
 for(const value of ['{}','null','not-json','[]','["가"]','["가",3]','["가","나","다","라","마"]',JSON.stringify(['가\n나\n다\n라','다']),JSON.stringify(['😀','다']),JSON.stringify(['가'.repeat(54),'나'])]){
  assert.equal(validateScenarioDialoguePages(row,value,{gameId}).valid,false,value);assert.throws(()=>writeScenarioDialogue(body,gameId,[{recordIndex:row.recordIndex,pagesJson:value}]));
 }
 for(const edit of [{recordIndex:row.recordIndex,text:'가',pagesJson:'["가","나"]'},{recordIndex:row.recordIndex,pagesJson:''},{recordIndex:row.recordIndex,pagesJson:['가','나']},{recordIndex:row.recordIndex,pagesJson:'["가","나"]',extra:1}])assert.throws(()=>writeScenarioDialogue(body,gameId,[edit]));
});

test('existing control tokens, aliases and signed16 distance keep page creation closed',()=>{
 const gameId='srwf-final';
 for(const token of [246,247,248,249]){
  const raw=Uint8Array.of(...encodeEditorText('아무로',{gameId}).slice(0,-1),token,...([248,249].includes(token)?[1]:[]),...encodeEditorText('가나',{gameId})),body=fixture(gameId,{raw}),row=readScenarioDialogue(body,gameId).rows[0];
  assert.equal(row.pagesEditable,false);assert.equal(validateScenarioDialoguePages(row,'["가","나"]',{gameId}).valid,false);assert.throws(()=>writeScenarioDialogue(body,gameId,[{recordIndex:row.recordIndex,pagesJson:'["가","나"]'}]));
 }
 for(const body of [fixture(gameId,{targets:[400,402]}),fixture(gameId,{length:33000})])assert.equal(readScenarioDialogue(body,gameId).rows[0].pagesEditable,false);
});

test('page metadata kind, reserved bytes, appended separators and original operands are authenticated',()=>{
 const gameId='srwf-final',body=fixture(),row=readScenarioDialogue(body,gameId).rows[0],output=writeScenarioDialogue(body,gameId,[{recordIndex:row.recordIndex,pagesJson:'["아무로","크리스"]'}]),footer=new DataView(output.buffer,output.length-32,32),start=640+footer.getUint32(24),patch=output.length-32-footer.getUint32(28)*8;
 for(const offset of [646,start,start+32,start+33,start+34,start+36,patch+4,patch+6,output.length-8]){const bad=output.slice();bad[offset]^=1;assert.throws(()=>readScenarioDialogue(withBody(body,bad),gameId),`tamper ${offset}`);}
});

test('an original page near the width cap can gain separately bounded pages',()=>{
 const gameId='srwf-final',text='가'.repeat(21),body=fixture(gameId,{raw:encodeEditorText(text,{gameId})}),row=readScenarioDialogue(body,gameId).rows[0];
 assert.ok(row.pagesEditable);const out=writeScenarioDialogue(body,gameId,[{recordIndex:row.recordIndex,pagesJson:JSON.stringify([text,text,text,text])}]);assert.deepEqual(readScenarioDialogue(withBody(body,out),gameId).body.decoded,body.decoded);
});
test('typed v3 metadata preserves ordinary edits beside a separate page edit',()=>{
 const gameId='srwf-final',body=fixture(gameId,{targets:[400,450]});body.decoded.set(encodeEditorText('가나',{gameId}),450);
 const rows=readScenarioDialogue(body,gameId).rows,pagesJson='["아무로","크리스"]',out=writeScenarioDialogue(body,gameId,[{recordIndex:rows[0].recordIndex,pagesJson},{recordIndex:rows[1].recordIndex,text:'가'}]),read=readScenarioDialogue(withBody(body,out),gameId);
 assert.equal(read.rows[0].pagesJson,pagesJson);assert.equal(read.rows[1].text,'가');assert.equal(read.rows[1].pagesJson,'');assert.deepEqual(read.body.decoded,body.decoded);
 const changed=writeScenarioDialogue(withBody(body,out),gameId,[{recordIndex:rows[1].recordIndex,text:'나'}]);const again=readScenarioDialogue(withBody(body,changed),gameId);assert.equal(again.rows[0].pagesJson,pagesJson);assert.equal(again.rows[1].text,'나');
});
