import {cropBattleEffectPicture} from '../assets/editor-battle-effect-picture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createBattleBankScreenState} from '../assets/editor-battle-bank-screen-state.mjs';
const record=(slot,red)=>({slot,status:'ready',planeMode:3,fragments:[{}],images:[{
 width:8,height:8,pixels:Uint8ClampedArray.from({length:256},(_,i)=>i%4===0?red:i%4===3?255:0)}]});
const terminalRecord=(width,height)=>{
 const item=record(0,80),payload=new Uint8Array(24),v=new DataView(payload.buffer);
 v.setUint32(4,20);payload.set([1,1],10);v.setUint32(12,0xffffffff);payload.set([width,height],18);
 item.screen={formatByte:50,payload};return item;
};
test('selected source resources share their actual plane and overwrite only copied pixels',()=>{
 const state=createBattleBankScreenState([record(0,30),record(1,80)],{getDirection:()=>({bit6:false,bit7:false})});
 state.copy({resourceIndex:0,fragmentIndex:0,x:0,y:0,flags:0});
 state.copy({resourceIndex:1,fragmentIndex:0,x:1,y:0,flags:0});
 const snapshot=state.snapshot();assert.equal(snapshot.length,1);assert.equal(snapshot[0].planeIndex,2);
 assert.equal(snapshot[0].pixels[0],30);assert.equal(snapshot[0].pixels[32],80);
 assert.equal(snapshot[0].revision,2);snapshot[0].pixels[0]=0;assert.equal(state.snapshot()[0].pixels[0],30);
 assert.throws(()=>state.copy({resourceIndex:2,fragmentIndex:0,x:0,y:0,flags:0}),{code:'BATTLE_SCREEN_RESOURCE_UNLOADED'});
 assert.throws(()=>state.copy({resourceIndex:0,fragmentIndex:0,x:0,y:0,flags:16}),{code:'BATTLE_SCREEN_RESOURCE_UNLOADED'});
 assert.equal(state.snapshot()[0].revision,2);
});
test('source facing and both-edge wrapping preserve selected frame pixels',()=>{
 const item=record(0,0);item.images[0].pixels[0]=90;
 const state=createBattleBankScreenState([item],{getDirection:()=>({bit6:true,bit7:false})});
 const result=state.copy({resourceIndex:0,fragmentIndex:0,x:0,y:63,flags:0});
 assert.equal(result.x,39);assert.equal(result.flags,1);
 assert.equal(state.snapshot()[0].pixels[(504*512+319)*4],90);
});

test('owned terminal screen copies preserve existing pixels in every flip mode and selected plane',()=>{
 for(const [width,height]of [[0,0],[0,29],[7,0]])for(let mode=0;mode<4;mode++){
  const state=createBattleBankScreenState([terminalRecord(width,height)],{getDirection:()=>({bit6:false,bit7:false})});
  state.copy({resourceIndex:0,fragmentIndex:0,x:0,y:0,flags:0});
  const before=state.snapshot()[0],result=state.copy({resourceIndex:0,fragmentIndex:1,x:3,y:4,flags:mode});
  assert.deepEqual(result,{planeIndex:2,x:3,y:4,flags:mode,cellsWritten:0,empty:true});
  const after=state.snapshot()[0];assert.deepEqual(after.pixels,before.pixels);
  assert.equal(after.revision,before.revision);assert.equal(after.scrollX,3);assert.equal(after.scrollY,4);
 }
});

