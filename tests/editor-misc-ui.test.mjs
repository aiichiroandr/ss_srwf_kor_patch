import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {installFakeDom,loadHtml} from './helpers/fake-dom.mjs';
import {makeBase} from './helpers/synthetic-game.mjs';
const document=installFakeDom();loadHtml(document,await readFile(new URL('../index.html',import.meta.url),'utf8'));
const saved=console.error;console.error=()=>{};const {__testHooks:hooks}=await import('../assets/app.mjs');await new Promise(r=>setTimeout(r,0));console.error=saved;
const $=id=>document.getElementById(id);
test('collection unlock is a peer Misc tab, edits the same request and resets without another disclosure',async()=>{
 const {opened:{session,view}}=await makeBase({units:2});
 Object.assign(hooks.state,{mode:'editor',editorGameId:'srwf-final',editorSessionToken:session.sessionToken,editorBusy:false,busy:false});
 hooks.installEditorRows(view);assert.equal($('miscTabButton').hidden,false);
 $('miscTabButton').click();assert.equal(hooks.state.editorTab,'misc');assert.equal($('miscEditorPanel').hidden,false);
 assert.equal($('collectionUnlockSettings').closest('#miscEditorPanel'),$('miscEditorPanel'));
 assert.equal($('collectionUnlockSettings').tagName,'SECTION');assert.equal($('miscTabButton').getAttribute('aria-selected'),'true');
 for(const id of ['unitEditorPanel','pilotEditorPanel','weaponEditorPanel','rewardEditorPanel','terrainEditorPanel','scenarioEditorPanel'])assert.equal($(id).hidden,true,id);
 $('collectionUnlock').checked=true;$('collectionUnlock').dispatchEvent({type:'change',target:$('collectionUnlock')});
 assert.equal(hooks.buildEditorExportRequest().collectionUnlock,true);
 $('collectionUnlockReset').click();assert.equal(hooks.buildEditorExportRequest().collectionUnlock,false);
 $('weaponTabButton').click();assert.equal($('miscEditorPanel').hidden,true);assert.equal($('weaponTimeline').hidden,true);
 assert.equal($('weaponAnimationPanel').hidden,true);assert.equal($('weaponAnimationButton').getAttribute('aria-checked'),'false');
});
test('F Misc offers cartridge source connection while the unsupported collection patch remains hidden',async()=>{
 const {opened:{view}}=await makeBase({gameId:'srwf-f',units:2});hooks.state.editorGameId='srwf-f';hooks.installEditorRows(view);
 assert.equal($('miscTabButton').hidden,false);assert.equal($('collectionUnlockSettings').hidden,true);
 assert.equal($('srw4SourcePanel').closest('#miscEditorPanel'),$('miscEditorPanel'));
 assert.ok($('srw4SourcePanel').children.length>0);
});
