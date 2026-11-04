import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {installFakeDom,loadHtml} from './helpers/fake-dom.mjs';
import {makeBase,descriptorFor} from './helpers/synthetic-game.mjs';
import {CRITICAL_FIX_PROFILES,critical} from './helpers/synthetic-overlay-windows.mjs';
const {inspectCriticalFix,criticalFixRows}=critical;
import {criticalValues,criticalPercentLabel} from '../assets/editor-critical-values.mjs';
import {buildPreset,serializePreset,parsePreset,diffEditorRows} from '../assets/editor-preset.mjs';
import {exportEditedImage} from '../assets/editor-core.mjs';

const document=installFakeDom();
loadHtml(document,await readFile(new URL('../index.html',import.meta.url),'utf8'));
const oldError=console.error;console.error=()=>{};
const {__testHooks:hooks}=await import('../assets/app.mjs');
await new Promise(resolve=>setTimeout(resolve,0));console.error=oldError;
const $=id=>document.getElementById(id);
const main=()=>hooks.EDITOR_UI.weapon.form.querySelector('[data-editor-field="critical"]');
const inline=()=>$('unitWeaponDetail').querySelector('[data-inline-weapon-field="critical"]');
const actuals=()=>[$('weaponCriticalActual'),$('unitWeaponDetail').querySelector('[data-inline-weapon-critical-actual]')];
const change=(input,value)=>{input.value=String(value);input.dispatchEvent({type:'change',target:input});};
const toggle=enabled=>{$('criticalFixToggle').checked=enabled;$('criticalFixToggle').dispatchEvent({type:'change',target:$('criticalFixToggle')});};
const bytes=hex=>Uint8Array.from(hex.match(/../g),s=>parseInt(s,16));

// Obtain the same authenticated identity as the production reader, rather than
// a shape-only placeholder which the actual-value reader must refuse.
function metadata(gameId,enabled){
 const profile=CRITICAL_FIX_PROFILES[gameId],exec=new Uint8Array(profile.byteLength);
 exec.set(bytes(profile.context),profile.start);exec.set(bytes(enabled?profile.enabled:profile.original),profile.offset);
 exec.set(bytes(profile.calc.bytes),profile.calc.offset);exec.set(bytes(profile.display.bytes),profile.display.offset);
 const criticalFix=inspectCriticalFix(exec,gameId);
 assert.equal(criticalFix.available,true);
 return {criticalFix,criticalFixes:criticalFixRows(criticalFix,gameId)};
}
async function open({gameId='srwf-final',code=3,enabled=false,verified=true}={}){
 hooks.clearEditorState();
 const base=await makeBase({gameId,units:2,unitWeapons:{1:[{slot:2,weapon:1}],2:[{slot:2,weapon:1}]}});
 const weapons=base.opened.view.weapons.map(row=>row.recordIndex===1?{...row,critical:code,original:{...row.original,critical:code}}:row);
 const info=verified?metadata(gameId,enabled):{criticalFix:{available:false,enabled:false,identity:null},criticalFixes:[]};
 Object.assign(hooks.state,{mode:'editor',editorGameId:gameId,editorBaseReleaseId:`synthetic-${gameId==='srwf-f'?'f':'final'}-9-a`,editorSessionToken:base.opened.session.sessionToken,editorBusy:false,busy:false,cueSaving:false,editorSetupOpen:false});
 $('editorWorkspace').hidden=false;hooks.installEditorRows({...base.opened.view,weapons,...info});
 hooks.selectEditorTab('unit');hooks.selectEditorRecord('unit',1);
 const slot=$('unitWeaponList').querySelector('[data-unit-weapon-select="1"]');assert.ok(slot);slot.click();
 hooks.selectEditorRecord('weapon',1);
 assert.equal($('unitWeaponDetail').hidden,false);
 return base;
}
function assertReadouts(code,enabled){
 assert.equal(main().value,String(code));assert.equal(inline().value,String(code));
 const expected=`실제 ${criticalPercentLabel(criticalValues(code,enabled).actual)}`;
 for(const output of actuals()){assert.ok(output);assert.equal(output.textContent,expected);}
}
function assertNoWeaponChanges(){
 assert.equal(diffEditorRows('weapon',hooks.state.editorWeapons).length,0);
 assert.equal(main().classList.contains('is-modified'),false);
 assert.equal(inline().classList.contains('is-modified'),false);
}
function requestCritical(){return hooks.buildEditorExportRequest().weaponEdits.find(row=>row.recordIndex===1).fields.critical;}

