import test from 'node:test';import assert from 'node:assert/strict';
import {COLLECTION_UNLOCK as p,collection} from './helpers/synthetic-overlay-windows.mjs';
const {inspectCollectionCode,setCollectionCode}=collection;
function fixture(){const b=new Uint8Array(p.execBytes);b.set(Buffer.from(p.original,'hex'),p.offset);return b;}
test('collection overlay is reversible and changes only the return instruction',()=>{const b=fixture(),on=setCollectionCode(b,true);assert.equal(inspectCollectionCode(on),true);assert.deepEqual(setCollectionCode(on,false),b);assert.equal(inspectCollectionCode(b),false);assert.deepEqual([...on.keys()].filter(i=>on[i]!==b[i]),[p.offset+p.returnOffset,p.offset+p.returnOffset+1]);assert.deepEqual(setCollectionCode(on,true),on);});
test('unknown opcode, extent and non-boolean requests fail closed',()=>{const b=fixture();b[p.offset]^=1;assert.throws(()=>setCollectionCode(b,true));assert.throws(()=>inspectCollectionCode(new Uint8Array(4)));assert.throws(()=>setCollectionCode(fixture(),1));});
import {buildPreset,serializePreset,parsePreset,planPresetApplication,applyPresetPlan} from '../assets/editor-preset.mjs';
test('collection option survives JSON and is skipped when the game has no matching option',()=>{
 const row={recordIndex:1,name:'도감·영상 전체 열람',editable:true,enabled:1,original:{enabled:0}};
 const preset=parsePreset(serializePreset(buildPreset({gameId:'srwf-final'},{collection:[row]})),{gameId:'srwf-final'});
 assert.equal(preset.entries.collection[0].fields[0].to,1);
 const target={...row,enabled:0},session={gameId:'srwf-final',units:[],pilots:[],weapons:[],collections:[target]};
 const plan=planPresetApplication(preset,session);assert.equal(plan.counts.apply,1);applyPresetPlan(plan,session,'matching');assert.equal(target.enabled,1);
 assert.equal(planPresetApplication(preset,{...session,collections:[]}).counts.skip,1);
});
