// Authored SH-2 wrapper, not installed by any image writer yet. Its caller must
// authenticate the Final executable and provide a valid native stack before
// entry. Source spans are checked before copying. No scenario permission here.
// Original C0.0F writes the VM result/predicate; retain those while restoring
// the actor table and shared list. The original handler must return without yield.
export const FINAL_REGION_SNAPSHOT=Object.freeze({
 actorPointer:0x060b855c,listPointer:0x060bb298,handler:0x06024bc0,
 actorBytes:1184,listBytes:257,localBytes:1448,stackBytes:1480,
 invalidReturn:0xf000,installed:false,
});

export function finalRegionSnapshotCode(address){
 if(!Number.isInteger(address)||address<0x20200000||address>=0x20300000||(address&3))throw new RangeError('Snapshot code requires a four-aligned scenario RAM address.');
 const words=[],labels=new Map(),fixups=[];
 const emit=w=>words.push(w),mark=name=>labels.set(name,words.length*2);
 const literal=(r,name)=>{fixups.push({kind:'literal',at:words.length*2,r,name});emit(0);};
 const branch=(name,opcode=0x8b00)=>{fixups.push({kind:'branch',at:words.length*2,name,opcode});emit(0);};
 const rejectUnless=()=>{emit(0x8901);branch('invalid',0xa000);emit(9);};
 const rejectIf=()=>{emit(0x8b01);branch('invalid',0xa000);emit(9);};
 const span=(register,size,name)=>{
  emit(0x6803|(register<<4));literal(9,size);emit(0x398c); // r8=start, r9=end
  literal(10,'ramLow');emit(0x38a2);rejectUnless();
  emit(0x3982);rejectUnless(); // reject wrapping ends
  literal(10,'ramHigh');emit(0x39a6);rejectIf();
  literal(10,'stackBytes');emit(0x3afc);emit(0x38a2);branch(name+'Stack',0x8900);
  emit(0x3f92);rejectUnless();mark(name+'Stack');
  literal(10,'codeEnd');emit(0x38a2);branch(name+'Code',0x8900);
  literal(10,'codeStart');emit(0x3a92);rejectUnless();mark(name+'Code');
 };
 const copy=(name,count)=>{literal(10,count);mark(name);emit(0x6084);emit(0x2900);emit(0x7901);emit(0x4a10);branch(name);};
 emit(0x2f06);for(let r=8;r<=12;r++)emit(0x2f06|(r<<4));
 emit(0x4f22);emit(0x4f03); // incoming r0, r8..12, PR, SR
 literal(8,'localBytes');emit(0x3f88);
 literal(8,'actorPointer');emit(0x6b82);
 literal(8,'listPointer');emit(0x6c82);
 emit(0x60b3);emit(0xc801);rejectUnless(); // actor table requires word alignment
 span(11,'actorBytes','actors');span(12,'listBytes','list');
 // r8/r9 still hold the list interval. The actor interval must not overlap it.
 emit(0x3b92);branch('disjoint',0x8900);
 literal(10,'actorBytes');emit(0x3abc);emit(0x38a2);rejectUnless();mark('disjoint');
 emit(0x68b3);emit(0x69f3);copy('saveActors','actorBytes');
 emit(0x68c3);copy('saveList','listBytes');
 // Copy loops leave r1..7 untouched. Restore incoming r0 for the native call.
 literal(8,'localBytes');emit(0x38fc);emit(0x6882);emit(0x480e);
 literal(8,'incomingR0');emit(0x38fc);emit(0x6082);
 literal(8,'handler');emit(0x480b);emit(9);
 literal(8,'returnSlot');emit(0x38fc);emit(0x2802);
 emit(0x68f3);emit(0x69b3);copy('restoreActors','actorBytes');
 emit(0x69c3);copy('restoreList','listBytes');
 literal(8,'returnSlot');emit(0x38fc);emit(0x6082);
 branch('finish',0xa000);emit(9);
 mark('invalid');literal(0,'invalidReturn');
 mark('finish');
 literal(8,'localBytes');emit(0x3f8c);
 emit(0x4f07);emit(0x4f26);
 for(let r=12;r>=8;r--)emit(0x60f6|(r<<8));
 emit(0x000b);emit(0x7f04); // discard saved input r0, keep handler's return
 while(words.length%2)emit(9);
 const p=FINAL_REGION_SNAPSHOT;
 for(const [name,value]of Object.entries({actorPointer:p.actorPointer,listPointer:p.listPointer,handler:p.handler,actorBytes:p.actorBytes,listBytes:p.listBytes,localBytes:p.localBytes,incomingR0:p.localBytes+28,returnSlot:p.localBytes-4,ramLow:0x20200000,ramHigh:0x20300000,stackBytes:p.stackBytes,codeStart:address,codeEnd:0,invalidReturn:p.invalidReturn})){
  mark(name);emit(value>>>16);emit(value&65535);
 }
 const end=address+words.length*2;words[labels.get('codeEnd')/2]=end>>>16;words[labels.get('codeEnd')/2+1]=end&65535;
 for(const f of fixups){const target=labels.get(f.name);
  if(f.kind==='literal'){
   const delta=(target-(((address+f.at+4)&~3)-address))/4;
   if(!Number.isInteger(delta)||delta<0||delta>255)throw new RangeError('Snapshot literal out of range.');
   words[f.at/2]=0xd000|(f.r<<8)|delta;
  }else{
   const delta=(target-f.at-4)/2;
   const bits=f.opcode===0xa000?12:8;
   if(!Number.isInteger(delta)||delta< -(2**(bits-1))||delta>=2**(bits-1))throw new RangeError('Snapshot branch out of range.');
   words[f.at/2]=f.opcode|(delta&(2**bits-1));
  }
 }
 const bytes=new Uint8Array(words.length*2),v=new DataView(bytes.buffer);
 words.forEach((w,i)=>v.setUint16(i*2,w));
 if(address+bytes.length>0x20300000)throw new RangeError('Snapshot code exceeds scenario RAM.');
 return bytes;
}
