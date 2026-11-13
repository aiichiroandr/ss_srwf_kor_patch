// Synthetic, bounded SH-2 execution for the repository-authored ALICE crew
// adapter.  It is not a Saturn/game runtime: only the allocator and SP
// initializer call boundaries are stubbed, and no game instruction bytes are
// included here.
const s8=value=>(value<<24)>>24;
const s16=value=>(value<<16)>>16;
const s32=value=>value|0;
const s12=value=>value&0x800?(value|0xfffff000):value;

class Memory {
  constructor(){this.bytes=new Map();}
  load(at,bytes){bytes.forEach((value,index)=>this.bytes.set((at+index)>>>0,value));}
  get(at,size){let value=0;for(let index=0;index<size;index++)value=value*256+(this.bytes.get((at+index)>>>0)??0);return value>>>0;}
  set(at,size,value){for(let index=size-1;index>=0;index--){this.bytes.set((at+index)>>>0,value&255);value=Math.floor(value/256);}}
}

const readCode=(memory,address)=>memory.get(address,2);
// Native pilot rows are 12 bytes: +8 next, +9 morale, +10..11 BE SP16.
const profileRows=(memory,pilots)=>Array.from({length:128},(_,slot)=>({
  slot,id:memory.get(pilots+slot*12,2),flags:memory.get(pilots+slot*12+3,1),next:memory.get(pilots+slot*12+8,1),morale:memory.get(pilots+slot*12+9,1),sp:memory.get(pilots+slot*12+10,2),
}));
const unitRows=(memory,units)=>Array.from({length:128},(_,slot)=>({
  slot,id:memory.get(units+slot*30,2),pilotSlot:memory.get(units+slot*30+15,1),status:memory.get(units+slot*30+16,1),
}));

