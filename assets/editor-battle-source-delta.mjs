// Private reconstruction instructions. The game reads only the ordinary image
// record; this ledger lets the editor recover the exact authenticated source.
const MAX=32768;
function invalid(){const e=Error('전투 그림의 원본 차이 기록을 복원하지 못했습니다.');e.code='EDITOR_BATTLE_COMPONENT_INVALID';throw e;}
function checked(b){if(!(b instanceof Uint8Array)||b.length>MAX)invalid();}
const key=(b,at)=>((b[at]<<24)|(b[at+1]<<16)|(b[at+2]<<8)|b[at+3])>>>0;
export function makeBattleSourceDelta(original,current){
 checked(original);checked(current);
 const buckets=new Map(),out=[];let at=0,literals=[];
 for(let i=0;i+4<=current.length;i++){const k=key(current,i),list=buckets.get(k)??[];list.push(i);buckets.set(k,list);}
 const flush=()=>{if(literals.length){out.push(0,literals.length>>8,literals.length&255,...literals);literals=[];}};
 while(at<original.length){
  const list=at+4<=original.length?(buckets.get(key(original,at))??[]):[];let length=0,from=0;
  // Keep the search bounded even for large transparent image regions. Earlier
  // positions win ties so source reconstruction remains deterministic.
  const candidates=list.length>256?[...list.slice(0,128),...list.slice(-128)]:list;
  for(const start of candidates){let n=0;while(at+n<original.length&&start+n<current.length&&original[at+n]===current[start+n])n++;
   if(n>length){length=n;from=start;}}
  if(length>=8){flush();out.push(1,length>>8,length&255,from>>8,from&255);at+=length;}
  else literals.push(original[at++]);
 }
 flush();return Uint8Array.from(out);
}
export function restoreBattleSourceDelta(current,delta,length){
 checked(current);if(!(delta instanceof Uint8Array)||delta.length>MAX*2||!Number.isInteger(length)||length<1||length>MAX)invalid();
 const out=new Uint8Array(length);let at=0,to=0;
 while(at<delta.length){
  if(at+3>delta.length)invalid();const kind=delta[at++],n=(delta[at++]<<8)|delta[at++];
  if(!n||to+n>length)invalid();
  if(kind===0){if(at+n>delta.length)invalid();out.set(delta.subarray(at,at+n),to);at+=n;}
  else if(kind===1){if(at+2>delta.length)invalid();const from=(delta[at++]<<8)|delta[at++];if(from+n>current.length)invalid();out.set(current.subarray(from,from+n),to);}
  else invalid();to+=n;
 }
 if(to!==length)invalid();return out;
}
