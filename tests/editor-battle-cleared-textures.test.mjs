import test from'node:test';import assert from'node:assert/strict';
import{createBattleClearedTextureState,isBattleUnusedClearedTexture}from'../assets/editor-battle-cleared-textures.mjs';
test('only a source-cleared unused tail with untouched registration fields is empty',()=>{
 const state=createBattleClearedTextureState(256);assert.equal(isBattleUnusedClearedTexture(state,168,140),true);
 assert.equal(isBattleUnusedClearedTexture({...state},168,140),false);
 for(const [index,next]of [[139,140],[256,140],[-1,0],[168,-1]])assert.equal(isBattleUnusedClearedTexture(state,index,next),false);
 for(const [field,stride]of [['geometry',8],['attributes',10],['pivots',4],['textureFormats',1]]){state[field][168*stride]=1;assert.equal(isBattleUnusedClearedTexture(state,168,140),false);state[field][168*stride]=0;}
 assert.throws(()=>createBattleClearedTextureState(1025));
});

import{readBattleTextureClearProfile}from'../assets/editor-battle-cleared-textures.mjs';
function clearFixture(gameId,{wrapper=false}={}){
 const b=new Uint8Array(wrapper?0xaf210:0x6000),v=new DataView(b.buffer),put16=(a,n)=>v.setUint16(a-0x6004000,n),put32=(a,n)=>v.setUint32(a-0x6004000,n);
 const entry=gameId==='srwf-f'?0x600989c:0x6009ac4;[0x2f86,0x2fe6,0x4f22].forEach((n,i)=>put16(entry+i*2,n));
 if(gameId==='srwf-f'){
  put16(0x60098c0,0x410b);put32(0x6009910,0x2020f000);put32(0x6009918,wrapper?0x20219800:0x20210000);put32(0x6009920,wrapper?0x2021d800:0x20214800);put32(0x6009928,0xb000);put32(0x600992c,wrapper?0x60b31dc:0x600453c);
  if(wrapper){put16(0x60b31dc,0x4f22);put16(0x60b31e4,0x400b);put16(0x60b31ee,0x400b);put32(0x60b31f8,0x20219800);put32(0x60b31fc,0x9800);put32(0x60b3200,0x600453c);put32(0x60b3204,0x2020f000);put32(0x60b3208,0x1800);}
 }else{put32(0x6009b3c,0x60d86e4);put32(0x6009b44,0x2020c800);put32(0x6009b4c,0x20210800);put32(0x6009b54,0x600453c);for(const[a,n]of[[0x6009ae6,0xe518],[0x6009ae8,0x4518],[0x6009af2,0xe54c],[0x6009af4,0x4518],[0x6009af6,0x4500]])put16(a,n);}
 return{b,put16,put32};
}
test('source clear coverage distinguishes stock F, relocated F, Final and incomplete layouts',()=>{
 for(const[gameId,wrapper]of[['srwf-f',false],['srwf-f',true],['srwf-final',false]]){
  const f=clearFixture(gameId,{wrapper});assert.equal(readBattleTextureClearProfile(f.b,{gameId}).status,'proved');
  f.put32(gameId==='srwf-f'?0x6009920:0x6009b4c,0x20270000);
  assert.equal(readBattleTextureClearProfile(f.b,{gameId}).reason,'clear-coverage-incomplete');
 }
 assert.equal(readBattleTextureClearProfile(new Uint8Array(4),{gameId:'srwf-f'}).status,'unresolved');
 const state=createBattleClearedTextureState(256,{sourceCleared:false});assert.equal(isBattleUnusedClearedTexture(state,168,140),false);
});
