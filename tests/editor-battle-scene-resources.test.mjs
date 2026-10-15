import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveBattleSceneSprite,createBattleSceneResolvers,resolveBattleSceneMainProgram,createBattleSceneRendererContext,createBattleScenePaletteBindings,readBattleSceneBodyPalettes,prepareBattleSceneBodyPaletteState,createBattleSequenceUsageTracker} from '../assets/editor-battle-scene-resources.mjs';
import {createBattleMainClock,tickBattleMainClock} from '../assets/editor-battle-main-clock.mjs';
import {recordTable} from './helpers/synthetic-tsr.mjs';
import {readBattleSceneAnchorTable} from '../assets/editor-battle-mapping.mjs';
import {readBattleActorAnchor,createBattleActorClock,tickBattleActorClock} from '../assets/editor-battle-clock.mjs';
test('sequence usage retains only successful calls in the selected owned program, without collapsing aliases',()=>{
 const program=new Uint8Array(20),foreign=program.slice(),calls=[];
 const sources=new Map([[12,{bytes:program,index:12,common:false}], [13,{bytes:program,index:13}],
  [0xf001,{bytes:program,index:1,common:true}],[2,{bytes:foreign,index:2}], [3,{bytes:program,index:1024}]]);
 const tracked=createBattleSequenceUsageTracker(index=>{calls.push(index);return sources.get(index)??null;},program);
 for(const index of [13,12,13,0xf001,2,3,99])assert.equal(tracked.resolve(index),sources.get(index)??null);
 assert.deepEqual(calls,[13,12,13,0xf001,2,3,99]);assert.deepEqual(tracked.sequences(),[12,13]);
 tracked.sequences().push(88);assert.deepEqual(tracked.sequences(),[12,13]);
 assert.throws(()=>createBattleSequenceUsageTracker(null,program),/required/);
 assert.throws(()=>createBattleSequenceUsageTracker(()=>null,null),/required/);
 const failure=new Error('resolver failed');assert.throws(()=>createBattleSequenceUsageTracker(()=>{throw failure;},program).resolve(1),error=>error===failure);
});
const scene={weaponGraphics:[{fileName:'E_SPR.BIN',byteLength:1000,recordOffset:100,recordEnd:200,headerSlots:[0,2]}],
  unitGraphics:{fileName:'C_ROBOT.BIN',byteLength:2000,recordOffset:300,recordEnd:500}};
