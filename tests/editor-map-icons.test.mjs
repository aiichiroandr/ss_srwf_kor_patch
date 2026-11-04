import test from 'node:test';import assert from 'node:assert/strict';
import {readMapIcons,decodeMapIcon} from '../assets/editor-map-icons.mjs';
test('KOM uses the map icon ID, four faction palettes, high nibble first and transparent zero',()=>{
 const bytes=new Uint8Array(65664),view=new DataView(bytes.buffer);
 for(let p=0;p<4;p++)view.setUint16(p*32+2,[31,31<<5,31<<10,0x7fff][p]);
 bytes[128+511*128]=0x10;
 const bank=readMapIcons(bytes);
 for(const [faction,color]of [['player',[248,0,0,255]],['enemy',[0,248,0,255]],['other',[0,0,248,255]],['unknown',[248,248,248,255]]]){
  const icon=decodeMapIcon(bank,511,faction);assert.deepEqual([...icon.slice(0,4)],color);assert.equal(icon[7],0);
 }
 bytes.fill(0);assert.equal(decodeMapIcon(bank,511,'player')[0],248,'source bytes are owned by the model');
 assert.equal(decodeMapIcon(bank,0,'player')[3],0);
});
test('malformed KOM data never becomes an icon or an arbitrary memory read',()=>{
 for(const bytes of [new Uint8Array(65663),new Uint8Array(65665),[]])assert.throws(()=>readMapIcons(bytes),RangeError);
 const bank=readMapIcons(new Uint8Array(65664));
 for(const id of [-1,512,NaN,1.5])assert.equal(decodeMapIcon(bank,id),null);
 assert.equal(decodeMapIcon(bank,1,'bad'),null);assert.equal(decodeMapIcon({},1),null);
});
