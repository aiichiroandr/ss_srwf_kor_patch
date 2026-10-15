import test from'node:test';import assert from'node:assert/strict';
import{planBattleUnitBitmap}from'../assets/editor-battle-unit-bitmap.mjs';
import{createBattleBankScreenState}from'../assets/editor-battle-bank-screen-state.mjs';
import{createBattleActorClock,tickBattleActorClock}from'../assets/editor-battle-clock.mjs';
const fixture=()=>{
 const geometry=new Uint8Array(16),pivots=new Uint8Array(8),vram=new Uint8Array(0x80000),g=new DataView(geometry.buffer),p=new DataView(pivots.buffer);
 for(let i=0;i<2;i++){g.setUint16(i*8,144);g.setUint16(i*8+2,112);g.setUint16(i*8+4,i*1008);p.setInt16(i*4,40+i);p.setInt16(i*4+2,30+i);vram[i*8064]=0x12;vram[(i+1)*8064-1]=0x34;}
 return {operand:0x50,directionBit6:false,sceneFlagsByte:0,textureIndices:[0,1],assetKeys:['battle1:C_ROBOT.BIN:32:4:12:0','battle1:C_ROBOT.BIN:32:12:20:0'],textureState:{geometry,pivots,vram,textureFormats:Uint8Array.of(3,3)}};
};
test('E3 uses registered first body bitmap, dynamic palette nibble and whole reflection with scene bit1',()=>{
 for(const directionBit6 of[false,true])for(let operand=0;operand<256;operand++)for(const sceneFlagsByte of[0,2]){
  const f=fixture(),r=planBattleUnitBitmap({...f,operand,directionBit6,sceneFlagsByte}),side=directionBit6?1:0,mode=(operand^(sceneFlagsByte>>>1))&3;
  assert.equal(r.status,'ready');assert.equal(r.image.textureIndex,side);assert.equal(r.palette,operand>>>4);
  assert.equal(r.scrollX,((mode&1?144-40-side:40+side)-1)&65535);
  assert.equal(r.scrollY,((mode&2?112-30-side:30+side)-1)&65535);
 }
});
test('bitmap writes252cells into plane2 using live palette and preserves index0 transparency',()=>{
 const f=fixture(),r=planBattleUnitBitmap(f),words=new Uint16Array(1024);words[512+81]=0x7c00;
 const screen=createBattleBankScreenState([],{getPalette:()=>({words,offset:512}),getDirection:()=>({bit6:false,bit7:false})});
 assert.deepEqual(screen.copyUnitBitmap(r),{planeIndex:2,cellsWritten:252});let image=screen.snapshot()[0];
 assert.deepEqual([...image.pixels.slice(0,4)],[0,0,248,255]);assert.equal(image.pixels[(2*4)+3],0);
 assert.deepEqual(image.sourceCarriers,['C_ROBOT.BIN']);words[593]=31;image=screen.snapshot()[0];assert.deepEqual([...image.pixels.slice(0,4)],[248,0,0,255]);
});
test('missing geometry and source context remain blocked; E3 consumes no additional time',()=>{
 const f=fixture();assert.equal(planBattleUnitBitmap({...f,textureIndices:null}).status,'blocked');
 new DataView(f.textureState.geometry.buffer).setUint16(0,8);assert.equal(planBattleUnitBitmap(f).reason,'unit-bitmap-geometry-unresolved');
 const a=createBattleActorClock(Uint8Array.of(0xe3,0x50,0xc0,7,2));const seen=[];
 tickBattleActorClock(a,{copyUnitBitmap:v=>(seen.push(v),{status:'ready'})});assert.deepEqual(seen,[80]);assert.equal(a.selector,7);
 const b=createBattleActorClock(Uint8Array.of(0xe3,0,2));tickBattleActorClock(b,{});assert.equal(b.pc,0);assert.equal(b.blocked.reason,'unit-bitmap-context-missing');
});

test('E4 zero record word selects primary body; missing alternate registration never substitutes',()=>{
 for(const directionBit6 of[false,true]){
  const f={...fixture(),directionBit6,opcode:0xe4,sideWord6:[0,0]};
  for(let operand=0;operand<256;operand++)for(const sceneFlagsByte of[0,2]){
   const request={...f,operand,sceneFlagsByte};
   assert.deepEqual(planBattleUnitBitmap(request),planBattleUnitBitmap({...request,opcode:0xe3}));
  }
  const words=[0,0];words[directionBit6?1:0]=1;
  assert.equal(planBattleUnitBitmap({...f,sideWord6:words}).reason,'unit-bitmap-alternate-texture-unresolved');
  assert.equal(planBattleUnitBitmap({...f,sideWord6:null}).reason,'unit-bitmap-side-context-missing');
 }
 const a=createBattleActorClock(Uint8Array.of(0xe4,0x30,0xc0,7,2));let called;
 tickBattleActorClock(a,{copyUnitBitmap:(operand,opcode)=>(called=[operand,opcode],{status:'ready'})});
 assert.deepEqual(called,[48,228]);assert.equal(a.selector,7);
});
