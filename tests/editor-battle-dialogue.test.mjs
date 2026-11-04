import test from 'node:test';import assert from 'node:assert/strict';
import {battleDialogueCatalog} from '../assets/editor-battle-dialogue.mjs';
import {encodeEditorText} from '../assets/editor-text-codec.mjs';
function fixture(gameId='srwf-final'){
 const count=gameId==='srwf-f'?384:400,start=count*4,data=new Uint8Array(start+512),d=new DataView(data.buffer),r=new DataView(data.buffer,start);
 for(let i=0;i<count;i++)d.setInt32(i*4,start-i*4);
 for(let i=0;i<10;i++)r.setUint16(i*2,64-i*2);
 r.setUint16(20,65535);r.setUint32(22,64);r.setUint16(26,3);r.setUint32(28,160);r.setUint16(32,65535);r.setUint32(34,120);r.setUint16(64,65535);
 for(const [at,speaker,voice,body,text]of [[80,22,274,200,'핀 판넬'],[120,71,22951,240,'가라']]){r.setUint16(at,17);r.setUint16(at+2,(speaker<<6)|2);r.setUint16(at+4,voice);r.setUint32(at+6,body);r.setUint16(at+10,65535);data.set(encodeEditorText(text,{gameId}),start+body);}
 r.setUint16(160,13);r.setUint16(162,2);r.setUint32(164,80);r.setUint32(168,120);return {data,r,start};
}
for(const gameId of ['srwf-f','srwf-final'])test(`${gameId}: existing attack selector returns native texts, random candidates, speaker and voice ids`,()=>{
 const {data}=fixture(gameId),before=data.slice(),c=battleDialogueCatalog(data,gameId,22);
 assert.equal(c.types.length,64);assert.equal(c.types[3].common,false);assert.deepEqual(c.types[3].lines.map(l=>l.text),['핀\u3000판넬','가라']);assert.deepEqual(c.types[3].lines.map(l=>l.speaker),[22,71]);assert.deepEqual(c.types[3].lines.map(l=>l.voice),[274,22951]);
 assert.equal(c.types[24].common,true);assert.deepEqual(c.types[24].lines.map(l=>l.text),['가라']);assert.deepEqual(data,before);
});
for(const gameId of ['srwf-f','srwf-final'])test(`${gameId}: MAP first-table selectors and fallbacks stay distinct from normal battle`,()=>{
 const {data,r}=fixture(gameId),before=data.slice();
 // Separate first-table exact/fallback roots from second-table exact/fallback.
 for(const [at,key,target]of [[20,3,80],[26,65535,120],[32,3,160],[38,65535,80]]){r.setUint16(at,key);r.setUint32(at+2,target);}
 const prepared=data.slice(),c=battleDialogueCatalog(data,gameId,22);
 assert.equal(c.mapTypes.length,64);
 assert.equal(c.mapTypes[3].common,false);assert.deepEqual(c.mapTypes[3].lines.map(l=>l.text),['핀\u3000판넬']);
 assert.deepEqual(c.types[3].lines.map(l=>l.text),['핀\u3000판넬','가라']);
 assert.equal(c.mapTypes[24].common,true);assert.deepEqual(c.mapTypes[24].lines.map(l=>l.text),['가라']);
 assert.deepEqual(c.types[24].lines.map(l=>l.text),['핀\u3000판넬']);
 assert.deepEqual(data,prepared);assert.notDeepEqual(data,before);
});
test('silent pilot exposes no normal or MAP dialogue candidates',()=>{
 const {data}=fixture(),catalog=battleDialogueCatalog(data,'srwf-final',1);
 assert.equal(catalog.kind,'silent');assert.deepEqual(catalog.types,[]);assert.deepEqual(catalog.mapTypes,[]);
});
test('record bounds, invalid commands and truncated strings are refused; glyph-trail FF stays in its glyph',()=>{
 for(const change of [r=>r.setUint32(22,900),r=>r.setUint32(28,900),r=>r.setUint16(160,99),r=>r.setUint16(162,0),r=>r.setUint32(86,511)]){const {data,r}=fixture();change(r);assert.throws(()=>battleDialogueCatalog(data,'srwf-final',22));}
 const {data,start}=fixture();data.set([0xeb,0xff,0xff],start+200);assert.equal(battleDialogueCatalog(data,'srwf-final',22,{glyphMap:new Map([['EBFF','힣']])}).types[3].lines[0].text,'힣');
 for(const pilot of [-1,0,400,1.1,'22'])assert.throws(()=>battleDialogueCatalog(data,'srwf-final',pilot));assert.throws(()=>battleDialogueCatalog(data,'unknown',22));
});
