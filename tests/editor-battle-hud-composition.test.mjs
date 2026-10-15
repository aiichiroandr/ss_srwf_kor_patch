import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveBattleHudTopPlaneComposition,resolveBattleHudPlaneVisibility,resolveBattleHudSecondPlaneComposition} from '../assets/editor-battle-hud-composition.mjs';
import {applyBattleHudStateCommand} from '../assets/editor-battle-hud-state.mjs';

function state(ratio=19){
 const bytes=new Uint8Array(132),view=new DataView(bytes.buffer);
 bytes[1]=8;view.setUint16(2,4);view.setUint16(4,7);bytes[12]=ratio;return bytes;
}

for(const gameId of ['srwf-f','srwf-final']){
 test(`${gameId} owned hit mode blends NBG2 above ordinary sprites`,()=>{
  assert.deepEqual(resolveBattleHudTopPlaneComposition(state(),{gameId}),{
   status:'ready',planeIndex:2,opacity:0.375,blend:'normal',layerPriority:6,
   ratio:19,scope:'owned-nbg2-top-ratio-mode'});
 });
}

test('ratio endpoints follow the documented 31:1 through 0:32 range',()=>{
 assert.equal(resolveBattleHudTopPlaneComposition(state(0),{gameId:'srwf-f'}).opacity,31/32);
 assert.equal(resolveBattleHudTopPlaneComposition(state(15),{gameId:'srwf-f'}).opacity,0.5);
 assert.equal(resolveBattleHudTopPlaneComposition(state(31),{gameId:'srwf-f'}).opacity,0);
});

test('display cache flag and subview offsets do not change the top composition',()=>{
 const storage=new Uint8Array(160),bytes=storage.subarray(11,143);bytes.set(state());bytes[1]|=64;
 assert.equal(resolveBattleHudTopPlaneComposition(bytes,{gameId:'srwf-final'}).opacity,0.375);
});

test('unsupported second-image and multi-plane modes provide no guessed style',()=>{
 const bytes=state();bytes[1]=0;
 assert.deepEqual(resolveBattleHudTopPlaneComposition(bytes,{gameId:'srwf-f'}),
  {status:'partial',reason:'second-image-ratio-mode-unresolved'});
 new DataView(bytes.buffer).setUint16(2,6);
 assert.deepEqual(resolveBattleHudTopPlaneComposition(bytes,{gameId:'srwf-f'}),
  {status:'partial',reason:'display-color-mode-unresolved'});
 new DataView(bytes.buffer).setUint16(2,4);new DataView(bytes.buffer).setUint16(4,0x107);bytes[1]=8;
 assert.deepEqual(resolveBattleHudTopPlaneComposition(bytes,{gameId:'srwf-f'}),
  {status:'partial',reason:'display-color-mode-unresolved'});
});

test('disabled calculation is reported without supplying an opacity default',()=>{
 assert.deepEqual(resolveBattleHudTopPlaneComposition(new Uint8Array(132),{gameId:'srwf-f'}),
  {status:'inactive',reason:'color-calculation-disabled'});
});

test('missing context and out-of-range source values fail closed',()=>{
 assert.throws(()=>resolveBattleHudTopPlaneComposition(state()),/game context/);
 assert.throws(()=>resolveBattleHudTopPlaneComposition(state(),{gameId:'unknown'}),/game context/);
 assert.throws(()=>resolveBattleHudTopPlaneComposition(new Uint8Array(12),{gameId:'srwf-f'}),/display state/);
 assert.throws(()=>resolveBattleHudTopPlaneComposition(state(32),{gameId:'srwf-f'}),/source range/);
});

function nativePlaneBaseline(){
 const bytes=new Uint8Array(132),view=new DataView(bytes.buffer);
 view.setUint32(24,1);view.setUint32(28,2);view.setUint32(32,0x40000);view.setUint32(36,8);
 return bytes;
}

