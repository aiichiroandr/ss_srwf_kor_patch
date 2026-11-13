import {constructUnitRow,UNIT_CONCEPTS,unitConstructionRewards} from '../assets/editor-unit-construction.mjs';
import {authenticatedSaveCatalog} from './helpers/authenticated-save-catalog.mjs';
const openSave=async(input,catalog)=>openUntrustedSave(input,await authenticatedSaveCatalog(catalog));
import test from 'node:test';import assert from 'node:assert/strict';
import {extractMigrationPreset,requireMigrationIdentities} from '../assets/editor-migration.mjs';
import {checkSaveCompatibility,applyCompatibleNames} from '../assets/save-compatibility.mjs';
import {encodeEditorText} from '../assets/editor-text-codec.mjs';
import {decodeEditorText} from '../assets/editor-text-codec.mjs';
import {openSave as openUntrustedSave} from '../assets/save-core.mjs';
import {syntheticSave} from './helpers/synthetic-save.mjs';
import {collectionEditorRow,COLLECTION_EDITOR_IDENTITY} from '../assets/editor-collection-unlock.mjs';
import {aliceEditorRow,ALICE_CREW_DEFAULTS,ALICE_EDITOR_IDENTITY} from '../assets/editor-alice-crew-data.mjs';
import {parsePreset,serializePreset,planPresetApplication,applyPresetPlan} from '../assets/editor-preset.mjs';
const identity='unit:1:'+'a'.repeat(64);
const base=()=>({gameId:'srwf-final',targetHash:'a'.repeat(64),baseTargetSha256:'a'.repeat(64),baseReleaseId:'srwf-final-20261005-v0-3-a',provenanceMode:'accepted',units:[{recordIndex:1,name:'기체',identity,hp:3000,original:{hp:3000},weaponList:{entries:[]}}],pilots:[],weapons:[]});
test('save migration exports remapped custom names while preserving added units, upgrades and parts',async()=>{
 const source=base();
 source.glyphMap=new Map([['EB00','힣'],['EB01','똠']]);
 source.pilots=[{recordIndex:74,identity:'pilot:74:stable'}];
 source.weapons=[{recordIndex:10,identity:'weapon:10:stable'}];
 source.partNames={3:'파츠'};
 source.units=[23,24].map(recordIndex=>({recordIndex,identity:`unit:${recordIndex}:stable`,hp:4000,en:150,partSlots:2,saveUnitKind:0,saveUnitForm:0,
  construction:recordIndex===24?{preset:'restored-unit'}:undefined,
  weaponList:{status:'known',entries:[{slot:1,weaponIndex:10}]}}));
 const fixture=syntheticSave({upgradeUnlocked:true}),original=fixture.raw.slice();
 const oldSession=await openSave(fixture.raw,source);
 oldSession.editName(2,'heroName','힣');oldSession.editName(2,'partnerName','똠');
 const {slot}=oldSession.addUnit(2,24);
 oldSession.editUnit(2,'weaponUpgrades',10,slot,0);oldSession.editUnit(2,'parts',3,slot,0);
 const edited=await oldSession.exportFile(),before=edited.slice();
 const target=structuredClone(source);target.glyphMap=new Map([['EB00','똠'],['EB01','힣']]);
 const session=await openSave(edited,target),report=checkSaveCompatibility(session.list(),source,target);
 assert.equal(report.compatible,true);assert.equal(report.unitCount,2);
 assert.deepEqual(report.names.map(n=>[n.text,n.changed]),[['힣',true],['똠',true]]);
 applyCompatibleNames(session,report);
 const output=await session.exportFile(),reopened=(await openSave(output,target)).list()[0];
 assert.equal(reopened.editable,true,'reopened checksum is valid');
 for(const [field,text] of [['heroName','힣'],['partnerName','똠']])assert.equal(decodeEditorText(reopened[field+'Bytes'],{gameId:target.gameId,kind:'save',glyphMap:target.glyphMap}),text);
 assert.deepEqual(reopened.units,oldSession.list()[0].units);
 assert.deepEqual(reopened.pilots,oldSession.list()[0].pilots);
 const allowed=new Set([0,1,2,3,...Array.from({length:14},(_,i)=>0x3c+i),...Array.from({length:14},(_,i)=>0x50+i)].map(i=>fixture.payloadPositions[i]));
 output.forEach((byte,i)=>{if(!allowed.has(i))assert.equal(byte,before[i],`unrelated cartridge byte ${i}`);});
 assert.deepEqual(edited,before);assert.deepEqual(fixture.raw,original);
 target.units[1].construction.preset='different-restoration';
 const rejected=checkSaveCompatibility(session.list(),source,target);
 assert.ok(rejected.issues.some(issue=>issue.code==='unit-restoration'));
 assert.throws(()=>applyCompatibleNames(session,rejected));
});
test('BIN extraction stores only semantic user changes, without modifying either input',()=>{const a=base(),b=structuredClone(a);b.units[0].hp=4000;b.units[0].original.hp=4000;b.provenanceMode='bounded-editor-profile';const before=structuredClone(b);const {preset}=extractMigrationPreset(a,b);assert.deepEqual(preset.units[0].fields.hp,{from:3000,to:4000});assert.deepEqual(b,before);assert.equal(preset.units[0].identity,identity);});
test('wrong baseline and unsupported map edits are not silently transferred',()=>{const a=base(),b=base();b.baseTargetSha256='b'.repeat(64);assert.throws(()=>extractMigrationPreset(a,b));b.baseTargetSha256=a.targetHash;b.maps=[1];assert.throws(()=>extractMigrationPreset(a,b),/맵/);});
function fixture(){const source=base(),target=base();const bytes=Array.from(encodeEditorText('가',{gameId:'srwf-final',kind:'save',maxBytes:14}));const record={name:'SROBOTFC_01',key:1,gameId:'srwf-final',editable:true,heroNameBytes:bytes,partnerNameBytes:bytes,pilots:[],units:[{id:1,weaponUpgrades:Array(16).fill(0),parts:[]}]};return {source,target,record};}
test('save compatibility rejects missing units and changed occupied upgrade slots',()=>{const {source,target,record}=fixture();assert.equal(checkSaveCompatibility([record],source,target).compatible,true);target.units=[];assert.equal(checkSaveCompatibility([record],source,target).issues[0].code,'unit-identity');target.units=structuredClone(source.units);source.units[0].weaponList.entries=[{slot:1,weaponIndex:10}];target.units[0].weaponList.entries=[{slot:1,weaponIndex:11}];record.units[0].weaponUpgrades[0]=5;assert.equal(checkSaveCompatibility([record],source,target).issues[0].code,'upgrade-slot');});
test('custom name codes are converted by character, never blindly carried to a new glyph pool',()=>{const {source,target,record}=fixture();source.glyphMap=new Map([['EB00','힣']]);target.glyphMap=new Map([['EB01','힣']]);record.heroNameBytes=[235,0,255];const report=checkSaveCompatibility([record],source,target);assert.equal(report.compatible,true);assert.equal(report.names[0].text,'힣');assert.equal(report.names[0].changed,true);const calls=[];applyCompatibleNames({editName:(...args)=>calls.push(args)},report);assert.deepEqual(calls,[[1,'heroName','힣']]);target.glyphMap=new Map();const blocked=checkSaveCompatibility([record],source,target);assert.equal(blocked.compatible,false);assert.throws(()=>applyCompatibleNames({editName:()=>assert.fail()},blocked));});