test('custom texture indices never fall back to an unrelated ordinary group',()=>{
 const loadedGroups=new Map([[16,scene.weaponGraphics[0]]]);
 assert.equal(resolveBattleSceneSprite(scene,0xf006,{loadedGroups}).reason,'custom-texture-source-unresolved');
 const customTextures=new Map([[6,{...scene.unitGraphics,subIndex:0}]]);
 const sprite=resolveBattleSceneSprite(scene,0xf006,{loadedGroups,customTextures});
 assert.equal(sprite.assetKey,'battle1:C_ROBOT.BIN:2000:300:500:0');
 assert.equal(sprite.textureIndex,6);assert.equal(sprite.group,null);
});
test('body palette preparation resets and registers on a private arena without partial caller writes',async()=>{
 const source={...scene,opponentGraphics:{fileName:'C_ROBOT.BIN',byteLength:2000,recordOffset:600,recordEnd:800}};
 const banks=new Uint16Array(16).fill(99),map=new Uint16Array(64).fill(32);banks[15]=32;
 const rendererContext=createBattleSceneRendererContext({initialRenderDepthTables:new Uint8Array(32),initialPaletteRendererTables:{bankBases:banks,addressMap:map}},{variant:1});
 const sourceWords=new Uint16Array(6144).fill(123),destinationWords=new Uint16Array(1024).fill(456),bankStates=new Uint8Array(768).fill(77);
 const args={rendererContext,sourceWords,destinationWords,bankStates,sourceAddresses:{attacker:0x060ff958,defender:0x060ff958},
  readPalette:async assetKey=>({assetKey,fileName:'C_ROBOT.BIN',paletteWords:new Uint16Array(16).fill(assetKey.includes(':300:')?7:9),colorCount:16,nativeBankCount:1})};
 const result=await prepareBattleSceneBodyPaletteState(source,args);assert.equal(result.status,'ready');
 assert.equal(result.paletteState.sourceWords[58*16],7);assert.equal(result.paletteState.sourceWords[62*16],9);
 assert.equal(result.paletteState.sourceWords[4096],123);assert.equal(result.paletteState.sourceWords[16],0x7fff);
 assert.ok(result.paletteState.destinationWords.every(n=>n===0));assert.equal(result.bankStates[58*2],1);assert.equal(result.bankStates[58*2+1],77);
 assert.equal(result.rendererContext.bankBases[0],128);assert.equal(rendererContext.bankBases[0],99);
 assert.ok(sourceWords.every(n=>n===123));assert.ok(destinationWords.every(n=>n===456));assert.ok(bankStates.every(n=>n===77));
 const blocked=await prepareBattleSceneBodyPaletteState(source,{...args,readPalette:async assetKey=>({assetKey,fileName:'C_ROBOT.BIN',paletteWords:new Uint16Array(80),colorCount:80,nativeBankCount:5})});
 assert.equal(blocked.status,'blocked');assert.ok(sourceWords.every(n=>n===123));
});
test('body palette prefetch freezes both identities, copies colors and rejects foreign/cancelled results',async()=>{
 const source={...scene,opponentGraphics:{fileName:'C_ROBOT.BIN',byteLength:2000,recordOffset:600,recordEnd:800}};
 const words=new Uint16Array(16).fill(55),keys=[];
 const result=await readBattleSceneBodyPalettes(source,{readPalette:async assetKey=>{
  keys.push(assetKey);source.opponentGraphics.recordOffset=900;source.opponentGraphics.recordEnd=1000;
  return {assetKey,fileName:'C_ROBOT.BIN',paletteWords:words,colorCount:16,nativeBankCount:1};}});
 assert.equal(result.status,'ready');assert.ok(keys[1].includes(':600:800:'));
 words.fill(99);assert.equal(result.records[0].paletteWords[0],55);assert.equal(result.records[1].paletteWords[0],55);
 const foreign=await readBattleSceneBodyPalettes(source,{readPalette:async()=>({assetKey:'wrong'})});
 assert.equal(foreign.reason,'body-palette-identity-unresolved');
 const c=new AbortController(),reason=new Error('different weapon');
 await assert.rejects(readBattleSceneBodyPalettes(source,{signal:c.signal,readPalette:async assetKey=>{
  c.abort(reason);return {assetKey};}}),e=>e===reason);
});
test('owned palette mapping connects 6F to live colors and preserves its overlapping base word',()=>{
 const bankBases=new Uint16Array(16),addressMap=new Uint16Array(64).fill(32);bankBases[15]=32;
 const source={initialRenderDepthTables:new Uint8Array(32),initialPaletteRendererTables:{bankBases,addressMap}};
 const renderer=createBattleSceneRendererContext(source,{variant:1});
 const sourceWords=Uint16Array.from({length:6144},(_,i)=>i),destinationWords=new Uint16Array(1024).fill(65535);
 const bindings=createBattleScenePaletteBindings(renderer,{sourceWords,destinationWords,directionBit6:false});
 const bytes=Uint8Array.from([0x6f,0,0,0,16,255,20,4]);
 assert.equal(tickBattleMainClock(createBattleMainClock(bytes,{shared:bindings})).ended,true);
 assert.deepEqual(destinationWords.slice(512,528),sourceWords.slice(58*16,59*16));
 assert.equal(destinationWords[511],65535);assert.equal(destinationWords[528],65535);
 renderer.bankBases[15]=33;assert.equal(renderer.addressMap[0],33);
 assert.equal(addressMap[0],32);assert.equal(bankBases[15],32);
 assert.equal(tickBattleMainClock(createBattleMainClock(bytes,{shared:bindings})).ended,true);
 assert.deepEqual(destinationWords.slice(528,544),sourceWords.slice(58*16,59*16));
 assert.throws(()=>createBattleScenePaletteBindings({}, {sourceWords,destinationWords,directionBit6:false}),/unresolved/);
});
test('scene palette bindings connect FA02 color transitions to the same owned palette state',()=>{
 const sourceWords=new Uint16Array(6144),destinationWords=new Uint16Array(1024).fill(77);
 sourceWords.fill(31,58*16,59*16);
 const renderer={variant:1,bankBases:new Uint16Array(16),addressMap:new Uint16Array(64)};renderer.addressMap[0]=7;
 const shared=createBattleScenePaletteBindings(renderer,{sourceWords,destinationWords,directionBit6:false});
 const actor=createBattleActorClock(Uint8Array.from([0xfa,3,128,0xfa,2,0,0,0,16,255,20,1,0,1,255]));
 tickBattleActorClock(actor,shared);
 assert.equal(actor.blocked,null);assert.equal(shared.paletteTransitionWeight,128);
 assert.ok(destinationWords.slice(112,128).every(word=>word===16));
 assert.equal(destinationWords[111],77);assert.equal(destinationWords[128],77);
 assert.ok(sourceWords.slice(58*16,59*16).every(word=>word===31));
});
test('background mode factors come from the owned common table and never guessed defaults',()=>{
 const commonData=recordTable([0,1,0],[Uint8Array.from([1]),Uint8Array.from([254,3,4,255])]);
 const resources=createBattleSceneResolvers({program:new Uint8Array(16),commonActors:new Uint8Array(16),commonData});
 assert.deepEqual(resources.resolveBackgroundModeFactors(0),[-2,3]);
 assert.deepEqual(resources.resolveBackgroundModeFactors(1),[4,-1]);
 assert.equal(resources.resolveBackgroundModeFactors(2),null);
 assert.equal(createBattleSceneResolvers({program:new Uint8Array(16),commonActors:new Uint8Array(16)}).resolveBackgroundModeFactors(0),null);
});
test('main execution follows its little-endian carrier entry rather than the beam-specific offset',()=>{
  for(const start of [8,24,46]){
    const program=new Uint8Array(56),v=new DataView(program.buffer);
    v.setUint32(0,start,true);v.setUint32(4,52,true);v.setUint16(52,54);program[start]=4;program[54]=1;program[55]=255;
    const p=resolveBattleSceneMainProgram({program});assert.equal(p.start,start);assert.equal(p.bytes,program);
    assert.equal(tickBattleMainClock(createBattleMainClock(p.bytes,p)).ended,true);
    v.setUint32(0,52,true);assert.equal(resolveBattleSceneMainProgram({program}),null);
    v.setUint32(0,start,true);v.setUint16(52,1);assert.equal(resolveBattleSceneMainProgram({program}),null);
  }
  assert.equal(resolveBattleSceneMainProgram({program:new Uint8Array(8)}),null);
});
test('scene anchors use bounded BTSR cell19 and preserve self-relative aliases and signed coordinates',()=>{
  const anchors=new Uint8Array(68),view=new DataView(anchors.buffer);
  for(let i=0;i<32;i++)view.setUint16(i*2,64-i*2);
  anchors.set([255,255,236,9],64);
  const common=recordTable(Array(20).fill(0),[anchors]);
  const table=readBattleSceneAnchorTable(common);assert.deepEqual(table,anchors);
  for(const index of [0,12,31])assert.deepEqual(readBattleActorAnchor(table,index,1),{x:-20,depth:9,rowOffset:64});
  new DataView(common.buffer).setUint16(80+62,0);
  assert.equal(readBattleSceneAnchorTable(common),null);
  assert.equal(readBattleSceneAnchorTable(recordTable([0],[anchors])),null);
});
test('native common calls and actor assignments resolve their own validated program families',()=>{
  const program=new Uint8Array(52),p=new DataView(program.buffer);p.setUint32(4,48,true);p.setUint16(48,50);program[50]=1;program[51]=255;
  const commonPrograms=new Uint8Array(113),v=new DataView(commonPrograms.buffer);v.setInt32(12,4);
  for(let i=0;i<24;i++)v.setInt32(16+i*4,112-(16+i*4));commonPrograms[112]=4;
  const commonActors=Uint8Array.from([0,2,1,255]);
  const commonData=recordTable([0],[Uint8Array.from([0,96,0,32])]);
  const resolvers=createBattleSceneResolvers({program,commonPrograms,commonActors,commonData});
  assert.deepEqual(resolvers.resolveSceneBranchContext(0,102),{metadataType:3,unitByte10:102});
  assert.deepEqual(resolvers.resolveSceneBranchContext(1,0),{metadataType:1,unitByte10:0});
  assert.equal(resolvers.resolveSceneBranchContext(2,0),null);
  assert.equal(resolvers.resolveSceneBranchContext(0,undefined),null);
  assert.equal(resolvers.resolveActorSequence(0).bytes,program);
  assert.equal(resolvers.resolveActorSequence(0xf000).bytes,commonActors);
  assert.equal(resolvers.resolveActorSequence(1),null);assert.equal(resolvers.resolveActorSequence(0xf001),null);
  assert.equal(resolvers.resolveCommonProgram(24),null);
  const main=createBattleMainClock(Uint8Array.from([0x7e,6,4]));
  assert.equal(tickBattleMainClock(main,resolvers).ended,true);
  commonPrograms[16]=127;assert.equal(resolvers.resolveCommonProgram(6),null);
});
test('live frame selector chooses exactly one linked record and one subimage',()=>{
  assert.equal(resolveBattleSceneSprite(scene,0x0207).assetKey,'battle1:E_SPR.BIN:1000:100:200:7');
  assert.equal(resolveBattleSceneSprite(scene,0x0004).assetKey,'battle1:E_SPR.BIN:1000:100:200:4');
  assert.equal(resolveBattleSceneSprite(scene,0x0801).assetKey,'battle1:C_ROBOT.BIN:2000:300:500:1');
});
test('message programs keep their own self-relative bounds and alias identity',()=>{
  const messagePrograms=recordTable([0,1,0],[Uint8Array.from([0xf8,0,0xff]),Uint8Array.from([0xff])]);
  const resolvers=createBattleSceneResolvers({program:Uint8Array.from([0]),commonActors:Uint8Array.from([0]),messagePrograms});
  const first=resolvers.resolveMessageProgram(0),alias=resolvers.resolveMessageProgram(2),last=resolvers.resolveMessageProgram(1);
  assert.equal(first.bytes,messagePrograms);assert.equal(first.start,alias.start);assert.equal(first.end,alias.end);
  assert.equal(first.end,messagePrograms.length);assert.equal(last.end-last.start,1);
  assert.equal(resolvers.resolveMessageProgram(3),null);
  assert.equal(resolvers.resolveMessageProgram(-1),null);
  assert.equal(createBattleSceneResolvers({program:new Uint8Array(1),commonActors:new Uint8Array(1)}).resolveMessageProgram(28),null);
  new DataView(messagePrograms.buffer).setInt32(4,1000);
  assert.equal(resolvers.resolveMessageProgram(1),null);
});
test('message cell0 is not a count and an external neighbor cannot erase an owned program',()=>{
  const messagePrograms=new Uint8Array(144),v=new DataView(messagePrograms.buffer);
  v.setInt32(0,130);v.setInt32(4,-400);v.setInt32(28*4,132-28*4);
  messagePrograms.set([0xf8,0,0xff],132);
  const resolvers=createBattleSceneResolvers({program:new Uint8Array(1),commonActors:new Uint8Array(1),messagePrograms});
  const source=resolvers.resolveMessageProgram(28);
  assert.equal(source.start,132);assert.equal(source.end,144);assert.equal(source.lowerBound,0);
  assert.equal(resolvers.resolveMessageProgram(1),null);assert.equal(resolvers.resolveMessageProgram(256),null);
});
test('encoded short names retain FF at glyph boundaries and do not borrow another record',()=>{
  const shortNames=recordTable([0,1],[Uint8Array.from([238,255,21,255]),Uint8Array.from([255])]);
  const resolvers=createBattleSceneResolvers({program:new Uint8Array(1),commonActors:new Uint8Array(1),shortNames});
  assert.deepEqual(resolvers.resolveShortName(0),Uint8Array.from([238,255,21,255]));
  assert.deepEqual(resolvers.resolveShortName(1),Uint8Array.from([255]));assert.equal(resolvers.resolveShortName(2),null);
  shortNames[11]=21;shortNames[12]=21;assert.equal(resolvers.resolveShortName(0),null);
});
test('relocated short names use the whole owned decoded TSR and signed targets rather than cell0 as a count',()=>{
  const bytes=new Uint8Array(64),v=new DataView(bytes.buffer);v.setInt32(16,40-16);v.setInt32(20,4-20);
  bytes.set([21,255],4);bytes.set([238,255,255],40);
  const resolvers=createBattleSceneResolvers({program:new Uint8Array(1),commonActors:new Uint8Array(1),shortNames:{bytes,start:16,end:24}});
  assert.deepEqual(resolvers.resolveShortName(0),Uint8Array.from([238,255,255]));
  assert.deepEqual(resolvers.resolveShortName(1),Uint8Array.from([21,255]));assert.equal(resolvers.resolveShortName(2),null);
  v.setInt32(20,1000);assert.equal(resolvers.resolveShortName(1),null);
});
test('unloaded inherited, opponent and destruction groups never borrow another record',()=>{
  for(const selector of [0x0100,0x0900,0x1300])assert.equal(resolveBattleSceneSprite(scene,selector).status,'unresolved');
});
test('a native retained group overrides a reused header slot with its own carrier',()=>{
  const loadedGroups=new Map([[2,{fileName:'BTSR.BIN',byteLength:600,recordOffset:20,recordEnd:40}]]);
  assert.equal(resolveBattleSceneSprite(scene,0x0203,{loadedGroups}).assetKey,'battle1:BTSR.BIN:600:20:40:3');
});
test('unknown carriers and invalid record bounds are rejected before decoding',()=>{
  for(const record of [{...scene.unitGraphics,fileName:'other.bin'},{...scene.unitGraphics,recordEnd:2001}])
    assert.throws(()=>resolveBattleSceneSprite({...scene,unitGraphics:record},0x0800));
  for(const selector of [-1,65536,1.5])assert.throws(()=>resolveBattleSceneSprite(scene,selector));
});

