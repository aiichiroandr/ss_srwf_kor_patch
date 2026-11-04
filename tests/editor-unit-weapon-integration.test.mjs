import assert from 'node:assert/strict';import test from 'node:test';import {readFile} from 'node:fs/promises';
import {installFakeDom,loadHtml} from './helpers/fake-dom.mjs';
import {makeBase,descriptorFor} from './helpers/synthetic-game.mjs';
import {echoRequest} from './helpers/synthetic-iso.mjs';
import {exportEditedImage} from '../assets/editor-core.mjs';
const document=installFakeDom();loadHtml(document,await readFile(new URL('../index.html',import.meta.url),'utf8'));
const oldLog=console.error;console.error=()=>{};const {__testHooks:hooks}=await import('../assets/app.mjs');await new Promise(resolve=>setTimeout(resolve,0));console.error=oldLog;
const $=id=>document.getElementById(id);

test('invalid unit drafts invalidate previews while other valid field edits remain tracked',async()=>{
 const base=await makeBase({units:1,unitWeapons:{1:[{slot:2,weapon:1}]}});
 hooks.clearEditorState();Object.assign(hooks.state,{editorGameId:'srwf-final',editorSessionToken:base.opened.session.sessionToken,editorBusy:false,busy:false,cueSaving:false});
 hooks.installEditorRows(base.opened.view);hooks.selectEditorTab('unit');hooks.selectEditorRecord('unit',1);
 const hp=hooks.EDITOR_UI.unit.form.querySelector('[data-editor-field="hp"]'),en=hooks.EDITOR_UI.unit.form.querySelector('[data-editor-field="en"]');
 const oldHp=hooks.state.editorUnits[0].hp,oldEn=hooks.state.editorUnits[0].en,revision=hooks.state.editorEditRevision;
 hp.value='';hp.dispatchEvent({type:'input'});assert.equal(hooks.state.editorUnits[0].hp,oldHp);
 assert.ok(hooks.state.editorEditRevision>revision,'an invalid draft must invalidate a previously cached preview');
 const afterInvalid=hooks.state.editorEditRevision;en.value=String(oldEn+1);en.dispatchEvent({type:'input'});
 assert.equal(hooks.state.editorUnits[0].en,oldEn+1);assert.ok(hooks.state.editorEditRevision>afterInvalid);
 assert.ok(hooks.state.editorChangeCount>0,'valid edits made while another field is invalid must be counted');
 await assert.rejects(hooks.requestAnimationSource(),/HP|입력/);
 hp.value=String(oldHp);hp.dispatchEvent({type:'input'});assert.equal(hooks.validateEditorForms({report:false}),true);
});

test('invalid unit values survive tab switches and are not discarded by record navigation',async()=>{
 const base=await makeBase({units:2});hooks.clearEditorState();
 Object.assign(hooks.state,{editorGameId:'srwf-final',editorSessionToken:base.opened.session.sessionToken,editorBusy:false,busy:false,cueSaving:false});
 hooks.installEditorRows(base.opened.view);hooks.selectEditorTab('unit');hooks.selectEditorRecord('unit',1);
 const hp=hooks.EDITOR_UI.unit.form.querySelector('[data-editor-field="hp"]');
 hp.value='';hp.dispatchEvent({type:'input'});hooks.selectEditorTab('pilot');
 assert.equal(hp.value,'');assert.equal(hp.getAttribute('aria-invalid'),'true');
 hooks.selectEditorTab('unit');assert.equal(hp.value,'');assert.equal(hp.getAttribute('aria-invalid'),'true');
 hooks.selectEditorRecord('unit',2);assert.equal(hooks.state.editorSelected.unit,1);assert.equal(hp.value,'');
 const reset=hp.closest('label').querySelector('[data-editor-reset-field="hp"]');assert.equal(reset.disabled,false);
 reset.click();assert.equal(hp.value,String(hooks.state.editorUnits[0].original.hp));assert.equal(hp.getAttribute('aria-invalid'),null);
 assert.equal(hooks.validateEditorForms({report:false}),true);hooks.selectEditorRecord('unit',2);assert.equal(hooks.state.editorSelected.unit,2);
});

