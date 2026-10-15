import test from 'node:test';import assert from 'node:assert/strict';
import {recordTable} from './helpers/synthetic-tsr.mjs';
import {createBattleBackgroundSwitcher} from '../assets/editor-battle-background-switch.mjs';
import {createBattleMainClock,tickBattleMainClock} from '../assets/editor-battle-main-clock.mjs';

function setup(){
 const commonData=recordTable([0,1,2],[Uint8Array.of(0),Uint8Array.of(1,2),Uint8Array.of(0,2,0,0,0,0)]);
 const addressMap=new Uint16Array(64);for(let row=0;row<4;row++)for(let col=0;col<4;col++)addressMap[(4+row)*4+col]=row*4+col;
 const paletteState={mode:1,addressMap,sourceWords:Uint16Array.from({length:6144},(_,i)=>i),destinationWords:new Uint16Array(1024).fill(73)};
 const planes=Array.from({length:2},()=>new Uint32Array(4096).fill(73));
 const sides=[0,1].map(index=>({modeByte:0,pair:{screen:{formatByte:50},fragments:[0,1].map(part=>({width:1,height:1,cells:Uint32Array.of(0x10001+part)}))}}));
 const context={commonData,paletteState,planes,sides,getSceneFlagsByte:()=>0};
 return {...context,switchBackground:createBattleBackgroundSwitcher(context)};
}
test('6801 commits its real palette transfer and both background planes before continuing',()=>{
 const s=setup(),shared={switchBackground:s.switchBackground},clock=createBattleMainClock(Uint8Array.of(0x68,1,255,4),{shared});
 assert.equal(tickBattleMainClock(clock).ended,true);
 assert.deepEqual(shared.background.modeFactors,[1,2]);assert.equal(shared.background.side,1);
 assert.equal(s.planes[0][0],0x10401);assert.equal(s.planes[1][0],0x10402);
 assert.equal(s.paletteState.destinationWords[0],22*16);assert.equal(s.paletteState.destinationWords[16],23*16);
 assert.equal(shared.backgroundCompletionRequested,true);
});
test('both background sides publish all sixteen distinct source banks rather than repeat the first four',()=>{
 for(const [selector,startBank]of [[254,6],[255,22]]){
  const s=setup(),sourceBefore=s.paletteState.sourceWords.slice();
  s.switchBackground(selector);
  assert.deepEqual(s.paletteState.destinationWords.slice(0,256),sourceBefore.slice(startBank*16,(startBank+16)*16));
  assert.equal(s.paletteState.destinationWords[255],(startBank+16)*16-1);
  assert.ok(s.paletteState.destinationWords.slice(256).every(value=>value===73));
  assert.deepEqual(s.paletteState.sourceWords,sourceBefore);
 }
});
test('missing final background bank cannot publish the first fifteen banks or either plane',()=>{
 const s=setup();s.paletteState.sourceWords=s.paletteState.sourceWords.slice(0,37*16);
 assert.throws(()=>s.switchBackground(255),/palette transfer is unresolved/);
 assert.ok(s.paletteState.destinationWords.every(value=>value===73));
 assert.ok(s.planes.every(plane=>plane.every(value=>value===73)));
});
test('an invalid second fragment cannot partially commit palette or first plane',()=>{
 const s=setup();s.sides[1].pair.fragments[1].cells=new Uint32Array(0);
 assert.throws(()=>s.switchBackground(255),/unresolved plane/);
 assert.ok(s.paletteState.destinationWords.every(value=>value===73));
 assert.ok(s.planes.every(plane=>plane.every(value=>value===73)));
});
test('missing background switch context retains the main instruction',()=>{
 const c=createBattleMainClock(Uint8Array.of(0x68,1,255,4));
 assert.equal(tickBattleMainClock(c).blocked.reason,'background-switch-context-missing');assert.equal(c.program.pc,0);
});
