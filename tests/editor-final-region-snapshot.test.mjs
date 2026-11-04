import test from 'node:test';
import assert from 'node:assert/strict';
import {finalRegionSnapshotCode,FINAL_REGION_SNAPSHOT as P} from '../assets/editor-final-region-snapshot.mjs';

// Execute only authored instructions. The explicit original-handler stub
// tests the wrapper ABI/restoration, not actual C0.0F geometry or game execution.
function run({address=0x20288000,seed=1,result=0x6007,actors=0x20210000,list=0x20220000,invalid=false}={}){
 const mem=new Map(),r=new Uint32Array(16),stack=0x202f0000,stop=0x06001000,vm=0x20230000;
 const put=(at,bytes)=>bytes.forEach((x,i)=>mem.set(at+i,x));
 const store=(at,n,size)=>{for(let i=size-1;i>=0;i--){mem.set(at+i,n&255);n>>>=8;}};
 const read=(at,size)=>{let n=0;for(let i=0;i<size;i++){assert.ok(mem.has(at+i),`unmapped ${at.toString(16)}`);n=n*256+mem.get(at+i);}return n>>>0;};
 const dump=(at,n)=>Uint8Array.from({length:n},(_,i)=>read(at+i,1));
 const originalActors=Uint8Array.from({length:P.actorBytes},(_,i)=>(i*17+seed)&255),originalList=Uint8Array.from({length:P.listBytes},(_,i)=>(i*31+seed)&255);
 put(address,finalRegionSnapshotCode(address));if(!invalid){put(actors,originalActors);put(list,originalList);}put(stack-P.stackBytes,new Uint8Array(P.stackBytes));put(vm,new Uint8Array(40));
 store(P.actorPointer,actors,4);store(P.listPointer,list,4);
 r.forEach((_,i)=>r[i]=0xabc000+i);r[15]=stack;
 const before=r.slice();let pc=address,pr=stop,sr=0x3f3,steps=0,calls=0;
 const signed8=n=>(n&128)?(n&255)-256:n&255;
 const write=(at,value,size)=>{assert.ok(at>=stack-P.stackBytes&&at+size<=stack||at>=actors&&at+size<=actors+P.actorBytes||at>=list&&at+size<=list+P.listBytes,`foreign write ${at.toString(16)}`);store(at,value,size);};
 function instruction(at,w){const n=w>>>8&15,m=w>>>4&15,op=w&0xf00f;
  if(w===9)return;
  if(w===0x4f22||w===0x4f03){r[15]-=4;write(r[15],w===0x4f22?pr:sr,4);}
  else if(w===0x4f26||w===0x4f07){const x=read(r[15],4);r[15]+=4;if(w===0x4f26)pr=x;else sr=x;}
  else if(op===0x2006){r[n]-=4;write(r[n],r[m],4);}
  else if(op===0x6006){r[n]=read(r[m],4);r[m]+=4;}
  else if((w&0xf000)===0xd000)r[n]=read(((at+4)&~3)+(w&255)*4,4);
  else if(op===0x6002)r[n]=read(r[m],4);
  else if(op===0x6003)r[n]=r[m];
  else if((w&0xf0ff)===0x400e)sr=r[n];
  else if(op===0x6004){r[n]=signed8(read(r[m],1));r[m]++;}
  else if(op===0x2000)write(r[n],r[m],1);
  else if(op===0x2002)write(r[n],r[m],4);
  else if(op===0x300c)r[n]+=r[m];
  else if(op===0x3008)r[n]-=r[m];
  else if(op===0x3002)sr=(sr&~1)|Number(r[n]>=r[m]);
  else if(op===0x3006)sr=(sr&~1)|Number(r[n]>r[m]);
  else if((w&0xff00)===0xc800)sr=(sr&~1)|Number((r[0]&(w&255))===0);
  else if((w&0xf000)===0x7000)r[n]+=signed8(w);
  else if((w&0xf0ff)===0x4010){r[n]--;sr=(sr&~1)|Number(r[n]===0);}
  else assert.fail(`unsupported ${w.toString(16)}`);
 }
 while(pc!==stop){assert.ok(++steps<20000,'wrapper did not return');
  if(pc===P.handler){calls++;
   assert.equal(sr,0x3f3,'native handler receives incoming SR, not copy-loop T');
   assert.deepEqual(r.slice(0,8),before.slice(0,8),'original handler receives original volatile arguments');
   assert.deepEqual(dump(r[15],P.actorBytes),originalActors);
   assert.deepEqual(dump(r[15]+P.actorBytes,P.listBytes),originalList);
   put(actors,new Uint8Array(P.actorBytes).fill(0xee));put(list,new Uint8Array(P.listBytes).fill(0xdd));
   store(vm+20,17,4);store(vm+37,128,1);
   for(let i=1;i<8;i++)r[i]=0xbad000+i;
   r[0]=result;sr=0;pc=pr;continue;
  }
  const at=pc,w=read(at,2);
  if([0x8b00,0x8900].includes(w&0xff00))pc=((w&0xff00)===0x8900?!!(sr&1):!(sr&1))?at+4+signed8(w)*2:at+2;
  else if((w&0xf000)===0xa000){instruction(at+2,read(at+2,2));const d=(w&0x800)?(w&0xfff)-4096:w&0xfff;pc=at+4+d*2;}
  else if(w===11||(w&0xf0ff)===0x400b){const target=w===11?pr:r[w>>>8&15];if(w!==11)pr=at+4;instruction(at+2,read(at+2,2));pc=target;}
  else{instruction(at,w);pc+=2;}
 }
 assert.equal(calls,invalid?0:1);assert.equal(r[0],invalid?P.invalidReturn:result);assert.equal(pr,stop);assert.equal(sr,0x3f3);assert.deepEqual(r.slice(8),before.slice(8));
 if(invalid){assert.equal(read(vm+20,4),0);assert.equal(read(vm+37,1),0);return steps;}
 assert.deepEqual(dump(actors,P.actorBytes),originalActors);assert.deepEqual(dump(list,P.listBytes),originalList);
 assert.equal(read(vm+20,4),17);assert.equal(read(vm+37,1),128);
 return steps;
}
test('Final query wrapper restores all actor/list bytes and ABI while keeping native predicate/count',()=>{
 for(const address of [0x20288000,0x20288004,0x20290000])for(const seed of [0,1,127,255])for(const result of [0x6007,0xf000])assert.ok(run({address,seed,result})>10000);
 assert.equal(P.installed,false);
});
test('snapshot rejects unmapped, overflowing and overlapping sources before original handler entry',()=>{
 for(const actors of [0,0x201ffffe,0x202ffb62,0xfffffffe,0x20210001,0x20220000,0x2021fffe,0x20288000,0x20287ffe,0x202efffe,0x202efa38])run({actors,invalid:true});
 for(const list of [0,0x201fffff,0x202fff00,0xffffffff,0x20210000,0x2021049f,0x2020fffe,0x20288000,0x20287fff,0x202effff,0x202efa38])run({list,invalid:true});
 // Adjacent ranges and last byte of high RAM remain valid.
 run({list:0x202104a0});run({list:0x202ffeff});run({actors:0x202ffb60});
});
test('snapshot compiler bounds placement and emits deterministic address-bound code',()=>{
 assert.deepEqual(finalRegionSnapshotCode(0x20288000),finalRegionSnapshotCode(0x20288000));
 assert.notDeepEqual(finalRegionSnapshotCode(0x20288000),finalRegionSnapshotCode(0x20288004));
 for(const address of [null,0x06003700,0x20288002,0x20300000,0x202ffffc])assert.throws(()=>finalRegionSnapshotCode(address),RangeError);
});