test('replacing the session clears old input errors before selecting its records',async()=>{
 const base=await makeBase({units:2});hooks.clearEditorState();
 Object.assign(hooks.state,{editorGameId:'srwf-final',editorSessionToken:base.opened.session.sessionToken,editorBusy:false,busy:false,cueSaving:false});
 hooks.installEditorRows(base.opened.view);hooks.selectEditorRecord('unit',1);
 const hp=hooks.EDITOR_UI.unit.form.querySelector('[data-editor-field="hp"]');hp.value='';hp.dispatchEvent({type:'input'});
 hooks.installEditorRows(base.opened.view);assert.equal(hp.getAttribute('aria-invalid'),null);
 hooks.selectEditorRecord('unit',2);assert.equal(hooks.state.editorSelected.unit,2);assert.equal(Number(hp.value),hooks.state.editorUnits[1].hp);
});

test('checking forms does not overwrite a row from stale on-screen controls',async()=>{
 const base=await makeBase({units:1});hooks.clearEditorState();
 Object.assign(hooks.state,{editorGameId:'srwf-final',editorSessionToken:base.opened.session.sessionToken,editorBusy:false,busy:false,cueSaving:false});
 hooks.installEditorRows(base.opened.view);hooks.selectEditorTab('unit');hooks.selectEditorRecord('unit',1);
 const row=hooks.state.editorUnits[0],hp=hooks.EDITOR_UI.unit.form.querySelector('[data-editor-field="hp"]');
 const original=row.hp;assert.equal(Number(hp.value),original);row.hp=original+1;
 assert.equal(hooks.validateEditorForms({report:false}),true);assert.equal(row.hp,original+1);
});

test('record jumps cannot associate an invalid draft with a different unit',async()=>{
 const base=await makeBase({units:2});hooks.clearEditorState();
 Object.assign(hooks.state,{editorGameId:'srwf-final',editorSessionToken:base.opened.session.sessionToken,editorBusy:false,busy:false,cueSaving:false});
 hooks.installEditorRows(base.opened.view);hooks.selectEditorTab('unit');hooks.selectEditorRecord('unit',1);
 const hp=hooks.EDITOR_UI.unit.form.querySelector('[data-editor-field="hp"]');hp.value='';hp.dispatchEvent({type:'input'});
 assert.equal(hooks.jumpToEditorRecord('unit',2),false);assert.equal(hooks.state.editorSelected.unit,1);assert.equal(hp.value,'');
 hp.value=String(hooks.state.editorUnits[0].hp);hp.dispatchEvent({type:'input'});
 assert.equal(hooks.jumpToEditorRecord('unit',2),true);assert.equal(hooks.state.editorSelected.unit,2);
});

test('search retains focus and a consistent list when an invalid draft blocks automatic selection',async()=>{
 const base=await makeBase({units:2});hooks.clearEditorState();
 Object.assign(hooks.state,{editorGameId:'srwf-final',editorSessionToken:base.opened.session.sessionToken,editorBusy:false,busy:false,cueSaving:false});
 hooks.installEditorRows(base.opened.view);hooks.selectEditorTab('unit');hooks.selectEditorRecord('unit',1);
 const hp=hooks.EDITOR_UI.unit.form.querySelector('[data-editor-field="hp"]');hp.value='';hp.dispatchEvent({type:'input'});
 const search=$('unitSearch');search.focus();search.value='#2';search.dispatchEvent({type:'input'});
 assert.ok(document.activeElement===search,'search keeps focus');assert.equal(hooks.state.editorSelected.unit,1);assert.equal(hp.value,'');
 assert.equal($('unitRecordList').getAttribute('aria-activedescendant'),null);
});

