import test from 'node:test';
import assert from 'node:assert/strict';
import {ALICE_CREW_NATIVE,aliceCrewCode} from '../assets/editor-alice-crew-native.mjs';
import {ALICE_F_CODE_BASE,ALICE_F_CODE_LABELS,aliceFNativeCode} from '../assets/editor-alice-f-code.mjs';
import {executeAliceCrewSynthetic} from './helpers/alice-crew-vm.mjs';

// Synthetic execution of exact repository-authored SH-2 slots. The allocator
// and SP initializer are narrow ABI stubs, not actual Saturn/game runtime.
const PROFILES=Object.freeze([
 Object.freeze({name:'Final',ids:[430,431,432,433],code:ids=>aliceCrewCode(ids),base:ALICE_CREW_NATIVE.slotBase,actor:ALICE_CREW_NATIVE.base,pilot:ALICE_CREW_NATIVE.entryPilot,unitsGlobal:0x060b8568,pilotsGlobal:0x060b856c,create:0x0602d7b4,fillSP:0x0602c840,continueActor:0x06053560,continuePilot:0x0602cbd0}),
 Object.freeze({name:'F development template',ids:[348,349,350,351],code:ids=>aliceFNativeCode(ids),base:ALICE_F_CODE_BASE,actor:ALICE_F_CODE_BASE+ALICE_F_CODE_LABELS.actor,pilot:ALICE_F_CODE_BASE+ALICE_F_CODE_LABELS.pilot,unitsGlobal:0x060b2088,pilotsGlobal:0x060b208c,create:0x0602a208,fillSP:0x06029370,continueActor:0x0604db50,continuePilot:0x06029700}),
]);
const humans=(...slots)=>slots.map(slot=>({slot,id:10+slot,next:255,morale:40,sp:420}));
const live=rows=>rows.filter(row=>row.id!==0).map(({slot,id,flags,next,morale,sp})=>({slot,id,flags,next,morale,sp}));
const alices=result=>result.pilots.filter(row=>row.id===399);
const run=(profile,{units=[],pilots=[],entry='actor'}={})=>executeAliceCrewSynthetic({code:profile.code(profile.ids),base:profile.base,entry:profile[entry],profile,units,pilots,initialSp:325,initialMorale:100});
for(const profile of PROFILES){
 test(`${profile.name}: actual authored bytes initialize SP16 and separately copy human morale`,()=>{
  for(const target of[profile.ids[0],profile.ids[2]]){const first=run(profile,{units:[{slot:0,id:target,pilotSlot:0}],pilots:humans(0)});assert.deepEqual(alices(first).map(row=>[row.slot,row.next,row.sp,row.morale]),[[1,255,325,40]]);assert.equal(first.pilots[0].next,1);assert.deepEqual(first.calls,{create:1,fillSP:1});const spent=live(first.pilots).map(row=>row.id===399?{...row,sp:307,morale:7}:row),repeat=run(profile,{entry:'pilot',units:[{slot:0,id:target,pilotSlot:0}],pilots:spent});assert.equal(alices(repeat).length,1);assert.deepEqual(alices(repeat).map(row=>[row.sp,row.morale]),[[307,7]]);assert.deepEqual(repeat.calls,{create:0,fillSP:0});}
 });
 test(`${profile.name}: simultaneous crews, cruisers, swaps, exit/re-entry and reuse preserve SP16`,()=>{
  const[s,sCruiser,exs,gCruiser]=profile.ids,units=[{slot:0,id:s,pilotSlot:0},{slot:1,id:exs,pilotSlot:1},{slot:2,id:sCruiser,pilotSlot:0},{slot:3,id:gCruiser,pilotSlot:1}],first=run(profile,{units,pilots:humans(0,1)});assert.equal(alices(first).length,2);assert.deepEqual(first.pilots.slice(0,4).map(row=>[row.id,row.next,row.sp,row.morale]),[[10,2,420,40],[11,3,420,40],[399,255,325,40],[399,255,325,40]]);const spent=live(first.pilots).map(row=>row.id===399?{...row,sp:row.slot===2?309:417,morale:row.slot===2?9:17}:row),swapped=run(profile,{units:[{...units[0],pilotSlot:1},{...units[1],pilotSlot:0},{...units[2],pilotSlot:1},{...units[3],pilotSlot:0}],pilots:spent});assert.deepEqual(alices(swapped).map(row=>[row.sp,row.morale]),[[309,9],[417,17]]);assert.deepEqual(swapped.calls,{create:0,fillSP:0});const returned=run(profile,{units,pilots:live(swapped.pilots)}),outside=run(profile,{units:[],pilots:live(returned.pilots)});assert.deepEqual(outside.pilots.slice(0,4).map(row=>[row.id,row.next,row.sp,row.morale]),[[10,255,420,40],[11,255,420,40],[399,255,309,9],[399,255,417,17]]);const reentry=run(profile,{units:[{slot:0,id:exs,pilotSlot:1}],pilots:live(outside.pilots)});assert.equal(reentry.pilots[1].next,2);assert.deepEqual(alices(reentry).map(row=>[row.sp,row.morale]),[[309,9],[417,17]]);assert.deepEqual(reentry.calls,{create:0,fillSP:0});
 });
 test(`${profile.name}: stock subpilots survive and full pilot slots attach no new row`,()=>{
  const stock=run(profile,{units:[{slot:0,id:profile.ids[0],pilotSlot:0}],pilots:[{slot:0,id:10,next:1,morale:40,sp:420},{slot:1,id:77,flags:8,next:255,morale:33,sp:333}]});assert.deepEqual(stock.pilots.slice(0,3).map(row=>[row.id,row.next,row.sp,row.morale]),[[10,1,420,40],[77,2,333,33],[399,255,325,40]]);const full=run(profile,{units:[{slot:0,id:profile.ids[0],pilotSlot:0}],pilots:Array.from({length:128},(_,slot)=>({slot,id:slot+1,next:255,morale:slot===0?40:0,sp:slot===0?420:300}))});assert.equal(alices(full).length,0);assert.equal(full.pilots[0].next,255);assert.deepEqual(full.calls,{create:1,fillSP:0});
 });
}
