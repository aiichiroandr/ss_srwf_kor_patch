import test from 'node:test';import assert from 'node:assert/strict';
import {createBattleWebHud} from '../assets/editor-battle-web-hud.mjs';
import {expandBattleWebPicture,prepareBattleWebPicture} from '../assets/editor-battle-web-picture.mjs';
const picture=(width,height,color)=>prepareBattleWebPicture({width,height,pixels:Uint8Array.from({length:width*height*4},(_,i)=>color[i%4])});
const digits=base=>Array.from({length:10},(_,n)=>picture(8,16,[base+n,1,2,255]));
const glyphs={status:'ready',hp:{digits:digits(10),blank:picture(8,16,[3,4,5,255]),hidden:picture(8,16,[6,7,8,255])},en:{digits:digits(40),blank:picture(8,16,[9,10,11,255]),infinity:picture(24,16,[12,13,14,255])},indicators:{counter:picture(16,16,[15,16,17,255]),guard:picture(16,16,[18,19,20,255]),evade:picture(16,16,[21,22,23,255])}};
const at=(image,x,y)=>[...image.pixels.subarray((y*320+x)*4,(y*320+x)*4+4)];
test('native numeric slots preserve frame, glyph colors and vertical alignment across loop reset',()=>{
 const frame=picture(320,32,[24,48,72,255]);
 const hud=createBattleWebHud({picture:frame,glyphs,attacker:{maxHp:65535,maxEn:999},defender:{maxHp:3400,maxEn:100},responseChoice:'guard'});
 const before={attackerHp:65535,attackerEn:999,defenderHp:3400,defenderEn:77},start=hud.render(before),p=expandBattleWebPicture(start[0].picture);
 assert.deepEqual(at(p,0,0),[24,48,72,255]);assert.deepEqual(at(p,48,0),[3,4,5,255]);
 assert.deepEqual(at(p,56,0),[13,1,2,255]);assert.deepEqual(at(p,56,15),[13,1,2,255]);
 assert.deepEqual(at(p,64,16),[47,1,2,255]);assert.deepEqual(at(p,64,31),[47,1,2,255]);
 assert.deepEqual(at(p,200,16),[12,13,14,255]);assert.deepEqual(at(p,136,8),[18,19,20,255]);
 const dead=expandBattleWebPicture(hud.render({...before,defenderHp:0})[0].picture);
 assert.deepEqual(at(dead,80,0),[10,1,2,255]);assert.deepEqual(at(dead,200,0),[16,1,2,255]);
 assert.equal(hud.render(before),start);assert.deepEqual(at(expandBattleWebPicture(frame),56,0),[24,48,72,255]);
 assert.throws(()=>hud.render({...before,defenderHp:3401}),/outside actor capacity/);
});
test('wider edited EN cannot overlap the original three-cell field',()=>{
 assert.throws(()=>createBattleWebHud({picture:picture(320,32,[0,0,0,255]),glyphs,attacker:{maxHp:100,maxEn:1000},defender:{maxHp:100,maxEn:100}}),/bounded actors/);
});

test('timed source reaction changes restore glyph and side without altering HP/EN or retaining stale markers',()=>{
 const frame=picture(320,32,[24,48,72,255]);
 const hud=createBattleWebHud({picture:frame,glyphs,attacker:{maxHp:100,maxEn:100},defender:{maxHp:100,maxEn:100}});
 const values={attackerHp:100,attackerEn:100,defenderHp:100,defenderEn:100};
 const initial=hud.render(values,{responseChoice:'counter',side:'left'});
 const guard=hud.render(values,{responseChoice:'guard',side:'left'});
 const evade=hud.render(values,{responseChoice:'evade',side:'right'});
 const clear=hud.render(values,{responseChoice:'none',side:'right'});
 assert.deepEqual(at(expandBattleWebPicture(initial[0].picture),136,8),[15,16,17,255]);
 assert.deepEqual(at(expandBattleWebPicture(guard[0].picture),136,8),[18,19,20,255]);
 const moved=expandBattleWebPicture(evade[0].picture);
 assert.deepEqual(at(moved,136,8),[24,48,72,255]);assert.deepEqual(at(moved,288,8),[21,22,23,255]);
 assert.deepEqual(at(expandBattleWebPicture(clear[0].picture),288,8),[24,48,72,255]);
 const first=expandBattleWebPicture(initial[0].picture);
 for(let y=0;y<32;y++)for(let x=0;x<320;x++){
  if(y>=8&&y<24&&(x>=136&&x<152||x>=288&&x<304))continue;
  assert.deepEqual(at(moved,x,y),at(first,x,y));
 }
 assert.equal(hud.render(values,{responseChoice:'counter',side:'left'}),initial);
 assert.throws(()=>hud.render(values,{responseChoice:'attack',side:'left'}),{code:'HUD_GLYPH_SOURCE_INVALID'});
});