test('editing a shared inline weapon does not erase an invalid draft in the weapon tab',async()=>{
 const base=await makeBase({units:1,unitWeapons:{1:[{slot:2,weapon:1}]}});hooks.clearEditorState();
 Object.assign(hooks.state,{editorGameId:'srwf-final',editorSessionToken:base.opened.session.sessionToken,editorBusy:false,busy:false,cueSaving:false});
 hooks.installEditorRows(base.opened.view);hooks.selectEditorTab('weapon');hooks.selectEditorRecord('weapon',1);
 const attack=hooks.EDITOR_UI.weapon.form.querySelector('[data-editor-field="attack"]');attack.value='';attack.dispatchEvent({type:'input'});
 hooks.selectEditorTab('unit');hooks.selectEditorRecord('unit',1);$('unitWeaponList').querySelector('[data-unit-weapon-select="1"]').click();
 const hit=$('unitWeaponDetail').querySelector('[data-inline-weapon-field="hit"]');hit.value=String(Number(hit.value)+1);hit.dispatchEvent({type:'input'});
 hooks.selectEditorTab('weapon');assert.equal(attack.value,'');assert.equal(attack.getAttribute('aria-invalid'),'true');
 assert.equal(hooks.validateEditorForms({report:false}),false);
});

test('invalid inline weapon input invalidates the previous preview and blocks a new one',async()=>{
 const base=await makeBase({units:1,unitWeapons:{1:[{slot:2,weapon:1}]}});
 hooks.clearEditorState();Object.assign(hooks.state,{editorGameId:'srwf-final',editorSessionToken:base.opened.session.sessionToken,editorBusy:false,busy:false,cueSaving:false});
 hooks.installEditorRows(base.opened.view);hooks.selectEditorTab('unit');hooks.selectEditorRecord('unit',1);$('unitWeaponList').querySelector('[data-unit-weapon-select="1"]').click();
 const attack=$('unitWeaponDetail').querySelector('[data-inline-weapon-field="attack"]'),before=hooks.state.editorWeapons.find(w=>w.recordIndex===1).attack,revision=hooks.state.editorEditRevision;
 attack.value='';attack.dispatchEvent({type:'input'});
 assert.equal(hooks.state.editorWeapons.find(w=>w.recordIndex===1).attack,before);
 assert.ok(hooks.state.editorEditRevision>revision,'an invalid weapon draft must invalidate a cached preview');
 await assert.rejects(hooks.requestAnimationSource(),/기체 무장/);
 const invalidRevision=hooks.state.editorEditRevision;attack.value=String(before);attack.dispatchEvent({type:'input'});
 assert.ok(hooks.state.editorEditRevision>invalidRevision,'resolving a draft without changing the value must refresh the preview again');
 assert.equal(hooks.validateEditorForms({report:false}),true);
});

test('weapon-tab edits do not discard an invalid inline weapon value',async()=>{
 const base=await makeBase({units:1,unitWeapons:{1:[{slot:2,weapon:1}]}});hooks.clearEditorState();
 Object.assign(hooks.state,{editorGameId:'srwf-final',editorSessionToken:base.opened.session.sessionToken,editorBusy:false,busy:false,cueSaving:false});
 hooks.installEditorRows(base.opened.view);hooks.selectEditorTab('unit');hooks.selectEditorRecord('unit',1);$('unitWeaponList').querySelector('[data-unit-weapon-select="1"]').click();
 const attack=$('unitWeaponDetail').querySelector('[data-inline-weapon-field="attack"]');attack.value='';attack.dispatchEvent({type:'input'});
 hooks.selectEditorTab('weapon');const hit=hooks.EDITOR_UI.weapon.form.querySelector('[data-editor-field="hit"]');hit.value=String(Number(hit.value)+1);hit.dispatchEvent({type:'input'});
 assert.equal(attack.value,'');assert.equal(attack.getAttribute('aria-invalid'),'true');
 await assert.rejects(hooks.requestAnimationSource(),/기체 무장/);
 assert.equal(hooks.validateEditorForms({report:true}),false);assert.equal(hooks.state.editorTab,'unit');assert.ok(document.activeElement===attack);
});

