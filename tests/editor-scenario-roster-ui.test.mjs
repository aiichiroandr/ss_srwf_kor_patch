import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {installFakeDom,loadHtml} from './helpers/fake-dom.mjs';
import {createScenarioRosterEditor} from '../assets/editor-scenario-roster-ui.mjs';
import {createScenarioModel} from '../assets/editor-scenario-model.mjs';
import {buildPreset,serializePreset,parsePreset,planPresetApplication,applyPreset} from '../assets/editor-preset.mjs';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const raw={recordIndex:'roster:0:64',physicalIndex:0,pilotId:1,unitId:2,initialLevel:7,editable:true,identity:`roster-level:1:${'a'.repeat(64)}`};
function model(){return createScenarioModel({gameId:'srwf-final',pilots:[{recordIndex:1,name:'파일럿'}],units:[{recordIndex:2,name:'기체'}],rosterLevels:[raw]});}
test('join level UI commits valid values, preserves invalid drafts and focus, and resets only the selected operand',()=>{
 const document=installFakeDom();loadHtml(document,html);const $=id=>document.getElementById(id),m=model(),changes=[];
 const ui=createScenarioRosterEditor({el:$,rows:()=>m.rosterLevels,canEdit:()=>true,onChange:(kind,row)=>{changes.push(kind);ui.refresh(0);}});ui.refresh(0);
 const input=$('scenarioRosterList').querySelector('input'),reset=$('scenarioRosterList').querySelector('button');input.focus();
 const set=value=>{input.value=String(value);input.dispatchEvent({type:'input',target:input});};
 set(33);assert.equal(m.exportRosterLevels()[0].initialLevel,33);assert.equal(changes[0],'roster');assert.ok(document.activeElement===input);
 set(100);ui.refresh(0);assert.equal(input.value,'100');assert.equal(m.rosterLevels[0].initialLevel,33);assert.equal(ui.validate(),false);
 reset.click();assert.equal(ui.validate(),true);assert.deepEqual(m.exportRosterLevels(),[]);assert.equal(input.value,'7');
 m.rosterLevels[0].editable=false;ui.refresh(0);set(88);assert.equal(m.rosterLevels[0].initialLevel,7);
});
test('roster presets keep identity/location and only accept an editable 1..99 initial level',()=>{
 const m=model();m.rosterLevels[0].initialLevel=33;
 const session=rows=>({gameId:'srwf-final',units:[],pilots:[],weapons:[],rosterLevels:rows});
 const preset=buildPreset({gameId:'srwf-final'},{roster:m.rosterLevels}),parsed=parsePreset(serializePreset(preset)),target=model(),s=session(target.rosterLevels);
 const plan=planPresetApplication(parsed,s);assert.equal(plan.items.filter(i=>i.status!=='skip').length,1);applyPreset(parsed,s,'matching');assert.equal(target.rosterLevels[0].initialLevel,33);
 const bad=JSON.parse(serializePreset(preset));bad.rosterLevels[0].fields.initialLevel.to=100;assert.throws(()=>parsePreset(JSON.stringify(bad)));
 const mismatched=model();mismatched.rosterLevels[0].identity=`roster-level:1:${'b'.repeat(64)}`;assert.equal(planPresetApplication(parsed,session(mismatched.rosterLevels)).items[0].status,'skip');
});
