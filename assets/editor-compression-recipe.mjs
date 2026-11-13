// A reversible description of an existing LZ stream. Literal bytes come from
// its unchanged decoded data; the nearest matching reference recovers distance.
// This is a source-recovery ledger, never a format executed by the game.
import {bytesEqual as same} from './editor-bytes.mjs?v=20261113-alicecopies1';
function invalid(){const e=Error('전투 그림의 원본 압축 기록을 복원하지 못했습니다.');e.code='EDITOR_BATTLE_COMPONENT_INVALID';throw e;}
function put(out,n){if(!Number.isInteger(n)||n<0||n>65535)invalid();do{out.push((n&127)|(n>=128?128:0));n>>>=7;}while(n);}
function reader(bytes){let at=0,flag=0,bits=0,lastFlag=0;return {
 byte(){if(at>=bytes.length)invalid();return bytes[at++];},
 bit(){if(!bits){lastFlag=at;flag=this.byte();bits=8;}return (flag>>--bits)&1;},
 get at(){return at;},get lastFlag(){return lastFlag;},
 };}
function writer(){const bytes=[];let bits=0,flag=0;return {
 bit(n){if(!bits){flag=bytes.length;bytes.push(255);bits=8;}if(!n)bytes[flag]&=~(1<<--bits);else --bits;},
 byte(n){bytes.push(n&255);},finish(lastFlag){bytes[flag]=lastFlag;return Uint8Array.from(bytes);},
 };}
function nearest(raw,at,length,buckets){
 const key=(raw[at]<<8)|raw[at+1],list=buckets.get(key)??[];
 for(let i=list.length-1;i>=0;i--){const p=list[i];if(at-p>8192)break;let j=0;while(j<length&&raw[p+j]===raw[at+j])j++;if(j===length)return at-p;}
 invalid();
}
function remember(raw,buckets,at,n){for(let i=at;i<at+n;i++){const key=(raw[i]<<8)|raw[i+1],list=buckets.get(key)??[];list.push(i);buckets.set(key,list);}}
export function makeCompressionRecipe(stream,raw){
 if(!(stream instanceof Uint8Array)||stream.length>65535||!(raw instanceof Uint8Array)||raw.length>32768)invalid();
 const r=reader(stream),out=[],buckets=new Map();let at=0,literals=0,steps=0;
 while(++steps<=raw.length+1){
  if(r.bit()){if(at>=raw.length||r.byte()!==raw[at])invalid();remember(raw,buckets,at++,1);literals++;continue;}
  let kind,length,distance;
  if(r.bit()){const code=(r.byte()<<8)|r.byte();distance=8192-(code>>3);length=code&7;kind=length?2:3;
   if(!length){const extra=r.byte();if(!extra){put(out,literals);if(at!==raw.length||r.at!==stream.length)invalid();const recipe=Uint8Array.from(out),lastFlag=stream[r.lastFlag];if(!same(restoreCompressionRecipe(raw,recipe,lastFlag),stream))invalid();return {recipe,lastFlag};}length=extra+1;}else length+=2;
  }else{kind=1;length=(r.bit()<<1|r.bit())+2;distance=256-r.byte();}
  if(at+length>raw.length||distance!==nearest(raw,at,length,buckets))invalid();
  for(let i=0;i<length;i++)if(raw[at-distance+i]!==raw[at+i])invalid();
  put(out,literals);put(out,(length<<2)|kind);literals=0;remember(raw,buckets,at,length);at+=length;
 }
 invalid();
}
export function restoreCompressionRecipe(raw,recipe,lastFlag){
 if(!(raw instanceof Uint8Array)||raw.length>32768||!(recipe instanceof Uint8Array)||recipe.length>8192||!Number.isInteger(lastFlag)||lastFlag<0||lastFlag>255)invalid();
 const w=writer(),buckets=new Map();let cursor=0,at=0,steps=0;
 const get=()=>{let n=0,shift=0;for(let i=0;i<3;i++){if(cursor>=recipe.length)invalid();const v=recipe[cursor++];n|=(v&127)<<shift;if(!(v&128)){if(n>65535||i&&v===0)invalid();return n;}shift+=7;}invalid();};
 while(cursor<recipe.length&&++steps<=raw.length+1){
  const literals=get();if(at+literals>raw.length)invalid();
  for(let i=0;i<literals;i++){w.bit(1);w.byte(raw[at]);remember(raw,buckets,at++,1);}
  if(cursor===recipe.length)break;
  const code=get(),kind=code&3,length=code>>2;
  if(!kind||length<2||length>256||at+length>raw.length||kind===1&&length>5||kind===2&&(length<3||length>9))invalid();
  const distance=nearest(raw,at,length,buckets);w.bit(0);
  if(kind===1){if(distance>256)invalid();w.bit(0);w.bit((length-2)>>1);w.bit((length-2)&1);w.byte(256-distance);}
  else {w.bit(1);const encoded=((8192-distance)<<3)|(kind===2?length-2:0);w.byte(encoded>>8);w.byte(encoded);if(kind===3)w.byte(length-1);}
  remember(raw,buckets,at,length);at+=length;
 }
 if(at!==raw.length||cursor!==recipe.length)invalid();
 w.bit(0);w.bit(1);w.byte(0);w.byte(0);w.byte(0);return w.finish(lastFlag);
}
