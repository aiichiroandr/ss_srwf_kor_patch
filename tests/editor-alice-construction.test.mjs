import test from 'node:test';import assert from 'node:assert/strict';
import {aliceEditorRow} from '../assets/editor-alice-crew-data.mjs';
import {connectDefaultAlice,cancelDefaultAlice} from '../assets/editor-alice-construction.mjs';
const row=()=>aliceEditorRow({enabled:false});
test('new Ex-S setup connects the proposed ALICE crew without replacing existing settings',()=>{
 const a=row();a.spBase=70;a.spirit1=1;const marker=connectDefaultAlice(a,430);
 assert.deepEqual([a.enabled,a.crewEnabled,a.spBase,a.spirit1],[1,1,70,1]);
 assert.equal(marker.rootId,430);assert.equal(a.original.enabled,0);
 assert.equal(cancelDefaultAlice(a,marker),true);
 assert.deepEqual([a.enabled,a.crewEnabled,a.spBase,a.spirit1],[0,0,70,1]);
});
test('loaded and explicit crew choices are preserved; other pairs do not detach ALICE',()=>{
 const a=row();assert.equal(connectDefaultAlice(a,430,{explicitChoice:true}),null);assert.equal(a.enabled,0);
 a.original.enabled=1;assert.equal(connectDefaultAlice(a,430),null);
 const b=row(),marker=connectDefaultAlice(b,430);assert.equal(cancelDefaultAlice(b,marker,{hasPair:true}),false);assert.equal(b.crewEnabled,1);
 assert.equal(connectDefaultAlice(undefined,430),null);
});
test('cancelling after later spirit edits preserves the edited identity and detaches only the crew',()=>{
 const a=row(),marker=connectDefaultAlice(a,430);a.spBase=88;
 assert.equal(cancelDefaultAlice(a,marker),true);assert.equal(a.enabled,1);assert.equal(a.crewEnabled,0);assert.equal(a.spBase,88);
});