for(const gameId of ['srwf-f','srwf-final']){
 test(`${gameId}: both weapon views offer percentages, share a raw code, and update actual values immediately from Misc`,async()=>{
  await open({gameId});
  for(const input of [main(),inline()]){
   assert.equal(input.tagName,'SELECT');
   assert.deepEqual(input.options.map(option=>[option.value,option.textContent]),[['4','-20%'],['0','-10%'],['1','0%'],['2','+10%'],['3','+20%']]);
  }
  assertReadouts(3,false);assertNoWeaponChanges();
  hooks.selectEditorTab('misc');toggle(true);
  assertReadouts(3,true);assertNoWeaponChanges();assert.equal(hooks.countEditorChanges(),1);assert.equal(requestCritical(),3);
  hooks.selectEditorTab('unit');inline().focus();change(inline(),4);
  assert.equal(document.activeElement,inline());assertReadouts(4,true);assert.equal(requestCritical(),4);
  assert.equal(hooks.countEditorChanges(),2);
  hooks.selectEditorTab('misc');toggle(false);assertReadouts(4,false);assert.equal(hooks.countEditorChanges(),1);
  hooks.selectEditorTab('weapon');change(main(),2);assertReadouts(2,false);assert.equal(requestCritical(),2);
  main().closest('label').querySelector('.editor-diff-reset').click();
  assertReadouts(3,false);assertNoWeaponChanges();assert.equal(hooks.countEditorChanges(),0);
  change(inline(),4);assertReadouts(4,false);
  $('unitWeaponDetail').querySelector('[data-inline-weapon-reset="critical"]').click();
  assertReadouts(3,false);assertNoWeaponChanges();
  assert.equal(hooks.state.editorUnits[0].critical,undefined,'the inline view edits only the shared weapon');
 });
 test(`${gameId}: a loaded ON baseline survives JSON OFF import, both readouts, reset, and raw-code export`,async()=>{
  const base=await open({gameId,code:4,enabled:true});
  assertReadouts(4,true);assertNoWeaponChanges();
  const entry={...hooks.state.editorCriticalRows[0],original:{...hooks.state.editorCriticalRows[0].original},enabled:0};
  const text=serializePreset(buildPreset({gameId},{critical:[entry]}));
  await hooks.editorChanges.loadFile({name:'critical-off.json',size:text.length,async text(){return text;}});hooks.editorChanges.apply('matching');
  assertReadouts(4,false);assertNoWeaponChanges();assert.equal(requestCritical(),4);assert.equal(hooks.buildEditorExportRequest().criticalFix,false);
  const saved=parsePreset(JSON.stringify(await hooks.editorChanges.save()));
  assert.deepEqual(saved.entries.critical[0].fields,[{field:'enabled',from:1,to:0}]);
  assert.equal(saved.entries.weapon.length,0);
  $('criticalFixReset').click();assertReadouts(4,true);assertNoWeaponChanges();assert.equal(hooks.countEditorChanges(),0);
  for(const enabled of [false,true]){
   toggle(enabled);const request={...hooks.buildEditorExportRequest()};assert.equal(request.weaponEdits.find(row=>row.recordIndex===1).fields.critical,4);
   // The synthetic disc contains no EXEC0. Actual fix writes are tested by the
   // authenticated fix suite; this roundtrip checks the weapon writer's raw code.
   delete request.criticalFix;
   const output=await exportEditedImage(base.opened.session,request);
   const reopened=await base.full.inspectPatchedImage(output.outputBlob,descriptorFor(base.disc,{gameId,imageKind:'local'}));
   assert.equal(reopened.view.weapons.find(row=>row.recordIndex===1).critical,4);
  }
 });
 test(`${gameId}: loaded legacy nibble values retain their exact raw option through changes, toggles and reset`,async()=>{
  for(let code=5;code<=15;code++){
   const base=await open({gameId,code});
   for(const input of [main(),inline()]){
    assert.deepEqual(input.options.map(option=>Number(option.value)),[4,0,1,2,3,code]);
    assert.equal(input.selectedOptions[0].textContent,`${criticalPercentLabel(criticalValues(code).display)} (기존 값)`);
   }
   assertReadouts(code,false);assertNoWeaponChanges();assert.equal(requestCritical(),code);
   toggle(true);assertReadouts(code,true);assertNoWeaponChanges();assert.equal(requestCritical(),code);
   change(inline(),4);assertReadouts(4,true);assert.equal(requestCritical(),4);
   main().closest('label').querySelector('.editor-diff-reset').click();
   assertReadouts(code,true);assertNoWeaponChanges();assert.equal(requestCritical(),code);
   change(main(),3);assertReadouts(3,true);
   $('unitWeaponDetail').querySelector('[data-inline-weapon-reset="critical"]').click();
   assertReadouts(code,true);assertNoWeaponChanges();assert.equal(requestCritical(),code);
   $('criticalFixReset').click();assertReadouts(code,false);assert.equal(hooks.countEditorChanges(),0);
   if(code===15){
    const request={...hooks.buildEditorExportRequest()};delete request.criticalFix;
    const output=await exportEditedImage(base.opened.session,request);
    const reopened=await base.full.inspectPatchedImage(output.outputBlob,descriptorFor(base.disc,{gameId,imageKind:'local'}));
    assert.equal(reopened.view.weapons.find(row=>row.recordIndex===1).critical,15,'legacy raw code survives the writer and reparse');
   }
  }
 });
 test(`${gameId}: unverified critical-fix metadata displays an unknown actual value in both weapon views`,async()=>{
  await open({gameId,code:3,verified:false});
  assertReadouts(3,null);assertNoWeaponChanges();
  assert.equal($('criticalFixToggle').disabled,true);
  toggle(true);assertReadouts(3,null);assert.equal(requestCritical(),3);
  assert.equal(Object.hasOwn(hooks.buildEditorExportRequest(),'criticalFix'),false);
 });
}
