import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {installFakeDom,loadHtml} from './helpers/fake-dom.mjs';
import {createUnitWeaponEditor} from '../assets/editor-unit-weapon-ui.mjs';
import {joinWeaponTerrain} from '../assets/editor-grades.mjs';

const document=installFakeDom();loadHtml(document,await readFile(new URL('../index.html',import.meta.url),'utf8'));
const rows=[1,2,3,4].map(id=>({recordIndex:id,name:`무기${id}`,editable:id!==3,nameEditable:id!==3,statsValid:true,attack:1000,hit:0,critical:id===4?15:4,minRange:1,maxRange:5,energy:20,ammo:id===2?0:5,ammoEditable:true,requiredMorale:100,requiredSkill:0,voiceType:3,terrain:255}));
for(const row of rows)row.original={...row};
let busy=false,selected=null,changes=0,criticalFixEnabled=false;
const panel=document.getElementById('unitWeaponDetail'),work=document.getElementById('unitWeaponWorkarea');
const ui=createUnitWeaponEditor({panel,workarea:work,gameId:()=>'srwf-final',weapons:()=>rows,row:id=>rows.find(row=>row.recordIndex===id),canEdit:()=>!busy,criticalFixEnabled:()=>criticalFixEnabled,onSelect:row=>{selected=row.recordIndex;},onChange:()=>changes++,choices:field=>field==='requiredSkill'?[{value:0,label:'없음'},{value:32,label:'뉴타입'}]:[{value:3,label:'기본'},{value:24,label:'다른 대사'}],reveal:input=>input.focus()});
const input=field=>panel.querySelector(`[data-inline-weapon-field="${field}"]`),set=(field,value)=>{const el=input(field);el.value=String(value);el.dispatchEvent({type:el.tagName==='SELECT'?'change':'input',target:el});};
const injectCritical=value=>{const option=document.createElement('option');option.value=String(value);option.textContent='변조된 선택';input('critical').append(option);set('critical',value);return option;};

test('inline edits keep focus, share weapon rows, validate without discarding drafts and restore individual fields',()=>{
 ui.context(1,[1,2,3]);assert.equal(ui.open(1),true);assert.equal(selected,1);assert.equal(panel.hidden,false);assert.equal(work.dataset.weaponDetail,'open');
 const dialogue=panel.querySelector('.unit-weapon-dialogue-details');
 assert.equal(Boolean(dialogue.open),false);assert.equal(input('voiceType').closest('details'),dialogue);
 assert.equal(input('attack').closest('details'),null);
 const attack=input('attack');attack.focus();set('attack',4321);set('critical',2);set('ammo',255);set('energy',600);set('requiredSkill',32);set('voiceType',24);
 assert.equal(document.activeElement,attack);assert.equal(rows[0].attack,4321);assert.equal(rows[0].critical,2);assert.equal(rows[0].ammo,255);assert.equal(rows[0].energy,600);assert.equal(rows[0].requiredSkill,32);assert.equal(rows[0].voiceType,24);assert.equal(changes,6);
 const sea=panel.querySelector('[data-inline-weapon-terrain="sea"]');sea.value='0';sea.dispatchEvent({type:'change',target:sea});
 assert.equal(rows[0].terrain,joinWeaponTerrain({ground:3,sea:0,air:3,space:3}));
 const unknown=injectCritical(15);assert.equal(rows[0].critical,2);assert.equal(ui.validate(),false);assert.equal(ui.open(2),false);assert.equal(selected,1);assert.equal(input('critical').value,'15');unknown.remove();
 set('critical',3);assert.equal(ui.validate(),true);assert.equal(rows[0].critical,3);
 panel.querySelector('[data-inline-weapon-reset="critical"]').click();assert.equal(rows[0].critical,4);assert.equal(rows[0].attack,4321);
 assert.match(panel.querySelector('.unit-weapon-detail-scope').textContent,/모든 기체/);
 assert.equal(panel.querySelectorAll('[data-editor-field]').length,0,'weapon fields cannot be collected by the enclosing unit form');
});

test('inline hit accepts both 99 boundaries and refuses three-digit modifiers without changing the row',()=>{
 ui.context(1,[1,2,3]);ui.open(1);
 const hit=input('hit'),before=rows[0].hit;
 assert.equal(hit.min,'-99');assert.equal(hit.max,'99');
 for(const value of [100,127,-100,-128]){set('hit',value);assert.equal(ui.validate(),false);assert.equal(rows[0].hit,before);}
 set('hit',99);assert.equal(rows[0].hit,99);assert.equal(ui.validate(),true);
 set('hit',-99);assert.equal(rows[0].hit,-99);assert.equal(ui.validate(),true);
 panel.querySelector('[data-inline-weapon-reset="hit"]').click();
});