for(const gameId of ['srwf-f','srwf-final']){
 test(`${gameId} source baseline excludes NBG2 and retains the other planes`,()=>{
  assert.deepEqual(resolveBattleHudPlaneVisibility(nativePlaneBaseline(),{gameId,presentationVariant:1}),
   {status:'ready',planeIndex:2,visible:false,enabledMask:11,scope:'owned-variant1-plane-enable'});
 });
 test(`${gameId} FA52/FA53 enable NBG2 and FA54 disables its retained pixels`,()=>{
  const bytes=nativePlaneBaseline();
  for(const sub of [0x52,0x53]){
   applyBattleHudStateCommand(bytes,new Uint8Array([250,sub]),0);
   assert.deepEqual(resolveBattleHudPlaneVisibility(bytes,{gameId,presentationVariant:1}),
    {status:'ready',planeIndex:2,visible:true,enabledMask:15,scope:'owned-variant1-plane-enable'});
  }
  // The second-image ratio mode alone does not decide visibility: FA53 is
  // enabled, while FA54 has the same clear flag but a different plane request.
  assert.equal(bytes[1]&8,0);
  applyBattleHudStateCommand(bytes,new Uint8Array([250,0x54]),0);
  assert.equal(bytes[1]&8,0);
  assert.deepEqual(resolveBattleHudPlaneVisibility(bytes,{gameId,presentationVariant:1}),
   {status:'ready',planeIndex:2,visible:false,enabledMask:11,scope:'owned-variant1-plane-enable'});
 });
}

test('visibility uses the combined low byte without treating upper disable masks as enables',()=>{
 const bytes=nativePlaneBaseline(),view=new DataView(bytes.buffer);
 view.setUint32(24,0x10000);view.setUint32(32,4);view.setUint32(36,0x80000);
 assert.deepEqual(resolveBattleHudPlaneVisibility(bytes,{gameId:'srwf-f',presentationVariant:1}),
  {status:'ready',planeIndex:2,visible:true,enabledMask:6,scope:'owned-variant1-plane-enable'});
 view.setUint32(32,0x40000);
 assert.equal(resolveBattleHudPlaneVisibility(bytes,{gameId:'srwf-f',presentationVariant:1}).visible,false);
});

test('visibility reads all four requests at their actual typed-array offsets',()=>{
 const storage=new Uint8Array(180),bytes=storage.subarray(17,149);bytes.set(nativePlaneBaseline());
 new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).setUint32(36,12);
 assert.equal(resolveBattleHudPlaneVisibility(bytes,{gameId:'srwf-final',presentationVariant:1}).visible,true);
 assert.equal(resolveBattleHudPlaneVisibility(bytes,{gameId:'srwf-final',presentationVariant:1}).enabledMask,15);
});

test('missing or different presentation contexts do not invent visibility',()=>{
 for(const presentationVariant of [undefined,0,2,3,'1'])
  assert.deepEqual(resolveBattleHudPlaneVisibility(nativePlaneBaseline(),{gameId:'srwf-f',presentationVariant}),
   {status:'partial',reason:'presentation-variant-unresolved'});
});

test('visibility rejects missing game identity and truncated or non-byte display records',()=>{
 assert.throws(()=>resolveBattleHudPlaneVisibility(nativePlaneBaseline(),{presentationVariant:1}),/game context/);
 assert.throws(()=>resolveBattleHudPlaneVisibility(nativePlaneBaseline(),{gameId:'other',presentationVariant:1}),/game context/);
 for(const bytes of [new Uint8Array(39),new Uint8Array(1025),new Uint16Array(132),null])
  assert.throws(()=>resolveBattleHudPlaneVisibility(bytes,{gameId:'srwf-f',presentationVariant:1}),/display state/);
});

