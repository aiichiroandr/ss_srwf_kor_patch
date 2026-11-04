import assert from 'node:assert/strict';import test from 'node:test';
import { readUpgradeCosts, updateUpgradeCosts, costValueAllowed } from '../assets/editor-costs.mjs';
import { exportEditedImage } from '../assets/editor-core.mjs';
import { makeBase, descriptorFor } from './helpers/synthetic-game.mjs';
import { echoRequest } from './helpers/synthetic-iso.mjs';
import { buildPreset, parsePreset, serializePreset, applyPreset } from '../assets/editor-preset.mjs';
function table(){const bytes=new Uint8Array(384),v=new DataView(bytes.buffer);[16,116,216,296].forEach((s,i)=>v.setInt32(i*4,s-i*4));for(let i=116;i<216;i+=2)v.setUint16(i,1000+i);for(let i=296;i<384;i+=2)v.setUint16(i,500+i);return{start:3000,bytes};}
for(const game of ['srwf-f','srwf-final'])test(`${game}: all upgrade costs, max values, fresh reopen and preserved unit bits`,async()=>{
 const t=table(),base=await makeBase({gameId:game,units:8,costTable:t.bytes}),view=base.opened.view;
 assert.equal(view.upgradeCosts.length,94);assert.deepEqual(view.upgradeCosts.filter(r=>r.type==='unit'&&r.level===0).map(r=>r.group),['한계 반응','장갑','EN','HP','운동성']);
 const request=echoRequest(base.opened.session,view);
 for(const edit of request.unitEdits){const row=view.units.find(r=>r.recordIndex===edit.recordIndex);edit.fields.killMoney=row.editable?65535:row.killMoney;edit.fields.partSlots=row.editable?4:row.partSlots;}
 request.upgradeCostEdits=view.upgradeCosts.map(row=>({recordIndex:row.recordIndex,fields:{cost:row.maximum}}));
 const result=await exportEditedImage(base.opened.session,request),opened=await base.full.inspectPatchedImage(result.outputBlob,descriptorFor(base.disc,{gameId:game,imageKind:'local'}));
 for(const row of opened.view.upgradeCosts)assert.equal(row.cost,row.maximum);
 for(const row of opened.view.units){const before=view.units.find(r=>r.recordIndex===row.recordIndex);assert.equal(row.killMoney,before.editable?65535:before.killMoney);assert.equal(row.partSlots,before.editable?4:before.partSlots);assert.equal(row.identity,before.identity);}
 const original=base.opened.session.root[27].bytes,after=opened.session.root[27].bytes;
 const allowed=new Set();for(const row of view.units.filter(r=>r.editable)){allowed.add(row.byteOffset+20);allowed.add(row.byteOffset+21);allowed.add(row.byteOffset+25);assert.equal(original[row.byteOffset+25]&~48,after[row.byteOffset+25]&~48);}
 for(let i=0;i<original.length;i++)if(!allowed.has(i))assert.equal(after[i],original[i]);
 assert.deepEqual(opened.session.root[31].bytes.slice(16,116),t.bytes.slice(16,116));assert.deepEqual(opened.session.root[31].bytes.slice(216,296),t.bytes.slice(216,296));
});
test('cost edits reject overflow, wrong scale, accessors and partial invalid requests atomically',()=>{
 for(const cost of [-1,655351,11,NaN,0.5]){const t=table(),before=t.bytes.slice();assert.throws(()=>updateUpgradeCosts(t,'srwf-final',[{recordIndex:0,fields:{cost:200}},{recordIndex:50,fields:{cost}}]),e=>e.code==='EDITOR_COST_INVALID');assert.deepEqual(t.bytes,before);}
 const t=table(),rows=readUpgradeCosts(t,'srwf-final');assert.equal(rows[50].scale,10);assert.equal(costValueAllowed(rows[50],655350),true);assert.equal(costValueAllowed(rows[0],655350),false);
 const fields={};Object.defineProperty(fields,'cost',{get(){throw Error('getter executed');}});assert.throws(()=>updateUpgradeCosts(t,'srwf-final',[{recordIndex:50,fields}]),e=>e.code==='EDITOR_COST_INVALID');
});
test('cost presets use actual amounts, reject wrong game steps and preserve other rows',()=>{
 const rows=readUpgradeCosts(table(),'srwf-final').map(r=>({...r,original:{cost:r.cost}}));rows[50].cost=655350;
 const preset=parsePreset(serializePreset(buildPreset({gameId:'srwf-final'},{upgrade:rows}))),target=readUpgradeCosts(table(),'srwf-final').map(r=>({...r,original:{cost:r.cost}}));
 assert.equal(applyPreset(preset,{gameId:'srwf-final',upgradeCosts:target},'all').applied,1);assert.equal(target[50].cost,655350);assert.equal(target[51].cost,rows[51].cost);
 const raw=buildPreset({gameId:'srwf-final'},{upgrade:rows});raw.upgradeCosts[0].fields.cost.to=11;
 assert.equal(applyPreset(parsePreset(JSON.stringify(raw)),{gameId:'srwf-final',upgradeCosts:target},'all').applied,0);
});
