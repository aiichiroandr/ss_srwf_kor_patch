import test from 'node:test';import assert from 'node:assert/strict';
import {installFakeDom} from './helpers/fake-dom.mjs';
import {weaponDialogueSources,createWeaponDialogueSource} from '../assets/editor-weapon-dialogue-ui.mjs';
const document=installFakeDom();
const rows=[{recordIndex:245,name:'돌격',voiceType:24,original:{voiceType:0}},{recordIndex:994,name:'데들리 웨이브',voiceType:3},
 {recordIndex:4,name:'빈 자리',recordKind:'unused-filler',voiceType:3},{recordIndex:5,name:'잘못된 키',voiceType:64},{recordIndex:6,name:'복제',voiceType:3,weaponClone:{}}];
test('existing weapon selection searches ids/names and copies the loaded key rather than another pending edit',()=>{
 assert.deepEqual(weaponDialogueSources(rows).map(r=>[r.id,r.voiceType]),[[245,0],[994,3]]);
 assert.deepEqual(weaponDialogueSources(rows,'#２４５').map(r=>r.id),[245]);
 assert.deepEqual(weaponDialogueSources(rows,'데들리웨이브').map(r=>r.id),[994]);
});
test('copying an existing key changes no names, stats or pilot; search and locked states stay local',()=>{
 const container=document.createElement('div');let current={recordIndex:10,name:'추가 무기',voiceType:3,attack:2500,pilot:71,editable:true,statsValid:true},busy=false,count=0;
 const ui=createWeaponDialogueSource({container,row:()=>current,rows:()=>rows,canEdit:()=>!busy,onChange:()=>count++});ui.refresh();
 const search=container.querySelector('input'),select=container.querySelector('select');search.value='돌격';search.dispatchEvent({type:'input'});assert.equal(select.options.length,2);
 select.value='245';select.dispatchEvent({type:'change'});assert.equal(current.voiceType,0);assert.equal(count,1);assert.equal(current.name,'추가 무기');assert.equal(current.attack,2500);assert.equal(current.pilot,71);
 assert.match(container.querySelector('small').textContent,/현재 유형 #0/);assert.equal(container.querySelectorAll('[data-editor-field]').length,0);
 busy=true;ui.sync();assert.equal(select.disabled,true);select.value='994';select.dispatchEvent({type:'change'});assert.equal(current.voiceType,0);
 busy=false;current={...current,recordIndex:11,voiceType:3};ui.refresh();assert.equal(search.value,'');assert.equal(select.value,'');
 current.editable=false;ui.sync();assert.equal(search.disabled,true);select.value='245';select.dispatchEvent({type:'change'});assert.equal(current.voiceType,3);
});

test('real text appears in choices and a visible candidate list; late responses cannot overwrite a different pilot',async()=>{
 const container=document.createElement('div'),pending=new Map(),current={recordIndex:10,voiceType:3,editable:true};let reported;
 const catalog=(pilot,text)=>({pilot,kind:'native',types:[{type:3,common:false,lines:[{text,speaker:pilot,voice:7}],warnings:[]}]});
 const ui=createWeaponDialogueSource({container,row:()=>current,rows:()=>rows,canEdit:()=>true,onChange:()=>{},pilotContext:()=>({pilots:[{id:22,name:'카미유'},{id:71,name:'시북'}],defaultPilot:22}),
  readDialogue:id=>new Promise(resolve=>pending.set(id,resolve)),onPilotChange:id=>reported=id});ui.refresh();await Promise.resolve();
 const pilot=container.querySelector('[data-dialogue-pilot]');pilot.value='71';pilot.dispatchEvent({type:'change'});await Promise.resolve();assert.equal(reported,71);
 pending.get(71)(catalog(71,'기존 대사'));await new Promise(r=>setTimeout(r,0));assert.match(container.querySelector('[data-dialogue-lines]').textContent,/기존 대사/);assert.match(container.querySelector('[data-dialogue-source]').options.find(o=>o.value==='994').textContent,/기존 대사/);
 pending.get(22)(catalog(22,'오래된 응답'));await new Promise(r=>setTimeout(r,0));assert.doesNotMatch(container.querySelector('[data-dialogue-lines]').textContent,/오래된/);
 pilot.value='';pilot.dispatchEvent({type:'change'});assert.equal(container.querySelector('[data-dialogue-lines]').textContent,'');assert.match(container.querySelector('[data-dialogue-summary]').textContent,/파일럿을 선택/);
});
test('MAP candidate lines and source examples use the first table while normal weapons keep the second',async()=>{
 const container=document.createElement('div'),current={recordIndex:10,voiceType:3,mapType:23,editable:true};
 const type=text=>[{type:3,common:false,lines:[{text,speaker:22,voice:7}],warnings:[]}];
 const ui=createWeaponDialogueSource({container,row:()=>current,rows:()=>rows,canEdit:()=>true,onChange:()=>{},
  pilotContext:()=>({pilots:[{id:22,name:'카미유'}],defaultPilot:22}),
  readDialogue:async()=>({pilot:22,kind:'native',types:type('일반 전투 대사'),mapTypes:type('맵병기 대사')})});
 ui.refresh();await new Promise(r=>setTimeout(r,0));
 const lines=container.querySelector('[data-dialogue-lines]'),source=container.querySelector('[data-dialogue-source]');
 assert.match(lines.textContent,/맵병기 대사/);assert.doesNotMatch(lines.textContent,/일반 전투/);
 assert.match(source.options.find(o=>o.value==='994').textContent,/맵병기 대사/);
 // A mode change must update the already populated source examples as well.
 current.mapType=null;ui.refresh();
 assert.match(lines.textContent,/일반 전투 대사/);assert.doesNotMatch(lines.textContent,/맵병기 대사/);
 assert.match(source.options.find(o=>o.value==='994').textContent,/일반 전투 대사/);
});
