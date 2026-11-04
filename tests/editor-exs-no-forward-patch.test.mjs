import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {compressTsr,decompressTsr} from '../assets/editor-core.mjs';
import {Sha256} from '../assets/sha256.mjs';
import {createBattleComponentCodec,BATTLE_COMPONENT_RECIPES} from '../assets/editor-battle-components.mjs';
const hash=b=>new Sha256().update(b).hex();
const root=new URL('../',import.meta.url);
// Fingerprints of the removed drawn Ex-S forward-cannon pose (v2..v4 and v5..v7 patches): result pixel hashes and
// the hashes of their authored replacement bytes.
const REMOVED=['3f9276c226c98ecb3b6f9cd18fe7413ca51fe842ed1a2cdf6cf6ddde5f435f61','80c9ef3469c8554fc0e8dac05eca39e9f6eabf8de14d06ab4ccdb83d98103729',
 'aa3bbd9f6a54d4278a57a0c09a115e41ef9fb48484d0c12806850865187d16b6','463eb3f67407c60cccd162dfde67cda8eef7b078e3c3a5df828ee2b91dee39c1'];

async function archive(){
 const packed=[];
 for(let id=0;id<341;id++){
  const raw=new Uint8Array(278),d=new DataView(raw.buffer);d.setUint16(0,5);d.setUint32(82,16);
  for(let i=0;i<16;i++)d.setUint16(86+i*2,i*(id===306?71:67));
  for(let part=0;part<5;part++){const at=2+part*16;d.setUint32(at,120+part*32);d.setUint16(at+8,8);d.setUint16(at+10,8);d.setInt16(at+12,4);d.setInt16(at+14,4);raw.fill(id===306?0x33+part:id===305?0x55:id===310?0x77:0x11,118+part*32,150+part*32);}
  const stream=await compressTsr(raw),record=new Uint8Array(stream.length+2);record.set([0x70,0x58]);record.set(stream,2);packed.push(record);
 }
 const original=new Uint8Array(341*8+packed.reduce((n,p)=>n+p.length,0)),d=new DataView(original.buffer);let cursor=341*8;
 packed.forEach((record,id)=>{d.setInt32(id*8,cursor-id*8);d.setInt32(id*8+4,cursor+record.length-id*8-4);original.set(record,cursor);cursor+=record.length;});
 return {original,options:{decode:decompressTsr,encode:compressTsr,profiles:{test:{count:341,size:original.length,sha256:hash(original)}},
  aliases:Array.from({length:340},(_,i)=>i+1).filter(id=>![305,306,310].includes(id)).map(id=>[id,0])}};
}
const exs=1<<BATTLE_COMPONENT_RECIPES.findIndex(r=>r.preset==='ex-s-gundam');

test('a new Ex-S without the beam option keeps the original body of the user image',async()=>{
 const {original,options}=await archive(),codec=createBattleComponentCodec(options),source=codec.read(original,306);
 for(const request of [{},{exsAimedPose:false},{upgrade:true}]){
  const plan=await codec.build(original,'test',exs,request),body=codec.read(plan.bytes,306).parts[0];
  assert.deepEqual(body.pixels,source.parts[0].pixels,JSON.stringify(request));
  assert.deepEqual(body.palette,source.parts[0].palette);
  assert.ok(!REMOVED.includes(hash(body.pixels)));
  const reopened=await codec.inspect(plan.bytes,'test');assert.deepEqual(reopened.original,original);
 }
});

test('an old BIN whose Ex-S body carries a drawn forward pose is not reproduced',async()=>{
 const {original,options}=await archive(),reader=createBattleComponentCodec(options),body=reader.read(original,306).parts[0];
 const pixels=body.pixels.slice();pixels[0]^=0xff;
 const patch={width:body.width,height:body.height,x:body.x,y:body.y,sourcePixelSha256:hash(body.pixels),pixelSha256:hash(pixels),visiblePaletteSha256:hash(body.palette.subarray(2)),patches:[[0,1,pixels[0].toString(16).padStart(2,'0')]]};
 const old=await createBattleComponentCodec({...options,exsForwardPatch:patch}).build(original,'test',exs);
 assert.deepEqual(reader.read(old.bytes,306).parts[0].pixels,pixels,'the fixture really carries the drawn pose');
 await assert.rejects(()=>reader.inspect(old.bytes,'test'),e=>e.code==='EDITOR_BATTLE_COMPONENT_INVALID');
});

test('the public tree ships no Ex-S forward-pose module or its fingerprints',()=>{
 for(const gone of ['editor-s-gundam-art.mjs','editor-exs-forward-art-v5.mjs'])assert.equal(existsSync(new URL(`assets/${gone}`,root)),false,gone);
 const files=[...readdirSync(new URL('assets/',root)).filter(f=>f.endsWith('.mjs')).map(f=>`assets/${f}`),'index.html','scripts/site-policy.json'];
 for(const file of files){
  const text=readFileSync(new URL(file,root),'utf8');
  assert.doesNotMatch(text,/EXS_FORWARD_ART_PATCH|editor-s-gundam-art|editor-exs-forward-art/,file);
  for(const h of REMOVED)assert.ok(!text.includes(h),`${file}: ${h}`);
 }
 // The requested aimed pose stays.
 assert.ok(existsSync(new URL('assets/editor-exs-aimed-art.mjs',root)));
});