test('scene renderer reads explicit mutable depth context and leaves missing context unresolved',()=>{
 const scene={program:new Uint8Array(16),commonActors:new Uint8Array(16)};
 const depthTables=new Uint8Array(32),v=new DataView(depthTables.buffer);v.setInt32(8,-327680);
 const context={depthTables,variant:1},resolvers=createBattleSceneResolvers(scene,{rendererContext:context});
 assert.equal(resolvers.resolveRenderDepth(2),-327680);v.setInt32(8,-393216);assert.equal(resolvers.resolveRenderDepth(2),-393216);
 context.variant=0;v.setInt32(24,65536);assert.equal(resolvers.resolveRenderDepth(2),65536);
 assert.equal(createBattleSceneResolvers(scene).resolveRenderDepth(2),null);
 assert.equal(resolvers.resolveSpriteLoadContext(0),null);
 context.cacheMap=Uint8Array.from([5,0]);context.bankBases=new Uint16Array(16);context.bankBases[5]=132;
 assert.deepEqual(resolvers.resolveSpriteLoadContext(0),{cacheIndex:5,baseBank:132,format:4});
 context.bankBases[5]=134;assert.equal(resolvers.resolveSpriteLoadContext(0).baseBank,134);
});

test('source renderer initialization requires the actual variant and isolates per-scene state',()=>{
 const source={program:new Uint8Array(16),commonActors:new Uint8Array(16),initialRenderDepthTables:new Uint8Array(32)};
 new DataView(source.initialRenderDepthTables.buffer).setInt32(24,-65536);
 const first=createBattleSceneRendererContext(source,{variant:0});
 const second=createBattleSceneRendererContext(source,{variant:1});
 assert.equal(createBattleSceneResolvers(source,{rendererContext:first}).resolveRenderDepth(2),-65536);
 assert.equal(createBattleSceneResolvers(source,{rendererContext:second}).resolveRenderDepth(2),0);
 first.depthTables.fill(0);assert.equal(new DataView(source.initialRenderDepthTables.buffer).getInt32(24),-65536);
 assert.throws(()=>createBattleSceneRendererContext(source),/unresolved/);
 assert.throws(()=>createBattleSceneRendererContext({...source,initialRenderDepthTables:null},{variant:1}),/unresolved/);
});