test('proved original no-write cell aliases retain pixels in every facing and copy mode',()=>{
 for(const facing of [false,true])for(const flags of [0,1,2,3,4,8]){
  const item=terminalRecord(0,0),payload=new Uint8Array(40);payload.set(item.screen.payload);item.screen.payload=payload;
  const state=createBattleBankScreenState([item],{getDirection:()=>({bit6:facing,bit7:false})});
  state.copy({resourceIndex:0,fragmentIndex:0,x:0,y:0,flags:0});const before=state.snapshot();
  const command={resourceIndex:0,fragmentIndex:2,x:3,y:4,flags},sourceCommand=Uint8Array.of(0xfa,0xc4,0,2,3,4,flags);
  assert.throws(()=>state.copy(command),{code:'BATTLE_SCREEN_RESOURCE_UNLOADED'});
  const result=state.copy(command,{sourceCommand});
  assert.equal(result.cellsWritten,0);assert.equal(result.noWriteKind,'bounded-cell-zero-height-no-write');
  assert.equal(result.x,facing?37:3);assert.equal(result.y,4);
  const after=state.snapshot();assert.equal(after.length,before.length);
  assert.deepEqual(after[0].pixels,before[0].pixels);assert.equal(after[0].revision,before[0].revision);
  payload[20]=1;
  assert.throws(()=>state.copy(command,{sourceCommand}),{code:'BATTLE_SCREEN_RESOURCE_UNLOADED'});
 }
});
test('empty screen destination bookkeeping follows facing and explicit plane overrides without drawing',()=>{
 const state=createBattleBankScreenState([terminalRecord(7,0)],{getDirection:()=>({bit6:true,bit7:false})});
 assert.deepEqual(state.copy({resourceIndex:0,fragmentIndex:1,x:3,y:4,flags:4}),
  {planeIndex:0,x:30,y:4,flags:1,cellsWritten:0,empty:true});
 assert.deepEqual(state.copy({resourceIndex:0,fragmentIndex:1,x:3,y:4,flags:8}),
  {planeIndex:1,x:30,y:4,flags:1,cellsWritten:0,empty:true});
 assert.deepEqual(state.snapshot(),[]);
});
test('missing resources, nonterminal indices, nonempty sentinel views and palette transfers stay fail closed',()=>{
 const item=terminalRecord(0,29),state=createBattleBankScreenState([item],{getDirection:()=>({bit6:false,bit7:false})});
 for(const change of [{resourceIndex:1},{fragmentIndex:2},{flags:16}]){
  assert.throws(()=>state.copy({resourceIndex:0,fragmentIndex:1,x:0,y:0,flags:0,...change}),
   {code:'BATTLE_SCREEN_RESOURCE_UNLOADED'});
 }
 item.screen.payload[18]=1;
 assert.throws(()=>state.copy({resourceIndex:0,fragmentIndex:1,x:0,y:0,flags:0}),{code:'BATTLE_SCREEN_RESOURCE_UNLOADED'});
 item.screen.payload[18]=0;item.screen.payload[12]=0;
 assert.throws(()=>state.copy({resourceIndex:0,fragmentIndex:1,x:0,y:0,flags:0}),{code:'BATTLE_SCREEN_RESOURCE_UNLOADED'});
 assert.throws(()=>state.copy({resourceIndex:0,fragmentIndex:1,x:0,y:0,flags:-1}),/invalid copy/);
 assert.deepEqual(state.snapshot(),[]);
});
test('an unselected unsupported fragment does not block another source image, but its own copy preserves the typed error',()=>{
 const item=record(0,80);item.fragments.push({index:1});item.images.push(null);
 item.imageErrors=[null,{code:'BATTLE_BACKGROUND_CELL_BOUNDS',reason:'Battle background pixels: cell outside paired bank',
  cellIndex:7,cellOffset:72,cell:0x00ff0104,tile:260,palette:127,tileCount:260,colorCount:32,boundary:'tile-and-palette'}];
 const state=createBattleBankScreenState([item],{getDirection:()=>({bit6:false,bit7:false})});
 state.copy({resourceIndex:0,fragmentIndex:0,x:0,y:0,flags:0});
 const before=state.snapshot();
 assert.throws(()=>state.copy({resourceIndex:0,fragmentIndex:1,x:4,y:5,flags:0}),
  error=>error.code==='BATTLE_BACKGROUND_CELL_BOUNDS'&&error.resourceIndex===0&&error.fragmentIndex===1
   &&error.details.cellIndex===7&&error.details.cellOffset===72&&error.details.tile===260);
 assert.deepEqual(state.snapshot(),before);
});
test('a selected palette-only slot stays owned but has no screen metadata or guessed picture',()=>{
 const item={...record(0,80),screenStatus:'absent',screen:null,fragments:[],images:[],imageErrors:[]};
 const state=createBattleBankScreenState([item],{getDirection:()=>({bit6:false,bit7:false})});
 assert.equal(state.hasResource(0),true);
 assert.throws(()=>state.copy({resourceIndex:0,fragmentIndex:0,x:0,y:0,flags:0}),{code:'BATTLE_SCREEN_RESOURCE_UNLOADED'});
 assert.deepEqual(state.snapshot(),[]);
 assert.throws(()=>createBattleBankScreenState([{...item,screen:{payload:new Uint8Array(16)}}],
  {getDirection:()=>({bit6:false,bit7:false})}),/identity/);
});
test('an unresolved image cannot be substituted without its exact supported-error identity',()=>{
 const item=record(0,80);item.images[0]=null;
 for(const imageErrors of [undefined,[],[null],[{code:'UNKNOWN',reason:'bad'}],[{code:'BATTLE_BACKGROUND_CELL_BOUNDS'}]]){
  assert.throws(()=>createBattleBankScreenState([{...item,...(imageErrors===undefined?{}:{imageErrors})}],
   {getDirection:()=>({bit6:false,bit7:false})}),/identity/);
 }
 const valid=record(0,80);valid.imageErrors=[{code:'BATTLE_BACKGROUND_CELL_BOUNDS',reason:'bad'}];
 assert.throws(()=>createBattleBankScreenState([valid],{getDirection:()=>({bit6:false,bit7:false})}),/identity/);
 const hole=record(0,80);hole.images=new Array(1);
 assert.throws(()=>createBattleBankScreenState([hole],{getDirection:()=>({bit6:false,bit7:false})}),/identity/);
});

