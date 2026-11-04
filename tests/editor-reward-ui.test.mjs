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
test('an invalid reward draft invalidates cached preview/output and correction to the old value clears it',async()=>{
 const row=setup(),input=control('chance1'),revision=hooks.state.editorEditRevision;
 set(input,90);assert.equal(row.chance1,60);assert.ok(hooks.state.editorEditRevision>revision);
 await assert.rejects(hooks.requestAnimationSource(),/보상/);
 await assert.rejects(hooks.getPreviewResources(),/보상/,'cached resources must not bypass current validation');
 const invalidRevision=hooks.state.editorEditRevision;set(input,60);
 assert.equal(input.getAttribute('aria-invalid'),null);assert.ok(hooks.state.editorEditRevision>invalidRevision);
 assert.equal(hooks.validateEditorForms({report:false}),true);
});
test('invalid reward drafts survive list and search changes and block export until fixed',async()=>{
 const row=setup();set(control('chance1'),90);
 $('rewardRecordList').querySelector('[data-record-id="0"]').click();
 assert.equal($('rewardFields').children.length,0);
 assert.equal(hooks.sessionHasUnsavedEdits(),true,'off-screen draft still needs protection');
 assert.equal(hooks.validateEditorForms({report:false}),false);
 assert.equal($('rewardFields').children.length,0,'silent validation must not change the selection');
 $('rewardRecordList').querySelector('[data-record-id="1"]').click();
 assert.equal(control('chance1').value,'90');assert.equal(control('chance1').getAttribute('aria-invalid'),'true');
 $('rewardSearch').value='파츠3';$('rewardSearch').dispatchEvent({type:'input'});
 assert.equal(control('chance1').value,'90');
 set(control('chance1'),60);assert.equal(row.chance1,60);assert.equal(hooks.validateEditorForms({report:false}),true);
});
test('unsaved and unapplied edits warn before leaving until a BIN download is requested',()=>{
 setup();set(control('chance1'),70);
 hooks.state.editorExportedRevision=0;
 assert.equal(hooks.sessionHasUnsavedEdits(),true);
 let prevented=false;hooks.warnWhileBusy({preventDefault(){prevented=true;},returnValue:null});assert.equal(prevented,true);
 hooks.state.workflowOutput={bin:new Blob(['result'])};hooks.state.editorDownloadUrls=['blob:bin','blob:cue'];
 hooks.state.workflowDirectOutput=true;$('editorDownloadBinLink').click();assert.equal(hooks.sessionHasUnsavedEdits(),true,'a stock output cannot save editor changes');
 hooks.state.workflowDirectOutput=false;
 $('editorDownloadBinLink').click();assert.equal(hooks.sessionHasUnsavedEdits(),false);
 set(control('chance1'),90);assert.equal(hooks.sessionHasUnsavedEdits(),true,'invalid drafts must not be lost even after a download');
 set(control('chance1'),70);assert.equal(hooks.validateEditorForms({report:false}),true);
 hooks.state.editorDownloadUrls=[];hooks.state.workflowOutput=null;
});
test('empty reward selectors and a busy session cannot mutate values',()=>{
 const row=setup();hooks.state.editorBusy=true;set(control('chance1'),50);assert.equal(row.chance1,60);hooks.state.editorBusy=false;
 $('rewardRecordList').querySelector('[data-record-id="0"]').click();assert.equal($('rewardFields').children.length,0);assert.equal($('rewardReset').disabled,true);assert.equal(hooks.buildEditorExportRequest().rewardEdits.length,1);
});

test('shared appearances are one-click rows with at most seven visible and every later page reachable',async()=>{
 const {createRewardEditor}=await import('../assets/editor-reward-ui.mjs');const row=setup(),opened=[];
 const appearances=Array.from({length:31},(_,i)=>({recordIndex:`0:${i}`,physicalIndex:0,scenarioSlots:[0],rewardSelector:1,name:`기체${i}`,x:i,y:0}));
 const ui=createRewardEditor({rows:()=>[row],canEdit:()=>true,partName:id=>`파츠${id}`,model:()=>({deployments:appearances}),onChange:()=>{},openUse:(kind,id)=>opened.push([kind,id])});
 ui.refresh();const list=$('rewardUsageList');assert.equal(list.querySelectorAll('button').length,7);list.querySelectorAll('button')[0].click();assert.deepEqual(opened,[['deployment','0:0']]);
 const ids=[];for(let i=0;i<5;i++){ids.push(...list.querySelectorAll('button').map(b=>b.textContent.split(' · ')[0]));if(!$('rewardUsageNext').disabled)$('rewardUsageNext').click();}
 assert.equal(new Set(ids).size,31);assert.equal($('rewardUsageNext').disabled,true);assert.equal($('rewardUsagePosition').textContent,'5 / 5');
});

test('desktop exposes every shared appearance and resizing to mobile restores bounded pages',async t=>{
 const width=window.innerWidth;t.after(()=>{window.innerWidth=width;});window.innerWidth=1280;
 const {createRewardEditor}=await import('../assets/editor-reward-ui.mjs');const row=setup();
 const appearances=Array.from({length:31},(_,i)=>({recordIndex:`0:${i}`,physicalIndex:0,scenarioSlots:[0],rewardSelector:1,name:`기체${i}`,x:i,y:0}));
 const ui=createRewardEditor({rows:()=>[row],canEdit:()=>true,partName:id=>`파츠${id}`,model:()=>({deployments:appearances}),onChange:()=>{}});
 ui.refresh();assert.equal($('rewardUsageList').querySelectorAll('button').length,31);assert.equal($('rewardUsageNext').disabled,true);
 window.innerWidth=430;ui.refresh();assert.equal($('rewardUsageList').querySelectorAll('button').length,7);assert.equal($('rewardUsageNext').disabled,false);
});
