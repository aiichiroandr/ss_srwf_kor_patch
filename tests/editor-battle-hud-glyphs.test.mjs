import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareBattleHudGlyphs,planBattleHudNumericFields,planBattleHudIndicator,
 resolveBattleHudIndicatorSource} from '../assets/editor-battle-hud-glyphs.mjs';
import {expandBattleWebPicture} from '../assets/editor-battle-web-picture.mjs';

function compressed(payload){
 const out=[];let flag=-1,used=8;
 const bit=value=>{if(used===8){flag=out.length;out.push(0);used=0;}if(value)out[flag]|=1<<(7-used);used++;};
 for(const value of payload){bit(1);out.push(value);}bit(0);bit(1);out.push(0,0,0);return out;
}
function fixture({tiles=348,colors=48,width=40}={}){
 const bank=new Uint8Array(4+colors*2+tiles+tiles*32),b=new DataView(bank.buffer);
 b.setUint16(0,colors);b.setUint16(2,tiles);
 for(let palette=0;palette<colors/16;palette++)for(let index=1;index<16;index++)
  b.setUint16(4+(palette*16+index)*2,index<<(palette*5));
 const attr=4+colors*2,pixels=attr+tiles;
 for(let tile=0;tile<tiles;tile++){
  bank[attr+tile]=1;
  bank.fill(((tile%15+1)<<4)|(Math.floor(tile/15)%15+1),pixels+tile*32,pixels+(tile+1)*32);
 }
 const screen=new Uint8Array(20+40*4*2+40*8*2),s=new DataView(screen.buffer);
 screen.set([40,28],0);s.setUint32(4,24);screen.set([width,4],10);
 s.setUint32(12,24+40*4*2);screen.set([40,8],18);
 const bk=Uint8Array.from([0x62,0x6b,0x30,0x31,...compressed(bank)]);
 const sc=Uint8Array.from([0x73,0x63,0x30,0x31,...compressed(screen)]);
 const bytes=new Uint8Array(24+bk.length+sc.length),v=new DataView(bytes.buffer);
 for(let i=0;i<6;i++)v.setInt32(i*4,24-i*4);v.setInt32(20,24+bk.length-20);
 bytes.set(bk,24);bytes.set(sc,24+bk.length);return bytes;
}
const pixel=(picture,x,y)=>{const p=expandBattleWebPicture(picture);return [...p.pixels.slice((y*p.width+x)*4,(y*p.width+x)*4+4)];};
const expected=tile=>[0,(tile%15+1)<<3,0,255];

test('source HP/EN pairs and reaction 2x2 cells keep palette1 and native field dimensions',()=>{
 const result=prepareBattleHudGlyphs(fixture(),{gameId:'srwf-f'});
 assert.deepEqual(Object.keys(result).sort(),['en','hp','indicators','status']);
 for(let digit=0;digit<10;digit++){
  for(const [kind,base]of [['hp',3],['en',25]]){
   const glyph=result[kind].digits[digit];assert.equal(glyph.width,8);assert.equal(glyph.height,16);
   assert.deepEqual(pixel(glyph,0,0),expected(base+2*digit));
   assert.deepEqual(pixel(glyph,0,8),expected(base+2*digit+1));
  }
 }
 assert.deepEqual(pixel(result.hp.blank,0,0),expected(1));
 assert.deepEqual(pixel(result.en.blank,0,8),expected(24));
 assert.deepEqual(pixel(result.hp.hidden,0,0),expected(179));
 for(const [name,base]of [['counter',57],['guard',53],['evade',49]]){
  const glyph=result.indicators[name];assert.deepEqual([glyph.width,glyph.height],[16,16]);
  for(const [x,y,tile]of [[0,0,base],[8,0,base+1],[0,8,base+2],[8,8,base+3]])
   assert.deepEqual(pixel(glyph,x,y),expected(tile));
 }
});

test('999 infinity uses exact F/Final bottom rows, without borrowing a tile from another bank',()=>{
 const f=prepareBattleHudGlyphs(fixture(),{gameId:'srwf-f'}),final=prepareBattleHudGlyphs(fixture(),{gameId:'srwf-final'});
 for(let col=0;col<3;col++){
  assert.deepEqual(pixel(f.en.infinity,col*8,0),expected(176+col));
  assert.deepEqual(pixel(final.en.infinity,col*8,0),expected(176+col));
  assert.deepEqual(pixel(f.en.infinity,col*8,8),expected(24));
  assert.deepEqual(pixel(final.en.infinity,col*8,8),expected(342+col));
 }
 assert.throws(()=>prepareBattleHudGlyphs(fixture({tiles:344}),{gameId:'srwf-final'}),{code:'BATTLE_BACKGROUND_CELL_BOUNDS'});
});

test('prepared glyph ownership survives source mutation and typed subviews',()=>{
 const bytes=fixture(),storage=new Uint8Array(bytes.length+13);storage.set(bytes,7);
 const source=storage.subarray(7,7+bytes.length),first=prepareBattleHudGlyphs(source,{gameId:'srwf-f'});
 const second=prepareBattleHudGlyphs(source,{gameId:'srwf-f'}),before=expandBattleWebPicture(first.hp.digits[4]);
 source.fill(0);assert.deepEqual(expandBattleWebPicture(first.hp.digits[4]),before);
 const pixels=expandBattleWebPicture(second.hp.digits[4]);pixels.pixels.fill(0);
 assert.deepEqual(expandBattleWebPicture(first.hp.digits[4]),before);
});