test('effect pixels follow the published scene palette after a copy, preserving transparent overwrites',()=>{
 const item=record(0,80),image=item.images[0];
 image.colorIndices=new Uint8Array(64);image.paletteIndices=new Uint8Array(64);
 image.colorIndices[0]=1;image.colorIndices[1]=2;image.paletteIndices[1]=1;
 const words=new Uint16Array(1024);words[513]=0x001f;words[530]=0x03e0;words[529]=0x7c00;
 const state=createBattleBankScreenState([item],{getDirection:()=>({bit6:false,bit7:false}),
  getPalette:()=>({words,offset:512})});
 state.copy({resourceIndex:0,fragmentIndex:0,x:0,y:0,flags:0});
 const first=state.snapshot()[0];
 assert.deepEqual([...first.pixels.slice(0,12)],[248,0,0,255,0,248,0,255,0,0,0,0]);
 words[513]=0x7fff;
 assert.deepEqual([...state.snapshot()[0].pixels.slice(0,4)],[248,248,248,255]);
 assert.deepEqual([...first.pixels.slice(0,4)],[248,0,0,255]);
 state.copy({resourceIndex:0,fragmentIndex:0,x:0,y:0,flags:16});
 assert.deepEqual([...state.snapshot()[0].pixels.slice(0,4)],[0,0,248,255]);
 state.clear(2);assert.ok(state.snapshot()[0].pixels.every(n=>n===0));
});


test('light-effect provenance is pinned, unknown or mixed carriers cannot gain an exclusive weapon-bank profile',()=>{
 const first={...record(0,30),source:{fileName:'E_BNK.BIN'}},unknown=record(1,80);
 const common={...record(15,90),source:{fileName:'BTSR.BIN',sourceTableCell:8,mapTableCell:9},paletteLoadBase:92};
 const state=createBattleBankScreenState([first,unknown,common],{getDirection:()=>({bit6:false,bit7:false})});
 first.source.fileName='BTSR.BIN';
 state.copy({resourceIndex:0,fragmentIndex:0,x:0,y:0,flags:0});
 assert.deepEqual(state.snapshot()[0].sourceCarriers,['E_BNK.BIN']);
 state.copy({resourceIndex:15,fragmentIndex:0,x:1,y:0,flags:0});
 assert.deepEqual(state.snapshot()[0].sourceCarriers,['BTSR.BIN','E_BNK.BIN']);
 state.clear(2);assert.deepEqual(state.snapshot()[0].sourceCarriers,[]);
 state.copy({resourceIndex:1,fragmentIndex:0,x:0,y:0,flags:0});
 assert.deepEqual(state.snapshot()[0].sourceCarriers,['unresolved']);
});

test('cropped snapshots retain exact offsets and copied ownership through overwrite and clear',()=>{
 const state=createBattleBankScreenState([record(0,30)],{getDirection:()=>({bit6:false,bit7:false})});
 const compare=()=>{
  const full=state.snapshot()[0],compact=state.snapshot({cropped:true})[0];
  assert.equal(compact.revision,full.revision);assert.deepEqual(compact.picture,cropBattleEffectPicture(full));return compact.picture;
 };
 state.copy({resourceIndex:0,fragmentIndex:0,x:3,y:4,flags:0});
 const first=compare();assert.deepEqual([first.x,first.y,first.width,first.height],[24,32,8,8]);
 first.pixels[0]=99;assert.equal(compare().pixels[0],30);
 state.copy({resourceIndex:0,fragmentIndex:0,x:5,y:6,flags:0});
 assert.deepEqual([compare().width,compare().height],[24,24]);
 assert.equal(first.width,8);assert.equal(first.pixels[0],99);
 state.clear(2);assert.equal(compare(),null);
 state.copy({resourceIndex:0,fragmentIndex:0,x:0,y:0,flags:0});assert.equal(compare().width,8);
 assert.throws(()=>state.snapshot({cropped:'true'}),/invalid snapshot/);
});
test('palette-only changes refresh cropped colors while preserving occupied bounds and old frames',()=>{
 const item=record(0,0),image=item.images[0];image.colorIndices=new Uint8Array(64).fill(1);image.paletteIndices=new Uint8Array(64);
 const words=new Uint16Array(1024);words[1]=31;
 const state=createBattleBankScreenState([item],{getDirection:()=>({bit6:false,bit7:false}),getPalette:()=>({words,offset:0})});
 state.copy({resourceIndex:0,fragmentIndex:0,x:2,y:3,flags:0});
 const before=state.snapshot({cropped:true})[0];words[1]=31<<10;
 const after=state.snapshot({cropped:true})[0];assert.equal(before.revision,after.revision);
 assert.deepEqual([after.picture.x,after.picture.y,after.picture.width,after.picture.height],[16,24,8,8]);
 assert.deepEqual([...before.picture.pixels.slice(0,4)],[248,0,0,255]);
 assert.deepEqual([...after.picture.pixels.slice(0,4)],[0,0,248,255]);
});