for(const gameId of ['srwf-f','srwf-final']){
 test(`${gameId} FA53 resolves second-image ratios without affecting top mode or visibility`,()=>{
  const bytes=nativePlaneBaseline();bytes[12]=19;
  applyBattleHudStateCommand(bytes,new Uint8Array([250,0x53]),0);
  assert.deepEqual(resolveBattleHudSecondPlaneComposition(bytes,{gameId,backRatio:0}),{
   status:'ready',planeIndex:2,effectRatio:19,backRatio:0,layerPriority:3,
   ratioSource:'second-visible-layer',calculatedLayers:['rear-background','effect'],
   scope:'owned-second-image-ratio-mode'});
  assert.equal(resolveBattleHudTopPlaneComposition(bytes,{gameId}).status,'partial');
  assert.equal(resolveBattleHudPlaneVisibility(bytes,{gameId,presentationVariant:1}).visible,true);
 });
}

test('second mode preserves both explicit ratio endpoints and retained Back values',()=>{
 const bytes=nativePlaneBaseline();applyBattleHudStateCommand(bytes,new Uint8Array([250,0x53]),0);
 for(const effectRatio of [0,15,31])for(const backRatio of [0,15,31]){
  bytes[12]=effectRatio;
  const result=resolveBattleHudSecondPlaneComposition(bytes,{gameId:'srwf-f',backRatio});
  assert.equal(result.effectRatio,effectRatio);assert.equal(result.backRatio,backRatio);
  assert.equal(Object.hasOwn(result,'opacity'),false);
 }
});

test('second-mode state is read from the typed-array subview without mutation',()=>{
 const storage=new Uint8Array(180).fill(255),bytes=storage.subarray(17,149);bytes.set(nativePlaneBaseline());
 applyBattleHudStateCommand(bytes,new Uint8Array([250,0x53]),0);bytes[1]|=64;bytes[12]=7;
 const before=storage.slice();
 const result=resolveBattleHudSecondPlaneComposition(bytes,{gameId:'srwf-final',backRatio:3});
 assert.equal(result.effectRatio,7);assert.equal(result.backRatio,3);assert.deepEqual(storage,before);
});

test('missing Back ratio stays partial instead of silently choosing a fresh default',()=>{
 const bytes=nativePlaneBaseline();applyBattleHudStateCommand(bytes,new Uint8Array([250,0x53]),0);
 assert.deepEqual(resolveBattleHudSecondPlaneComposition(bytes,{gameId:'srwf-f'}),
  {status:'partial',reason:'back-ratio-context-missing'});
});

test('other modes do not infer a second-layer style and disabled calculation stays inactive',()=>{
 assert.deepEqual(resolveBattleHudSecondPlaneComposition(new Uint8Array(132),{gameId:'srwf-f'}),
  {status:'inactive',reason:'color-calculation-disabled'});
 const bytes=nativePlaneBaseline();
 for(const sub of [0x52,0x54]){
  applyBattleHudStateCommand(bytes,new Uint8Array([250,sub]),0);
  assert.deepEqual(resolveBattleHudSecondPlaneComposition(bytes,{gameId:'srwf-f',backRatio:0}),
   {status:'partial',reason:'display-color-mode-unresolved'});
 }
 applyBattleHudStateCommand(bytes,new Uint8Array([250,0x53]),0);bytes[1]|=8;
 assert.deepEqual(resolveBattleHudSecondPlaneComposition(bytes,{gameId:'srwf-f',backRatio:0}),
  {status:'partial',reason:'top-image-ratio-mode-unresolved'});
 bytes[1]&=247;new DataView(bytes.buffer).setUint16(4,0x104);
 assert.equal(resolveBattleHudSecondPlaneComposition(bytes,{gameId:'srwf-f',backRatio:0}).status,'partial');
});

test('second mode rejects unsupported context, truncated records and invalid explicit ratios',()=>{
 const bytes=nativePlaneBaseline();applyBattleHudStateCommand(bytes,new Uint8Array([250,0x53]),0);
 for(const gameId of [undefined,'other'])
  assert.throws(()=>resolveBattleHudSecondPlaneComposition(bytes,{gameId,backRatio:0}),/game context/);
 for(const record of [undefined,new Uint8Array(12),new Uint8Array(1025),new Uint16Array(132)])
  assert.throws(()=>resolveBattleHudSecondPlaneComposition(record,{gameId:'srwf-f',backRatio:0}),/display state/);
 for(const backRatio of [-1,32,0.5,NaN,'0'])
  assert.throws(()=>resolveBattleHudSecondPlaneComposition(bytes,{gameId:'srwf-f',backRatio}),/source range/);
 bytes[12]=32;
 assert.throws(()=>resolveBattleHudSecondPlaneComposition(bytes,{gameId:'srwf-f',backRatio:0}),/source range/);
});

