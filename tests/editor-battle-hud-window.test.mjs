import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareBattleHudWindow} from '../assets/editor-battle-hud-window.mjs';
import {expandBattleWebPicture} from '../assets/editor-battle-web-picture.mjs';

function compressed(payload){
 const out=[];let flag=-1,used=8;
 const bit=value=>{if(used===8){flag=out.length;out.push(0);used=0;}if(value)out[flag]|=1<<(7-used);used++;};
 for(const value of payload){bit(1);out.push(value);}bit(0);bit(1);out.push(0,0,0);return out;
}
function fixture({badTile=false,badPalette=false,width=40,height=4}={}){
 const bank=new Uint8Array(4+32*2+2+2*32),b=new DataView(bank.buffer);b.setUint16(0,32);b.setUint16(2,2);
 b.setUint16(6,31);b.setUint16(38,0x3e0);bank.fill(0x11,4+64+2+32);
 const screen=new Uint8Array(20+40*4*2+40*8*2),s=new DataView(screen.buffer);
 screen.set([40,28],0);s.setUint32(4,24);screen.set([width,height],10);s.setUint32(12,24+40*4*2);screen.set([40,8],18);
 for(let i=0;i<40*4;i++)s.setUint16(20+i*2,1);
 for(let i=0;i<40*8;i++)s.setUint16(20+40*4*2+i*2,0x1001);
 if(badTile)s.setUint16(20,2);if(badPalette)s.setUint16(20,0x2001);
 const bk=Uint8Array.from([0x62,0x6b,0x30,0x31,...compressed(bank)]),sc=Uint8Array.from([0x73,0x63,0x30,0x31,...compressed(screen)]);
 const bytes=new Uint8Array(24+bk.length+sc.length),v=new DataView(bytes.buffer);
 for(let i=0;i<6;i++)v.setInt32(i*4,24-i*4);v.setInt32(20,24+bk.length-20);bytes.set(bk,24);bytes.set(sc,24+bk.length);return bytes;
}

test('the original HUD selects fragment0, retaining its own palette and transparent cells',()=>{
 const result=prepareBattleHudWindow(fixture()),image=expandBattleWebPicture(result.picture);
 assert.deepEqual(Object.keys(result).sort(),['picture','status']);assert.equal(result.status,'ready');
 assert.deepEqual([image.width,image.height],[320,32]);
 assert.deepEqual([...image.pixels.slice(0,4)],[248,0,0,255]);
 assert.deepEqual([...image.pixels.slice(-4)],[248,0,0,255]);
});

test('typed subviews and later source mutation cannot alter a prepared HUD',()=>{
 const bytes=fixture(),storage=new Uint8Array(bytes.length+13);storage.set(bytes,7);
 const view=storage.subarray(7,7+bytes.length),prepared=prepareBattleHudWindow(view),before=expandBattleWebPicture(prepared.picture);
 view.fill(0);assert.deepEqual(expandBattleWebPicture(prepared.picture),before);
});

test('HUD shape and paired source guards refuse unselected dialogue or guessed banks',()=>{
 for(const opts of [{width:39},{height:8}])assert.throws(()=>prepareBattleHudWindow(fixture(opts)),{code:'HUD_WINDOW_SOURCE_INVALID'});
 for(const opts of [{badTile:true},{badPalette:true}])assert.throws(()=>prepareBattleHudWindow(fixture(opts)),{code:'BATTLE_BACKGROUND_CELL_BOUNDS'});
 const bytes=fixture();new DataView(bytes.buffer).setInt32(16,bytes.length-16);
 assert.throws(()=>prepareBattleHudWindow(bytes),{code:'HUD_WINDOW_SOURCE_INVALID'});
 assert.throws(()=>prepareBattleHudWindow(new Uint16Array(100)),{code:'HUD_WINDOW_SOURCE_INVALID'});
 assert.throws(()=>prepareBattleHudWindow(fixture().subarray(0,-3)));
});
