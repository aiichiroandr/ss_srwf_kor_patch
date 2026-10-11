import assert from 'node:assert/strict';import test from 'node:test';import{readFile}from'node:fs/promises';
import{installFakeDom,loadHtml}from'./helpers/fake-dom.mjs';
const document=installFakeDom();loadHtml(document,await readFile(new URL('../index.html',import.meta.url),'utf8'));
const logger=console.error;console.error=()=>{};const{__testHooks:hooks}=await import('../assets/app.mjs');await new Promise(r=>setTimeout(r,0));console.error=logger;
const $=id=>document.getElementById(id),control=field=>$('terrainFields').querySelector(`[data-terrain-field="${field}"]`);
const set=(el,value)=>{el.value=String(value);el.dispatchEvent({type:el.tagName==='INPUT'?'input':'change',target:el});};
function setup(){Object.assign(hooks.state,{mode:'editor',editorGameId:'srwf-final',editorSessionToken:'terrain-token',editorBusy:false,busy:false,cueSaving:false,editorSetupOpen:false});$('editorWorkspace').hidden=false;
 hooks.installEditorRows({units:[],pilots:[],weapons:[],terrains:[{recordIndex:4,name:'도시',avoidanceBonus:25,defenseBonus:25,hpRecovery:0,enRecovery:10,editable:true,statsValid:true,identity:`terrain:1:${'a'.repeat(64)}`} ]});$('terrainTabButton').click();return hooks.state.editorTerrains[0];}
test('terrain inputs reject invalid percentages without moving focus, recover, export and reset',()=>{
 const row=setup(),input=control('enRecovery');input.focus();set(input,101);assert.equal(row.enRecovery,10);assert.equal(hooks.countEditorChanges(),0);assert.equal(input.getAttribute('aria-invalid'),'true');assert.equal($('terrainReset').disabled,false);
 set(input,50);assert.equal(row.enRecovery,50);assert.equal(document.activeElement,input);assert.equal(input.getAttribute('aria-invalid'),null);assert.equal(hooks.countEditorChanges(),1);
 assert.deepEqual(hooks.buildEditorExportRequest().terrainEdits,[{recordIndex:4,fields:{avoidanceBonus:25,defenseBonus:25,hpRecovery:0,enRecovery:50}}]);
 $('editorChangesButton').click();$('editorChangesList').querySelector('button').click();assert.equal(hooks.state.editorTab,'terrain');assert.equal(document.activeElement,control('enRecovery'));
 $('terrainReset').click();assert.equal(row.enRecovery,10);assert.equal(hooks.countEditorChanges(),0);
});
test('terrain controls cannot mutate a busy session and special tabs keep generic panes hidden',()=>{
 const row=setup();hooks.state.editorBusy=true;set(control('hpRecovery'),20);assert.equal(row.hpRecovery,0);hooks.state.editorBusy=false;
 for(const id of ['unitEditorPanel','pilotEditorPanel','weaponEditorPanel','rewardEditorPanel'])assert.equal($(id).hidden,true);
 assert.equal($('terrainEditorPanel').hidden,false);$('rewardTabButton').click();assert.equal($('terrainEditorPanel').hidden,true);
});
test('clearing a loaded editor removes terrain controls before synchronizing the empty session',()=>{
 setup();assert.equal($('terrainFields').querySelectorAll('input').length,4);
 const messages=[];hooks.state.editorWorker={postMessage:message=>messages.push(message),terminate(){}};
 assert.doesNotThrow(()=>hooks.clearEditorState());
 assert.equal(hooks.state.editorSessionToken,null);
 assert.equal(hooks.state.editorWorker,null);
 assert.equal($('terrainFields').children.length,0);
 assert.equal($('terrainTileExamples').children.length,0);
 assert.equal($('terrainSelector').disabled,true);
 assert.equal($('terrainReset').disabled,true);
 assert.deepEqual(messages.map(message=>message.type),['RESET']);
});
