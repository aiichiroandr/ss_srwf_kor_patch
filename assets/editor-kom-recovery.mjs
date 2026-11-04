// Bounded description of compression tokens, containing no literal game bytes.
// Replays the exact original packed KOM from its verified decoded preimage.
function fail(){const e=Error('KOM 원본 압축 기록이 올바르지 않습니다.');e.code='EDITOR_SRW4_MAP_INVALID';throw e;}
function parse(stream,raw){
 let cursor=0,flag=0,bits=0,at=0,lastFlagAt=0;const tokens=[];
 const byte=()=>{if(cursor>=stream.length)fail();return stream[cursor++];};
 const bit=()=>{if(!bits){lastFlagAt=cursor;flag=byte();bits=8;}return flag>>--bits&1;};
 for(let step=0;step<=raw.length;step++){
  const bitsBefore=bits;
  if(bit()){const value=byte();if(value!==raw[at])fail();tokens.push({at,length:1,kind:0,distance:0,bitsBefore});at++;continue;}
  let length,distance,kind;
  if(bit()){
   const code=(byte()<<8)|byte();distance=8192-(code>>>3);length=code&7;kind=length?2:3;
   if(!length){const extra=byte();if(!extra){if(at!==raw.length||cursor!==stream.length)fail();return {tokens,lastFlagAt,lastFlag:stream[lastFlagAt],unusedBits:bits};}length=extra+1;}
   else length+=2;
  }else{kind=1;length=(bit()<<1|bit())+2;distance=256-byte();}
  if(distance>at||at+length>raw.length)fail();
  for(let i=0;i<length;i++)if(raw[at-distance+i]!==raw[at+i])fail();
  tokens.push({at,length,kind,distance,bitsBefore});at+=length;
 }
 fail();
}
function matches(raw,{farWindow,nearWindow,maxLength,maxCandidates}){
 const nearLength=new Uint16Array(raw.length),nearDistance=new Uint16Array(raw.length),farLength=new Uint16Array(raw.length),farDistance=new Uint16Array(raw.length);
 const previous=new Int32Array(raw.length).fill(-1),head=new Int32Array(65536).fill(-1);let visitedMax=0,truncatedSearches=0;
 for(let at=0;at<raw.length;at++){
  const key=(raw[at]<<8)|(raw[at+1]??0),maximum=Math.min(maxLength,raw.length-at);let visited=0;
  for(let p=head[key];p>=0;p=previous[p]){
   const distance=at-p;if(distance>farWindow)break;
   if(visited===maxCandidates){truncatedSearches++;break;}visited++;
   let length=0;while(length<maximum&&raw[p+length]===raw[at+length])length++;
   if(length>farLength[at]){farLength[at]=length;farDistance[at]=distance;}
   if(distance<=nearWindow&&Math.min(length,5)>nearLength[at]){nearLength[at]=Math.min(length,5);nearDistance[at]=distance;}
   if(farLength[at]===maximum&&nearLength[at]===Math.min(maximum,5))break;
  }
  visitedMax=Math.max(visitedMax,visited);previous[at]=head[key];head[key]=at;
 }
 return {nearLength,nearDistance,farLength,farDistance,visitedMax,truncatedSearches};
}
function greedy(at,m,{minNear=2,minFar=3,tie='near'}={}){
 const far=m.farLength[at],near=m.nearLength[at];
 if(far>=minFar){
  if(far<=5&&near>=far&&tie==='near')return {length:far,kind:1,distance:m.nearDistance[at]};
  return {length:far,kind:far<=9?2:3,distance:m.farDistance[at]};
 }
 if(near>=minNear)return {length:near,kind:1,distance:m.nearDistance[at]};
 return {length:1,kind:0,distance:0};
}
function writer(){
 const out=[];let bits=0,flagAt=0;
 const bit=n=>{if(!bits){flagAt=out.length;out.push(0);bits=8;}out[flagAt]|=n<<--bits;};
 const byte=n=>out.push(n&255);
 return {
  get bitsLeft(){return bits;},
  token(token,raw,at){
   if(!token.kind){bit(1);byte(raw[at]);return;}
   bit(0);
   if(token.kind===1){bit(0);bit((token.length-2)>>1);bit((token.length-2)&1);byte(256-token.distance);}
   else{bit(1);const code=((8192-token.distance)<<3)|(token.kind===2?token.length-2:0);byte(code>>8);byte(code);if(token.kind===3)byte(token.length-1);}
  },
  finish(lastFlag=null){bit(0);bit(1);byte(0);byte(0);byte(0);if(lastFlag!==null){const mask=(1<<bits)-1;out[flagAt]=(out[flagAt]&~mask)|(lastFlag&mask);}return Uint8Array.from(out);},
 };
}

const params={farWindow:8191,nearWindow:256,maxLength:256,maxCandidates:1024};
function put(a,n){if(!Number.isInteger(n)||n<0||n>131072)fail();do{a.push((n&127)|(n>=128?128:0));n>>>=7;}while(n);}
function valid(raw){if(!(raw instanceof Uint8Array)||raw.length!==65664)fail();}
export function makeKomRecovery(stream,raw){
 valid(raw);if(!(stream instanceof Uint8Array)||stream.length>32768)fail();const actual=parse(stream,raw),m=matches(raw,params),out=[];let previous=0;
 for(const t of actual.tokens){const g=greedy(t.at,m);if(t.length===g.length&&t.kind===g.kind&&t.distance===g.distance)continue;put(out,t.at-previous);put(out,(t.length<<2)|t.kind);if(t.kind)put(out,t.distance);previous=t.at;}
 out.push(actual.lastFlag);if(out.length>2048)fail();const ledger=Uint8Array.from(out),restored=restoreKomRecovery(raw,ledger);if(restored.length!==stream.length||!restored.every((n,i)=>n===stream[i]))fail();return ledger;
}
export function restoreKomRecovery(raw,ledger){
 valid(raw);if(!(ledger instanceof Uint8Array)||ledger.length<1||ledger.length>2048)fail();let pos=0,previous=0;const overrides=new Map();
 const get=()=>{let n=0,shift=0;for(let i=0;i<3;i++){if(pos>=ledger.length-1)fail();const b=ledger[pos++];n|=(b&127)<<shift;if(!(b&128)){if(i&&b===0)fail();return n;}shift+=7;}fail();};
 while(pos<ledger.length-1){const at=previous+get(),code=get(),kind=code&3,length=code>>2,distance=kind?get():0;if(at>=raw.length||overrides.has(at)||length<1||length>256||kind===0&&length!==1||kind===1&&(length<2||length>5||distance<1||distance>256)||kind>=2&&(length<3||distance<1||distance>8192)||kind===2&&length>9||at+length>raw.length||kind&&distance>at)fail();overrides.set(at,{at,length,kind,distance});previous=at;}
 if(pos!==ledger.length-1)fail();const m=matches(raw,params),w=writer();let used=0;for(let at=0;at<raw.length;){const explicit=overrides.get(at),t=explicit??greedy(at,m);if(explicit)used++;if(t.kind)for(let j=0;j<t.length;j++)if(raw[at+j]!==raw[at-t.distance+j])fail();w.token(t,raw,at);at+=t.length;}
 if(used!==overrides.size)fail();return w.finish(ledger.at(-1));
}