test('map edits keep coordinates and plane identity instead of importing whole map bytes',()=>{
 const a=base(),b=base(),plane={width:2,height:1,tiles:[1,2],orientations:[0,0],identity:'map:1:'+'b'.repeat(64)};
 a.maps=[{mapIndex:1,mapSlots:[1],planes:[plane]}];b.maps=structuredClone(a.maps);b.maps[0].planes[0].tiles[1]=3;
 const {preset}=extractMigrationPreset(a,b);assert.equal(preset.mapCells[0].recordIndex,'1:0:1:0');assert.deepEqual(preset.mapCells[0].fields.tileId,{from:2,to:3});
});
test('long native default-name tokens stay intact when the destination decodes the same name',()=>{
 const {source,target,record}=fixture();source.glyphMap=new Map([['EB00','긴이름을표시하는기본토큰']]);target.glyphMap=source.glyphMap;record.heroNameBytes=[235,0,255];const report=checkSaveCompatibility([record],source,target);assert.equal(report.compatible,true);assert.equal(report.names[0].changed,false);
});
test('upgraded weapons require semantic identity even when numeric IDs and slots match',()=>{
 const {source,target,record}=fixture();
 source.units[0].weaponList.entries=[{slot:1,weaponIndex:10}];
 target.units=structuredClone(source.units);record.units[0].weaponUpgrades[0]=5;
 source.weapons=[{recordIndex:10,identity:'weapon:10:original'}];
 target.weapons=[{recordIndex:10,identity:'weapon:10:different'}];
 assert.equal(checkSaveCompatibility([record],source,target).issues[0].code,'weapon-identity');
 target.weapons=structuredClone(source.weapons);
 assert.equal(checkSaveCompatibility([record],source,target).compatible,true);
 target.weapons=[];
 assert.equal(checkSaveCompatibility([record],source,target).compatible,false);
});

