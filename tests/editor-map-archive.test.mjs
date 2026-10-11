import test from 'node:test';
import assert from 'node:assert/strict';
import { readMapArchive, readMapBankArchive, repackMapTiles } from '../assets/editor-map-archive.mjs';
import { decodeFramedLz } from '../assets/editor-core.mjs';
import { packGreedy, randomBytes } from './helpers/synthetic-iso.mjs';

import { makeMapArchives as fixture, archive } from './helpers/synthetic-scenario.mjs';
const sizes = { 'srwf-f': {}, 'srwf-final': {} };
for (const gameId of Object.keys(sizes)) test(`${gameId} map cell edits keep orientation/control bits, both plane boundaries, headers and logical aliases`, async () => {
  const f = fixture(gameId), original = f.bytes.slice(), model = readMapArchive(f.bytes,gameId), member = model.members[0];
  const bank = readMapBankArchive(f.bankBytes,gameId); assert.equal(bank.members[0].terrainIds[37],37);
  assert.equal(member.bankIndex,0); assert.equal(member.planes[0].cellStart,24);
  assert.equal(member.planes[1].width,3); assert.equal(member.planes[1].height,5);
  const edit = {mapIndex:2,plane:0,x:1,y:2,tileId:713};
  const result = await repackMapTiles(f.bytes,f.bankBytes,gameId,[edit]), reopened=readMapArchive(result.bytes,gameId);
  const wanted = f.rawPlanes[0].slice(), v = new DataView(wanted.buffer), offset=24+(2*6+1)*2, oldWord=v.getUint16(offset);
  v.setUint16(offset,(oldWord&0xfc00)|713);
  assert.deepEqual(reopened.members[0].planes[0].decoded,wanted);
  assert.deepEqual(reopened.members[0].planes[1].decoded,f.rawPlanes[1]);
  assert.deepEqual(result.bytes.subarray(0,member.start+72),original.subarray(0,member.start+72));
  assert.deepEqual(reopened.slots,model.slots); assert.deepEqual(f.bytes,original);
  const echo=await repackMapTiles(f.bytes,f.bankBytes,gameId,[{...edit,tileId:member.planes[0].tiles[13]}]);
  assert.deepEqual(echo.bytes,original); assert.deepEqual(echo.changedPlanes,[]);
});
test('map writes refuse out-of-rectangle coordinates, unknown ids/fields, getters, sparse lists and alias conflicts atomically', async()=>{
  const f=fixture('srwf-f'),original=f.bytes.slice(),valid={mapIndex:0,plane:0,x:0,y:0,tileId:11};
  let called=0;const getter={...valid};Object.defineProperty(getter,'tileId',{get(){called++;return 5;}});
  for(const edits of [null,[,valid],[valid,{...valid,mapIndex:1}],[getter],[{...valid,mapIndex:-1}],[{...valid,mapIndex:111}],
    [{...valid,plane:2}],[{...valid,x:6}],[{...valid,y:4}],[{...valid,tileId:1024}],[{...valid,tileId:1.1}],[{...valid,extra:2}]]){
    await assert.rejects(repackMapTiles(f.bytes,f.bankBytes,'srwf-f',edits),{code:'EDITOR_MAP_INVALID'});assert.deepEqual(f.bytes,original);
  }assert.equal(called,0);
});
test('map decoding refuses malformed directories, tags, tile rectangles, foreign compressed tails and invalid bank terrain ids',()=>{
  const f=fixture('srwf-final'),mutate=(bytes,fn)=>{const b=bytes.slice();fn(b,new DataView(b.buffer));return b;};
  for(const b of [mutate(f.bytes,(b,v)=>v.setUint32(0,10)),mutate(f.bytes,(b,v)=>v.setUint32(12,v.getUint32(12)+1)),
    mutate(f.bytes,b=>b[127*8+68]=0),mutate(f.bytes,(b,v)=>v.setUint16(127*8+66,1)),new Uint8Array([...f.bytes,0])]){
    assert.throws(()=>readMapArchive(b,'srwf-final'),{code:'EDITOR_MAP_INVALID'});
  }
  const model=readMapArchive(f.bytes,'srwf-final');const p=model.members[0].planes[0],bad=p.decoded.slice();bad[10]=65;
  const body=f.bytes.subarray(model.members[0].start).slice();const packed=packGreedy(bad);
  body.set(packed,72); // literal fixture has unchanged lengths for a header-byte edit
  assert.throws(()=>readMapArchive(archive(127,[body]),'srwf-final'),{code:'EDITOR_MAP_INVALID'});
  const banks=readMapBankArchive(f.bankBytes,'srwf-final'),badBank=banks.members[0].decoded.slice();badBank[512]=144;
  const packedBank=packGreedy(badBank),bankBody=new Uint8Array(1028+packedBank.length);
  bankBody.set(new TextEncoder().encode('bk00'),1024);bankBody.set(packedBank,1028);
  assert.throws(()=>readMapBankArchive(archive(24,[bankBody]),'srwf-final'),{code:'EDITOR_MAP_INVALID'});
});
test('map plane growth is refused and requested values are captured before asynchronous packing',async()=>{
  const f=fixture('srwf-f',{repetitive:true}),original=f.bytes.slice(),edits=Array.from({length:24},(_,i)=>({mapIndex:0,plane:0,x:i%6,y:Math.floor(i/6),tileId:i*41}));
  await assert.rejects(repackMapTiles(f.bytes,f.bankBytes,'srwf-f',edits),{code:'EDITOR_MAP_GROWTH_UNSUPPORTED'});assert.deepEqual(f.bytes,original);
  const noisy=fixture('srwf-f'),wanted={mapIndex:0,plane:0,x:1,y:2,tileId:700};
  const result=await repackMapTiles(noisy.bytes,noisy.bankBytes,'srwf-f',[wanted],{onProgress(){wanted.tileId=900;noisy.bytes.fill(255);noisy.bankBytes.fill(255);}});
  assert.equal(readMapArchive(result.bytes,'srwf-f').members[0].planes[0].tiles[13],700);
});
test('bounded framed LZ requires END and permits an output exactly at its configured bound',()=>{
  const raw=randomBytes(300,19),packed=packGreedy(raw);assert.deepEqual(decodeFramedLz(packed,300).output,raw);
  assert.throws(()=>decodeFramedLz(packed,299));assert.throws(()=>decodeFramedLz(packed.subarray(0,packed.length-1)));
  assert.throws(()=>decodeFramedLz(new Uint8Array([0,0,1,2])));
  for(const bound of [0,1.5,8388609])assert.throws(()=>decodeFramedLz(packed,bound));
});