// `code` is the exact authored bytes under characterization.  The two stubs
// model only the documented native allocator and SP-initializer ABI enough to
// let the authored caller execute; all reconciliation reads/writes come from
// interpreting `code` itself.
export function executeAliceCrewSynthetic({code,base,entry,profile,units=[],pilots=[],initialSp=325,initialMorale=100,maxSteps=200000}={}){
  if(!(code instanceof Uint8Array)||!Number.isInteger(base)||!Number.isInteger(entry)||!profile)throw TypeError('synthetic ALICE VM requires authored code and a profile');
  const memory=new Memory(),r=new Uint32Array(16),calls={create:0,fillSP:0},writes=[];
  const unitBase=0x20010000,pilotBase=0x20012000;
  memory.load(base,code);memory.set(profile.unitsGlobal,4,unitBase);memory.set(profile.pilotsGlobal,4,pilotBase);
  for(const row of units){const at=unitBase+row.slot*30;memory.set(at,2,row.id);memory.set(at+15,1,row.pilotSlot??255);memory.set(at+16,1,row.status??255);}
  for(const row of pilots){const at=pilotBase+row.slot*12;memory.set(at,2,row.id);memory.set(at+3,1,row.flags??(row.id===399?8:0));memory.set(at+8,1,row.next??255);memory.set(at+9,1,row.morale??0);memory.set(at+10,2,row.sp??initialSp);}
  r[15]=0x060ff000;let pc=entry>>>0,pr=0,sr=0,mach=0,macl=0,steps=0,returned=false;
  const read=(at,size)=>memory.get(at,size);
  const write=(at,size,value)=>{memory.set(at,size,value);writes.push({at,size,value:value>>>0});};
  const setT=value=>{sr=(sr&~1)|(value?1:0);};
  const getT=()=>sr&1;
  const execute=(at,w)=>{
    const n=w>>>8&15,m=w>>>4&15,low=w&15,op=w&0xf00f;
    if(w===0x0009)return;
    if(w===0x0102){r[15]=(r[15]-4)>>>0;write(r[15],4,sr);return;}
    if(w===0x4f22){r[15]=(r[15]-4)>>>0;write(r[15],4,pr);return;}
    if(w===0x4f02){r[15]=(r[15]-4)>>>0;write(r[15],4,mach);return;}
    if(w===0x4f12){r[15]=(r[15]-4)>>>0;write(r[15],4,macl);return;}
    if(w===0x410e){sr=r[1];return;}
    if(w===0x4f16){macl=read(r[15],4);r[15]=(r[15]+4)>>>0;return;}
    if(w===0x4f06){mach=read(r[15],4);r[15]=(r[15]+4)>>>0;return;}
    if(w===0x4f26){pr=read(r[15],4);r[15]=(r[15]+4)>>>0;return;}
    if((w&0xf000)===0xd000){r[n]=read(((at+4)&~3)+(w&255)*4,4);return;}
    if((w&0xf000)===0xe000){r[n]=s8(w&255)>>>0;return;}
    if((w&0xf000)===0x7000){r[n]=(r[n]+s8(w&255))>>>0;return;}
    if(op===0x2000){write(r[n],1,r[m]);return;}
    if(op===0x2001){write(r[n],2,r[m]);return;}
    if(op===0x2002){write(r[n],4,r[m]);return;}
    if(op===0x2008){setT((r[n]&r[m])===0);return;}
    if(op===0x2009){r[n]&=r[m];return;}
    if(op===0x2006){r[n]=(r[n]-4)>>>0;write(r[n],4,r[m]);return;}
    if(op===0x6000){r[n]=s8(read(r[m],1))>>>0;return;}
    if(op===0x6001){r[n]=s16(read(r[m],2))>>>0;return;}
    if(op===0x6002){r[n]=read(r[m],4);return;}
    if(op===0x6003){r[n]=r[m];return;}
    if(op===0x6006){r[n]=read(r[m],4);if(n!==m)r[m]=(r[m]+4)>>>0;return;}
    if(op===0x600c){r[n]=r[m]&255;return;}
    if(op===0x600d){r[n]=r[m]&65535;return;}
    if(op===0x3000){setT(r[n]===r[m]);return;}
    if(op===0x300c){r[n]=(r[n]+r[m])>>>0;return;}
    if(op===0x3006){setT(s32(r[n])>s32(r[m]));return;}
    if((w&0xf0ff)===0x4008){r[n]=(r[n]<<2)>>>0;return;}
    if((w&0xf0ff)===0x4009){r[n]>>>=2;return;}
    if((w&0xf0ff)===0x4010){r[n]=(r[n]-1)>>>0;setT(r[n]===0);return;}
    if((w&0xff00)===0xc800){setT((r[0]&(w&255))===0);return;}
    if((w&0xff00)===0xc900){r[0]&=w&255;return;}
    if((w&0xff00)===0xcb00){r[0]|=w&255;return;}
    if((w&0xf000)===0x8000&&n===0){write(r[m]+low,1,r[0]);return;}
    throw Error(`unsupported authored SH-2 instruction 0x${w.toString(16)} at 0x${at.toString(16)}`);
  };
  const allocator=()=>{
    calls.create++;const slot=Array.from({length:128},(_,index)=>index).find(index=>read(pilotBase+index*12,2)===0);
    if(slot===undefined){r[0]=0xffffffff;return;}
    const at=pilotBase+slot*12;write(at,2,r[4]&65535);write(at+3,1,8);write(at+8,1,255);write(at+9,1,initialMorale);write(at+10,2,initialSp);r[0]=slot;
  };
  const fill=()=>{calls.fillSP++;const slot=r[4]&255;if(slot<128)write(pilotBase+slot*12+10,2,initialSp);};
  while(!returned){
    if(++steps>maxSteps)throw Error('authored ALICE crew code did not return in the synthetic VM');
    if(pc===profile.create){allocator();pc=pr;continue;}
    if(pc===profile.fillSP){fill();pc=pr;continue;}
    if(pc===profile.continueActor||pc===profile.continuePilot){returned=true;break;}
    const w=readCode(memory,pc),top=w&0xff00;
    if(top===0x8900||top===0x8b00){const taken=top===0x8900?getT():!getT();pc=taken?(pc+4+s8(w&255)*2)>>>0:(pc+2)>>>0;continue;}
    if((w&0xf000)===0xa000){execute(pc+2,readCode(memory,pc+2));pc=(pc+4+s12(w&0xfff)*2)>>>0;continue;}
    if((w&0xf0ff)===0x400b){pr=(pc+4)>>>0;execute(pc+2,readCode(memory,pc+2));pc=r[w>>>8&15]>>>0;continue;}
    if((w&0xf0ff)===0x402b){execute(pc+2,readCode(memory,pc+2));pc=r[w>>>8&15]>>>0;continue;}
    if(w===0x000b){execute(pc+2,readCode(memory,pc+2));pc=pr;continue;}
    execute(pc,w);pc=(pc+2)>>>0;
  }
  return Object.freeze({calls:Object.freeze({...calls}),steps,pilots:Object.freeze(profileRows(memory,pilotBase)),units:Object.freeze(unitRows(memory,unitBase)),writes:Object.freeze(writes)});
}