test('cross-version or unidentified legacy JSON cannot guess identities from numeric IDs',()=>{
 const preset={releaseId:'srwf-final-20261005-v0-3-a',entries:{unit:[{recordIndex:1}]}};
 assert.doesNotThrow(()=>requireMigrationIdentities(preset,'srwf-final-20261005-v0-3-c'));
 assert.throws(()=>requireMigrationIdentities(preset,'srwf-final-20261024-v0-4-a'),{code:'EDITOR_MIGRATION_IDENTITY'});
 preset.entries.unit[0].identity=identity;assert.doesNotThrow(()=>requireMigrationIdentities(preset,'srwf-final-20261024-v0-4-a'));
});

test('save weapon upgrades allow changed voice and translation, but retain animation identity checks',()=>{
 const {source,target,record}=fixture();
 source.units[0].weaponList.entries=[{slot:1,weaponIndex:10}];
 target.units=structuredClone(source.units);record.units[0].weaponUpgrades[0]=5;
 source.weapons=[{recordIndex:10,identity:'old-voice',saveIdentity:'same-animation',name:'旧名',voiceType:1}];
 target.weapons=[{recordIndex:10,identity:'new-voice',saveIdentity:'same-animation',name:'새 이름',voiceType:2}];
 assert.equal(checkSaveCompatibility([record],source,target).compatible,true);
 target.weapons[0].saveIdentity='other-animation';
 assert.equal(checkSaveCompatibility([record],source,target).issues[0].code,'weapon-identity');
});

test('BIN voice edits target the baseline weapon identity, not the edited header',()=>{
 const a=base();a.weapons=[{recordIndex:1,name:'빔사벨',editable:true,identity:'weapon:1:'+'a'.repeat(64),voiceType:1}];
 const b=structuredClone(a);b.weapons[0].identity='weapon:1:'+'b'.repeat(64);b.weapons[0].voiceType=2;
 const {preset}=extractMigrationPreset(a,b);
 assert.equal(preset.weapons[0].identity,a.weapons[0].identity);
 assert.deepEqual(preset.weapons[0].fields.voiceType,{from:1,to:2});
 assert.equal(b.weapons[0].identity,'weapon:1:'+'b'.repeat(64));
});

test('BIN extraction retains collection and every ALICE setting with stable semantic identities',()=>{
 const before=base(),after=base();
 before.collections=[collectionEditorRow(false)];after.collections=[collectionEditorRow(true)];
 before.aiPilots=[aliceEditorRow({enabled:false})];
 const crew={...ALICE_CREW_DEFAULTS,enabled:true,spBase:37,
  spirits:ALICE_CREW_DEFAULTS.spirits.map((spirit,i)=>({id:ALICE_CREW_DEFAULTS.spirits[5-i].id,level:spirit.level+i+1}))};
 after.aiPilots=[aliceEditorRow({enabled:true,crew})];
 const originalBefore=structuredClone(before),originalAfter=structuredClone(after);
 const {preset}=extractMigrationPreset(before,after),parsed=parsePreset(serializePreset(preset));
 assert.equal(preset.collections[0].identity,COLLECTION_EDITOR_IDENTITY);
 assert.deepEqual(preset.collections[0].fields.enabled,{from:0,to:1});
 assert.equal(preset.aiPilots[0].identity,ALICE_EDITOR_IDENTITY);
 for(const [field,to] of Object.entries({enabled:1,crewEnabled:1,spBase:37,
  ...Object.fromEntries(crew.spirits.flatMap((spirit,i)=>[[`spirit${i+1}`,spirit.id],[`spiritLevel${i+1}`,spirit.level]]))})){
  assert.equal(preset.aiPilots[0].fields[field].to,to,field);
 }
 requireMigrationIdentities(parsed,'srwf-final-20261024-v0-4-c');
 const target=structuredClone(before),plan=planPresetApplication(parsed,target);
 assert.ok(plan.items.filter(item=>item.kind==='alice'||item.kind==='collection').every(item=>item.status==='apply'));
 applyPresetPlan(plan,target,'matching');
 assert.equal(target.collections[0].enabled,1);assert.equal(target.aiPilots[0].spBase,37);
 assert.equal(target.aiPilots[0].spiritLevel6,46);
 assert.deepEqual(before,originalBefore);assert.deepEqual(after,originalAfter);
});

