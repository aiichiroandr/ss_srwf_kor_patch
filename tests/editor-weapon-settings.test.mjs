import assert from 'node:assert/strict';
import test from 'node:test';
import {parsePreset,presetChangeCount,serializePreset,parseWeaponAuthoringSettings} from '../assets/editor-preset.mjs';
import {copyWeaponAuthoringEntries,weaponAnimationPreviewEntries,changedWeaponAuthoringIndices} from '../assets/editor-weapon-settings.mjs';
const entry={weaponIndex:1248,sourceWeapon:1,unitIndex:1,edits:[{recordOffset:592,field:'horizontalVelocity',value:-15}]};
const preset={format:'srwf.editor-preset',version:1,gameId:'srwf-f',units:[],pilots:[],weapons:[],weaponAuthoring:[entry],weaponAuthoringFrom:[]};
test('original motion preview excludes only the selected donor override and does not mutate saved recipes',()=>{
 const rows=[{...entry,weaponIndex:1,animationWeapon:245},{...entry,weaponIndex:1248}];
 const before=structuredClone(rows),original=weaponAnimationPreviewEntries(rows,1,{original:true});
 assert.deepEqual(original,[before[1]]);assert.deepEqual(weaponAnimationPreviewEntries(rows,1),before);
 original[0].edits[0].value=3;assert.deepEqual(rows,before);
});
test('existing weapon motion replacements roundtrip without internal origin metadata',()=>{
 const original={weaponIndex:1,sourceWeapon:1,unitIndex:1,animationWeapon:245,edits:[]};
 const portable=copyWeaponAuthoringEntries([{...original,originalSelector:1292,sourceSelector:47}]);
 assert.deepEqual(portable,[original]);
 assert.deepEqual(parsePreset(serializePreset({...preset,weaponAuthoring:portable})).weaponAuthoring,[original]);
 assert.throws(()=>parseWeaponAuthoringSettings([{...original,originalSelector:1292}],'srwf-f'),{code:'PRESET_UNKNOWN_KEY'});
});
test('custom name and foreign motion identity survive preset save and load',()=>{
 const custom={...entry,animationWeapon:245,name:'웨이브라이더어택'};
 const saved={...preset,weaponAuthoring:[custom],weaponAuthoringFrom:[custom]};
 const opened=parsePreset(serializePreset(saved),{gameId:'srwf-f'});
 assert.deepEqual(opened.weaponAuthoring,[custom]);assert.deepEqual(opened.weaponAuthoringFrom,[custom]);
 const snapshot=copyWeaponAuthoringEntries([{...custom,sourceSelector:47,donorUnit:367}]);
 assert.deepEqual(snapshot,[custom]);snapshot[0].edits[0].value=22;
 assert.equal(custom.edits[0].value,-15);
});
test('presets reject malformed or unsupported custom names and animation origins',()=>{
 for(const fields of [{name:'🚀'},{name:' 돌격'},{name:undefined},{animationWeapon:undefined},{animationWeapon:'245'},{animationWeapon:1248},{weaponIndex:1,name:'돌격'}])
  assert.throws(()=>parseWeaponAuthoringSettings([{...entry,...fields}],'srwf-f'),{code:'PRESET_BAD_VALUE'});
});
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

test('appended effect placement survives portable settings and remains independent from internal selector metadata',()=>{
 const imports=[{targetSequence:1,donorWeapon:3,donorSequence:1,donorSelector:12,placement:'append'}];
 const snapshot=copyWeaponAuthoringEntries([{...entry,imports}]);
 assert.deepEqual(snapshot[0].imports,[{targetSequence:1,donorWeapon:3,donorSequence:1,placement:'append'}]);
 assert.deepEqual(parseWeaponAuthoringSettings(snapshot,'srwf-f'),snapshot);
 snapshot[0].imports[0].donorSequence=2;assert.equal(imports[0].donorSequence,1);
 assert.throws(()=>parseWeaponAuthoringSettings([{...entry,imports:[{targetSequence:1,donorWeapon:3,donorSequence:1,placement:'arbitrary'}]}],'srwf-f'));
});


test('authoring change count identifies each added, edited and removed weapon without counting ordering',()=>{
 const one={weaponIndex:1,sourceWeapon:1,unitIndex:1,edits:[]},two={weaponIndex:2,sourceWeapon:2,unitIndex:1,edits:[]};
 assert.deepEqual(changedWeaponAuthoringIndices([one,two]),[1,2]);
 assert.deepEqual(changedWeaponAuthoringIndices([two,one],[one,two]),[]);
 assert.deepEqual(changedWeaponAuthoringIndices([one],[one,two]),[2]);
 assert.deepEqual(changedWeaponAuthoringIndices([{...one,edits:[{recordOffset:50,field:'holdDuration',value:11}]},two],[one,two]),[1]);
});
