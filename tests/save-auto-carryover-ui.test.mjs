import test from 'node:test';
import assert from 'node:assert/strict';
import {findAutomaticCarryoverInputs} from '../assets/save-auto-carryover-ui.mjs';
function handle(name,size,header=''){
 return {kind:'file',name,async getFile(){return {name,size,slice(){return new Blob([header]);}}}};
}
const f=handle('mod.bin',578512032,'SEGA SEGASATURN T-20610G');
const final=handle('final.bin',521680656,'SEGA SEGASATURN T-20612G');
const save=handle('f-ch34.bkr',32768);
test('same-folder companion uses one F disc and one backup without choosing Final disc again',async()=>{
 const r=await findAutomaticCarryoverInputs([f,final,save,handle('another.txt',10)]);
 assert.equal(r.f.name,f.name);assert.equal(r.save.name,save.name);assert.equal(r.ambiguous,false);
});
test('multiple saves are not guessed and a verified already-open F can be reused',async()=>{
 const r=await findAutomaticCarryoverInputs([f,final,save,handle('other.bcr',65536)],{rememberedF:{name:'already linked'}});
 assert.equal(r.f.name,'already linked');assert.equal(r.save,null);assert.equal(r.ambiguous,true);
});
test('stale or cancelled folder inputs reveal no companion candidates',async()=>{
 let calls=0;
 const r=await findAutomaticCarryoverInputs([f,save],{stale:()=>++calls>1});
 assert.deepEqual(r,{});
});
test('an existing converted companion cannot compete with the original save',async()=>{
 const r=await findAutomaticCarryoverInputs([f,final,save,handle('FINAL-승계전용-f-ch34.bkr',32768)]);
 assert.equal(r.save.name,save.name);assert.equal(r.ambiguous,false);
});
