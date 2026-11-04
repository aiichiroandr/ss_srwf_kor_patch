import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transformExSBeamBank} from '../assets/editor-exs-beam-geometry.mjs';

// Abstract lines, not extracted artwork: exercise the original bank's layout
// and stagger/fade phases without shipping any game pixels or palette.
function fixture(){
 const pixelRaw=new Uint8Array(16272),p=new DataView(pixelRaw.buffer),mapRaw=new Uint8Array(16048),m=new DataView(mapRaw.buffer),pool=[new Uint8Array(32)],seen=new Map([[pool[0].join(','),0]]);
 p.setUint16(0,80);p.setUint16(2,488);for(let i=4;i<164;i++)pixelRaw[i]=i;
 const centers=[7,15,26,34],onsets=[0,1,1,2],last=[13,14,14,15];let cursor=136;
 m.setUint32(0,0x80800000);m.setUint32(132,0xffffffff);
 for(let f=0;f<16;f++){
  const h=f===15?56:48,raster=new Uint8Array(328*h),at=4+f*8;m.setUint32(at,cursor+4);mapRaw[at+6]=41;mapRaw[at+7]=h/8;
  centers.forEach((y,i)=>{if(f>=onsets[i]&&f<=last[i])for(let x=Math.max(0,299-(f-onsets[i])*112);x<=322;x++)raster[y*328+x]=1;});
  for(let ty=0;ty<h/8;ty++)for(let tx=0;tx<41;tx++){
   const tile=new Uint8Array(32);for(let y=0;y<8;y++)for(let x=0;x<8;x++)tile[y*4+(x>>1)]|=raster[(ty*8+y)*328+tx*8+x]<<(x%2?0:4);
   const key=tile.join(',');let id=seen.get(key);if(id===undefined){id=pool.length;pool.push(tile);seen.set(key,id);}m.setUint32(cursor,id);cursor+=4;
  }
 }
 pixelRaw[164]=255;pool.forEach((t,i)=>pixelRaw.set(t,652+i*32));return {pixelRaw,mapRaw,onsets,last};
}
function sourceFrame({pixelRaw,mapRaw},frame){
 const p=new DataView(pixelRaw.buffer,pixelRaw.byteOffset,pixelRaw.byteLength),m=new DataView(mapRaw.buffer,mapRaw.byteOffset,mapRaw.byteLength),count=p.getUint16(2),pixels=4+p.getUint16(0)*2+count,at=4+frame*8,w=mapRaw[at+6]*8,h=mapRaw[at+7]*8,o=m.getUint32(at)-4,data=new Uint8Array(w*h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const tile=m.getUint32(o+((y>>3)*(w>>3)+(x>>3))*4);assert.ok(tile<count);data[y*w+x]=pixelRaw[pixels+tile*32+(y%8)*4+((x%8)>>1)]>>(x%2?0:4)&15;}return {w,h,data};
}
function composedPhase(result,phase){
 const data=new Uint8Array(368*64);for(const placement of result.geometry.framePlacements[phase]){const f=sourceFrame(result,placement.frame);for(let y=0;y<f.h;y++)data.set(f.data.subarray(y*f.w,(y+1)*f.w),(placement.y*8+y)*368+placement.x*8);}return data;
}
const points=[[359,13],[320,5],[347,44],[318,46]];

test('two fixed bands fit the original map reservation and put all four bright cores on their native ports',()=>{
 const input=fixture(),output=transformExSBeamBank(input),p=new DataView(output.pixelRaw.buffer);
 assert.equal(output.mapRaw.length,14988);assert.ok(output.mapRaw.length<=input.mapRaw.length);assert.ok(output.pixelRaw.length<32768);assert.equal((4+160+p.getUint16(2))%4,0);
 assert.deepEqual(output.pixelRaw.subarray(4,164),input.pixelRaw.subarray(4,164));assert.deepEqual(output.geometry.fa55,[344,56]);
 for(let f=0;f<16;f++){
  const phase=composedPhase(output,f);for(let y=24;y<40;y++)assert.ok(phase.subarray(y*368,(y+1)*368).every(n=>n===0));
  for(let i=0;i<4;i++)assert.equal(phase[points[i][1]*368+points[i][0]],f>=input.onsets[i]&&f<=input.last[i]?1:0,`phase ${f}, ray ${i}: preserve onset and fade`);
 }
 output.geometry.nativePortCenters.forEach((target,i)=>{const point=output.geometry.mappedNativeCoreCenters[i];assert.ok(Math.max(...target.map((n,j)=>Math.abs(n-point[j])))<=0.5,'At most half a native pixel per axis');});
 assert.deepEqual(input,fixture(),'Inputs are never mutated');
});

