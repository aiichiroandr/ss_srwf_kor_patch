import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {FakeElement,installFakeDom,loadHtml} from './helpers/fake-dom.mjs';
import {syntheticSave} from './helpers/synthetic-save.mjs';
const document=installFakeDom();loadHtml(document,await readFile(new URL('../index.html',import.meta.url),'utf8'));
Object.defineProperty(FakeElement.prototype,'parentElement',{configurable:true,get(){return this.parentNode;}});
Object.defineProperty(FakeElement.prototype,'firstElementChild',{configurable:true,get(){return this.children[0]??null;}});
const logger=console.error;console.error=()=>{};
const {__testHooks:h}=await import('../assets/app.mjs');await new Promise(resolve=>setTimeout(resolve,0));console.error=logger;

test('edited cartridge saves participate in ROM replacement and page-leave protection',async()=>{
 Object.assign(h.state,{editorGameId:'srwf-final',editorSessionToken:'save-integration',editorBusy:false,editorActive:false,busy:false,cueSaving:false});
 h.installEditorRows({units:[],pilots:[],weapons:[],partNames:[],saveTitles:[]});
 const data=syntheticSave(),$=id=>document.getElementById(id);
 await h.saveEditor.load({name:'sample.bcr',size:data.raw.length,arrayBuffer:async()=>data.raw.buffer});
 $('saveCommonTab').click();$('saveMoney').value='1000';$('saveMoney').dispatchEvent({type:'input'});
 assert.equal(h.saveEditor.hasUnsavedEdits(),true);assert.equal(h.sessionHasUnsavedEdits(),true);
 let prevented=false;h.warnWhileBusy({preventDefault(){prevented=true;},returnValue:null});assert.equal(prevented,true);
 const previous=globalThis.confirm;let prompts=0;globalThis.confirm=()=>{prompts++;return false;};
 try{assert.equal(h.confirmReplaceEditorSession(),false);assert.equal(prompts,1);assert.equal($('saveMoney').value,'1000');}
 finally{globalThis.confirm=previous;}
 $('saveReset').click();assert.equal(h.saveEditor.hasUnsavedEdits(),false);assert.equal(h.sessionHasUnsavedEdits(),false);
});
