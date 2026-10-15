import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareBattleWebPicture,validateBattleWebPicture,battleWebPictureBytes,
 expandBattleWebPicture,equalBattleWebPictures,equalBattleWebPictureToRgba} from '../assets/editor-battle-web-picture.mjs';
const indexed='battle-web-indexed-picture-v1',rgba='battle-web-rgba-picture-v1';
const raw=(width,height=1,colors=[[0,0,0,0],[0,0,0,255],[248,80,20,255]])=>{
 const pixels=new Uint8ClampedArray(width*height*4);
 for(let at=0;at<width*height;at++)pixels.set(colors[at%colors.length],at*4);
 return {width,height,pixels};
};
test('local indexing preserves transparent zero, opaque black and exact source colors',()=>{
 const input=raw(128),result=prepareBattleWebPicture(input);
 assert.equal(result.format,indexed);assert.equal(result.slotStride,1);
 assert.deepEqual(Array.from(result.colors),[0,0,0,0,0,0,0,255,248,80,20,255]);
 assert.deepEqual(expandBattleWebPicture(result).pixels,new Uint8Array(input.pixels));
 assert.equal(battleWebPictureBytes(result),128+12);assert.equal(validateBattleWebPicture(result),true);
 assert.equal(prepareBattleWebPicture(result),result);
});
test('arbitrary alpha including invisible colored pixels is lossless',()=>{
 const input=raw(128,1,[[9,8,7,0],[0,0,0,0],[210,80,23,128],[1,255,7,1],[0,0,0,255]]);
 const result=prepareBattleWebPicture(input);
 assert.equal(result.format,indexed);assert.equal(result.colors[7],0);
 assert.deepEqual(expandBattleWebPicture(result).pixels,new Uint8Array(input.pixels));
});
test('only cheaper pictures are encoded; equal costs and excessive colors use RGBA',()=>{
 const input=raw(4,1,[[0,0,0,255],[1,2,3,255],[4,5,6,255]]);
 const equal=prepareBattleWebPicture(input);assert.equal(equal.format,rgba);
 assert.equal(battleWebPictureBytes(equal),16);assert.notEqual(equal.pixels,input.pixels);
 const many=raw(512,4,Array.from({length:1024},(_,i)=>[i&255,i>>>8,17,255]));
 const result=prepareBattleWebPicture(many);assert.equal(result.format,rgba);
 assert.deepEqual(expandBattleWebPicture(result).pixels,new Uint8Array(many.pixels));
});
test('stride two is little endian and handles the 255/256/1023 boundary',()=>{
 const input=raw(512,8,Array.from({length:1023},(_,i)=>[i&255,i>>>8,17,255]));
 const result=prepareBattleWebPicture(input);assert.equal(result.format,indexed);assert.equal(result.slotStride,2);
 assert.equal(result.colors.length,4096);
 for(const [pixel,slot] of [[0,1],[254,255],[255,256],[1022,1023]])
  assert.equal(result.colorSlots[pixel*2]+result.colorSlots[pixel*2+1]*256,slot);
 assert.deepEqual(expandBattleWebPicture(result).pixels,new Uint8Array(input.pixels));
 assert.equal(battleWebPictureBytes(result),8192+4096);
});
test('the 256-color table boundary chooses one byte; its next slot chooses two',()=>{
 const unique=n=>Array.from({length:n},(_,i)=>[i&255,i>>>8,17,255]);
 const one=prepareBattleWebPicture(raw(512,8,unique(255))),two=prepareBattleWebPicture(raw(512,8,unique(256)));
 assert.equal(one.colors.length,1024);assert.equal(one.slotStride,1);
 assert.equal(two.colors.length,1028);assert.equal(two.slotStride,2);
 assert.deepEqual(expandBattleWebPicture(one).pixels,new Uint8Array(raw(512,8,unique(255)).pixels));
 assert.deepEqual(expandBattleWebPicture(two).pixels,new Uint8Array(raw(512,8,unique(256)).pixels));
});
test('typed subviews and source metadata do not leak buffers or proprietary layout into web IR',()=>{
 const input=raw(128),storage=new Uint8Array(input.pixels.length+12).fill(77);
 storage.set(input.pixels,4);const view=storage.subarray(4,4+input.pixels.length);
 const result=prepareBattleWebPicture({...input,pixels:view,format:'image',assetKey:'body:1',sourceAssetKey:'owned:body',
  paletteWords:new Uint16Array(1024),colorIndices:new Uint8Array(128),widthSource:900});
 assert.deepEqual(Object.keys(result).sort(),['assetKey','colorSlots','colors','format','height','slotStride','sourceAssetKey','width']);
 assert.deepEqual(expandBattleWebPicture(result).pixels,new Uint8Array(input.pixels));
 assert.equal(storage[3],77);assert.equal(storage.at(-1),77);
 const copied=structuredClone(result);assert.equal(equalBattleWebPictures(result,copied),true);
});
test('palette changes produce new immutable pictures without changing previous inputs',()=>{
 const input=raw(128),before=input.pixels.slice(),first=prepareBattleWebPicture(input);
 input.pixels[8]=7;const second=prepareBattleWebPicture(input);
 assert.deepEqual(expandBattleWebPicture(first).pixels,new Uint8Array(before));
 assert.equal(equalBattleWebPictures(first,second),false);
 assert.equal(first.colorSlots[2],2);assert.notEqual(first.colors,second.colors);
});
test('RGBA fallback copies typed subviews and contains only explicit web fields',()=>{
 const storage=Uint8Array.of(99,99,7,8,9,128,99),input={width:1,height:1,pixels:storage.subarray(2,6),
  format:'bk01',assetKey:'bg',paletteIndices:new Uint8Array(1)};
 const result=prepareBattleWebPicture(input);assert.equal(result.format,rgba);
 assert.deepEqual(Object.keys(result).sort(),['assetKey','format','height','pixels','width']);
 storage[2]=77;assert.deepEqual(Array.from(result.pixels),[7,8,9,128]);
 const expanded=expandBattleWebPicture(result);expanded.pixels[0]=90;assert.equal(result.pixels[0],7);
});
test('valid shared index subviews preserve their view boundaries',()=>{
 const source=prepareBattleWebPicture(raw(128)),storage=new Uint8Array(136).fill(255);
 storage.set(source.colorSlots,4);const shared={...source,colorSlots:storage.subarray(4,132)};
 assert.equal(validateBattleWebPicture(shared),true);assert.equal(equalBattleWebPictures(source,shared),true);
 assert.deepEqual(expandBattleWebPicture(shared).pixels,expandBattleWebPicture(source).pixels);
});
test('format-specific equality checks geometry, stride, table and pixels, excluding trace labels',()=>{
 const a=prepareBattleWebPicture(raw(128));assert.equal(equalBattleWebPictures(a,{...a,assetKey:'different'}),true);
 assert.equal(equalBattleWebPictures(a,{...a,width:64,height:2}),false);
 const colors=a.colors.slice();colors[4]=12;assert.equal(equalBattleWebPictures(a,{...a,colors}),false);
 const colorSlots=a.colorSlots.slice();colorSlots[0]=1;assert.equal(equalBattleWebPictures(a,{...a,colorSlots}),false);
 const rawPicture={format:rgba,...expandBattleWebPicture(a)};
 assert.equal(equalBattleWebPictures(a,rawPicture),false);
 assert.equal(equalBattleWebPictures(rawPicture,structuredClone(rawPicture)),true);
});
test('invalid dimensions, source types, lengths and ambiguous web formats fail closed',()=>{
 const good=raw(128);
 for(const input of [null,{}, {...good,width:0},{...good,height:513},{...good,width:1.5},
  {...good,pixels:new Uint8Array(1)},{...good,pixels:Array.from(good.pixels)},
  {...good,pixels:new Uint16Array(good.pixels.length)}, {...good,format:'battle-web-picture-unknown'},
  {...good,assetKey:''},{...good,sourceAssetKey:22}])assert.throws(()=>prepareBattleWebPicture(input),/Battle web picture/);
});
test('strict wire validation rejects missing format, trailing fields and all malformed indexed regions',()=>{
 const a=prepareBattleWebPicture(raw(128));
 const invalid=[{...a,format:undefined},{...a,paletteWords:new Uint16Array(1024)},
  {...a,assetKey:undefined},{...a,slotStride:0},{...a,slotStride:3},
  {...a,colorSlots:new Uint8Array(127)},{...a,colorSlots:new Uint8Array(129)},
  {...a,colorSlots:new Uint8ClampedArray(a.colorSlots)}, {...a,colors:new Uint8Array(3)},
  {...a,colors:new Uint8Array(4100)},{...a,colors:new Uint16Array(12)},
  {...a,colors:Uint8Array.of(1,0,0,0)},{...a,colors:new Uint8Array(4)},
  {...a,slotStride:1,colors:new Uint8Array(1028)}, {...a,[Symbol('source')]:1}];
 for(const input of invalid){assert.throws(()=>validateBattleWebPicture(input),/Battle web picture/);
  assert.throws(()=>expandBattleWebPicture(input),/Battle web picture/);}
 const two={...a,slotStride:2,colorSlots:new Uint8Array(256)};two.colorSlots[1]=255;
 assert.throws(()=>validateBattleWebPicture(two),/index outside color table/);
 const r=prepareBattleWebPicture(raw(1));
 for(const input of [{...r,pixels:new Uint8Array(3)},{...r,pixels:new Uint8Array(5)},
  {...r,colors:new Uint8Array(4)}])assert.throws(()=>validateBattleWebPicture(input),/Battle web picture/);
});

test('retained web pictures compare to RGBA without hiding changed alpha or color bytes',()=>{
 for(const input of [raw(128,1,[[9,8,7,0],[0,0,0,255],[7,8,9,128]]),
  raw(512,8,Array.from({length:1023},(_,i)=>[i&255,i>>>8,17,255])),raw(1)]){
  const retained=prepareBattleWebPicture(input);
  assert.equal(equalBattleWebPictureToRgba(retained,input),true);
  for(const component of [0,1,2,3]){
   const changed={...input,pixels:input.pixels.slice()};changed.pixels[component]^=1;
   assert.equal(equalBattleWebPictureToRgba(retained,changed),false);
  }
  assert.throws(()=>equalBattleWebPictureToRgba(retained,{...input,pixels:new Uint8Array(1)}),/RGBA region/);
 }
 const a=prepareBattleWebPicture(raw(128));
 assert.equal(equalBattleWebPictureToRgba(a,{...raw(128),width:64,height:2}),false);
 const broken={...a,colorSlots:a.colorSlots.slice()};broken.colorSlots[0]=255;
 assert.throws(()=>equalBattleWebPictureToRgba(broken,raw(128)),/index outside/);
});