test('weapon-tab edits preserve invalid inline names and reveal them on validation',async()=>{
 const base=await makeBase({units:1,unitWeapons:{1:[{slot:2,weapon:1}]}});hooks.clearEditorState();
 Object.assign(hooks.state,{editorGameId:'srwf-final',editorSessionToken:base.opened.session.sessionToken,editorBusy:false,busy:false,cueSaving:false});
 hooks.installEditorRows(base.opened.view);hooks.selectEditorTab('unit');hooks.selectEditorRecord('unit',1);$('unitWeaponList').querySelector('[data-unit-weapon-select="1"]').click();
 const name=$('unitWeaponDetail').querySelector('[data-weapon-name]');name.value='😀';name.dispatchEvent({type:'input'});assert.equal(name.getAttribute('aria-invalid'),'true');
 hooks.selectEditorTab('weapon');const hit=hooks.EDITOR_UI.weapon.form.querySelector('[data-editor-field="hit"]');hit.value=String(Number(hit.value)+1);hit.dispatchEvent({type:'input'});
 assert.equal(name.value,'😀');assert.equal(name.getAttribute('aria-invalid'),'true');assert.equal(hooks.validateEditorForms({report:true}),false);
 assert.equal(hooks.state.editorTab,'unit');assert.ok(document.activeElement===name);
});

test('a weapon with an invalid main-tab draft cannot silently switch through a unit slot',async()=>{
 const base=await makeBase({units:1,unitWeapons:{1:[{slot:2,weapon:1},{slot:3,weapon:2}]}});hooks.clearEditorState();
 Object.assign(hooks.state,{editorGameId:'srwf-final',editorSessionToken:base.opened.session.sessionToken,editorBusy:false,busy:false,cueSaving:false});
 hooks.installEditorRows(base.opened.view);hooks.selectEditorTab('weapon');hooks.selectEditorRecord('weapon',1);
 const attack=hooks.EDITOR_UI.weapon.form.querySelector('[data-editor-field="attack"]');attack.value='';attack.dispatchEvent({type:'input'});
 hooks.selectEditorTab('unit');hooks.selectEditorRecord('unit',1);$('unitWeaponList').querySelector('[data-unit-weapon-select="2"]').click();
 assert.equal(hooks.state.editorSelected.weapon,1);assert.equal(hooks.state.editorTab,'weapon');assert.equal(attack.value,'');
 assert.equal($('unitWeaponDetail').hidden,true,'the second weapon must not open when switching is refused');
 assert.ok(document.activeElement===attack);
});

test('a main weapon name error is revealed when another unit weapon is selected',async()=>{
 const base=await makeBase({units:1,unitWeapons:{1:[{slot:2,weapon:1},{slot:3,weapon:2}]}});hooks.clearEditorState();
 Object.assign(hooks.state,{editorGameId:'srwf-final',editorSessionToken:base.opened.session.sessionToken,editorBusy:false,busy:false,cueSaving:false});
 hooks.installEditorRows(base.opened.view);hooks.selectEditorTab('weapon');hooks.selectEditorRecord('weapon',1);
 const name=$('weaponNameControl').querySelector('[data-weapon-name]');name.value='😀';name.dispatchEvent({type:'input'});
 hooks.selectEditorTab('unit');hooks.selectEditorRecord('unit',1);$('unitWeaponList').querySelector('[data-unit-weapon-select="2"]').click();
 assert.equal(hooks.state.editorSelected.weapon,1);assert.equal(hooks.state.editorTab,'weapon');assert.equal(name.value,'😀');
 assert.equal($('unitWeaponDetail').hidden,true);assert.ok(document.activeElement===name);
});

