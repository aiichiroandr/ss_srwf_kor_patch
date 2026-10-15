import test from 'node:test';
import assert from 'node:assert/strict';
import {planBattleVoiceRange} from '../assets/editor-battle-voice-range.mjs';

test('voice selection uses XA decoded capacity rather than the ISO directory byte units',()=>{
 const file={extentLba:20,byteLength:40*2048};
 const range=planBattleVoiceRange({sourceBlock:10,endBlock:126},file,60*2352);
 assert.equal(range.frameCount,16256);
 assert.equal(range.sectorCount,5,'four 2048-byte units would omit the last sound group');
 assert.equal(range.startByte,30*2352);
 assert.equal(range.byteLength,5*2352);
 assert.equal(range.sampleRate,18900);
 assert.equal(range.channelCount,1);
});

test('a selected clip can end exactly at its file boundary without reading its trailing neighbours',()=>{
 const range=planBattleVoiceRange({sourceBlock:3,endBlock:31},
  {extentLba:1,byteLength:5*2048},6*2352);
 assert.equal(range.sectorCount,2);
 assert.equal(range.startByte+range.byteLength,6*2352);
 assert.throws(()=>planBattleVoiceRange({sourceBlock:4,endBlock:31},
  {extentLba:1,byteLength:5*2048},6*2352),/escape/);
});

test('foreign extents, unsafe sizes and oversized clips fail before bytes can be read',()=>{
 const record={sourceBlock:0,endBlock:0},file={extentLba:2,byteLength:2048};
 assert.equal(planBattleVoiceRange(record,file,3*2352).frameCount,128);
 for(const changed of [{sourceBlock:-1},{sourceBlock:1.5},{endBlock:-1},{endBlock:0xffffff}])
  assert.throws(()=>planBattleVoiceRange({...record,...changed},file,3*2352));
 for(const changed of [{extentLba:-1},{extentLba:Number.MAX_SAFE_INTEGER},{byteLength:0},{byteLength:385*1024*1024}])
  assert.throws(()=>planBattleVoiceRange(record,{...file,...changed},3*2352));
 assert.throws(()=>planBattleVoiceRange(record,file,2*2352),/escape/);
});
