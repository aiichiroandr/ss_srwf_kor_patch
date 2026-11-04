import test from 'node:test';import assert from 'node:assert/strict';
import {makeCompressionRecipe,restoreCompressionRecipe}from '../assets/editor-compression-recipe.mjs';
// An intentionally literal stream: original byte choices can be recovered
// from decoded bytes even though a normal compressor produces a shorter file.
import {literals}from './helpers/literal-compression.mjs';
import {compressTsr}from '../assets/editor-core.mjs';

for(const n of [1,7,8,9,255,400])test(`compression topology exactly restores ${n} literal bytes`,()=>{const raw=Uint8Array.from({length:n},(_,i)=>i%17),stream=literals(raw),r=makeCompressionRecipe(stream,raw);assert.deepEqual(restoreCompressionRecipe(raw,r.recipe,r.lastFlag),stream);});
test('topology rejects truncated tokens and wrong decoded data',()=>{const raw=Uint8Array.of(1,2,3),stream=literals(raw);assert.throws(()=>makeCompressionRecipe(stream.subarray(0,-1),raw));assert.throws(()=>makeCompressionRecipe(stream,Uint8Array.of(1,2,4)));for(const recipe of [Uint8Array.of(255),Uint8Array.of(1,0),Uint8Array.of(4),Uint8Array.of(128,0)])assert.throws(()=>restoreCompressionRecipe(raw,recipe,255));});
test('topology recovers actual short and long references as well as literals',async()=>{for(const raw of [Uint8Array.of(1,2,1,2,1,2),Uint8Array.from({length:1400},(_,i)=>i%17)]){const stream=await compressTsr(raw,{completeNearMatches:true}),r=makeCompressionRecipe(stream,raw);assert.ok(stream.length<raw.length+4);assert.deepEqual(restoreCompressionRecipe(raw,r.recipe,r.lastFlag),stream);}});
