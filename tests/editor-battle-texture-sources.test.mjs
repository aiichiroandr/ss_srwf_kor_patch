import {prepareBattleTextureRegistration} from '../assets/editor-battle-texture-registration.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {planBattleTextureSourceLoad,commitBattleTextureSourceLoad,completeBattleTextureSourceLoad} from '../assets/editor-battle-texture-sources.mjs';
const source={fileName:'E_SPR.BIN',byteLength:1000,recordOffset:100,recordEnd:200};
const record={...source,nativeTextureCount:3,assets:[{subIndex:0},{subIndex:2}],diagnostics:[{code:'UNSUPPORTED_SUBIMAGE',subIndex:1}]};
test('native ownership retains skipped subimage indices instead of compacting gallery pictures',()=>{
 const plan=planBattleTextureSourceLoad({sessionToken:'owned-session',source,record,textureBase:20,capacity:100});
 const registry={sessionToken:'owned-session',nextTextureIndex:20,capacity:100,sources:new Map()};
 assert.deepEqual(plan.links.map(x=>[x.textureIndex,x.subIndex]),[[20,0],[21,1],[22,2]]);
 commitBattleTextureSourceLoad(registry,plan);assert.equal(registry.nextTextureIndex,23);
 assert.equal(registry.sources.get(22).recordOffset,100);
 assert.throws(()=>commitBattleTextureSourceLoad(registry,plan),/stale/);
});
test('foreign session, changed allocation and collision reject without partial ownership writes',()=>{
 const plan=planBattleTextureSourceLoad({sessionToken:'owned-session',source,record,textureBase:20,capacity:100});
 for(const override of [{sessionToken:'another-session'},{nextTextureIndex:21},{sources:new Map([[21,{old:true}]])}]){
  const registry={sessionToken:'owned-session',nextTextureIndex:20,capacity:100,sources:new Map(),...override};
  const before=[...registry.sources];assert.throws(()=>commitBattleTextureSourceLoad(registry,plan),/stale/);
  assert.deepEqual([...registry.sources],before);assert.equal(registry.nextTextureIndex,override.nextTextureIndex??20);
 }
 assert.throws(()=>planBattleTextureSourceLoad({sessionToken:'owned-session',source,record:{...record,recordEnd:201},textureBase:20,capacity:100}),/unresolved/);
 assert.throws(()=>planBattleTextureSourceLoad({sessionToken:'owned-session',source,record,textureBase:98,capacity:100}),/unresolved/);
});

test('source ownership is published only after the owned registration uploads successfully',()=>{
 const one={...source,nativeTextureCount:1};
 const registry={sessionToken:'owned-session',nextTextureIndex:0,capacity:10,sources:new Map()};
 const sourcePlan=planBattleTextureSourceLoad({sessionToken:registry.sessionToken,source,record:one,textureBase:0,capacity:10});
 const registration=Object.assign(prepareBattleTextureRegistration({images:[{subIndex:0,nativeTexture:true,width:8,height:1,colorCount:16,paletteIndex:0,pivot:{x:0,y:0},colorIndices:Uint8Array.from([1,2,3,4,5,6,7,8])}],kind:0x70,textureBase:0,paletteBase:0,drawColor:4}),source,{sourceSessionToken:registry.sessionToken});
 const state={nextTextureIndex:0,geometry:new Uint8Array(80),attributes:new Uint8Array(100),pivots:new Uint8Array(40),vram:new Uint8Array(0x80000),textureFormats:new Uint8Array(10)};
 assert.throws(()=>completeBattleTextureSourceLoad(registry,sourcePlan,registration,{...state,vram:new Uint8Array(0)}),/destination/);
 assert.equal(registry.sources.size,0);assert.equal(state.geometry.some(Boolean),false);
 registration.sourceSessionToken='foreign-session';assert.throws(()=>completeBattleTextureSourceLoad(registry,sourcePlan,registration,state),/conflicting/);
 assert.equal(state.vram.some(Boolean),false);registration.sourceSessionToken=registry.sessionToken;
 const completed=completeBattleTextureSourceLoad(registry,sourcePlan,registration,state);
 assert.equal(completed.uploaded,true);assert.equal(state.vram[0x10000],0x12);assert.equal(registry.sources.get(0).subIndex,0);
 assert.equal(registry.nextTextureIndex,1);assert.equal(state.nextTextureIndex,1);
 assert.throws(()=>completeBattleTextureSourceLoad(registry,sourcePlan,registration,state),/conflicting/);
});

test('selected expression maps to its actual source index rather than a gallery ordinal',()=>{
 const face={...source,fileName:'FACE.BIN'},record={...face,nativeTextureCount:3};
 const plan=planBattleTextureSourceLoad({sessionToken:'owned',source:face,record,textureBase:10,capacity:16,subimageStart:2,subimageCount:1});
 assert.equal(plan.textureCount,1);assert.equal(plan.links[0].textureIndex,10);assert.equal(plan.links[0].subIndex,2);
 assert.throws(()=>planBattleTextureSourceLoad({sessionToken:'owned',source:face,record,textureBase:10,capacity:16,subimageStart:2,subimageCount:2}),/unresolved/);
});
