import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import {bytesEqual,dataView,bytesToHex,hexToBytes,base64ToBytes,base64UrlToBytes,sha256Digest,scenarioRootOffsets} from '../assets/editor-bytes.mjs';
import {Sha256,sha256Hex} from '../assets/sha256.mjs';

const root=new URL('../',import.meta.url);

test('bytesEqual compares typed arrays and plain arrays element by element',()=>{
 assert.equal(bytesEqual(new Uint8Array([1,2,3]),new Uint8Array([1,2,3])),true);
 assert.equal(bytesEqual(new Uint8Array([1,2,3]),[1,2,3]),true);
 assert.equal(bytesEqual([1,2,3],new Uint8Array([1,2,3])),true);
 assert.equal(bytesEqual(new Uint8Array(),[]),true);
 assert.equal(bytesEqual(new Uint8Array([1,2,3]),new Uint8Array([1,2])),false);
 assert.equal(bytesEqual(new Uint8Array([1,2,3]),new Uint8Array([1,2,4])),false);
 // Strict element equality: no coercion between numbers and strings.
 assert.equal(bytesEqual([1,2],['1','2']),false);
});

test('dataView covers exactly the window of a subarray',()=>{
 const backing=Uint8Array.from({length:16},(_,i)=>i);
 const window=backing.subarray(4,12),view=dataView(window);
 assert.equal(view.byteOffset,4);assert.equal(view.byteLength,8);assert.equal(view.buffer,backing.buffer);
 assert.equal(view.getUint32(0),0x04050607);
 view.setUint8(0,0xff);assert.equal(backing[4],0xff,'the view writes through to the caller-owned bytes');
 assert.throws(()=>view.getUint8(8),RangeError);
});

test('bytesToHex spells every byte as two lower-case digits',()=>{
 assert.equal(bytesToHex(new Uint8Array([0,1,0x0a,0xab,0xff])),'00010aabff');
 assert.equal(bytesToHex([]),'');
 assert.equal(bytesToHex(new Uint8Array(32)),'0'.repeat(64));
});

test('hexToBytes reads two digits per byte and round-trips bytesToHex',()=>{
 assert.deepEqual(hexToBytes('00010aabff'),new Uint8Array([0,1,0x0a,0xab,0xff]));
 assert.deepEqual(hexToBytes('ABff'),new Uint8Array([0xab,0xff]),'either case is accepted');
 const bytes=Uint8Array.from({length:256},(_,i)=>i);
 assert.deepEqual(hexToBytes(bytesToHex(bytes)),bytes);
 assert.throws(()=>hexToBytes(''),TypeError);
});

test('base64 helpers decode the standard and URL-safe alphabets',()=>{
 const bytes=Uint8Array.from({length:256},(_,i)=>i),standard=Buffer.from(bytes).toString('base64');
 assert.deepEqual(base64ToBytes(standard),bytes);
 assert.deepEqual(base64UrlToBytes(Buffer.from(bytes).toString('base64url')),bytes);
 assert.deepEqual(base64UrlToBytes(standard),bytes,'the standard alphabet is a subset of what the URL-safe reader accepts');
 assert.deepEqual(base64ToBytes(''),new Uint8Array());
 assert.throws(()=>base64ToBytes('*'),{name:'InvalidCharacterError'});
});

test('sha256Digest returns a fresh copy of the raw digest',()=>{
 const input=new TextEncoder().encode('abc'),digest=sha256Digest(input);
 assert.ok(digest instanceof Uint8Array);assert.equal(digest.length,32);
 assert.equal(bytesToHex(digest),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
 assert.equal(bytesToHex(digest),sha256Hex(input));
 assert.deepEqual(digest,new Sha256().update(input).digest());
 digest[0]^=1;assert.equal(bytesToHex(sha256Digest(input)),sha256Hex(input),'callers cannot change a later digest');
});

test('scenarioRootOffsets resolves the 14 self-relative root cells',()=>{
 const body=new Uint8Array(80),view=new DataView(body.buffer);
 for(let i=0;i<14;i++)view.setInt32(i*4,56-i*4+i);
 assert.deepEqual(scenarioRootOffsets(body),Array.from({length:14},(_,i)=>56+i));
 view.setInt32(8,-8);assert.equal(scenarioRootOffsets(body)[2],0,'negative cells are signed');
 const shifted=new Uint8Array(84);shifted.set(body,4);
 assert.deepEqual(scenarioRootOffsets(shifted.subarray(4)),scenarioRootOffsets(body),'offsets follow the subarray window');
 assert.throws(()=>scenarioRootOffsets(new Uint8Array(55)),RangeError);
});

test('editor modules use the shared helpers instead of private copies',()=>{
 // A private copy of a shared helper drifts silently; keep one definition.
 // editor-bytes.mjs owns the byte helpers and editor-own-copy.mjs the own-data snapshot.
 const copies=[
  /Object\.fromEntries\(Reflect\.ownKeys\(\w+\)\.flatMap\(/,
  /=\s*\(a,\s*b\)\s*=>\s*a\.length\s*===\s*b\.length\s*&&\s*a\.every\(/,
  /function\s+\w+\s*\(a,\s*b\)\s*\{\s*return\s+a\.length\s*===\s*b\.length\s*&&\s*a\.every\(/,
  /=\s*\(?(\w+)\)?\s*=>\s*new DataView\(\1\.buffer,\s*\1\.byteOffset,\s*\1\.byteLength\)/,
  /=\s*\(?(\w+)\)?\s*=>\s*new Sha256\(\)\.update\(\1\)\.(?:hex|digest)\(\)/,
  /=\s*\(?(\w+)\)?\s*=>\s*Uint8Array\.from\(atob\(\1\)/,
  /function\s+\w+\s*\((\w+)\)\s*\{\s*return\s+Array\.from\(\1,\s*\(?(\w+)\)?\s*=>\s*\2\.toString\(16\)\.padStart\(2,\s*'0'\)\)\.join\(''\);?\s*\}/,
 ];
 const offenders=[];
 for(const name of readdirSync(new URL('assets/',root)).filter(n=>n.endsWith('.mjs')&&n!=='editor-bytes.mjs'&&n!=='editor-own-copy.mjs')){
  const text=readFileSync(new URL(`assets/${name}`,root),'utf8');
  for(const pattern of copies)if(pattern.test(text))offenders.push(`${name}: ${pattern}`);
 }
 assert.deepEqual(offenders,[]);
});
