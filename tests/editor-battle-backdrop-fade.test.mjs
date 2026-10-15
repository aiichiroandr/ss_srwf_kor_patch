import test from 'node:test';
import assert from 'node:assert/strict';
import {stepBattleBackdropDarkening,stepBattleBackdropRestoration,prepareBattleOffsetPicture}
 from '../assets/editor-battle-backdrop-fade.mjs';

for(const gameId of ['srwf-f','srwf-final']){
 test(`${gameId}: darkening initializes without moving and finishes on invocation17`,()=>{
  let phase=0;const steps=[];
  for(let i=0;i<17;i++){
   const next=stepBattleBackdropDarkening({gameId,phase});steps.push(next);phase=next.phase;
   assert.equal(next.yield,true);assert.equal(next.complete,i===16);
   assert.equal(next.advanceBytes,i===16?1:0);
  }
  assert.deepEqual(steps.map(s=>s.rgbOffset[0]),[0,...Array.from({length:15},(_,i)=>-17-i*16),-255]);
  assert.deepEqual(steps[0].enabledLayers,['foreground-background','rear-background']);
  assert.ok(steps.slice(1).every(s=>s.enabledLayers===null));
  assert.equal(phase,0);
 });
 test(`${gameId}: restoration shares the explicit phase and resets targets only on completion`,()=>{
  let phase=0;const steps=[];
  for(let i=0;i<17;i++){
   const next=stepBattleBackdropRestoration({gameId,phase});steps.push(next);phase=next.phase;
   assert.equal(next.yield,true);assert.equal(next.complete,i===16);
  }
  assert.deepEqual(steps.map(s=>s.rgbOffset[0]),[-255,...Array.from({length:15},(_,i)=>-239+i*16),0]);
  assert.deepEqual(steps[0].enabledLayers,['foreground-background','rear-background']);
  assert.ok(steps.slice(1,16).every(s=>s.enabledLayers===null));
  assert.deepEqual(steps[16].enabledLayers,['foreground-background','rear-background','effect','front-overlay','body']);
  assert.equal(phase,0);assert.equal(steps[16].advanceBytes,1);
 });
}
test('both thresholds clamp final visible RGB before resetting the shared phase',()=>{
 for(const phase of [-239,-255,-256]){
  assert.deepEqual(stepBattleBackdropDarkening({gameId:'srwf-f',phase}).rgbOffset,[-255,-255,-255]);
  assert.equal(stepBattleBackdropDarkening({gameId:'srwf-f',phase}).complete,true);
 }
 assert.equal(stepBattleBackdropDarkening({gameId:'srwf-f',phase:-238}).complete,false);
 for(const phase of [-16,-1,1])assert.equal(stepBattleBackdropRestoration({gameId:'srwf-final',phase}).complete,true);
 assert.equal(stepBattleBackdropRestoration({gameId:'srwf-final',phase:-17}).complete,false);
});
test('retained phase uses signed word storage; color offset is independently signed9-bit',()=>{
 assert.deepEqual(stepBattleBackdropDarkening({gameId:'srwf-f',phase:-32768}),
  {phase:32752,rgbOffset:[-16,-16,-16],enabledLayers:null,complete:false,advanceBytes:0,yield:true});
 assert.deepEqual(stepBattleBackdropRestoration({gameId:'srwf-final',phase:32767}),
  {phase:-32753,rgbOffset:[15,15,15],enabledLayers:null,complete:false,advanceBytes:0,yield:true});
});
test('phase is explicit, inputs are not mutated, and unsupported games fail closed',()=>{
 for(const fn of [stepBattleBackdropDarkening,stepBattleBackdropRestoration]){
  for(const value of [undefined,{}, {gameId:'srwf-f'}, {gameId:'other',phase:0},
   {gameId:'srwf-f',phase:0.5},{gameId:'srwf-f',phase:32768},{gameId:'srwf-f',phase:-32769}])
   assert.throws(()=>fn(value),/unresolved/);
  const input={gameId:'srwf-f',phase:-1},before=structuredClone(input);fn(input);assert.deepEqual(input,before);
 }
});
test('prepared post-composition RGB clamps while preserving alpha and input pixels',()=>{
 const picture={width:3,height:1,pixels:Uint8Array.of(5,250,120,255,10,20,30,128,7,8,9,0)};
 const before=picture.pixels.slice(),prepared=prepareBattleOffsetPicture({picture,rgbOffset:[-17,20,-255]});
 assert.deepEqual(Array.from(prepared.pixels),[0,255,0,255,0,40,0,128,7,8,9,0]);
 assert.deepEqual(picture.pixels,before);assert.notEqual(prepared.pixels,picture.pixels);
});
test('each picture preparation observes changes to picture and offset, without stale memoization',()=>{
 const picture={width:1,height:1,pixels:Uint8Array.of(200,100,50,255)};
 const first=prepareBattleOffsetPicture({picture,rgbOffset:[-17,-17,-17]});
 picture.pixels[0]=100;
 const second=prepareBattleOffsetPicture({picture,rgbOffset:[-33,-33,-33]});
 assert.deepEqual(Array.from(first.pixels),[183,83,33,255]);
 assert.deepEqual(Array.from(second.pixels),[67,67,17,255]);
});
test('offset applies to the mixed top image rather than either input before mixing',()=>{
 // Explicit mixed RGB100 represents e.g. a bright rear and a dark second
 // effect. Offsetting/clamping the bright source before the mix would yield
 // a different color. This helper deliberately accepts the final top picture.
 const picture={width:1,height:1,pixels:Uint8Array.of(100,100,100,255)};
 assert.deepEqual(Array.from(prepareBattleOffsetPicture({picture,rgbOffset:[-150,-150,-150]}).pixels),[0,0,0,255]);
});
test('pictures and offsets must be bounded and explicit',()=>{
 const picture={width:1,height:1,pixels:Uint8Array.of(1,2,3,255)};
 for(const input of [undefined,{}, {picture}, {picture,rgbOffset:[-257,0,0]},
  {picture,rgbOffset:[0,0,256]}, {picture,rgbOffset:[0,0]},
  {picture:{...picture,width:513},rgbOffset:[0,0,0]},
  {picture:{...picture,pixels:new Uint8Array(3)},rgbOffset:[0,0,0]}])
  assert.throws(()=>prepareBattleOffsetPicture(input),/unresolved/);
});