test('critical percentages stay in the numeric grid and actual values follow the fix without losing selection, focus or drafts',()=>{
 ui.context(1,[1,2,3]);ui.open(1);
 const critical=input('critical'),actual=panel.querySelector('[data-inline-weapon-critical-actual]');
 assert.equal(critical.tagName,'SELECT');assert.equal(critical.closest('.unit-weapon-number-grid').children[7],critical.closest('label'));
 assert.equal(critical.closest('label').children[0].textContent,'크리티컬 보정');
 assert.deepEqual(critical.options.map(option=>[option.value,option.textContent]),[['4','-20%'],['0','-10%'],['1','0%'],['2','+10%'],['3','+20%']]);
 assert.equal(actual.textContent,'실제 +20%');assert.equal(actual.classList.contains('critical-applied-value'),true);
 const attack=input('attack');attack.focus();set('attack',65536);assert.equal(ui.validate(),false);
 criticalFixEnabled=true;ui.refresh();assert.equal(actual.textContent,'실제 -20%');assert.equal(input('attack').value,'65536');assert.equal(document.activeElement,attack);assert.equal(ui.selected(),1);
 criticalFixEnabled=null;ui.sync();assert.equal(actual.textContent,'실제 미확인');assert.equal(ui.validate(),false);
 panel.querySelector('[data-inline-weapon-reset="attack"]').click();set('critical',2);assert.equal(actual.textContent,'실제 미확인');
 criticalFixEnabled=false;ui.sync();assert.equal(actual.textContent,'실제 0%');critical.focus();criticalFixEnabled=true;ui.refresh();assert.equal(actual.textContent,'실제 +10%');assert.equal(document.activeElement,critical);
 panel.querySelector('[data-inline-weapon-reset="critical"]').click();criticalFixEnabled=false;
});

test('legacy critical codes survive a no-op, shared-row refresh, JSON and both resets; unknown selections remain invalid',()=>{
 ui.context(4,[4]);ui.open(4);const critical=input('critical'),before=changes;
 assert.equal(critical.value,'15');assert.equal(critical.selectedOptions[0].textContent,'0% (기존 값)');
 assert.deepEqual(critical.options.map(option=>option.value),['4','0','1','2','3','15']);
 set('critical',15);ui.refresh();assert.equal(changes,before);assert.equal(rows[3].critical,15);assert.equal(JSON.parse(JSON.stringify(rows[3])).critical,15);
 set('critical',1);assert.equal(rows[3].critical,1);assert.ok(critical.options.some(option=>option.value==='15'),'the original legacy code remains available');
 panel.querySelector('[data-inline-weapon-reset="critical"]').click();assert.equal(rows[3].critical,15);assert.equal(critical.value,'15');
 set('critical',2);panel.querySelectorAll('button').find(button=>button.getAttribute('aria-label')==='선택한 무기 이름·수치 전체 복원').click();assert.equal(rows[3].critical,15);assert.equal(critical.value,'15');
 for(const value of [16,-1,1.5,7]){const option=injectCritical(value);assert.equal(rows[3].critical,15);assert.equal(ui.validate(),false);option.remove();set('critical',15);assert.equal(ui.validate(),true);}
});

test('no-ammo and read-only records stay protected; arrows change weapons and context changes close the detail',()=>{
 ui.context(1,[1,2,3]);
 assert.equal(ui.open(2),true);assert.equal(input('ammo').disabled,true);assert.equal(input('ammo').hidden,true);set('ammo',9);assert.equal(rows[1].ammo,0);
 panel.querySelectorAll('button').find(button=>button.getAttribute('aria-label')==='다음 무장 수치').click();assert.equal(selected,3);assert.equal(input('attack').disabled,true);set('attack',9999);assert.equal(rows[2].attack,1000);
 ui.open(1);busy=true;ui.sync();set('energy',3);assert.equal(rows[0].energy,600);busy=false;
 ui.context(2,[2]);assert.equal(panel.hidden,true);assert.equal(work.dataset.weaponDetail,undefined);ui.open(2);assert.equal(panel.hidden,false);
 ui.context(2,[]);assert.equal(panel.hidden,true);
});

test('inline weapon names share the row, keep invalid drafts, refuse navigation and reset the full name',()=>{
 ui.context(1,[1,2,3]);ui.open(1);const name=panel.querySelector('[data-weapon-name]');name.focus();name.value='천지인';name.dispatchEvent({type:'input'});assert.equal(rows[0].name,'천지인');assert.equal(document.activeElement,name);
 assert.equal(panel.querySelectorAll('[data-weapon-name]').length,1);
 assert.equal(name.closest('h5'),panel.querySelector('#unitWeaponDetailTitle'));
 assert.equal(name.closest('.unit-weapon-detail-body'),null,'the heading edits the name without another body row');
 name.value='😀';name.dispatchEvent({type:'input'});assert.equal(ui.validate(),false);assert.equal(ui.open(2),false);assert.equal(rows[0].name,'천지인');
 [...panel.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='선택한 무기 이름·수치 전체 복원').click();assert.equal(ui.validate(),true);assert.equal(rows[0].name,rows[0].original.name);
});

test('inline existing dialogue picker shares the numeric field and its restore without changing unit context',()=>{
 ui.open(1);set('voiceType',24);const choose=panel.querySelector('[data-dialogue-source]');choose.value='2';choose.dispatchEvent({type:'change'});
 assert.equal(rows[0].voiceType,3);assert.equal(input('voiceType').value,'3');assert.equal(ui.selected(),1);assert.equal(selected,1);
 set('voiceType',24);panel.querySelector('[data-inline-weapon-reset="voiceType"]').click();assert.equal(rows[0].voiceType,3);
});
