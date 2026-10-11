import { packGreedy } from './synthetic-iso.mjs';
import { encodeObjectiveText } from '../../assets/editor-scenario-objective-base.mjs';
export function eventHostBody(){
 const decoded=new Uint8Array(12645).fill(0xaa),v=new DataView(decoded.buffer);
 const roots=[6573,104,1975,104,2311,2790,548,104,2805,3160,3162,3164,3166,6567];
 roots.forEach((target,i)=>v.setInt32(i*4,target-i*4));
 decoded.set([0xc4,0,2,0x80,1,0xca,2,0x11,2,3,0x14,1,0,2,47,0,0,0,0,0,255,255,0xe9],2311);
 decoded.set([0xd4,0,0xf3,0,8,0,4,0xd0,0,0,250,0xe9,1,255,243],2790);
 decoded.set([0xd0,2,0,250,0xf0,0,0,0,0xd0,2,0,241,0xf1,0,0,0],2805);
 v.setInt16(2811,2835-2811);v.setInt16(2819,2835-2819);
 decoded.set([0xd3,0xfb,0xf2,0,0,0,0,0xd3,0xfc,0xf2,0,0,0,0,0xe9,1,0,0],2821);
 v.setInt16(2824,3157-2824);v.setInt16(2831,2839-2831);v.setInt16(2837,2805-2837);
 decoded.set([0xec,1,0xea],2839);decoded.set([0xec,2,0xea],3157);
 const win=encodeObjectiveText('적전멸','srwf-final'),lose=encodeObjectiveText('아군전멸','srwf-final');
 decoded.set([0xe7,2,0,4,0xe7,3,0,4,(win.length+2)>>>8,(win.length+2)&255,...win,...lose],6567);
 return decoded;
}
export function eventHostArchive(){
 const raws=Array.from({length:9},(_,i)=>{const b=new Uint8Array(120).fill(0xaa),v=new DataView(b.buffer);for(let r=0;r<14;r++)v.setInt32(r*4,60-r*4);b.set([0xe9,1,255,254],60);b[99]=i;return b;});raws.push(eventHostBody());
 const spans=[];let end=1600;
 const blocks=raws.map((b,i)=>{const packed=packGreedy(b),length=(packed.length+(i===9?2048:64)+3)&~3;spans.push([end,end+length]);end+=length;return packed;});
 const bytes=new Uint8Array(end),v=new DataView(bytes.buffer);
 for(let slot=0;slot<200;slot++){const index=slot===106?9:slot>=1&&slot<=8?slot:0,[start,end]=spans[index],cell=slot*8;v.setUint32(cell,start-cell);v.setUint32(cell+4,end-cell);}
 blocks.forEach((b,i)=>bytes.set(b,spans[i][0]));return{bytes,raw:raws[9],first:2319};
}
