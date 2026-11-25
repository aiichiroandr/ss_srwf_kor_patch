import assert from 'node:assert/strict';
import test from 'node:test';
import {verifiedFinalTransfer as map} from '../assets/editor-f-final-transfer-map.mjs';
import {applyPreset,parsePreset,planPresetApplication,PRESET_FIELDS} from '../assets/editor-preset.mjs';

const id=Number(Object.keys(map.unit)[0]);
const stamp=`unit:1:${map.unit[id]}`;
const options={finalTransferMap:map};
const fixture=(identity=stamp)=>({gameId:'srwf-final',units:[{
  recordIndex:id,identity,recordKind:'regular',editable:true,name:'완결편 행',original:{hp:100,armor:100},
  hp:110,armor:100,
}],pilots:[],weapons:[]});
function input({identity=stamp,releaseId=null,index=id}={}){
 return parsePreset(JSON.stringify({format:'srwf.editor-preset',version:1,gameId:'srwf-f',
  ...(releaseId?{base:{releaseId}}:{}),pilots:[],weapons:[],units:[{recordIndex:index,name:'입력 힌트',
   ...(identity!==null?{identity}:{}),fields:{hp:{from:100,to:120},armor:{from:100,to:140},ability1:{from:0,to:1}}}]}));
}

test('one-way transfer requires opt-in and leaves conflicts untouched in matching mode',()=>{
 const target=fixture(),src=input();
 assert.throws(()=>planPresetApplication(src,target),{code:'PRESET_OTHER_GAME'});
 assert.throws(()=>planPresetApplication({...src,gameId:'srwf-final'},{...target,gameId:'srwf-f'},options),{code:'PRESET_OTHER_GAME'});
 const preview=planPresetApplication(src,target,options);
 assert.deepEqual(preview.counts,{apply:1,conflict:1,same:0,skip:1});
 assert.deepEqual([target.units[0].hp,target.units[0].armor],[110,100]);
 const updated=applyPreset(src,target,'matching',options);
 assert.equal(updated.applied,1);
 assert.deepEqual([target.units[0].hp,target.units[0].armor],[110,140]);
 assert.equal(applyPreset(src,target,'all',options).applied,1);
 assert.equal(target.units[0].hp,120);
});

test('name, number, and a mismatched or unanchored identity cannot guess a mapping',()=>{
 for(const [preset,session] of [
  [input({identity:'unit:1:'+'f'.repeat(64)}),fixture()],
  [input({identity:null}),fixture()],
  [input({identity:null,releaseId:'srwf-f-unknown-release'}),fixture()],
  [input(),fixture('unit:1:'+'a'.repeat(64))],
  [input({index:65535}),fixture()],
 ]){
  const result=applyPreset(preset,session,'all',options);
  assert.equal(result.applied,0);
  assert.equal(result.plan.skipReasons['transfer-unverified'],2);
  assert.equal(result.plan.skipReasons['transfer-unsupported'],1);
  assert.deepEqual([session.units[0].hp,session.units[0].armor],[110,100]);
 }
});

test('legacy no-identity preset is bounded by its reviewed F base and Final target identity',()=>{
 const src=input({identity:null,releaseId:'srwf-f-20260928-v0-5-a'});
 assert.equal(planPresetApplication(src,fixture(),options).counts.apply,1);
 assert.equal(planPresetApplication(src,fixture('unit:1:'+'f'.repeat(64)),options).counts.apply,0);
});


test('verified weapon pairing accepts the alternate P identity and transfers only the boolean', {skip:!PRESET_FIELDS.weapon.includes('postMove')},()=>{
 const weapon=Number(Object.keys(map.weapon)[0]);
 const historical=`weapon:1:${map.weapon[weapon]}`;
 const alternate='weapon:1:'+'e'.repeat(64);
 const target={gameId:'srwf-final',units:[],pilots:[],weapons:[{
  recordIndex:weapon,name:'완결편 무기',recordKind:'regular',editable:true,
  identity:historical,identityAliases:[alternate],original:{postMove:false},postMove:false,
 }]};
 const src=parsePreset(JSON.stringify({format:'srwf.editor-preset',version:1,gameId:'srwf-f',
  units:[],pilots:[],weapons:[{recordIndex:weapon,identity:alternate,
   fields:{postMove:{from:false,to:true},voiceType:{from:0,to:1}}}]}));
 const result=applyPreset(src,target,'matching',options);
 assert.equal(result.applied,1);
 assert.equal(result.plan.counts.skip,1);
 assert.equal(result.plan.items.find(i=>i.field==='voiceType').reason,'transfer-unsupported');
 assert.equal(target.weapons[0].postMove,true);
});