test('a replacement editor session clears weapon-name errors even when the same weapon is selected',async()=>{
 const base=await makeBase({units:1,unitWeapons:{1:[{slot:2,weapon:1}]}});hooks.clearEditorState();
 Object.assign(hooks.state,{editorGameId:'srwf-final',editorSessionToken:base.opened.session.sessionToken,editorBusy:false,busy:false,cueSaving:false});
 hooks.installEditorRows(base.opened.view);hooks.selectEditorTab('weapon');hooks.selectEditorRecord('weapon',1);
 const name=$('weaponNameControl').querySelector('[data-weapon-name]');name.value='😀';name.dispatchEvent({type:'input'});
 assert.equal(name.getAttribute('aria-invalid'),'true');hooks.installEditorRows(base.opened.view);hooks.selectEditorTab('weapon');hooks.selectEditorRecord('weapon',1);
 assert.equal(name.getAttribute('aria-invalid'),null);assert.notEqual(name.value,'😀');assert.equal(hooks.validateEditorForms({report:false}),true);
});
for(const gameId of ['srwf-f','srwf-final'])test(`${gameId}: unit slot click edits the shared weapon, stays in unit, and reaches BIN output without changing unit fields`,async()=>{
 const base=await makeBase({gameId,units:2,unitWeapons:{1:[{slot:2,weapon:1}],2:[{slot:2,weapon:1}]}});
 Object.assign(hooks.state,{mode:'editor',editorGameId:gameId,editorSessionToken:base.opened.session.sessionToken,editorBusy:false,busy:false,cueSaving:false,editorSetupOpen:false});$('editorWorkspace').hidden=false;
 hooks.installEditorRows(base.opened.view);hooks.selectEditorTab('unit');hooks.selectEditorRecord('unit',1);
 const unitBefore={...hooks.state.editorUnits[0]},slot=$('unitWeaponList').querySelector('[data-unit-weapon-select="1"]');assert.ok(slot,JSON.stringify({selected:hooks.state.editorSelected.unit,unit:hooks.state.editorUnits.find(row=>row.recordIndex===1)?.weaponList,note:$('unitWeaponNote').textContent,html:$('unitWeaponList').textContent}));slot.click();
 assert.equal(hooks.state.editorTab,'unit');assert.equal($('unitWeaponDetail').hidden,false);assert.equal($('unitAnimationPanel').hidden,true,'editing never turns the player on');
 const input=field=>$('unitWeaponDetail').querySelector(`[data-inline-weapon-field="${field}"]`);
 for(const [field,value]of [['attack',3456],['critical',2],['energy',333]]){input(field).focus();input(field).value=String(value);input(field).dispatchEvent({type:input(field).tagName==='SELECT'?'change':'input',target:input(field)});assert.equal(document.activeElement,input(field));}
 const sea=$('unitWeaponDetail').querySelector('[data-inline-weapon-terrain="sea"]');sea.value='0';sea.dispatchEvent({type:'change',target:sea});
 const main=hooks.EDITOR_UI.weapon.form;assert.equal(main.querySelector('[data-editor-field="critical"]').value,'2');
 assert.equal(input('critical').selectedOptions[0].textContent,'+10%');
 assert.match(slot.querySelector('.weapon-entry-stats').textContent,/3,456/);
 assert.deepEqual(hooks.state.editorUnits[0],unitBefore);
 const request=hooks.buildEditorExportRequest();assert.equal(request.weaponEdits.find(row=>row.recordIndex===1).fields.critical,2);
 assert.equal(request.unitEdits[0].fields.attack,undefined);assert.equal(request.unitEdits[0].fields.critical,undefined);
 const output=await exportEditedImage(base.opened.session,request),opened=await base.full.inspectPatchedImage(output.outputBlob,descriptorFor(base.disc,{gameId,imageKind:'local'}));
 const saved=opened.view.weapons.find(row=>row.recordIndex===1);assert.equal(saved.attack,3456);assert.equal(saved.critical,2);assert.equal(saved.energy,333);assert.equal(saved.terrain&0x30,0);
 const unknown=document.createElement('option');unknown.value='15';unknown.textContent='변조된 선택';input('critical').append(unknown);input('critical').value='15';input('critical').dispatchEvent({type:'change',target:input('critical')});assert.equal(hooks.validateEditorForms(),false);assert.equal(hooks.state.editorTab,'unit');assert.equal(hooks.state.editorWeapons.find(row=>row.recordIndex===1).critical,2);
 hooks.selectEditorRecord('unit',2);assert.equal(hooks.state.editorSelected.unit,1,'invalid drafts block changing unit');
 unknown.remove();input('critical').value='3';input('critical').dispatchEvent({type:'change',target:input('critical')});hooks.selectEditorRecord('unit',2);
 assert.equal(hooks.state.editorSelected.unit,2);$('unitWeaponList').querySelector('[data-unit-weapon-select="1"]').click();assert.equal(input('critical').value,'3','another unit reads the same weapon record');
 hooks.selectEditorTab('weapon');hooks.EDITOR_UI.weapon.form.querySelector('[data-editor-field="critical"]').value='0';hooks.EDITOR_UI.weapon.form.dispatchEvent({type:'change',target:hooks.EDITOR_UI.weapon.form.querySelector('[data-editor-field="critical"]')});assert.equal(input('critical').value,'0');
});

