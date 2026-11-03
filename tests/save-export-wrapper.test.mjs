import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {openSave} from '../assets/save-core.mjs';
import {syntheticSave} from './helpers/synthetic-save.mjs';

test('a valid gzip of the wrong container is refused after the payload/block checks passed',async()=>{
 const fixture=syntheticSave(),session=await openSave(new Uint8Array(gzipSync(fixture.raw)),{gameId:'srwf-final'});
 session.edit(session.list()[0].key,'money',12345);
 const original=globalThis.CompressionStream;
 try{
  globalThis.CompressionStream=class{
   constructor(){const chunks=[];return new TransformStream({
    transform(chunk){chunks.push(Buffer.from(chunk));},
    flush(controller){const bytes=Buffer.concat(chunks);bytes[bytes.length-1]^=1;controller.enqueue(new Uint8Array(gzipSync(bytes)));}
   });}
  };
  await assert.rejects(session.exportFile(),/출력 파일의 압축·배치 재검사/);
 }finally{globalThis.CompressionStream=original;}
 // Failure did not alter the planned edits or the user's input.
 const again=await openSave(await session.exportFile(),{gameId:'srwf-final'});
 assert.equal(again.list()[0].money,12345);
});
