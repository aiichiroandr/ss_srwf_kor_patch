import test from 'node:test';
import assert from 'node:assert/strict';
import {cropBattleEffectPicture} from '../assets/editor-battle-effect-picture.mjs';

test('a thin effect keeps its occupied pixels and exact scene offset without a full plane texture',()=>{
 const pixels=new Uint8ClampedArray(512*512*4);
 for(let x=300;x<308;x++)pixels.set([248,x-300,0,255],(270*512+x)*4);
 const image=cropBattleEffectPicture({width:512,height:512,pixels});
 assert.deepEqual([image.x,image.y,image.width,image.height],[300,270,8,1]);
 assert.equal(image.pixels.byteLength,32);
 assert.deepEqual([...image.pixels.slice(0,4)],[248,0,0,255]);
 assert.deepEqual([...image.pixels.slice(-4)],[248,7,0,255]);
 assert.equal(pixels.byteLength,1048576);
});

test('transparent holes, disconnected wrapped edges and empty planes retain their meaning',()=>{
 const pixels=new Uint8Array(8*8*4);
 assert.equal(cropBattleEffectPicture({width:8,height:8,pixels}),null);
 pixels.set([1,2,3,255],(2*8+3)*4);pixels.set([4,5,6,128],(4*8+5)*4);
 const image=cropBattleEffectPicture({width:8,height:8,pixels});
 assert.deepEqual([image.x,image.y,image.width,image.height],[3,2,3,3]);
 assert.equal(image.pixels[4*4+3],0);assert.equal(image.pixels.at(-1),128);
 pixels[3]=255;pixels[pixels.length-1]=255;
 assert.equal(cropBattleEffectPicture({width:8,height:8,pixels}).pixels,pixels);
 assert.throws(()=>cropBattleEffectPicture({width:8,height:8,pixels:pixels.slice(1)}),/invalid layer/);
});
