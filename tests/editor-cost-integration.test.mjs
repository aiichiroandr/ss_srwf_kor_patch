import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {installFakeDom,loadHtml} from './helpers/fake-dom.mjs';
const document=installFakeDom();loadHtml(document,await readFile(new URL('../index.html',import.meta.url),'utf8'));
const oldError=console.error;console.error=()=>{};
const {__testHooks:h}=await import('../assets/app.mjs');await new Promise(resolve=>setTimeout(resolve,0));console.error=oldError;

test('invalid cost drafts invalidate cached preview and recover without applying an invalid value',async()=>{
 Object.assign(h.state,{mode:'editor',editorGameId:'srwf-final',editorSessionToken:'cost',editorBusy:false,busy:false,cueSaving:false,editorSetupOpen:false});
 document.getElementById('editorWorkspace').hidden=false;
 h.installEditorRows({units:[],pilots:[],weapons:[],upgradeCosts:[{recordIndex:0,type:'unit',category:0,group:'기체 비용',name:'기체 비용 1단',level:0,maximum:1000,scale:10,cost:100,editable:true}]});
 const open=document.querySelector('[data-upgrade-cost-open="unit"]');assert.equal(open.disabled,false,JSON.stringify({busy:h.anyJobBusy(),rows:h.state.editorUpgradeCosts.length}));open.click();
 const input=document.body.querySelector('[data-upgrade-record="0"]');assert.ok(input);
 const revision=h.state.editorEditRevision;input.value='101';input.dispatchEvent({type:'input'});
 assert.equal(h.state.editorUpgradeCosts[0].cost,100);assert.ok(h.state.editorEditRevision>revision);
 assert.equal(h.sessionHasUnsavedEdits(),true,'an invalid draft alone needs protection');
 let prevented=false;h.warnWhileBusy({preventDefault(){prevented=true;},returnValue:null});assert.equal(prevented,true);
 await assert.rejects(h.getPreviewResources(),/개조 비용/);
 const invalidRevision=h.state.editorEditRevision;input.value='100';input.dispatchEvent({type:'input'});
 assert.ok(h.state.editorEditRevision>invalidRevision);assert.equal(h.validateEditorForms({report:false}),true);
});