test('BIN extraction retains disabling collection and ALICE without manufacturing unsupported destination rows',()=>{
 const before=base(),after=base();
 before.collections=[collectionEditorRow(true)];after.collections=[collectionEditorRow(false)];
 before.aiPilots=[aliceEditorRow({enabled:true,crew:{...ALICE_CREW_DEFAULTS,enabled:true}})];
 after.aiPilots=[aliceEditorRow({enabled:false})];
 const {preset}=extractMigrationPreset(before,after),parsed=parsePreset(serializePreset(preset));
 assert.deepEqual(preset.collections[0].fields.enabled,{from:1,to:0});
 assert.deepEqual(preset.aiPilots[0].fields.enabled,{from:1,to:0});
 assert.deepEqual(preset.aiPilots[0].fields.crewEnabled,{from:1,to:0});
 const unavailable=planPresetApplication(parsed,{...before,collections:[],aiPilots:[]});
 assert.ok(unavailable.items.length>0);assert.ok(unavailable.items.every(item=>item.status==='skip'));
 const changed=structuredClone(before);changed.aiPilots[0].identity='alice:1:'+'f'.repeat(64);
 const mismatch=planPresetApplication(parsed,changed);
 assert.ok(mismatch.items.filter(item=>item.kind==='alice').every(item=>item.status==='skip'));
});

test('legacy JSON remains same-family only when collection or ALICE identities are absent',()=>{
 for(const kind of ['collection','alice']){
  const legacy={releaseId:'srwf-final-20261005-v0-3-c',entries:{[kind]:[{recordIndex:1}]}};
  assert.doesNotThrow(()=>requireMigrationIdentities(legacy,'srwf-final-20261005-v0-3-a'));
  assert.throws(()=>requireMigrationIdentities(legacy,'srwf-final-20261024-v0-4-c'),{code:'EDITOR_MIGRATION_IDENTITY'});
 }
 assert.equal(collectionEditorRow(false).identity,collectionEditorRow(true).identity);
 assert.match(COLLECTION_EDITOR_IDENTITY,/^collection:1:[a-f0-9]{64}$/);
 assert.match(ALICE_EDITOR_IDENTITY,/^alice:1:[a-f0-9]{64}$/);
 assert.throws(()=>collectionEditorRow(1),TypeError);
});

test('constructed BIN weapons are measured from their concept loadout once, not from the empty reserved unit',()=>{
 const source=base();
 const weapons=[467,469,470,474,475,777].map(recordIndex=>({recordIndex,name:'무기',editable:true,ammo:0}));
 const values={...UNIT_CONCEPTS['s-gundam'].stats,...unitConstructionRewards('s-gundam','srwf-final'),hp:3000};
 const donor={recordIndex:1,editable:true,...values,original:{...values},weaponList:{status:'known',entries:[{weaponIndex:467,slot:1}]}};
 const filler={recordIndex:430,name:'',identity,hp:0,restorationEligible:true,recordKind:'unused-filler',weaponList:{entries:[]}};
 source.units=[donor,filler];source.weapons=weapons;source.unitRestorationSlots=[430];
 const edited=structuredClone(source);
 const unit=constructUnitRow(filler,donor,'s-gundam','srwf-final',weapons,2);
 unit.hp=4567;unit.weaponList.entries.push({weaponIndex:777,slot:6});unit.weapon6=777;delete unit.pendingConstruction;
 edited.units[1]=unit;
 const untouched=structuredClone(edited);
 const {preset}=extractMigrationPreset(source,edited);
 const change=preset.units.find(row=>row.recordIndex===430);
 assert.deepEqual(change.weaponAdditions,{from:[],to:[777],baseCount:5});
 assert.equal(change.construction.to,'s-gundam');
 assert.deepEqual(change.fields.hp,{from:4000,to:4567});
 assert.deepEqual(edited,untouched);
});
