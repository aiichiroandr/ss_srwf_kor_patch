import test from 'node:test';
import assert from 'node:assert/strict';
import { F_NAME_MAP, FINAL_NAME_MAP } from '../assets/editor-name-map.mjs';
import { readScenarioPurpose, inspectScenarioDeadline, updateScenarioDeadlineBody, normalizeScenarioDeadlineBody } from '../assets/editor-scenario-deadlines.mjs';
import { inspectPendingObjectiveHook } from '../assets/editor-scenario-objective-base.mjs';

function fixture(gameId,guard=false) {
  const bytes=new Uint8Array(300),view=new DataView(bytes.buffer),roots=Array(14).fill(56);
  const prefix=guard?[0xd0,2,0,250,0xf0,0,0,22]:[],start=100,p=start+prefix.length;
  roots[8]=start;roots[9]=p+24;roots[13]=200;
  roots.forEach((root,i)=>view.setInt32(i*4,root-i*4));
  bytes.set(prefix,start);bytes.set([0xd3,252,0xf2,0,15,0,0,0xd3,251,0xf2,0,11,0,0,0xe9,1,255,(-16-prefix.length)&255,0xec,1,0xea,0xec,2,0xea],p);
  const names=gameId==='srwf-f'?F_NAME_MAP:FINAL_NAME_MAP;
  function text(s){const b=[];for(const c of s){const [key]=[...names].find(([k,g])=>g===c);for(let j=0;j<key.length;j+=2)b.push(parseInt(key.slice(j,j+2),16));}return [...b,255];}
  const win=text('적의전멸'),lose=text('아군의전멸');
  bytes.set([0xe7,2,0,4,0xe7,3,0,4,0,win.length+2,...win,...lose],200);
  return {decoded:bytes,roots,slots:[2,4],physicalIndex:1};
}

function execute(bytes,start,state) {
  const v=new DataView(bytes.buffer,bytes.byteOffset),flag=state.flag??true;
  let p=start,value=0,result=0;
  for(let i=0;i<100;i++) {
    const op=bytes[p];
    if(op===0xd0){assert.equal(bytes[p+1],2);p+=4;}
    else if(op===0xf0||op===0xf1)p=(op===0xf0?!flag:flag)?p+2+v.getInt16(p+2):p+4;
    else if(op===0xd3){value=bytes[p+1]===252?state.enemy:state.ally;p+=2;}
    else if(op===0xd4){assert.equal(bytes[p+1],0);value=state.turn;p+=2;}
    else if(op===0xf2||op===0xf5)p=(op===0xf2?value===v.getUint16(p+3):value>=v.getUint16(p+3))?p+1+v.getInt16(p+1):p+5;
    else if(op===1)p+=1+v.getInt16(p+1);
    else if(op===0xec){result=bytes[p+1];p+=2;}
    else if(op===0xea)return {result,active:false};
    else if(op===0xe9)return {result,active:true,next:p+1};
    else assert.fail(`Unexpected instruction ${p}:${op}`);
  }
  assert.fail('Callback failed to yield');
}

for(const gameId of ['srwf-f','srwf-final'])test(`${gameId} deadline preserves existing outcomes, yields, original code and both purpose strings`,()=>{
  const base=fixture(gameId),before=base.decoded.slice(),row=inspectScenarioDeadline(base,gameId);
  assert.equal(row.deadline,0);assert.equal(row.purpose.victory,'적의전멸');
  const changed=updateScenarioDeadlineBody(base,gameId,5),roots=Array.from({length:14},(_,i)=>i*4+new DataView(changed.buffer).getInt32(i*4));
  const purpose=readScenarioPurpose(changed,gameId);assert.equal(purpose.victory,'적의전멸');assert.equal(purpose.defeat,'아군의전멸또는6턴이상');
  const normalized=normalizeScenarioDeadlineBody({...base,decoded:changed,roots},gameId);
  assert.deepEqual(normalized.body.decoded,before);assert.equal(normalized.deadline,5);
  assert.deepEqual(updateScenarioDeadlineBody({...base,decoded:changed,roots},gameId,0),before);
  for(const [state,result]of [[{enemy:0,ally:0,turn:6},1],[{enemy:0,ally:1,turn:6},1],[{enemy:1,ally:0,turn:1},2],
    [{enemy:1,ally:1,turn:5},0],[{enemy:1,ally:1,turn:6},2]])assert.equal(execute(changed,100,state).result,result);
  const first=execute(changed,100,{enemy:1,ally:1,turn:5});assert.equal(execute(changed,first.next,{enemy:1,ally:1,turn:6}).result,2);
  assert.deepEqual(base.decoded,before);
  const edited=updateScenarioDeadlineBody({...base,decoded:changed,roots},gameId,8);
  assert.equal(normalizeScenarioDeadlineBody({...base,decoded:edited,roots:Array.from({length:14},(_,i)=>i*4+new DataView(edited.buffer).getInt32(i*4))},gameId).deadline,8);
});

