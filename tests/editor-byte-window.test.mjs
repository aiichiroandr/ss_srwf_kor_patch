import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {matchesByteWindow} from '../assets/editor-byte-window.mjs';
import {sha256Hex} from '../assets/sha256.mjs';
import {CRITICAL_FIX_PROFILES} from '../assets/editor-critical-fix.mjs';
import {COLLECTION_UNLOCK,COLLECTION_EDITOR_IDENTITY} from '../assets/editor-collection-unlock.mjs';
import {DEBUG_ENTRY,DEBUG_ENTRY_IDENTITY} from '../assets/editor-debug-entry.mjs';

test('verification windows carry digests and preserve former user preset identities',()=>{
 const ids={
  'srwf-f':'critical:1:ff77f5e6a4b559b54569c252ff548fe177e70026cfb8ca76dcf718e9f7bf0b3b',
  'srwf-final':'critical:1:cbff07cdaabcc28d7dcd1db4b3297bb1ab2bca15735fdbaa7b0eaa139aec50ef',
 };
 for(const [game,p]of Object.entries(CRITICAL_FIX_PROFILES)){
  assert.equal(Object.hasOwn(p,'context'),false);assert.equal(Object.hasOwn(p,'original'),false);
  assert.equal(Object.hasOwn(p.calc,'bytes'),false);assert.equal(Object.hasOwn(p.display,'bytes'),false);
  assert.equal(p.contextBytes,228);assert.match(p.contextSha256,/^[a-f0-9]{64}$/);assert.equal(p.identity,ids[game]);
 }
 assert.equal(Object.hasOwn(COLLECTION_UNLOCK,'original'),false);assert.equal(COLLECTION_UNLOCK.contextBytes,72);
 assert.equal(COLLECTION_EDITOR_IDENTITY,'collection:1:a4bded8499e5a58a23d4dc230ee554a8a78ec4c0c397bffc0a9f087b10b22ecd');
 assert.equal(Object.hasOwn(DEBUG_ENTRY,'context'),false);assert.equal(DEBUG_ENTRY.contextBytes,27);
 assert.equal(DEBUG_ENTRY_IDENTITY,'debug:1:4392656a1e8aad4b894b3c1871385074274916f58cdcd787b9cbe77a1a2b4045');
});
test('masked window hashing authenticates all unmasked bytes without modifying arrays, buffers or views',()=>{
 const base=Uint8Array.from({length:50},(_,i)=>i*3),expected=base.slice(5,35);expected.fill(0,7,11);
 const digest=sha256Hex(expected),mask={offset:12,length:4};
 for(const src of [base,Buffer.from(base),new Uint8Array([...Array(7).fill(3),...base,...Array(4).fill(2)]).subarray(7,57)]){
  const before=src.slice();assert.equal(matchesByteWindow(src,5,30,digest,mask),true);assert.deepEqual(src,before);
  for(let i=5;i<35;i++){const changed=new Uint8Array(src);changed[i]^=1;assert.equal(matchesByteWindow(changed,5,30,digest,mask),i>=12&&i<16);}
 }
 assert.equal(matchesByteWindow(base,5,30,sha256Hex(base.subarray(5,35))),true);
});
test('bad window bounds, malformed masks and digests fail closed',()=>{
 const b=new Uint8Array(30),hash=sha256Hex(b);
 for(const v of [null,{},[],b.buffer,new Uint16Array(30)])assert.equal(matchesByteWindow(v,0,30,hash),false);
 for(const [start,length]of [[-1,30],[0,0],[0,-1],[1,30],[.5,20],[0,Infinity]])assert.equal(matchesByteWindow(b,start,length,hash),false);
 for(const mask of [{offset:-1,length:1},{offset:0,length:0},{offset:29,length:2},{offset:0,length:1.5},{},false])assert.equal(matchesByteWindow(b,0,30,hash,mask),false);
 for(const digest of ['',hash.slice(1),hash.toUpperCase(),42,null])assert.equal(matchesByteWindow(b,0,30,digest),false);
});
test('production wrappers contain no long hexadecimal preimage strings',async()=>{
 for(const name of ['editor-critical-fix.mjs','editor-collection-unlock.mjs','editor-debug-entry.mjs']){
  const text=await readFile(new URL('../assets/'+name,import.meta.url),'utf8');
  const hexLiterals=[...text.matchAll(/['"]([a-fA-F0-9]{18,})['"]/g)].map(m=>m[1]);
  assert.ok(hexLiterals.every(s=>s.length===64),`${name}: only SHA256 literals are permitted`);
 }
});