test('malformed bank lengths, frame dimensions, palette flags and tile references fail before producing a bank',()=>{
 assert.throws(()=>transformExSBeamBank(),{code:'EDITOR_BATTLE_COMPONENT_INVALID'});
 for(const change of [f=>{f.pixelRaw=f.pixelRaw.subarray(0,-1);},f=>{f.mapRaw[10]=255;},f=>{new DataView(f.mapRaw.buffer).setUint32(136,65535);},f=>{f.pixelRaw[165]=1;}]){const f=fixture();change(f);assert.throws(()=>transformExSBeamBank(f),{code:'EDITOR_BATTLE_COMPONENT_INVALID'});}
});

test('defender rays reach the screen edge only after their original arrival and retain every muzzle endpoint',()=>{
 const input=fixture(),output=transformExSBeamBank(input);assert.equal(output.geometry.defenderEdgeContinuation,true);
 for(let f=0;f<16;f++){
  const original=sourceFrame(input,f),phase=composedPhase(output,f);
  for(const [i,sy]of[7,15,26,34].entries()){
   const y=points[i][1],sourceReached=original.data[sy*328]===1;
   assert.equal(phase[y*368],sourceReached?1:0,`phase ${f}, ray ${i}: edge follows original arrival/fade`);
   if(sourceReached)for(let x=0;x<=points[i][0];x++)assert.equal(phase[y*368+x],1,`phase ${f}, ray ${i}: no mid-screen break`);
  }
 }
});

const actualBase=new URL('../build/exs-beam-align-20261028/trace-audit/',import.meta.url);
let actual;try{actual={pixelRaw:new Uint8Array(await readFile(new URL('ebnk-512-4.bin',actualBase))),mapRaw:new Uint8Array(await readFile(new URL('beam-map.bin',actualBase)))};}catch{}
test('private authenticated source: all original colors, staggered phase presence and final fade survive the 16-phase remap',{skip:!actual},()=>{
 const output=transformExSBeamBank(actual),p=new DataView(output.pixelRaw.buffer),paletteEnd=4+p.getUint16(0)*2,count=p.getUint16(2),originalPalette=actual.pixelRaw.subarray(4,paletteEnd);
 assert.deepEqual(output.pixelRaw.subarray(4,paletteEnd),originalPalette);assert.equal(count%8,0);assert.ok(output.pixelRaw.length<=32768&&output.mapRaw.length<=actual.mapRaw.length);
 const used=new Set();for(let f=0;f<16;f++)for(const n of sourceFrame(actual,f).data)used.add(n);
 for(let f=0;f<16;f++){
  const source=sourceFrame(actual,f),phase=composedPhase(output,f);
  for(const n of phase)assert.ok(used.has(n),'Only source color indices may occur');
  for(const [i,y]of [7,15,26,34].entries())assert.equal(output.geometry.ownership[f][i]>0,source.data.subarray(y*source.w,(y+1)*source.w).some(Boolean),`phase ${f}, ray ${i}: same original presence`);
 }
 const peak=composedPhase(output,5);for(const[x,y]of points)assert.equal(peak[y*368+x],1,'White core touches the muzzle, not just its halo');
 assert.ok(output.geometry.ownership[15].slice(0,3).every(n=>n===0));assert.ok(output.geometry.ownership[15][3]>0);
});
