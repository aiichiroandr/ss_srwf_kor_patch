import test from 'node:test';
import assert from 'node:assert/strict';
import {compressTsr,decompressTsr} from '../assets/editor-core.mjs';
import {createBattleComponentCodec} from '../assets/editor-battle-components.mjs';
import {makeExSAimedPoseParts} from '../assets/editor-exs-aimed-pose.mjs';
import {literals} from './helpers/literal-compression.mjs';
import {Sha256} from '../assets/sha256.mjs';
const hash=b=>new Sha256().update(b).hex();
const view=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
const bad=e=>e.code==='EDITOR_BATTLE_COMPONENT_INVALID';
function record(body=false){
 const width=body?144:8,height=body?112:8,size=86+32+width*height/2+128,raw=new Uint8Array(size),d=view(raw);
 d.setUint16(0,5);d.setUint32(82,16);
 for(let i=0;i<16;i++)d.setUint16(86+i*2,i*73);
 let cursor=118;
 for(let i=0;i<5;i++){
  const at=2+i*16;d.setUint32(at,cursor+2);d.setUint16(at+8,i?8:width);d.setUint16(at+10,i?8:height);
  d.setInt16(at+12,i?4:body?72:4);d.setInt16(at+14,i?4:body?96:4);cursor+=i?32:width*height/2;
 }
 if(body)for(const [x,y,n]of [[40,33,1],[44,44,2],[100,98,3],[118,104,4]]){const at=y*width+x;raw[118+(at>>1)]|=n<<(at&1?0:4);}
 return raw;
}
async function fixture(){
 const raws=[record(),record(true)],packed=await Promise.all(raws.map(async raw=>{const stream=literals(raw);return Uint8Array.of(0x70,0x58,...stream);}));
 const count=307,original=new Uint8Array(count*8+306*packed[0].length+packed[1].length),d=view(original);let cursor=count*8;
 for(let id=0;id<count;id++){const p=packed[id===306?1:0];d.setInt32(id*8,cursor-id*8);d.setInt32(id*8+4,cursor+p.length-id*8-4);original.set(p,cursor);cursor+=p.length;}
 const source=raws[1].slice(118,118+8064),aimed=source.slice(),at=(44*144+44)>>1;aimed[at]=0x50;
 const art={width:144,height:112,x:72,y:96,sourcePixelSha256:hash(source),pixelSha256:hash(aimed),visiblePaletteSha256:hash(raws[1].subarray(88,118)),
  crop:{x:39,y:32,width:80,height:74},patches:[[at,1,'50']]};
 const recipe={preset:'ex-s-gundam',graphic:306,bodyPatch:'exs-forward',parts:[]};
 const options={decode:decompressTsr,encode:compressTsr,profiles:{test:{count,size:original.length,sha256:hash(original)}},aliases:Array.from({length:305},(_,i)=>[i+1,0]),
  recipes:[recipe],exsAimedArt:art,exsForwardPatch:{...art,patches:art.patches}};
 return {original,art,options,codec:createBattleComponentCodec(options)};
}
function worldPixels(part){
 const pixels=[];for(let y=0;y<part.height;y++)for(let x=0;x<part.width;x++){const at=y*part.width+x,n=(part.pixels[at>>1]>>(at&1?0:4))&15;if(n)pixels.push([x-part.x,y-part.y,n]);}
 return pixels;
}
test('v9 stores original standing and aimed part 4 in one bounded combatant record, with exact source recovery',async()=>{
 const {original,codec}=await fixture(),before=codec.read(original,306),plan=await codec.build(original,'test',1,{exsAimedPose:true}),after=codec.read(plan.bytes,306);
 assert.equal(plan.version,9);assert.equal(plan.exsAimedPose,true);assert.equal(plan.bytes.length,original.length);assert.ok(plan.remaining>=0);assert.ok(after.raw.length<=0x3000);
 assert.deepEqual([after.parts[0].width,after.parts[0].height,after.parts[0].x,after.parts[0].y],[144,112,72,96]);
 assert.deepEqual(worldPixels(after.parts[0]),worldPixels(before.parts[0]));
 assert.deepEqual(after.parts[0],before.parts[0],'Ability/upgrade readers receive the full original standing frame');
 assert.deepEqual([after.parts[4].width,after.parts[4].height,after.parts[4].x,after.parts[4].y],[80,74,33,64]);
 assert.equal(worldPixels(after.parts[4]).find(([x,y])=>x===44-72&&y===44-96)[2],5);
 for(const id of [0,1,45,305])assert.deepEqual(codec.read(plan.bytes,id).raw,codec.read(original,id).raw);
 for(const i of [1,2,3])assert.deepEqual(after.parts[i].pixels,before.parts[i].pixels);
 const opened=await codec.inspect(plan.bytes,'test');assert.equal(opened.version,9);assert.equal(opened.exsAimedPose,true);assert.deepEqual(opened.original,original);
 assert.deepEqual((await codec.build(opened.original,'test',1)).bytes,plan.bytes);
 assert.deepEqual((await codec.build(opened.original,'test',0)).bytes,original);
 const disabled=await codec.build(opened.original,'test',1,{exsAimedPose:false});assert.equal(disabled.version,6);assert.deepEqual((await codec.inspect(disabled.bytes,'test')).original,original);
});
test('v9 rejects modified poses, padding, source metadata and unknown native-mode flags',async()=>{
 const {original,codec}=await fixture(),plan=await codec.build(original,'test',1,{exsAimedPose:true}),chosen=codec.read(plan.bytes,306);
 for(const at of [chosen.start+3,plan.bytes.length-17,plan.bytes.length-18,plan.bytes.length-1]){
  const changed=plan.bytes.slice();changed[at]^=1;await assert.rejects(()=>codec.inspect(changed,'test'),bad);
 }
 const unknownFlag=plan.bytes.slice();unknownFlag[unknownFlag.length-17]=2;await assert.rejects(()=>codec.inspect(unknownFlag,'test'),bad);
 await assert.rejects(()=>codec.build(original,'test',1,{exsAimedPose:'yes'}),bad);
});
test('aimed-pose reconstruction refuses opaque cropping, odd heights, nonempty slot 4 and changed palette',async()=>{
 const {original,art,codec}=await fixture(),parts=codec.read(original,306).parts;
 const good=makeExSAimedPoseParts(parts,art);assert.deepEqual(worldPixels(good[0]),worldPixels(parts[0]));
 assert.throws(()=>makeExSAimedPoseParts(parts,{...art,crop:{...art.crop,x:47}}),bad);
 assert.throws(()=>makeExSAimedPoseParts(parts,{...art,crop:{...art.crop,height:73}}),bad);
 const occupied=parts.map(p=>({...p,pixels:p.pixels.slice()}));occupied[4].pixels[0]=1;assert.throws(()=>makeExSAimedPoseParts(occupied,art),bad);
 const changedPalette=parts.map(p=>({...p,palette:p.palette.slice()}));changedPalette[0].palette[2]^=1;assert.throws(()=>makeExSAimedPoseParts(changedPalette,art),bad);
 assert.throws(()=>makeExSAimedPoseParts(parts,{...art,patches:[...art.patches,...art.patches]}),bad);
});