test('glyph source rejects absent game context, broken pairing, bank shape and palette bounds',()=>{
 assert.throws(()=>prepareBattleHudGlyphs(fixture()),{code:'HUD_GLYPH_SOURCE_INVALID'});
 assert.throws(()=>prepareBattleHudGlyphs(fixture(),{gameId:'other'}),{code:'HUD_GLYPH_SOURCE_INVALID'});
 assert.throws(()=>prepareBattleHudGlyphs(fixture({width:39}),{gameId:'srwf-f'}),{code:'HUD_WINDOW_SOURCE_INVALID'});
 assert.throws(()=>prepareBattleHudGlyphs(fixture({colors:16}),{gameId:'srwf-f'}),{code:'BATTLE_BACKGROUND_CELL_BOUNDS'});
 const bytes=fixture();new DataView(bytes.buffer).setInt32(16,bytes.length-16);
 assert.throws(()=>prepareBattleHudGlyphs(bytes,{gameId:'srwf-f'}),{code:'HUD_WINDOW_SOURCE_INVALID'});
});

test('current right alignment, maximum left alignment and leading blanks follow original five/three-cell writer',()=>{
 const hp=planBattleHudNumericFields({selector:2,current:42,max:12345,hpMode:0}).placements;
 assert.deepEqual(hp.filter(p=>p.field==='current').map(p=>[p.glyph,p.x,p.y]),
  [['hp.blank',48,0],['hp.blank',56,0],['hp.blank',64,0],['hp.digits.4',72,0],['hp.digits.2',80,0]]);
 assert.deepEqual(hp.filter(p=>p.field==='max').map(p=>p.x),[96,104,112,120,128]);
 const en=planBattleHudNumericFields({selector:1,current:0,max:75,hpMode:0}).placements;
 assert.deepEqual(en.map(p=>[p.glyph,p.x,p.y]),
  [['en.blank',200,16],['en.blank',208,16],['en.digits.0',216,16],['en.digits.7',232,16],['en.digits.5',240,16],['en.blank',248,16]]);
});

test('HP hidden five-digit mode and exact EN999 infinity do not substitute hand-drawn characters',()=>{
 const hp=planBattleHudNumericFields({selector:0,current:10000,max:65535,hpMode:1}).placements;
 assert.equal(hp.length,10);assert.ok(hp.every(p=>p.glyph==='hp.hidden'));
 const ordinary=planBattleHudNumericFields({selector:2,current:9999,max:10000,hpMode:1}).placements;
 assert.deepEqual(ordinary.slice(0,5).map(p=>p.glyph),['hp.blank',...Array(4).fill('hp.digits.9')]);
 assert.ok(ordinary.slice(5).every(p=>p.glyph==='hp.hidden'));
 const en=planBattleHudNumericFields({selector:3,current:999,max:999,hpMode:0}).placements;
 assert.deepEqual(en,[{field:'current',glyph:'en.infinity',x:48,y:16,width:24,height:16},
  {field:'max',glyph:'en.infinity',x:80,y:16,width:24,height:16}]);
 for(const input of [{selector:4,current:1,max:1,hpMode:0},{selector:0,current:65536,max:1,hpMode:0},
  {selector:1,current:1000,max:1000,hpMode:0},{selector:0,current:1,max:1},{selector:0,current:-1,max:1,hpMode:0}])
  assert.throws(()=>planBattleHudNumericFields(input),{code:'HUD_GLYPH_SOURCE_INVALID'});
});

test('explicit UI choice distinguishes absent response from a source counter label',()=>{
 assert.deepEqual(planBattleHudIndicator({responseChoice:'none',side:'left'}),{status:'ready',placement:null});
 for(const [responseChoice,glyph]of [['counter','counter'],['guard','guard'],['evade','evade']])
  assert.deepEqual(planBattleHudIndicator({responseChoice,side:'right'}).placement,
   {glyph:`indicators.${glyph}`,x:288,y:8,width:16,height:16});
 assert.throws(()=>planBattleHudIndicator({responseChoice:'attack',side:'left'}),{code:'HUD_GLYPH_SOURCE_INVALID'});
});

test('native reaction class, directional packet selection and header counter suppression are independent',()=>{
 for(const directionBit6 of [0,0x4000])for(const directionBit7 of [0,0x8000])for(const actionClass of [0,1,2,3]){
  const sideStatusFlags=directionBit6?[0,actionClass<<2]:[actionClass<<2,0];
  const result=resolveBattleHudIndicatorSource({headerFlags:directionBit6|directionBit7,sideStatusFlags});
  const name=actionClass<2?'counter':actionClass===2?'guard':'evade';
  assert.equal(result.responseChoice,name);assert.equal(result.side,directionBit7?'right':'left');
  assert.equal(result.placement.glyph,`indicators.${name}`);assert.equal(result.placement.x,directionBit7?288:136);
  for(const suppress of [0x80,0x100,0x180]){
   const blockedCounter=resolveBattleHudIndicatorSource({headerFlags:directionBit6|directionBit7|suppress,sideStatusFlags});
   assert.equal(blockedCounter.placement===null,actionClass<2);
   assert.equal(blockedCounter.responseChoice,actionClass<2?'none':name);
  }
 }
 for(const sideStatusFlags of [[,0],[0,256],[0,-1],[0],new Uint8Array(2)])
  assert.throws(()=>resolveBattleHudIndicatorSource({headerFlags:0,sideStatusFlags}),{code:'HUD_GLYPH_SOURCE_INVALID'});
 const getter=[0,0];Object.defineProperty(getter,0,{get:()=>0});
 assert.throws(()=>resolveBattleHudIndicatorSource({headerFlags:0,sideStatusFlags:getter}),{code:'HUD_GLYPH_SOURCE_INVALID'});
});
