import test from 'node:test';
import assert from 'node:assert/strict';
import {restoreBattleBackgroundPalette,approachBattleBackgroundPalette} from '../assets/editor-battle-background-palette.mjs';

const approachColor=(current,target)=>{
 let result=0;
 for(const shift of [0,5,10]){
  const value=(current>>>shift)&31,to=(target>>>shift)&31;
  result|=(value+Math.sign(to-value))<<shift;
 }
 return result;
};
test('DA approaches every channel in the sixteen selected raw background banks by one unit',()=>{
 const sourceWords=Uint16Array.from({length:6144},(_,i)=>(i*251)&32767),addressMap=new Uint16Array(64);
 addressMap.set(Array.from({length:16},(_,i)=>16+i),16);
 for(const [flags,base]of [[0,6],[32,22],[64,22],[96,6],[128,6],[255,6]]){
  const current=10|(20<<5)|(5<<10),destinationWords=new Uint16Array(1024).fill(current);
  assert.equal(approachBattleBackgroundPalette({sceneFlagsByte:flags,mode:1,sourceWords,destinationWords,addressMap}),true);
  assert.deepEqual([...destinationWords.slice(256,512)],
   [...sourceWords.slice(base*16,(base+16)*16)].map(target=>approachColor(current,target)));
  assert.ok(destinationWords.slice(0,256).every(word=>word===current));
  assert.ok(destinationWords.slice(512).every(word=>word===current));
 }
});
test('DA retains direct bank16, converges without overshooting and keeps equal channels fixed',()=>{
 const sourceWords=new Uint16Array(6144).fill(31),addressMap=new Uint16Array(64);
 addressMap.set(Array.from({length:16},(_,i)=>16+i),16);
 sourceWords.fill(15|(10<<5)|(5<<10),16*16,17*16);
 const initial=13|(12<<5)|(5<<10),destinationWords=new Uint16Array(1024).fill(initial);
 const state={sceneFlagsByte:0,mode:1,sourceWords,destinationWords,addressMap};
 // Column2/group2 maps raw source bank16 to physical destination bank26.
 assert.equal(approachBattleBackgroundPalette(state),true);
 assert.equal(destinationWords[26*16],14|(11<<5)|(5<<10));
 for(let n=0;n<40;n++)assert.equal(approachBattleBackgroundPalette(state),true);
 assert.equal(destinationWords[26*16],15|(10<<5)|(5<<10));
});
test('DA validates the full destination extent atomically and refuses unresolved palette context',()=>{
 const sourceWords=new Uint16Array(6144).fill(31),destinationWords=new Uint16Array(1024).fill(777),addressMap=new Uint16Array(64);
 addressMap.set(Array.from({length:16},(_,i)=>16+i),16);addressMap[31]=64;
 const state={sceneFlagsByte:0,mode:1,sourceWords,destinationWords,addressMap};
 assert.equal(approachBattleBackgroundPalette(state),false);assert.ok(destinationWords.every(word=>word===777));
 for(const replacement of [{sceneFlagsByte:-1},{sceneFlagsByte:256},{sceneFlagsByte:undefined},
  {mode:0},{mode:2},{sourceWords:new Uint16Array(6143)},
  {destinationWords:new Uint16Array(1023)},{addressMap:new Uint16Array(63)}]){
  assert.equal(approachBattleBackgroundPalette({...state,...replacement}),false);
  assert.ok(destinationWords.every(word=>word===777));
 }
});

test('background restoration chooses the actual side bank and restores all sixteen palettes',()=>{
 const sourceWords=Uint16Array.from({length:6144},(_,i)=>i),addressMap=new Uint16Array(64);
 addressMap.set(Array.from({length:16},(_,i)=>16+i),16);
 for(const [flags,base]of [[0,6],[32,22],[64,22],[96,6]]){
  const destinationWords=new Uint16Array(1024).fill(777);
  assert.equal(restoreBattleBackgroundPalette({sceneFlagsByte:flags,mode:1,sourceWords,destinationWords,addressMap}),true);
  assert.deepEqual(destinationWords.slice(256,512),sourceWords.slice(base*16,(base+16)*16));
  assert.ok(destinationWords.slice(0,256).every(word=>word===777));
  assert.ok(destinationWords.slice(512).every(word=>word===777));
 }
});

test('a bad final background destination cannot leave a partially restored plane',()=>{
 const sourceWords=new Uint16Array(6144).fill(31),destinationWords=new Uint16Array(1024).fill(777),addressMap=new Uint16Array(64);
 addressMap.set(Array.from({length:16},(_,i)=>16+i),16);addressMap[31]=64;
 const state={sceneFlagsByte:0,mode:1,sourceWords,destinationWords,addressMap};
 assert.equal(restoreBattleBackgroundPalette(state),false);
 assert.ok(destinationWords.every(word=>word===777));
 assert.equal(restoreBattleBackgroundPalette({...state,mode:0}),false);
 assert.equal(restoreBattleBackgroundPalette({...state,sceneFlagsByte:-1}),false);
});
