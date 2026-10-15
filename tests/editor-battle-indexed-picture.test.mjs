import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareBattleIndexedPicture,createBattleIndexedPicturePreparer} from '../assets/editor-battle-indexed-picture.mjs';
import {createBattleBankScreenState} from '../assets/editor-battle-bank-screen-state.mjs';
const image=(colors,palettes)=>({width:colors.length,height:1,
 colorIndices:Uint8Array.from(colors),paletteIndices:Uint8Array.from(palettes)});

test('current offset256 uses each cell palette; RGB555 preserves the established max248 scale',()=>{
 const paletteWords=new Uint16Array(1024),input=image([2,2,1],[1,2,0]);
 paletteWords[274]=31|(16<<5)|(8<<10);paletteWords[290]=31<<10;paletteWords[257]=31<<5;
 const result=prepareBattleIndexedPicture({image:input,paletteWords,paletteOffset:256});
 assert.deepEqual(Array.from(result.pixels),[248,128,64,255,0,0,248,255,0,248,0,255]);
 assert.equal(result.width,3);assert.equal(result.height,1);
 assert.deepEqual(Object.keys(result).sort(),['height','pixels','width']);
});
test('color0 stays transparent even when its palette entry is bright; nonzero black is opaque',()=>{
 const paletteWords=new Uint16Array(1024);paletteWords[16]=32767;paletteWords[17]=0;
 const result=prepareBattleIndexedPicture({image:image([0,1],[1,1]),paletteWords,paletteOffset:0});
 assert.deepEqual(Array.from(result.pixels),[0,0,0,0,0,0,0,255]);
});
test('offset and 7-bit palette sum wrap over the1024-word destination',()=>{
 const paletteWords=new Uint16Array(1024);paletteWords[1022]=31;paletteWords[0]=31<<5;
 const result=prepareBattleIndexedPicture({image:image([15,1],[127,0]),paletteWords,paletteOffset:1023});
 assert.deepEqual(Array.from(result.pixels),[248,0,0,255,0,248,0,255]);
});
test('typed array subviews use their declared views rather than the enclosing buffers',()=>{
 const paletteStorage=new Uint16Array(1030).fill(31<<10),paletteWords=paletteStorage.subarray(3,1027);
 paletteWords[18]=31;
 const colors=Uint8Array.of(15,15,2,3,15),palettes=Uint8Array.of(127,127,1,1,127);
 const input={width:2,height:1,colorIndices:colors.subarray(2,4),paletteIndices:palettes.subarray(2,4)};
 const result=prepareBattleIndexedPicture({image:input,paletteWords,paletteOffset:0});
 assert.deepEqual(Array.from(result.pixels),[248,0,0,255,0,0,248,255]);
 assert.equal(paletteStorage[2],31<<10);assert.equal(colors[1],15);
});
test('new pictures reflect palette publication changes while older pictures and all inputs remain intact',()=>{
 const paletteWords=new Uint16Array(1024),input=image([1],[0]);paletteWords[1]=31;
 const colorsBefore=input.colorIndices.slice(),palettesBefore=input.paletteIndices.slice();
 const first=prepareBattleIndexedPicture({image:input,paletteWords,paletteOffset:0});
 paletteWords[1]=31<<5;
 const second=prepareBattleIndexedPicture({image:input,paletteWords,paletteOffset:0});
 assert.deepEqual(Array.from(first.pixels),[248,0,0,255]);
 assert.deepEqual(Array.from(second.pixels),[0,248,0,255]);assert.notEqual(first.pixels,second.pixels);
 assert.deepEqual(input.colorIndices,colorsBefore);assert.deepEqual(input.paletteIndices,palettesBefore);
 assert.equal(paletteWords[1],31<<5);
});
test('offset changes are observed independently from the palette buffer identity',()=>{
 const paletteWords=new Uint16Array(1024);paletteWords[1]=31;paletteWords[257]=31<<10;
 const input=image([1],[0]);
 assert.deepEqual(Array.from(prepareBattleIndexedPicture({image:input,paletteWords,paletteOffset:0}).pixels),[248,0,0,255]);
 assert.deepEqual(Array.from(prepareBattleIndexedPicture({image:input,paletteWords,paletteOffset:256}).pixels),[0,0,248,255]);
});
test('the high unused RGB555 bit does not invent transparency for a nonzero color index',()=>{
 const paletteWords=new Uint16Array(1024);paletteWords[1]=0x8000;paletteWords[2]=0xffff;
 const result=prepareBattleIndexedPicture({image:image([1,2],[0,0]),paletteWords,paletteOffset:0});
 assert.deepEqual(Array.from(result.pixels),[0,0,0,255,248,248,248,255]);
});
test('full declared image region is required, including width, height and indexed tails',()=>{
 const paletteWords=new Uint16Array(1024),good=image([1,2],[0,0]);
 for(const input of [undefined,{}, {image:good,paletteWords},
  {image:{...good,width:0},paletteWords,paletteOffset:0},
  {image:{...good,height:513},paletteWords,paletteOffset:0},
  {image:{...good,width:1.5},paletteWords,paletteOffset:0},
  {image:{...good,colorIndices:new Uint8Array(1)},paletteWords,paletteOffset:0},
  {image:{...good,paletteIndices:new Uint8Array(3)},paletteWords,paletteOffset:0},
  {image:{...good,colorIndices:[1,2]},paletteWords,paletteOffset:0},
  {image:{...good,paletteIndices:Uint16Array.of(0,0)},paletteWords,paletteOffset:0}])
  assert.throws(()=>prepareBattleIndexedPicture(input),/unresolved/);
});
test('published palette and offset cannot be guessed, truncated or padded',()=>{
 const input=image([1],[0]);
 for(const paletteWords of [undefined, new Uint16Array(1023),new Uint16Array(1025),new Uint8Array(1024),Array(1024).fill(0)])
  assert.throws(()=>prepareBattleIndexedPicture({image:input,paletteWords,paletteOffset:0}),/unresolved/);
 for(const paletteOffset of [undefined,-1,1024,0.5,NaN,'256'])
  assert.throws(()=>prepareBattleIndexedPicture({image:input,paletteWords:new Uint16Array(1024),paletteOffset}),/unresolved/);
});
test('out-of-range indexed metadata fails even behind transparent pixels',()=>{
 const paletteWords=new Uint16Array(1024);
 for(const input of [image([16],[0]),image([0],[128])])
  assert.throws(()=>prepareBattleIndexedPicture({image:input,paletteWords,paletteOffset:0}),/outside source range/);
});
test('background preparation agrees with the existing live bank-plane lookup before and after publication',()=>{
 const indexed={width:8,height:8,colorIndices:new Uint8Array(64),paletteIndices:new Uint8Array(64),
  pixels:new Uint8ClampedArray(256).fill(200)},paletteWords=new Uint16Array(1024);
 indexed.colorIndices[0]=1;indexed.colorIndices[1]=2;indexed.colorIndices[8]=3;
 indexed.paletteIndices[1]=127;indexed.paletteIndices[8]=7;
 paletteWords[257]=31;paletteWords[(256+127*16+2)&1023]=0;paletteWords[371]=31<<10;
 const state=createBattleBankScreenState([{slot:0,status:'ready',planeMode:1,fragments:[{}],images:[indexed]}],
  {getDirection:()=>({bit6:false,bit7:false}),getPalette:()=>({words:paletteWords,offset:256})});
 state.copy({resourceIndex:0,fragmentIndex:0,x:0,y:0,flags:0});
 const compare=()=>{
  const existing=state.snapshot()[0],prepared=prepareBattleIndexedPicture({image:indexed,paletteWords,paletteOffset:256});
  for(let y=0;y<8;y++)assert.deepEqual(prepared.pixels.slice(y*32,(y+1)*32),existing.pixels.slice(y*512*4,y*512*4+32));
 };
 compare();paletteWords[257]=31<<5;compare();
});

