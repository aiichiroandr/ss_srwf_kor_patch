import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareBattleHudBars,planBattleHudBar} from '../assets/editor-battle-hud-bars.mjs';
import {expandBattleWebPicture} from '../assets/editor-battle-web-picture.mjs';

function compressed(payload){
 const out=[];let flag=-1,used=8;
 const bit=value=>{if(used===8){flag=out.length;out.push(0);used=0;}if(value)out[flag]|=1<<(7-used);used++;};
 for(const value of payload){bit(1);out.push(value);}bit(0);bit(1);out.push(0,0,0);return out;
}
function fixture({width=8,height=8,paletteIndex=0}={}){
 const bank=new Uint8Array(4+32*2+1+32),bv=new DataView(bank.buffer);bv.setUint16(0,32);bv.setUint16(2,1);
 const screen=new Uint8Array(12+40*4*2),sv=new DataView(screen.buffer);screen.set([40,4]);sv.setUint32(4,16);screen.set([40,4],10);
 const count=35,paletteStart=count*16+6,stride=Math.ceil(width/8)*4;
 const payload=new Uint8Array(paletteStart+64+count*stride*height),v=new DataView(payload.buffer);
 payload[1]=count;v.setUint32(count*16+2,32);
 v.setUint16(paletteStart+2,0x03e0);v.setUint16(paletteStart+4,0x001f);
 for(let index=0;index<count;index++){
  const at=index*16,pixels=paletteStart+64+index*stride*height,offset=pixels+2;
  payload.set([offset>>>16,(offset>>>8)&255,offset&255],at+3);payload[at+9]=paletteIndex;
  v.setUint16(at+10,width);v.setUint16(at+12,height);v.setInt16(at+14,4);v.setInt16(at+16,4);
  for(let y=2;y<Math.min(7,height);y++)for(let x=0;x<width;x++){
   const color=x<index-26?1:2,at=pixels+y*stride+(x>>>1);
   payload[at]|=color<<(x&1?0:4);
  }
 }
 const bk=Uint8Array.from([0x62,0x6b,0x30,0x31,...compressed(bank)]),sc=Uint8Array.from([0x73,0x63,0x30,0x31,...compressed(screen)]),p=Uint8Array.from([0x70,0x58,...compressed(payload)]);
 const bytes=new Uint8Array(32+bk.length+sc.length+p.length),d=new DataView(bytes.buffer);
 for(let index=0;index<8;index++)d.setInt32(index*4,32-index*4);
 d.setInt32(5*4,32+bk.length-5*4);d.setInt32(7*4,32+bk.length+sc.length-7*4);
 bytes.set(bk,32);bytes.set(sc,32+bk.length);bytes.set(p,32+bk.length+sc.length);return bytes;
}
test('the nine owned common pictures retain source colors, alpha and eight-pixel fill steps',()=>{
 for(const gameId of ['srwf-f','srwf-final']){
  const bars=prepareBattleHudBars(fixture(),{gameId});assert.equal(bars.status,'ready');assert.equal(bars.pictures.length,9);
  for(let fill=0;fill<=8;fill++){
   const p=expandBattleWebPicture(bars.pictures[fill]);assert.deepEqual([p.width,p.height],[8,8]);
   for(let y=0;y<8;y++)for(let x=0;x<8;x++){
    const actual=[...p.pixels.slice((y*8+x)*4,(y*8+x)*4+4)];
    assert.deepEqual(actual,y>=2&&y<=6?(x<fill?[0,248,0,255]:[248,0,0,255]):[0,0,0,0]);
   }
  }
 }
});
test('prepared gauge pictures do not alias mutated source or an enclosing typed buffer',()=>{
 const bytes=fixture(),storage=new Uint8Array(bytes.length+13).fill(77);storage.set(bytes,7);
 const view=storage.subarray(7,7+bytes.length),result=prepareBattleHudBars(view,{gameId:'srwf-f'}),before=result.pictures.map(expandBattleWebPicture);
 view.fill(0);assert.deepEqual(result.pictures.map(expandBattleWebPicture),before);assert.equal(storage[6],77);assert.equal(storage.at(-1),77);
});
test('missing game, truncated carrier and unverified common picture geometry or palette are refused',()=>{
 for(const gameId of [undefined,'other'])assert.throws(()=>prepareBattleHudBars(fixture(),{gameId}),/explicit game/);
 for(const options of [{width:16},{height:7},{paletteIndex:1}])
  assert.throws(()=>prepareBattleHudBars(fixture(options),{gameId:'srwf-f'}),/unsupported gauge-piece/);
 const bytes=fixture();new DataView(bytes.buffer).setInt32(28,32-28);
 assert.throws(()=>prepareBattleHudBars(bytes,{gameId:'srwf-f'}),/picture source invalid/);
 assert.throws(()=>prepareBattleHudBars(fixture().subarray(0,-7),{gameId:'srwf-f'}));
});
test('native selectors keep separate HP88/EN24 anchors on the correct left and right sides',()=>{
 for(const [selector,x,y,width,count]of [[0,200,12,88,11],[1,264,18,24,3],[2,48,12,88,11],[3,112,18,24,3]]){
  const full=planBattleHudBar({selector,current:200,max:200});assert.equal(full.selector,selector);assert.equal(full.filledPixels,width);assert.equal(full.placements.length,count);
  assert.deepEqual(full.placements.map(p=>p.x),Array.from({length:count},(_,i)=>x+i*8));
  assert.ok(full.placements.every(p=>p.pictureIndex===8&&p.y===y&&p.width===8&&p.height===8&&p.x+p.width<=320&&p.y+p.height<=32));
  const zero=planBattleHudBar({selector,current:0,max:200});assert.equal(zero.filledPixels,0);assert.ok(zero.placements.every(p=>p.pictureIndex===0));
 }
});
test('division is integer source rounding and emits only actual partial/empty pieces',()=>{
 const hp=planBattleHudBar({selector:2,current:69,max:100});assert.equal(hp.filledPixels,60);
 assert.deepEqual(hp.placements.map(p=>p.pictureIndex),[8,8,8,8,8,8,8,4,0,0,0]);
 const en=planBattleHudBar({selector:3,current:69,max:100});assert.equal(en.filledPixels,16);
 assert.deepEqual(en.placements.map(p=>p.pictureIndex),[8,8,0]);
 for(let max=1;max<=97;max++)for(let current=0;current<=max;current++)for(const selector of [0,1]){
  const result=planBattleHudBar({selector,current,max}),width=selector===0?88:24;
  assert.equal(result.filledPixels,Math.floor(current*width/max));
  assert.equal(result.placements.reduce((sum,p)=>sum+p.pictureIndex,0),result.filledPixels);
  assert.ok(result.placements.every(p=>Number.isInteger(p.pictureIndex)&&p.pictureIndex>=0&&p.pictureIndex<=8));
 }
});
test('zero maximum follows the source full-width branch and malformed numeric state cannot invent a gauge',()=>{
 for(const selector of [0,1,2,3])for(const current of [0,999,65535]){
  const result=planBattleHudBar({selector,current,max:0});assert.ok(result.placements.every(p=>p.pictureIndex===8));
 }
 for(const input of [{selector:4,current:1,max:2},{selector:0,current:3,max:2},
  {selector:0,current:-1,max:20},{selector:1,current:1.5,max:20},{selector:0,current:1,max:65536},
  {selector:0,current:1,max:null},{}])assert.throws(()=>planBattleHudBar(input),/bounded numeric gauge/);
});
