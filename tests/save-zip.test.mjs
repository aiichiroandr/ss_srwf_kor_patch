import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSaveZip } from '../assets/save-zip.mjs';

const files=[{name:'상대.bin',blob:new Blob(['123456789'])},{name:'상대.cue',blob:new Blob(['FILE "상대.bin" BINARY'])},{name:'원본-edited.bcr',blob:new Blob([Uint8Array.of(0,1,255)])}];
test('three STORE members have UTF-8 names, matching local/central metadata and canonical CRC',async()=>{
 const out=await buildSaveZip(files),raw=new Uint8Array(await out.arrayBuffer()),view=new DataView(raw.buffer);
 const u16=(p)=>view.getUint16(p,true),u32=(p)=>view.getUint32(p,true),decode=new TextDecoder();
 const end=raw.length-22;assert.equal(u32(end),0x06054b50);assert.equal(u16(end+10),3);
 let directory=u32(end+16),local=0;
 for(const [index,{name,blob}] of files.entries()){
  assert.equal(u32(local),0x04034b50);assert.equal(u16(local+6),0x800);assert.equal(u16(local+8),0);
  assert.equal(u32(directory),0x02014b50);assert.equal(u16(directory+10),0);
  const len=u16(local+26),crc=u32(local+14),size=u32(local+18);
  assert.equal(u32(directory+42),local);assert.equal(u32(directory+16),crc);assert.equal(u32(directory+20),size);assert.equal(size,blob.size);
  assert.equal(decode.decode(raw.slice(local+30,local+30+len)),name);
  assert.equal(decode.decode(raw.slice(directory+46,directory+46+len)),name);
  if(!index)assert.equal(crc,0xcbf43926);
  assert.deepEqual(raw.slice(local+30+len,local+30+len+size),new Uint8Array(await blob.arrayBuffer()));
  local+=30+len+size;directory+=46+len;
 }
 assert.equal(directory,end);assert.equal(local,u32(end+16));
});
test('zip refuses unsafe/duplicate names and cancels before publishing bytes',async()=>{
 await assert.rejects(buildSaveZip([{...files[0],name:'../game.bin'},...files.slice(1)]),/ZIP/);
 await assert.rejects(buildSaveZip([files[0],{...files[1],name:'상대.BIN'},files[2]]),/ZIP/);
 const c=new AbortController();
 await assert.rejects(buildSaveZip(files,{signal:c.signal,onProgress:()=>c.abort()}),{name:'AbortError'});
});