test('registered backgrounds reuse only unchanged visible RGB and retain prior generations',()=>{
 const source=image([0,1,2,1],[127,0,127,0]),paletteWords=new Uint16Array(1024);
 paletteWords[257]=31;paletteWords[(256+127*16+2)&1023]=31<<10;
 const prepare=createBattleIndexedPicturePreparer(source),read=offset=>prepare({paletteWords,paletteOffset:offset});
 const first=read(256);
 assert.deepEqual(first,prepareBattleIndexedPicture({image:source,paletteWords,paletteOffset:256}));
 paletteWords[256]=0x7fff;paletteWords[15]=0x7fff;paletteWords[257]|=0x8000;
 assert.equal(read(256),first);
 paletteWords[257]=31<<5;const changed=read(256);
 assert.notEqual(changed,first);
 assert.deepEqual(changed,prepareBattleIndexedPicture({image:source,paletteWords,paletteOffset:256}));
 assert.deepEqual(Array.from(first.pixels.slice(4,8)),[248,0,0,255]);
 assert.deepEqual(read(1023),prepareBattleIndexedPicture({image:source,paletteWords,paletteOffset:1023}));
});

test('registered input ownership and detached worker output cannot corrupt the next picture',()=>{
 const source=image([0,1],[0,0]),paletteWords=new Uint16Array(1024);paletteWords[1]=31;
 const prepare=createBattleIndexedPicturePreparer(source),first=prepare({paletteWords,paletteOffset:0});
 assert.equal(prepare.ownsSnapshot(first),true);
 assert.equal(prepare.ownsSnapshot({...first,pixels:first.pixels.slice()}),false);
 assert.equal(prepare.ownsSnapshot({...first,width:1,height:2}),false);
 source.colorIndices[1]=2;source.paletteIndices[1]=17;
 assert.equal(prepare({paletteWords,paletteOffset:0}),first);
 const transferred=structuredClone(first,{transfer:[first.pixels.buffer]});
 assert.equal(first.pixels.length,0);
 assert.equal(prepare.ownsSnapshot(first),false);
 const restored=prepare({paletteWords,paletteOffset:0});
 assert.deepEqual(restored,transferred);assert.notEqual(restored,first);
 assert.equal(prepare.ownsSnapshot(restored),true);assert.equal(prepare.ownsSnapshot(transferred),false);
 assert.deepEqual(Object.keys(restored).sort(),['height','pixels','width']);
});

test('registered preparation validates transparent indexed tails and every supplied palette',()=>{
 for(const input of [image([16],[0]),image([0],[128]),{...image([1],[0]),colorIndices:new Uint8Array(2)}])
  assert.throws(()=>createBattleIndexedPicturePreparer(input),/outside source range|unresolved/);
 const prepare=createBattleIndexedPicturePreparer(image([0],[0]));
 for(const input of [undefined,{}, {paletteWords:new Uint16Array(1023),paletteOffset:0},
  {paletteWords:new Uint16Array(1024),paletteOffset:1024}])assert.throws(()=>prepare(input),/unresolved/);
 const paletteWords=new Uint16Array(1024),empty=prepare({paletteWords,paletteOffset:0});
 paletteWords.fill(0x7fff);assert.equal(prepare({paletteWords,paletteOffset:0}),empty);
});