test('source additive top mode ignores ratio and requires proved top flag',()=>{const s=new Uint8Array(132),v=new DataView(s.buffer);v.setUint16(2,4);v.setUint16(4,67);s[1]=8;s[12]=31;const r=resolveBattleHudTopPlaneComposition(s,{gameId:'srwf-f'});assert.equal(r.opacity,1);assert.equal(r.blend,'add');assert.equal(r.scope,'owned-nbg2-top-additive-mode');s[1]=0;const rear=resolveBattleHudTopPlaneComposition(s,{gameId:'srwf-f'});assert.equal(rear.layerPriority,3);assert.equal(rear.scope,'owned-nbg2-rear-additive-mode');});
test('cached request18 retains additive CCMD after the enabled-plane parameters are rewritten',()=>{const s=new Uint8Array(132),v=new DataView(s.buffer);s[0]=18;s[1]=192;v.setUint16(2,4);v.setUint16(4,7);const r=resolveBattleHudTopPlaneComposition(s,{gameId:'srwf-final'});assert.equal(r.blend,'add');assert.equal(r.layerPriority,3);s[0]=2;assert.equal(resolveBattleHudTopPlaneComposition(s,{gameId:'srwf-final'}).status,'partial');});
import{resolveBattleForegroundDisplayComposition}from'../assets/editor-battle-hud-composition.mjs';
test('foreground additive composition retains priority through later disabled color calculation',()=>{const s=new Uint8Array(132),v=new DataView(s.buffer);s[0]=16;s[1]=64;v.setUint16(2,1);v.setUint16(4,70);const a=resolveBattleForegroundDisplayComposition(s,{gameId:'srwf-f',priority:6});assert.equal(a.blend,'add');assert.equal(a.layerPriority,6);v.setUint16(2,0);s[0]=18;const b=resolveBattleForegroundDisplayComposition(s,{gameId:'srwf-final',priority:6});assert.equal(b.blend,'normal');assert.equal(b.layerPriority,6);});
test('request4 effect plane uses cached additive mode separately from conditional sprite calculation',()=>{const s=new Uint8Array(132),v=new DataView(s.buffer);s[0]=4;s[1]=192;v.setUint16(2,68);v.setUint16(4,3);const r=resolveBattleHudTopPlaneComposition(s,{gameId:'srwf-final'});assert.equal(r.blend,'add');assert.equal(r.layerPriority,3);s[1]|=8;assert.equal(resolveBattleHudTopPlaneComposition(s,{gameId:'srwf-final'}).layerPriority,6);});

test('cached request19 effect plane resolves additive mode without borrowing request18 flags',()=>{
 for(const gameId of ['srwf-f','srwf-final'])for(const top of [false,true]){
  const s=new Uint8Array(132),v=new DataView(s.buffer);s[0]=19;s[1]=64|(top?8:0);v.setUint16(2,4);v.setUint16(4,3);
  const r=resolveBattleHudTopPlaneComposition(s,{gameId});assert.equal(r.status,'ready');assert.equal(r.blend,'add');assert.equal(r.layerPriority,top?6:3);
  v.setUint16(4,7);assert.equal(resolveBattleHudTopPlaneComposition(s,{gameId}).blend,'add');
  s[1]&=~64;assert.notEqual(resolveBattleHudTopPlaneComposition(s,{gameId}).blend,'add');
  s[1]|=64;v.setUint16(2,6);assert.equal(resolveBattleHudTopPlaneComposition(s,{gameId}).status,'partial');
 }
});
