import test from 'node:test';import assert from 'node:assert/strict';
import {captureSrw4Import,rollbackSrw4Import,pendingSrw4Import}from'../assets/editor-srw4-undo.mjs';
const row=(recordIndex,extra={})=>({recordIndex,hp:3000,weaponList:{entries:[]},...extra});
test('bulk undo restores existing construction and keeps edits made before and after import',()=>{
 const before={units:[row(1,{construction:{preset:'s-gundam'},pendingConstruction:'s-gundam',hp:43210}),row(2)],weapons:[row(100)]};
 const after=structuredClone(before);Object.assign(after.units[0],{srw4Native:true,mapIcon:319,constructionGroup:'s-cruiser',ability2:17});Object.assign(after.units[1],{srw4Native:true,construction:{preset:'s-g-cruiser'},pendingConstruction:'s-g-cruiser'});
 const tx=captureSrw4Import(before,after),current=structuredClone(after);current.units[0].hp=45678;current.units[0].ability3=44;current.weapons[0].attack=7654;
 const snapshot=structuredClone(current),result=rollbackSrw4Import(tx,current);
 assert.equal(result.units[0].hp,45678);assert.equal(result.units[0].ability3,44);assert.equal(result.units[0].pendingConstruction,'s-gundam');assert.equal(result.units[0].srw4Native,undefined);assert.equal(result.units[0].constructionGroup,undefined);assert.equal(result.units[0].ability2,undefined);assert.deepEqual(result.units[1],before.units[1]);assert.equal(result.weapons[0].attack,7654);assert.deepEqual(current,snapshot);assert.equal(result.removed,1);
});
test('fresh package undo removes all seven forms and unreferenced clones together',()=>{
 const before={units:Array.from({length:7},(_,i)=>row(i+1)),weapons:[row(100)]},after=structuredClone(before);
 for(const r of after.units)Object.assign(r,{construction:{preset:'form'+r.recordIndex},pendingConstruction:'form'+r.recordIndex,srw4Native:true});Object.assign(after.weapons[0],{weaponClone:{sourceRecordIndex:1},pendingWeaponClone:1,attack:5000});
 const tx=captureSrw4Import(before,after);assert.deepEqual(rollbackSrw4Import(tx,after),{...before,removed:7,keptWeapons:[]});
 const current=structuredClone(after);current.units.push(row(20,{weaponList:{entries:[{weaponIndex:100}]}}));const result=rollbackSrw4Import(tx,current);assert.deepEqual(result.keptWeapons,[100]);assert.equal(result.weapons[0].attack,5000);assert.equal(result.units.at(-1).recordIndex,20);
});
test('pending JSON package can be undone but saved constructions are not treated as pending',()=>{
 const units=Array.from({length:7},(_,i)=>row(i+1,{srw4Native:true,pendingConstruction:'form',construction:{preset:'form'},constructionSource:row(i+1)})),weapons=[];
 const tx=pendingSrw4Import(units,weapons);assert(tx);assert.equal(rollbackSrw4Import(tx,{units,weapons}).units.filter(u=>u.srw4Native).length,0);
 delete units[0].pendingConstruction;assert.equal(pendingSrw4Import(units,weapons),null);
});