test('owned gauge pieces track HP damage and EN consumption with exact seek and loop restoration',()=>{
 const barPictures=Array.from({length:9},(_,fill)=>{
  const pixels=new Uint8Array(8*8*4);
  // The owned source's row footprint is 2..6; this fixture substitutes
  // distinct colors so the composition and cutouts can be asserted.
  for(let y=2;y<7;y++)for(let x=0;x<8;x++)pixels.set(x<fill?[8,248,80,255]:[192,24,16,255],(y*8+x)*4);
  return prepareBattleWebPicture({width:8,height:8,pixels});
 });
 const blank=picture(8,16,[24,48,72,255]);
 const inkDigits=(from,to)=>Array.from({length:10},()=>{
  const pixels=expandBattleWebPicture(blank).pixels.slice();
  for(let y=from;y<=to;y++)for(let x=1;x<7;x++)pixels.set([248,248,248,255],(y*8+x)*4);
  return prepareBattleWebPicture({width:8,height:16,pixels});
 });
 const ownedGlyphs={...glyphs,hp:{...glyphs.hp,digits:inkDigits(6,13),blank},
  en:{...glyphs.en,digits:inkDigits(2,9),blank},bars:{status:'ready',pictures:barPictures}};
 const hud=createBattleWebHud({picture:picture(320,32,[24,48,72,255]),glyphs:ownedGlyphs,
  attacker:{maxHp:1000,maxEn:200},defender:{maxHp:3400,maxEn:140}});
 const initial={attackerHp:1000,attackerEn:200,defenderHp:3400,defenderEn:140},end={...initial,attackerEn:120,defenderHp:0};
 const before=hud.render(initial),after=hud.render(end),p=expandBattleWebPicture(after[0].picture),b=expandBattleWebPicture(before[0].picture);
 assert.equal(hud.scope,'owned-frame-native-numeric-response-and-gauge-pieces');
 assert.deepEqual(at(b,48,14),[8,248,80,255]);assert.deepEqual(at(p,48,14),[192,24,16,255]);
 assert.deepEqual(at(p,277,20),[8,248,80,255]);assert.deepEqual(at(p,278,20),[192,24,16,255]);
 assert.deepEqual(at(p,200,14),[8,248,80,255]); // attacker HP was unchanged
 assert.deepEqual(at(p,112,20),[8,248,80,255]); // defender EN was unchanged
 assert.deepEqual(at(p,200,12),at(b,200,12)); // source gauge's transparent rows retain numbers
 assert.deepEqual(at(p,200,19),at(b,200,19));
 assert.deepEqual(at(p,49,18),[248,248,248,255]); // EN ink wins at the HP gauge overlap
 assert.equal(hud.render(initial),before);assert.equal(hud.render(end),after);
 assert.ok(barPictures.every(image=>expandBattleWebPicture(image).pixels.length===256));
 assert.throws(()=>createBattleWebHud({picture:picture(320,32,[0,0,0,255]),glyphs:{...glyphs,bars:{status:'ready',pictures:[]}},attacker:{maxHp:100,maxEn:100},defender:{maxHp:100,maxEn:100}}),/gauge pieces/);
});
