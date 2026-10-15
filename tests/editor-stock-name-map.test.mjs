import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeEditorName} from '../assets/editor-core.mjs';
import {F_STOCK_NAME_MAP} from '../assets/editor-stock-name-map.mjs';
import {F_NAME_MAP} from '../assets/editor-name-map.mjs';

test('stock F kanji keep their original glyphs instead of Korean patch replacements',()=>{
  const bytes=Uint8Array.from([0,0,0,4,0xf1,0x72,0xec,0xd9,0xec,0xe1,0xff]);
  const segment={start:0,end:4};
  assert.equal(decodeEditorName(bytes,segment,0,F_STOCK_NAME_MAP).text,'零号機');
  assert.notEqual(decodeEditorName(bytes,segment,0,F_NAME_MAP).text,'零号機');
  assert.equal(F_STOCK_NAME_MAP.get('F5F9'),'槍');
});