test('blocked original event guards cannot activate a new failure, and unknown prefixes do not grant a hook',()=>{
  const base=fixture('srwf-f',true),changed=updateScenarioDeadlineBody(base,'srwf-f',3);
  assert.equal(execute(changed,100,{enemy:1,ally:1,turn:4,flag:false}).result,0);
  assert.equal(execute(changed,100,{enemy:1,ally:1,turn:4,flag:true}).result,2);
  const unknown=fixture('srwf-f');unknown.decoded[100]=0xe1;assert.equal(inspectScenarioDeadline(unknown,'srwf-f'),null);
  assert.throws(()=>updateScenarioDeadlineBody(unknown,'srwf-f',3),{code:'EDITOR_OBJECTIVE_INVALID'});
});

test('bounded regeneration rejects changed code, text, roots, metadata and unsupported source layouts',()=>{
  const base=fixture('srwf-final'),changed=updateScenarioDeadlineBody(base,'srwf-final',5);
  const root13=52+new DataView(changed.buffer).getInt32(52);
  for(const offset of [101,103,300+2,root13+10,changed.length-8,changed.length-1]){
    const bad=changed.slice();bad[offset]^=1;
    assert.throws(()=>normalizeScenarioDeadlineBody({...base,decoded:bad},'srwf-final'),{code:'EDITOR_OBJECTIVE_INVALID'});
  }
  for(const value of [-1,99,1.2,null])assert.throws(()=>updateScenarioDeadlineBody(base,'srwf-final',value),{code:'EDITOR_OBJECTIVE_INVALID'});
  assert.throws(()=>normalizeScenarioDeadlineBody({...base,decoded:changed},'srwf-final',{scenarioLayout:'stock'}),{code:'EDITOR_OBJECTIVE_INVALID'});
  assert.throws(()=>updateScenarioDeadlineBody(base,'srwf-final',5,{scenarioLayout:'stock'}),{code:'EDITOR_OBJECTIVE_INVALID'});
  const large=fixture('srwf-f'),decoded=new Uint8Array(0x8000);decoded.set(large.decoded);
  assert.throws(()=>updateScenarioDeadlineBody({...large,decoded},'srwf-f',5),{code:'EDITOR_OBJECTIVE_INVALID'});
});


test('incoming loop references prohibit in-place writes and remain intact under closed-callback relocation',()=>{
  for(const [prefix,wordCell]of [[1,60],[3,60],[0xf2,60],[0xf0,61],[0xf6,61],[2,60]]){
    const body=fixture('srwf-f'),bytes=body.decoded,view=new DataView(bytes.buffer);
    const opcode=prefix===0xf0||prefix===0xf6?wordCell-2:wordCell-1;bytes[opcode]=prefix;
    if(opcode===wordCell-2)bytes[opcode+1]=0;
    if(prefix===2)view.setInt32(wordCell,115-wordCell);else view.setInt16(wordCell,115-wordCell);
    const original=bytes.slice();
    // The old loop cannot be overwritten: existing references can enter it.
    assert.equal(inspectPendingObjectiveHook(bytes,body.roots),null);
    const row=inspectScenarioDeadline(body,'srwf-f');assert.ok(row?.criteriaEditable);
    const changed=updateScenarioDeadlineBody(body,'srwf-f',5);
    const updatedView=new DataView(changed.buffer),newRoot=32+updatedView.getInt32(32);
    assert.ok(newRoot>=original.length);
    for(let i=56;i<original.length;i++)assert.equal(changed[i],original[i]);
    assert.equal(prefix===2?wordCell+updatedView.getInt32(wordCell):wordCell+updatedView.getInt16(wordCell),115);
    const normalized=normalizeScenarioDeadlineBody({...body,decoded:changed,roots:Array.from({length:14},(_,i)=>i*4+updatedView.getInt32(i*4))},'srwf-f');
    assert.deepEqual(normalized.body.decoded,original);
    assert.equal(normalized.deadline,5);
    assert.equal(execute(changed,newRoot,{enemy:1,ally:1,turn:5}).result,0);
    assert.equal(execute(changed,newRoot,{enemy:1,ally:1,turn:6}).result,2);
    assert.deepEqual(updateScenarioDeadlineBody({...body,decoded:changed,roots:Array.from({length:14},(_,i)=>i*4+updatedView.getInt32(i*4))},'srwf-f',0),original);
  }
});
