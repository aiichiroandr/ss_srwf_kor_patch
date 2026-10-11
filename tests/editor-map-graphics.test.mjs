import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeMapTile } from '../assets/editor-map-graphics.mjs';
import { createScenarioModel } from '../assets/editor-scenario-model.mjs';

function fixture() {
  const graphics = {palette:new Uint8Array(512),patterns:new Uint8Array(8192),pixels:new Uint8Array(32768)};
  const palette = new DataView(graphics.palette.buffer), patterns = new DataView(graphics.patterns.buffer);
  // Four different quadrants, different palettes, asymmetric nibble/row data.
  for (let p=0;p<16;p++) for(let n=0;n<16;n++) palette.setUint16((p*16+n)*2,(n&31)|((p&31)<<5)|(((n+p)&31)<<10));
  for (let q=0;q<4;q++) { patterns.setUint16((7*4+q)*2,((q+9)<<12)|(1020+q));
    for(let y=0;y<8;y++)for(let x=0;x<8;x+=2)graphics.pixels[(1020+q)*32+y*4+x/2]=((x+y+q)&15)<<4|((x+y+q+1)&15); }
  return graphics;
}
const pixel=(image,x,y)=>Array.from(image.subarray((y*16+x)*4,(y*16+x)*4+4));

test('4-bpp high nibble comes first; BE RGB555, palette and last character address are independent',()=>{
  const image=decodeMapTile(fixture(),7);
  assert.deepEqual(pixel(image,0,0),[0,72,72,255]);
  assert.deepEqual(pixel(image,1,0),[8,72,80,255]);
  assert.deepEqual(pixel(image,15,15),[8,96,104,255]);
});
test('map H/V permutations and character flips produce the expected reflected whole tile',()=>{
  const g=fixture(),plain=decodeMapTile(g,7);
  for (const orientation of [1,2,3]) {
    const flipped=decodeMapTile(g,7,orientation);
    for(let y=0;y<16;y++)for(let x=0;x<16;x++)assert.deepEqual(pixel(flipped,x,y),pixel(plain,orientation&1?15-x:x,orientation&2?15-y:y));
  }
});
test('inherent character flip is ORed with the map flip rather than cancelled',()=>{
  const g=fixture(),v=new DataView(g.patterns.buffer);
  const at=(7*4+1)*2;v.setUint16(at,v.getUint16(at)|1024);
  const without=fixture(),a=decodeMapTile(g,7,1),b=decodeMapTile(without,7,1);
  for(let y=0;y<8;y++)for(let x=0;x<8;x++)assert.deepEqual(pixel(a,x,y),pixel(b,x,y));
});
test('malformed buffers, tile ids and orientations are rejected before decoding',()=>{
  for(const [g,id,o]of [[fixture(),-1,0],[fixture(),1024,0],[fixture(),7,4],[fixture(),7,1.5],[{...fixture(),pixels:new Uint8Array(32767)},7,0],[{...fixture(),patterns:[]},7,0]])assert.throws(()=>decodeMapTile(g,id,o),RangeError);
});
test('map graphics follow sparse edits and aliases, retain orientation, and terrain examples navigate a real cell',()=>{
  const g=fixture(),terrainIds=new Uint8Array(1024);terrainIds[7]=4;
  const model=createScenarioModel({maps:[{mapIndex:0,mapSlots:[0,1],bankIndex:0,planes:[{width:2,height:1,tiles:[7,0],orientations:Uint8Array.of(1,0)}]}],mapBanks:[{bankSlots:[0],terrainIds,graphics:g}]});
  let result=model.graphics.map(model,1,0);assert.equal(result.width,32);assert.equal(result.height,16);
  assert.deepEqual(Array.from(result.data.subarray(0,4)),pixel(decodeMapTile(g,7,1),0,0));
  let examples=model.graphics.examples(model,4);assert.equal(examples.length,1);assert.deepEqual({...examples[0],pixels:undefined},{mapIndex:0,plane:0,x:0,y:0,tileId:7,pixels:undefined});
  model.cell(1,0,0,0).tileId=0;model.cell(0,0,1,0).tileId=7;
  result=model.graphics.map(model,0,0);assert.deepEqual(Array.from(result.data.subarray(64,68)),pixel(decodeMapTile(g,7),0,0));
  examples=model.graphics.examples(model,4);assert.equal(examples[0].x,1);
  assert.equal(createScenarioModel({maps:model.maps,mapBanks:[{bankSlots:[0],terrainIds}]}).graphics.map(model,9,0),null);
});
