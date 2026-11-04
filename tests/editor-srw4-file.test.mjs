import test from 'node:test';import assert from 'node:assert/strict';import{deflateRawSync}from'node:zlib';
import{readSrw4RomFile}from'../assets/editor-srw4-file.mjs';import{srw4Crc32}from'../assets/editor-srw4-rom.mjs';
function zip(bytes,{crc=parseInt(srw4Crc32(bytes),16),flags=0,declared=bytes.length,localFlags=flags,localCrc=flags&8?0:crc,localPacked,localBytes=flags&8?0:declared,descriptor=flags&8?'signed':null,descriptorCrc=crc,descriptorPacked,descriptorBytes=declared,descriptorTruncated=0}={}){
 const packed=deflateRawSync(bytes),name=new TextEncoder().encode('source.sfc'),local=new Uint8Array(30+name.length+packed.length),l=new DataView(local.buffer);l.setUint32(0,0x04034b50,true);l.setUint16(6,localFlags,true);l.setUint16(8,8,true);l.setUint32(14,localCrc,true);l.setUint32(18,localPacked??(flags&8?0:packed.length),true);l.setUint32(22,localBytes,true);l.setUint16(26,name.length,true);local.set(name,30);local.set(packed,30+name.length);
 const dd=new Uint8Array(descriptor==='signed'?16:descriptor==='unsigned'?12:0);if(dd.length){const d=new DataView(dd.buffer),at=descriptor==='signed'?4:0;if(at)d.setUint32(0,0x08074b50,true);d.setUint32(at,descriptorCrc,true);d.setUint32(at+4,descriptorPacked??packed.length,true);d.setUint32(at+8,descriptorBytes,true);}const trailer=dd.subarray(0,Math.max(0,dd.length-descriptorTruncated));
 const central=new Uint8Array(46+name.length),c=new DataView(central.buffer);c.setUint32(0,0x02014b50,true);c.setUint16(8,flags,true);c.setUint16(10,8,true);c.setUint32(16,crc,true);c.setUint32(20,packed.length,true);c.setUint32(24,declared,true);c.setUint16(28,name.length,true);central.set(name,46);
 const end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,1,true);e.setUint16(10,1,true);e.setUint32(12,central.length,true);e.setUint32(16,local.length+trailer.length,true);return new Blob([local,trailer,central,end]);
}
test('local ZIP yields the exact single ROM bytes, without claiming cartridge identity',async()=>{const raw=new Uint8Array(0x300000);raw[123]=44;const result=await readSrw4RomFile(zip(raw));assert.deepEqual(new Uint8Array(await result.arrayBuffer()),raw);});
test('ZIP local flags, CRC and lengths must agree with the central directory',async()=>{
 const raw=new Uint8Array(0x300000);
 for(const options of [{localFlags:8},{localCrc:123},{localPacked:1},{localBytes:2},{localCrc:0},{localPacked:0},{localBytes:0}])await assert.rejects(readSrw4RomFile(zip(raw,options)),{code:'SRW4_ROM_SIZE'});
});
test('ZIP data descriptors accept zero or matching local values and either signature form',async()=>{
 const raw=new Uint8Array(0x300000);raw[123]=44;
 for(const descriptor of ['signed','unsigned'])for(const supplied of [false,true]){
  const options={flags:8,descriptor,...(supplied?{localCrc:parseInt(srw4Crc32(raw),16),localPacked:deflateRawSync(raw).length,localBytes:raw.length}:{})};
  assert.deepEqual(new Uint8Array(await(await readSrw4RomFile(zip(raw,options))).arrayBuffer()),raw);
 }
});
test('ZIP deferred metadata rejects mismatched local values and missing, truncated or inconsistent descriptors',async()=>{
 const raw=new Uint8Array(0x300000);
 for(const options of [{localFlags:0},{localCrc:123},{localPacked:1},{localBytes:2},{descriptor:null},{descriptorTruncated:1},{descriptorCrc:123},{descriptorPacked:1},{descriptorBytes:2},{descriptor:'unsigned',descriptorTruncated:1},{descriptor:'unsigned',descriptorCrc:123}])await assert.rejects(readSrw4RomFile(zip(raw,{flags:8,...options})),{code:'SRW4_ROM_SIZE'});
});
test('encrypted, corrupt, oversized inflation and foreign inputs are refused',async()=>{const raw=new Uint8Array(0x300000);await assert.rejects(readSrw4RomFile(zip(raw,{flags:1})),{code:'SRW4_ROM_SIZE'});await assert.rejects(readSrw4RomFile(zip(raw,{crc:123})),{code:'SRW4_ROM_SIZE'});await assert.rejects(readSrw4RomFile(zip(new Uint8Array(0x300201),{declared:0x300000})),{code:'SRW4_ROM_SIZE'});await assert.rejects(readSrw4RomFile(new Blob([new Uint8Array(4)])),{code:'SRW4_ROM_SIZE'});});
test('cancelled source reads stop before ZIP or cartridge processing',async()=>{const c=new AbortController();c.abort();await assert.rejects(readSrw4RomFile(new Blob([new Uint8Array(4)]),{signal:c.signal}),{name:'AbortError'});});
