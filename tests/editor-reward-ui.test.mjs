import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {installFakeDom,loadHtml} from './helpers/fake-dom.mjs';
const document=installFakeDom();loadHtml(document,await readFile(new URL('../index.html',import.meta.url),'utf8'));
const logger=console.error;console.error=()=>{};
const {__testHooks:hooks}=await import('../assets/app.mjs');await new Promise(r=>setTimeout(r,0));console.error=logger;
const $=id=>document.getElementById(id),control=field=>$('rewardFields').querySelector(`[data-reward-field="${field}"]`);
const set=(el,value)=>{el.value=String(value);el.dispatchEvent({type:el.tagName==='INPUT'?'input':'change',target:el});};
function setup(){Object.assign(hooks.state,{mode:'editor',editorGameId:'srwf-final',editorSessionToken:'reward-token',editorBusy:false,busy:false,cueSaving:false,editorSetupOpen:false});$('editorWorkspace').hidden=false;
 hooks.installEditorRows({units:[],pilots:[],weapons:[],partNames:Array.from({length:23},(_,i)=>i===21?'변경할　수　있습니다．':`파츠${i}`),rewards:[{recordIndex:0,name:'보상 표 0',aliases:[0],capacity:0,editable:false},{recordIndex:1,name:'보상 표 1',aliases:[1],capacity:2,editable:true,part1:3,chance1:60,part2:4,chance2:20,statsValid:true,identity:`reward:1:${'a'.repeat(64)}`} ]});$('rewardTabButton').click();return hooks.state.editorRewards[1];}
test('reward fields preserve focus, reject combined totals, recover and join change/export state',()=>{
 const row=setup(),input=control('chance1');input.focus();set(input,90);assert.equal(row.chance1,60);assert.equal(input.getAttribute('aria-invalid'),'true');assert.equal(hooks.countEditorChanges(),0);
 set(input,70);assert.equal(row.chance1,70);assert.equal(input.getAttribute('aria-invalid'),null);assert.equal(document.activeElement,input);
 set(control('part2'),22);assert.equal(hooks.countEditorChanges(),2);assert.equal($('editorPresetSaveButton').disabled,false);
 assert.deepEqual(hooks.buildEditorExportRequest().rewardEdits,[{recordIndex:1,fields:{part1:3,chance1:70,part2:22,chance2:20}}]);
 assert.equal(control('part1').querySelectorAll('option')[20].textContent,'리페어 키트 S');
 $('editorChangesButton').click();const entry=$('editorChangesList').querySelector('button');entry.click();assert.equal(hooks.state.editorTab,'reward');assert.equal(document.activeElement,control('chance1'));
 $('rewardReset').click();assert.equal(row.chance1,60);assert.equal(row.part2,4);assert.equal(hooks.countEditorChanges(),0);
});
test('empty reward selectors and a busy session cannot mutate values',()=>{
 const row=setup();hooks.state.editorBusy=true;set(control('chance1'),50);assert.equal(row.chance1,60);hooks.state.editorBusy=false;
 set($('rewardSelector'),0);assert.equal($('rewardFields').children.length,0);assert.equal($('rewardReset').disabled,true);assert.equal(hooks.buildEditorExportRequest().rewardEdits.length,1);
});
