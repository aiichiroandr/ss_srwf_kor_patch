import { saveChecksum } from '../../assets/save-core.mjs';
import { encodeEditorText } from '../../assets/editor-text-codec.mjs';
export function syntheticHeroUnits(){
 return [221,222,223,224].map((recordIndex,i)=>{
  const name='형태'+['영','일','이','삼'][i],body=encodeEditorText(name,{gameId:'srwf-final',kind:'saveUnit'}).slice(0,-1),bytes=new Uint8Array(10);bytes.set(body);
  return {recordIndex,name,identity:`unit:${recordIndex}`,saveNameDefaultBytes:[...bytes]};
 });
}
const put=(b,p,n,w)=>{for(let i=w-1;i>=0;i--){b[p+i]=n&255;n=Math.floor(n/256);}};
export function syntheticSave({name='SROBOTFC_01',size=0x80000,blockSize=512,foreign=true,upgradeUnlocked=false,dateMinutes=0,completedCounter=0,titleIndex=0,heroNameBytes=[]}={}){
  const raw=new Uint8Array(size),sig=new TextEncoder().encode('BackUpRam Format');
  for(let p=0;p<blockSize;p+=16)raw.set(sig,p);
  const payload=new Uint8Array(0x1600);payload[0x9c]=upgradeUnlocked?8:0;payload[5]=completedCounter;payload[7]=titleIndex;payload.set(heroNameBytes,0x3c);put(payload,10,123456,3);put(payload,0x100,23,2);
  put(payload,0x1000,74,2);payload[0x1002]=30;put(payload,0x1004,321,2);put(payload,0,saveChecksum(payload),4);
  const positions=[];let count=1;while(blockSize-34+(count-1)*(blockSize-4)-count*2<payload.length)count++;
  const blocks=Array.from({length:count},(_,i)=>2+i*2); // fragmented, not a contiguous byte run
  raw[2*blockSize]=128;raw.set(new TextEncoder().encode(name),2*blockSize+4);put(raw,2*blockSize+30,payload.length,4);put(raw,2*blockSize+26,dateMinutes,4);
  blocks.forEach((block,i)=>{for(let p=block*blockSize+(i?4:34);p<(block+1)*blockSize;p++)positions.push(p);});
  blocks.slice(1).forEach((block,i)=>{raw[positions[i*2]]=block>>>8;raw[positions[i*2+1]]=block&255;});
  const payloadPositions=positions.slice(count*2,count*2+payload.length);payloadPositions.forEach((p,i)=>raw[p]=payload[i]);
  if(foreign){const base=3*blockSize;raw[base]=128;raw.set(new TextEncoder().encode('OTHER_GAME'),base+4);put(raw,base+30,8,4);raw.set([9,8,7,6,5,4,3,2],base+36);}
  return {raw,payload,payloadPositions,blocks};
}
