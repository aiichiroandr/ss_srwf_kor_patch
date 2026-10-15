import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareBattleDialogueWindow} from '../assets/editor-battle-dialogue-window.mjs';
import {expandBattleWebPicture,validateBattleWebPicture} from '../assets/editor-battle-web-picture.mjs';

function compressed(payload){
 const out=[];let flag=-1,used=8;
 const bit=value=>{if(used===8){flag=out.length;out.push(0);used=0;}if(value)out[flag]|=1<<(7-used);used++;};
 for(const value of payload){bit(1);out.push(value);}bit(0);bit(1);out.push(0,0,0);return out;
}
function fixture({paletteCount=48,windowWidth=40,windowHeight=8,badTile=false,badPalette=false,format=0x31}={}){
 const bank=new Uint8Array(4+paletteCount*2+3+3*32),b=new DataView(bank.buffer);
 b.setUint16(0,paletteCount);b.setUint16(2,3);
 for(const [index,word]of [[1,31],[2,0x7c00],[17,0x3e0],[18,0x7fff]])if(index<paletteCount)b.setUint16(4+index*2,word);
 const tileStart=4+paletteCount*2+3;bank.fill(0x11,tileStart+32,tileStart+64);
 bank[tileStart+64]=0x12; // Tile2: red/blue top-left pixels, transparent elsewhere.
 const frameCount=windowWidth*windowHeight,screen=new Uint8Array(20+40*4*2+frameCount*2),s=new DataView(screen.buffer);
 screen.set([40,28],0);s.setUint32(4,24);screen.set([40,4],10);
 s.setUint32(12,24+40*4*2);screen.set([0,5,windowWidth,windowHeight],16);
 // HUD points at red; the selected dialogue frame uses green palette1.
 for(let i=0;i<40*4;i++)s.setUint16(20+i*2,1);
 const at=20+40*4*2;for(let i=0;i<frameCount;i++)s.setUint16(at+i*2,0x1001);
 for(const [i,word]of [[0,2],[1,0x402],[2,0x802],[3,0xc02],[4,0x1002]])s.setUint16(at+i*2,word);
 if(badTile)s.setUint16(at,3);if(badPalette)s.setUint16(at,0x3001);
 const bankRecord=Uint8Array.from([0x62,0x6b,0x30,0x31,...compressed(bank)]),screenRecord=Uint8Array.from([0x73,0x63,0x30,format,...compressed(screen)]);
 const bankOffset=24,screenOffset=bankOffset+bankRecord.length,bytes=new Uint8Array(screenOffset+screenRecord.length),v=new DataView(bytes.buffer);
 for(let i=0;i<6;i++)v.setInt32(i*4,bankOffset-i*4);v.setInt32(20,screenOffset-20);
 bytes.set(bankRecord,bankOffset);bytes.set(screenRecord,screenOffset);return {bytes,bankOffset,screenOffset};
}
const pixel=(image,x,y)=>[...image.pixels.subarray((y*image.width+x)*4,(y*image.width+x)*4+4)];

test('the original window uses only cell4 bank and cell5 fragment1 with source palette and flips',()=>{
 const {bytes}=fixture(),result=prepareBattleDialogueWindow(bytes),image=expandBattleWebPicture(result.picture);
 assert.equal(result.status,'ready');assert.deepEqual([image.width,image.height],[320,64]);
 assert.deepEqual(result.interiorColor,[0,248,0,255]);
 for(const [x,y]of [[0,0],[15,0],[16,7],[31,7]])assert.deepEqual(pixel(image,x,y),[248,0,0,255]);
 for(const [x,y]of [[1,0],[14,0],[17,7],[30,7]])assert.deepEqual(pixel(image,x,y),[0,0,248,255]);
 assert.deepEqual(pixel(image,32,0),[0,248,0,255]);assert.deepEqual(pixel(image,33,0),[248,248,248,255]);
 assert.deepEqual(pixel(image,0,1),[0,0,0,0]);assert.deepEqual(pixel(image,80,20),[0,248,0,255]);
 assert.deepEqual(Object.keys(result).sort(),['interiorColor','picture','status']);
 assert.deepEqual(Object.keys(result.picture).sort(),['colorSlots','colors','format','height','slotStride','width']);
 assert.equal(validateBattleWebPicture(result.picture),true);
});

test('owned input views and returned window pictures do not alias source or later reads',()=>{
 const {bytes}=fixture(),storage=new Uint8Array(bytes.length+18);storage.set(bytes,9);
 const view=storage.subarray(9,9+bytes.length),first=prepareBattleDialogueWindow(view),second=prepareBattleDialogueWindow(view);
 const original=expandBattleWebPicture(first.picture).pixels;view.fill(0);
 assert.deepEqual(expandBattleWebPicture(first.picture).pixels,original);
 first.picture.colors.fill(0);assert.deepEqual(expandBattleWebPicture(second.picture).pixels,original);
 assert.notEqual(first.picture.colorSlots.buffer,second.picture.colorSlots.buffer);
});

test('invalid directories, aliases and unpaired sources never borrow another bank',()=>{
 for(const mutate of [
  (bytes,v)=>v.setInt32(0,20),
  (bytes,v)=>v.setInt32(8,bytes.length),
  (bytes,v)=>v.setInt32(16,v.getInt32(20)+4),
  (bytes,v)=>{const at=20+v.getInt32(20);bytes[at]=0x70;},
 ]){const {bytes}=fixture();mutate(bytes,new DataView(bytes.buffer));assert.throws(()=>prepareBattleDialogueWindow(bytes),{code:'DIALOGUE_WINDOW_SOURCE_INVALID'});}
 assert.throws(()=>prepareBattleDialogueWindow(new Uint8Array(0x14001)),{code:'DIALOGUE_WINDOW_SOURCE_INVALID'});
 assert.throws(()=>prepareBattleDialogueWindow(new Uint16Array(100)),{code:'DIALOGUE_WINDOW_SOURCE_INVALID'});
});

test('unsupported frame shape and screen formats are rejected before presentation',()=>{
 for(const options of [{windowWidth:39},{windowHeight:7},{format:0x32}])
  assert.throws(()=>prepareBattleDialogueWindow(fixture(options).bytes),{code:'DIALOGUE_WINDOW_SOURCE_INVALID'});
});

test('selected missing tiles or palette banks retain the strict paired-bank failure',()=>{
 for(const options of [{badTile:true},{badPalette:true},{paletteCount:16}])
  assert.throws(()=>prepareBattleDialogueWindow(fixture(options).bytes),{code:'BATTLE_BACKGROUND_CELL_BOUNDS'});
});

test('a truncated original compressed frame is not accepted as an empty or synthesized window',()=>{
 const {bytes}=fixture();assert.throws(()=>prepareBattleDialogueWindow(bytes.subarray(0,bytes.length-3)));
});
