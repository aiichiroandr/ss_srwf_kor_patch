import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {compressTsr,decompressTsr} from '../assets/editor-core.mjs';
import {Sha256} from '../assets/sha256.mjs';
import {createBattleComponentCodec,BATTLE_COMPONENT_RECIPES} from '../assets/editor-battle-components.mjs';
const hash=b=>new Sha256().update(b).hex();
const root=new URL('../',import.meta.url);
// Pixel hashes of the removed drawn G-Cruiser art (v1 GCRUISER_ART, v3/v4/v5 AIRCRAFT_ART gCruiser).
const REMOVED_ART_PIXEL_SHA='f16e411b875f0222d770a70dc4169e04e56461284b47c155d86cd767a582bf7e';

// A synthetic C_ROBOT-shaped archive: 341 five-part records, slot 340/295/296 equal to slot 0.
async function archive(){
 const packed=[];
 for(let id=0;id<341;id++){
  const raw=new Uint8Array(278),d=new DataView(raw.buffer);d.setUint16(0,5);d.setUint32(82,16);
  for(let i=0;i<16;i++)d.setUint16(86+i*2,i*(id===306?71:67));
  for(let part=0;part<5;part++){const at=2+part*16;d.setUint32(at,120+part*32);d.setUint16(at+8,8);d.setUint16(at+10,8);d.setInt16(at+12,4);d.setInt16(at+14,4);raw.fill(id===310?0x77:0x11,118+part*32,150+part*32);}
  const stream=await compressTsr(raw),record=new Uint8Array(stream.length+2);record.set([0x70,0x58]);record.set(stream,2);packed.push({raw,record});
 }
 const original=new Uint8Array(341*8+packed.reduce((n,p)=>n+p.record.length,0)),d=new DataView(original.buffer);let cursor=341*8;
 packed.forEach(({record},id)=>{d.setInt32(id*8,cursor-id*8);d.setInt32(id*8+4,cursor+record.length-id*8-4);original.set(record,cursor);cursor+=record.length;});
 const options={decode:decompressTsr,encode:compressTsr,profiles:{test:{count:341,size:original.length,sha256:hash(original)}},
  aliases:Array.from({length:340},(_,i)=>i+1).filter(id=>![306,310].includes(id)).map(id=>[id,0])};
 const pixels=new Uint8Array(32).fill(0x5a);
 const drawn={width:8,height:8,x:4,y:4,paletteSourceGraphic:306,visiblePaletteSha256:hash(packed[306].raw.subarray(88,118)),pixels:Buffer.from(pixels).toString('base64'),pixelSha256:hash(pixels)};
 return {original,options,drawn,pixels};
}
const bit=preset=>1<<BATTLE_COMPONENT_RECIPES.findIndex(r=>r.preset===preset);

test('without a connected Rev 1 source the shipped codec refuses to create or save either G-Cruiser variant',async()=>{
 const {original,options}=await archive(),codec=createBattleComponentCodec(options);
 for(const preset of ['g-cruiser','s-g-cruiser']){
  await assert.rejects(()=>codec.build(original,'test',bit(preset)),e=>e.code==='EDITOR_BATTLE_COMPONENT_INVALID'&&/제4차 Rev 1 원본/.test(e.message),preset);
  for(const exsAimedPose of [true,false])await assert.rejects(()=>codec.build(original,'test',bit(preset),{upgrade:true,exsAimedPose}),e=>e.code==='EDITOR_BATTLE_COMPONENT_INVALID',preset);
 }
 for(const preset of ['g-attacker','g-bomber','g-core'])await assert.rejects(()=>codec.build(original,'test',bit(preset)),e=>e.code==='EDITOR_BATTLE_COMPONENT_INVALID',preset);
 // S Gundam / Ex-S themselves are recomposed from the user's own parts and stay available.
 assert.equal((await codec.build(original,'test',0)).bytes,original);
});

test('a BIN that carries drawn cruiser art is not reproduced, so a re-save cannot carry those bytes',async()=>{
 const {original,options,drawn,pixels}=await archive();
 // A writer that still had drawn art (test-only injection) makes an older-style image.
 const writer=createBattleComponentCodec({...options,aircraftArt:{gCruiser:drawn}}),old=await writer.build(original,'test',bit('g-cruiser'));
 assert.deepEqual(writer.read(old.bytes,340).parts[0].pixels,pixels,'the fixture really carries drawn pixels');
 const shipped=createBattleComponentCodec(options);
 await assert.rejects(()=>shipped.inspect(old.bytes,'test'),e=>e.code==='EDITOR_BATTLE_COMPONENT_INVALID');
});

test('the public tree ships no drawn unit art module or its pixels',()=>{
 const assets=readdirSync(new URL('assets/',root)).filter(f=>f.endsWith('.mjs'));
 for(const gone of ['editor-aircraft-art-v3.mjs','editor-aircraft-art-v4.mjs','editor-aircraft-art-v5.mjs','editor-gcruiser-art.mjs'])assert.ok(!assets.includes(gone),gone);
 for(const file of [...assets.map(f=>`assets/${f}`),'index.html']){
  const text=readFileSync(new URL(file,root),'utf8');
  assert.doesNotMatch(text,/AIRCRAFT_ART_V[345]\b|GCRUISER_ART\b|S_GUNDAM_ART\b/,file);
  assert.ok(!text.includes(REMOVED_ART_PIXEL_SHA),file);
 }
 const policy=readFileSync(new URL('scripts/site-policy.json',root),'utf8');
 assert.doesNotMatch(policy,/editor-aircraft-art-v[345]\.mjs|editor-gcruiser-art\.mjs/);
});

test('the unit add menu refuses the G-Cruiser variants until the Rev 1 source is connected',()=>{
 const app=readFileSync(new URL('assets/app.mjs',root),'utf8');
 assert.match(app,/CRUISER_PRESETS\.includes\(value\)&&!hasSrw4CruiserSource\(\)\)\{announce\(SRW4_CRUISER_REQUIRED\);return;\}/);
 assert.match(app,/option\.disabled=[^;]*CRUISER_PRESETS\.includes\(value\)&&!rev1/);
 assert.match(app,/SRW4_CRUISER_REQUIRED='G크루저 변형은 제4차 일본판 Rev 1 원본의 그림만 사용합니다\./);
});
