import assert from 'node:assert/strict';
import test from 'node:test';
import {parsePreset,presetChangeCount,serializePreset,parseWeaponAuthoringSettings} from '../assets/editor-preset.mjs';
const entry={weaponIndex:1248,sourceWeapon:1,unitIndex:1,edits:[{recordOffset:592,field:'horizontalVelocity',value:-15}]};
const preset={format:'srwf.editor-preset',version:1,gameId:'srwf-f',units:[],pilots:[],weapons:[],weaponAuthoring:[entry],weaponAuthoringFrom:[]};
test('weapon recipes roundtrip as numeric changes without sprites, programs or offsets supplied to the writer',()=>{
 const result=parsePreset(serializePreset(preset),{gameId:'srwf-f'});assert.deepEqual(result.weaponAuthoring,[entry]);assert.deepEqual(result.weaponAuthoringFrom,[]);assert.equal(presetChangeCount(result),1);
 const empty=parsePreset(serializePreset({...preset,weaponAuthoring:[],weaponAuthoringFrom:[entry]}));assert.deepEqual(empty.weaponAuthoring,[]);assert.equal(empty.changeCount,1);
});
test('settings reject unverified fields, opcode payloads, duplicate operands and invalid identities',()=>{
 for(const entries of [[{...entry,unitIndex:448}],[entry,entry],[{...entry,edits:[{recordOffset:592,field:'frameIndex',value:3}]}],
  [{...entry,edits:[...entry.edits,...entry.edits]}],[{...entry,bytes:[1,2]}],[{...entry,edits:[{recordOffset:592,field:'horizontalVelocity',value:32768}]}]])
  assert.throws(()=>parseWeaponAuthoringSettings(entries,'srwf-f'));
});
test('legacy settings stay compatible and cannot receive an orphan authoring baseline',()=>{
 const legacy={...preset};delete legacy.weaponAuthoring;delete legacy.weaponAuthoringFrom;
 assert.equal(parsePreset(JSON.stringify(legacy)).weaponAuthoring,undefined);
 assert.throws(()=>parsePreset(JSON.stringify({...legacy,weaponAuthoringFrom:[]})));
 assert.throws(()=>parsePreset(JSON.stringify(preset),{gameId:'srwf-final'}),{code:'PRESET_OTHER_GAME'});
});