for(const gameId of ['srwf-f','srwf-final'])test(`${gameId}: an actual loaded legacy nibble survives inline no-op, reset, JSON and a second BIN export`,async()=>{
 const base=await makeBase({gameId,units:1,unitWeapons:{1:[{slot:2,weapon:1}]}});
 const prepared=await exportEditedImage(base.opened.session,echoRequest(base.opened.session,base.opened.view,(kind,row,fields)=>{if(kind==='weapon'&&row.recordIndex===1)fields.critical=15;}));
 const legacy=await base.full.inspectPatchedImage(prepared.outputBlob,descriptorFor(base.disc,{gameId,imageKind:'local'}));
 hooks.clearEditorState();Object.assign(hooks.state,{mode:'editor',editorGameId:gameId,editorSessionToken:legacy.session.sessionToken,editorBusy:false,busy:false,cueSaving:false,editorSetupOpen:false});$('editorWorkspace').hidden=false;
 hooks.installEditorRows(legacy.view);hooks.selectEditorTab('unit');hooks.selectEditorRecord('unit',1);$('unitWeaponList').querySelector('[data-unit-weapon-select="1"]').click();
 const critical=$('unitWeaponDetail').querySelector('[data-inline-weapon-field="critical"]');
 assert.equal(critical.value,'15');assert.equal(critical.selectedOptions[0].textContent,'0% (기존 값)');
 critical.dispatchEvent({type:'change',target:critical});assert.equal(hooks.countEditorChanges(),0);
 critical.value='2';critical.dispatchEvent({type:'change',target:critical});assert.equal(hooks.countEditorChanges(),1);
 $('unitWeaponDetail').querySelector('[data-inline-weapon-reset="critical"]').click();assert.equal(critical.value,'15');assert.equal(hooks.countEditorChanges(),0);
 const request=JSON.parse(JSON.stringify(hooks.buildEditorExportRequest()));assert.equal(request.weaponEdits.find(row=>row.recordIndex===1).fields.critical,15);
 const output=await exportEditedImage(legacy.session,request),reopened=await base.full.inspectPatchedImage(output.outputBlob,descriptorFor(base.disc,{gameId,imageKind:'local'}));
 assert.equal(reopened.view.weapons.find(row=>row.recordIndex===1).critical,15);
});

