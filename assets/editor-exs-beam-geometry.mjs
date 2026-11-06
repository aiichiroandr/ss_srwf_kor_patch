// Pure-data Ex-S beam geometry. Pixels and palettes come from a verified ROM.
// Frame atlas geometry is reconstructed into a separate authenticated bank.
// No runtime, file, disc, actor, or executable writes occur here.
import {dataView as dv} from './editor-bytes.mjs?v=20261106-part4';
function bad(reason='structure') {
 const error=Error('4연장 빔 효과의 그림 구조를 확인하지 못했습니다.');
 error.code='EDITOR_BATTLE_COMPONENT_INVALID';error.details={component:'beam-geometry',reason};throw error;
}
const check=(condition,reason)=>{if(!condition)bad(reason);};
const SOURCE_CENTERS=[7,15,26,34];
// Original world bitmap origin (-184,88), source bright core ends at x322.
// Rounded target centers: UR,UL,LR,LL. Half-pixel port centers round upward.
const DELTAS=[[37,-2],[-2,-18],[25,10],[-4,4]];
const TOP_PADDING=8,WIDTH=368,HEIGHT=64;
export function transformExSBeamBank({pixelRaw,mapRaw}={}){
 check(pixelRaw instanceof Uint8Array&&mapRaw instanceof Uint8Array);
 check(pixelRaw.length===16272&&mapRaw.length===16048);
 const p=dv(pixelRaw),m=dv(mapRaw),colors=p.getUint16(0),tiles=p.getUint16(2),attrAt=4+colors*2,pixelsAt=attrAt+tiles;
 check(colors===80&&tiles===488&&pixelsAt+tiles*32+4===pixelRaw.length);check(pixelRaw.subarray(-4).every(x=>x===0));
 check(m.getUint32(0)===0x80800000);
 const frames=[],tilePool=[new Uint8Array(32)],tileIndex=new Map([[new Uint8Array(32).join(','),0]]),ownership=[];
 function place(tile){const key=tile.join(',');let i=tileIndex.get(key);if(i===undefined){i=tilePool.length;tilePool.push(tile);tileIndex.set(key,i);}return i;}
 for(let f=0;f<16;f++){
  const h=4+f*8,mapAt=m.getUint32(h)-4,w=mapRaw[h+6]*8,height=mapRaw[h+7]*8;
  check(w===328&&height===(f===15?56:48));check(mapAt>=136&&mapAt+(w/8)*(height/8)*4<=mapRaw.length-4);
  const source=new Uint8Array(w*height),output=new Uint8Array(WIDTH*HEIGHT),owned=[0,0,0,0];
  for(let y=0;y<height;y++)for(let x=0;x<w;x++){
   const id=m.getUint32(mapAt+((y>>3)*(w>>3)+(x>>3))*4);check(id<tiles);
   const nibble=pixelRaw[pixelsAt+id*32+(y%8)*4+((x%8)>>1)]>>(x%2?0:4)&15;
   check(nibble===0||pixelRaw[attrAt+id]===0,'palette');source[y*w+x]=nibble;
  }
  for(let x=0;x<w;x++){
   // Decide ownership from the active source center at THIS column. This
   // retains the original staggered growth and first-frame charging flash.
   const active=SOURCE_CENTERS.map((y,i)=>source[y*w+x]?i:-1).filter(i=>i>=0);
   for(let y=0;y<height;y++){
    const value=source[y*w+x];if(!value)continue;
    const candidates=active.length?active:SOURCE_CENTERS.map((_,i)=>i);
    let owner=candidates[0];for(const i of candidates)if(Math.abs(y-SOURCE_CENTERS[i])<Math.abs(y-SOURCE_CENTERS[owner]))owner=i;
    // Original row21 is the second ray's lower halo (center15 +6),
    // not the third ray, whose independent flash starts at row22.
    if(y===21&&active.includes(1))owner=1;
    const nx=x+DELTAS[owner][0],ny=y+DELTAS[owner][1]+TOP_PADDING;
    if(nx<0||nx>=WIDTH||ny<0||ny>=HEIGHT)continue;
    const at=ny*WIDTH+nx;
    // Native ramp 1..9 is ordered bright->dark; preserve the brighter layer
    // where the two near lower-port beams naturally overlap.
    if(!output[at]||value<output[at])output[at]=value;owned[owner]++;
    // A positive muzzle delta used to move the far end of the ray as well.
    // In the defender shot the bank's x=0 is visible, leaving a 37/25 px
    // gap at the screen edge. Once the ORIGINAL ray has reached x=0,
    // continue that exact cross-section to the edge. Do not extend an
    // arriving ray early, or alter its muzzle end, palette, or fade.
    if(x===0&&DELTAS[owner][0]>0)for(let edge=0;edge<DELTAS[owner][0];edge++){
     const dst=ny*WIDTH+edge;
     if(!output[dst]||value<output[dst])output[dst]=value;
    }
   }
  }
  // Keep this SC allocation no larger than the authenticated source.
  // Two fixed bands avoid map-workspace growth and omit only the blank gap.
  // Every phase rewrites both full rectangles, including zero cells, so
  // earlier glow/fade pixels cannot remain outside a later cropped frame.
  for(let y=24;y<40;y++)for(let x=0;x<WIDTH;x++)check(output[y*WIDTH+x]===0,'band-gap');
  for(const [top,heightTiles]of [[0,3],[40,2]]){
   const table=[];for(let ty=0;ty<heightTiles;ty++)for(let tx=0;tx<WIDTH/8;tx++){
    const tile=new Uint8Array(32);for(let y=0;y<8;y++)for(let x=0;x<8;x++)tile[y*4+(x>>1)]|=output[(top+ty*8+y)*WIDTH+tx*8+x]<<(x%2?0:4);table.push(place(tile));
   }
   frames.push({width:WIDTH/8,height:heightTiles,table});
  }
  ownership.push(owned);
 }
 // Keep the attribute array and following pixel pointer word-aligned, as
 // every original bank does. Unreferenced padding tiles stay transparent.
 while(tilePool.length%8)tilePool.push(new Uint8Array(32));
 check(tilePool.length<=1024,'pixel-capacity');
 const outputPixel=new Uint8Array(4+colors*2+tilePool.length+tilePool.length*32+4),op=dv(outputPixel);op.setUint16(0,colors);op.setUint16(2,tilePool.length);outputPixel.set(pixelRaw.subarray(4,4+colors*2),4);
 outputPixel[4+colors*2]=255;const outPixels=4+colors*2+tilePool.length;tilePool.forEach((t,i)=>outputPixel.set(t,outPixels+i*32));
 const headerBytes=4+32*8+4,outputMap=new Uint8Array(headerBytes+16*(WIDTH/8)*5*4+4),om=dv(outputMap);om.setUint32(0,0x80800000);let cursor=headerBytes;
 frames.forEach((f,i)=>{const h=4+i*8;om.setUint32(h,cursor+4);outputMap[h+4]=1+(i%2)*47;outputMap[h+5]=1+Math.floor(i/2)*4;outputMap[h+6]=f.width;outputMap[h+7]=f.height;f.table.forEach((id,j)=>om.setUint32(cursor+j*4,id));cursor+=f.table.length*4;});om.setUint32(4+32*8,0xffffffff);
 check(outputMap.length<=mapRaw.length,'map-capacity');
 return {pixelRaw:outputPixel,mapRaw:outputMap,geometry:{sourceCoreEndX:322,sourceCenters:SOURCE_CENTERS.slice(),deltas:DELTAS.map(p=>p.slice()),topPadding:TOP_PADDING,fa55:[344,56],canvas:[WIDTH,HEIGHT],nativePortCenters:[[86,52],[46.5,44],[74,83],[44.5,84.5]],mappedNativeCoreCenters:[[86,52],[47,44],[74,83],[45,85]],defenderEdgeContinuation:true,tileCount:tilePool.length,pixelRawBytes:outputPixel.length,mapRawBytes:outputMap.length,framePlacements:Array.from({length:16},(_,f)=>[{frame:f*2,x:0,y:0},{frame:f*2+1,x:0,y:5}]),ownership}};
}
