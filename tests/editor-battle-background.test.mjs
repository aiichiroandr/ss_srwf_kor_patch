import test from 'node:test';
import assert from 'node:assert/strict';
import {readBattleBackgroundLayout,initializeBattleBackgroundGroups,readBattleCommonScreen,readBattleScreenFragment,readBattleScreenFragments,readBattleBankPlaneMode,applyBattleScreenFragment,applyBattleBackgroundFragment,planBattleBackgroundSwitch} from '../assets/editor-battle-background.mjs';
import {recordTable} from './helpers/synthetic-tsr.mjs';
test('FE/FF background choice follows direction while preserving the prepared side identity and layout',()=>{
 const record=Uint8Array.of(0,2,0,0,0,0),commonData=recordTable([0,0,1],[Uint8Array.of(0),record]);
 const sides=[0,1].map(index=>({modeByte:0,pair:{index,screen:{formatByte:50},fragments:[{},{}]}}));
 for(const [selector,direction,expected]of [[254,0,0],[254,1,1],[255,0,1],[255,1,0]]){
  const plan=planBattleBackgroundSwitch({selector,sceneFlagsByte:1|(direction<<6),sides,commonData});
  assert.equal(plan.side,expected);assert.equal(plan.pair,sides[expected].pair);
  assert.equal(plan.tileOffset,expected?0x400:0);assert.equal(plan.paletteStart,expected?22:6);
  assert.equal(plan.groups.length,2);
 }
 assert.throws(()=>planBattleBackgroundSwitch({selector:0,sceneFlagsByte:0,sides,commonData}),/unresolved/);
 assert.throws(()=>planBattleBackgroundSwitch({selector:255,sceneFlagsByte:0,sides:[sides[0],null],commonData}),/not prepared/);
});
test('background copy keeps32-bit palette attributes, flips and native addition with both-edge wrapping',()=>{
 const fragment={width:2,height:2,cells:Uint32Array.of(0x20001,0x30002,0xffffffff,0)};
 for(let mode=0;mode<4;mode++){
  const plane=new Uint32Array(4096).fill(73);
  applyBattleBackgroundFragment(fragment,plane,{x:63,y:63,tileOffset:0x400,flags:0x20|mode});
  for(let row=0;row<2;row++)for(let col=0;col<2;col++){
   const x=(63+(mode&1?1-col:col))&63,y=(63+(mode&2?1-row:row))&63;
   assert.equal(plane[y*64+x],((fragment.cells[row*2+col]^(mode<<30))+0x20400)>>>0);
  }
  assert.equal(plane[65],73);
 }
 const plane=new Uint32Array(4096).fill(73);
 assert.throws(()=>applyBattleBackgroundFragment(fragment,plane,{x:0,y:0,tileOffset:-1,flags:0}),/unresolved/);
 assert.ok(plane.every(value=>value===73));
});
test('sc02 source XOR then ADD preserves carry across the flip bits instead of treating FFFFFFFF as no-write',()=>{
 const expected=[0x000203ff,0xc00203ff,0x800203ff,0x400203ff];
 for(let mode=0;mode<4;mode++){
  const plane=new Uint32Array(4096).fill(73);
  const result=applyBattleBackgroundFragment({width:1,height:1,cells:Uint32Array.of(0xffffffff)},
   plane,{x:0,y:0,tileOffset:0x400,flags:0x20|mode});
  assert.equal(result.cellsWritten,1);assert.equal(plane[0],expected[mode]);
  assert.equal(plane[1],73);
 }
 const plane=new Uint32Array(4096);
 applyBattleBackgroundFragment({width:1,height:1,cells:Uint32Array.of(0x3fffffff)},plane,
  {x:0,y:0,tileOffset:0x400,flags:0x21});
 assert.equal(plane[0],0x800203ff);
});
test('32-bit battle screen fragments preserve upper attributes and cannot enter a16-bit plane copier',()=>{
 const payload=new Uint8Array(28),v=new DataView(payload.buffer);v.setUint32(4,16);
 payload.set([2,2],10);[0xffffffff,0x70001,0x20002,0].forEach((cell,i)=>v.setUint32(12+i*4,cell));
 const fragment=readBattleScreenFragment({formatByte:50,payload},0);
 assert.ok(fragment.cells instanceof Uint32Array);assert.equal(fragment.cells[0],0xffffffff);
 assert.equal(fragment.cells[1],0x70001);
 assert.throws(()=>applyBattleScreenFragment(fragment,new Uint16Array(4096),{x:0,y:0,flags:0,tileOffset:0}),/unresolved/);
});
test('screen copy mirrors cell order and tile bits, wrapping both edges without overwriting other cells',()=>{
 const fragment={width:2,height:2,cells:Uint16Array.of(1,2,3,65535)};
 for(let mode=0;mode<4;mode++){
  const plane=new Uint16Array(4096).fill(123);
  const x=mode===1?61:63;
  applyBattleScreenFragment(fragment,plane,{x,y:63,tileOffset:2,flags:0x20|mode});
  for(let row=0;row<2;row++)for(let col=0;col<2;col++){
   const dx=(x+(mode&1?1-col:col))&63,dy=(63+(mode&2?1-row:row))&63;
   assert.equal(plane[dy*64+dx],((fragment.cells[row*2+col]+0x2002)^(mode<<10))&65535);
  }
  assert.equal(plane[65],123);assert.equal(plane.filter(value=>value!==123).length,4);
 }
 const plane=new Uint16Array(4096).fill(73);
 assert.throws(()=>applyBattleScreenFragment(fragment,plane,{x:63,y:0,flags:1,tileOffset:0}),/unverified/);
 assert.throws(()=>applyBattleScreenFragment(fragment,plane,{x:0,y:0,flags:0,tileOffset:-1}),/unresolved/);
 assert.ok(plane.every(value=>value===73));
});
test('screen fragments return only selected packed cells using the native header bias',()=>{
 const payload=new Uint8Array(30),v=new DataView(payload.buffer);
 v.setUint32(4,24);payload.set([2,1],10);v.setUint32(12,28);payload.set([1,3],18);
 [0x8001,0x0402,3,4,5].forEach((word,i)=>v.setUint16(20+i*2,word));
 const screen={formatByte:49,payload};
 assert.deepEqual([...readBattleScreenFragment(screen,0).cells],[0x8001,0x0402]);
 assert.deepEqual([...readBattleScreenFragment(screen,1).cells],[3,4,5]);
 assert.throws(()=>readBattleScreenFragment(screen,2),/directory/);
 v.setUint32(12,32);assert.throws(()=>readBattleScreenFragment(screen,1),/outside source/);
});
test('selected bank screen directory terminator is not decoded as an extra frame',()=>{
 const payload=new Uint8Array(28),v=new DataView(payload.buffer);
 v.setUint32(4,20);payload.set([1,1],10);v.setUint32(12,0xffffffff);v.setUint32(16,7);
 const screen={formatByte:50,payload};
 assert.equal(readBattleScreenFragments(screen).length,1);
 assert.deepEqual([...readBattleScreenFragments(screen)[0].cells],[7]);
 v.setUint32(12,0);assert.throws(()=>readBattleScreenFragments(screen),/terminator/);
});
test('common screen cell6 is decoded at its normalized target without adding24 twice',()=>{
 const screen=Uint8Array.of(0x73,0x63,0x30,0x31,0xa0,65,0,0,0);
 const bytes=recordTable([0,0,0,0,0,0,0],[screen]);
 const decoded=readBattleCommonScreen(bytes);
 assert.equal(decoded.formatByte,49);assert.deepEqual(decoded.payload,Uint8Array.of(65));
 assert.equal(decoded.recordOffset,28);assert.equal(decoded.compressedEnd,bytes.length);
 assert.throws(()=>readBattleCommonScreen(bytes,5),/unsupported/);
 const truncated=bytes.slice(0,-1);assert.throws(()=>readBattleCommonScreen(truncated),/END token/);
 const invalid=bytes.slice();invalid[28]=0;assert.throws(()=>readBattleCommonScreen(invalid),/sc0/);
});
test('owned mode layouts retain separate groups and native duplicated rows with end markers',()=>{
 const record=new Uint8Array(26),v=new DataView(record.buffer);
 v.setUint16(0,2);record.set([2,1,9,10],2);
 [[16,32],[64,128],[256,512]].forEach(([factor,control],i)=>{v.setUint16(6+i*4,factor);v.setUint16(8+i*4,control);});
 const bytes=recordTable([0,0,1],[Uint8Array.of(0),record]);
 const layout=readBattleBackgroundLayout(bytes,0);assert.deepEqual(layout.counts,[2,1,9,10]);
 const groups=initializeBattleBackgroundGroups(layout);
 assert.deepEqual(groups[0].records.map(r=>r.factor),[16,64,16,64,0]);
 assert.deepEqual(groups[1].records.map(r=>r.control),[512,512,512]);
 assert.ok(groups.every(g=>g.records.every(r=>r.offset===0&&r.secondaryOffset===0)));
 assert.equal(readBattleBackgroundLayout(bytes,255),null);
 groups[0].records[0].factor=99;assert.equal(layout.groups[0].entries[0].factor,16);
});
test('unresolved background layouts never become empty groups or guessed retained end rows',()=>{
 assert.equal(readBattleBackgroundLayout(new Uint8Array(12),0),null);
 assert.equal(initializeBattleBackgroundGroups(null),null);
 assert.equal(initializeBattleBackgroundGroups({groups:[{count:64,entries:[]},{count:0,entries:[]}]}),null);
 const groups=initializeBattleBackgroundGroups({groups:[{count:0,entries:[]},{count:0,entries:[]}]});
 assert.equal(groups[0].records.length,1);assert.equal(groups[0].records[0].control,512);
});

test('selected bank source mode maps to a plane separately from the bank directory index',()=>{
 assert.equal(readBattleBankPlaneMode(0x4101),3);
 assert.equal(readBattleBankPlaneMode(0x4102),3);
 assert.equal(readBattleBankPlaneMode(0x1000),1);
 assert.equal(readBattleBankPlaneMode(0x2000),2);
 assert.equal(readBattleBankPlaneMode(0x3000),0);
 assert.equal(readBattleBankPlaneMode(0xffff),null);
 assert.throws(()=>readBattleBankPlaneMode(65536));
});
