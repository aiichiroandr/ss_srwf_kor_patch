import test from 'node:test';
import assert from 'node:assert/strict';
import {readBattleEmptyScreenFragment,readBattleScreenNoWriteOperation} from '../assets/editor-battle-empty-screen-fragment.mjs';

const screen=(width,height)=>{
 const payload=new Uint8Array(24),view=new DataView(payload.buffer);
 view.setUint32(4,20);payload.set([1,1],10);
 view.setUint32(12,0xffffffff);payload.set([width,height],18);
 return {formatByte:50,payload};
};
test('only the selected sc02 terminal descriptor with a zero dimension is an empty copy',()=>{
 for(const [width,height]of [[0,0],[0,29],[7,0]]){
  assert.deepEqual(readBattleEmptyScreenFragment(screen(width,height),1),
   {index:1,width,height,descriptorOffset:12,empty:true});
 }
 assert.equal(readBattleEmptyScreenFragment(screen(1,1),1),null);
 assert.equal(readBattleEmptyScreenFragment(screen(0,29),0),null);
 assert.equal(readBattleEmptyScreenFragment(screen(0,29),2),null);
});
test('unknown formats, malformed boundaries and missing terminal bytes never provide a guessed fragment',()=>{
 const good=screen(0,29),bad=()=>({formatByte:50,payload:good.payload.slice()});
 for(const candidate of [null,{...good,formatByte:49},{...good,payload:[...good.payload]},
  {...good,payload:good.payload.slice(0,19)}])assert.equal(readBattleEmptyScreenFragment(candidate,1),null);
 for(const index of [-1,256,NaN,1.5,'1'])assert.equal(readBattleEmptyScreenFragment(good,index),null);
 const marker=bad();marker.payload[12]=0;assert.equal(readBattleEmptyScreenFragment(marker,1),null);
 for(const boundary of [0,12,16,28,0xffffffff]){
  const value=bad();new DataView(value.payload.buffer).setUint32(4,boundary);
  assert.equal(readBattleEmptyScreenFragment(value,1),null);
 }
});

test('a bounded original source cell alias is a no-write operation, never another directory image',()=>{
 const payload=new Uint8Array(40);payload.set(screen(0,0).payload);
 const selected={formatByte:50,payload},command={resourceIndex:0,fragmentIndex:2,x:3,y:4,flags:2,
  sourceCommand:Uint8Array.of(0xfa,0xc4,0,2,3,4,2)};
 assert.equal(readBattleEmptyScreenFragment(selected,2),null);
 assert.deepEqual(readBattleScreenNoWriteOperation(selected,command),
  {kind:'bounded-cell-zero-height-no-write',index:2,width:0,height:0,sourceOffset:20,empty:true});
 for(let component=0;component<7;component++){
  const sourceCommand=command.sourceCommand.slice();sourceCommand[component]^=1;
  assert.equal(readBattleScreenNoWriteOperation(selected,{...command,sourceCommand}),null);
 }
 for(const sourceCommand of [undefined,Array.from(command.sourceCommand),command.sourceCommand.subarray(0,6),
  Uint8Array.of(...command.sourceCommand,0)])assert.equal(readBattleScreenNoWriteOperation(selected,{...command,sourceCommand}),null);
 for(let component=0;component<8;component++){
  payload[20+component]=1;assert.equal(readBattleScreenNoWriteOperation(selected,command),null);payload[20+component]=0;
 }
 assert.equal(readBattleScreenNoWriteOperation({...selected,payload:payload.subarray(0,27)},command),null);
 assert.equal(readBattleScreenNoWriteOperation({...selected,formatByte:49},command),null);
 payload[12]=0;assert.equal(readBattleScreenNoWriteOperation(selected,command),null);
});
