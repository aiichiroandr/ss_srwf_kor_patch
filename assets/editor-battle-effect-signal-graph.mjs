// Static dependency graph, not a DSP interpreter. Reference ordering keeps
// previous accumulator writes distinct from the current multiply/add result.
export function compileBattleEffectSignalGraph(effect){
 if(!Array.isArray(effect?.instructions)||effect.instructions.length!==128||!Array.isArray(effect.coefficients)||effect.coefficients.length!==64||!Array.isArray(effect.delayAddresses)||effect.delayAddresses.length!==32)throw new Error('Battle effect graph: bounded source required');
 if(!Number.isInteger(effect.ringLengthCode)||effect.ringLengthCode<0||effect.ringLengthCode>3)throw new Error('Battle effect graph: invalid ring length');
 const ringMask=(8192<<effect.ringLengthCode)-1,lastDelayWrites=new Map();
 const nodes=[],temporary=new Map(),memory=new Map(),outputs=new Map(),temporaryWrites=new Map(),memoryWrites=new Map(),delayWrites=[],unresolved=[];
 const add=(type,args=[],data={})=>{const id=nodes.length;nodes.push({id,type,args,...data});return id;};
 const zero=add('constant',[],{value:0});let accumulator=zero,fraction=zero,memoryValue=zero;
 const temp=index=>{if(!temporary.has(index))temporary.set(index,add('temporary-history',[],{index}));return temporary.get(index);};
 const mem=index=>{if(!memory.has(index))memory.set(index,add('input-history',[],{index}));return memory.get(index);};
 for(const instruction of effect.instructions){
  const f=instruction.fields,step=instruction.index;
  if(!f||f.reservedBits?.some(Boolean)||f.multiplierSource>1||f.shiftMode>1||f.absoluteAddress||f.addAddressRegister||f.loadAddress){unresolved.push({step,reason:'effect-graph-operation-unimplemented'});continue;}
  let input=f.inputRead<32?mem(f.inputRead):f.inputRead<48?add('mix-input',[],{index:f.inputRead-32}):f.inputRead<50?add('external-input',[],{index:f.inputRead-48}):null;
  if(input===null){unresolved.push({step,reason:'effect-input-range-unresolved'});continue;}
  if(f.inputWriteEnabled){memory.set(f.inputWrite,memoryValue);memoryWrites.set(f.inputWrite,memoryValue);if(f.inputRead===f.inputWrite)input=memoryValue;}
  const previous=accumulator,tap=temp(f.temporaryRead),x=f.inputAsX?input:tap;
  const coefficient=effect.coefficients[f.coefficientIndex]?.signed;
  if(!Number.isInteger(coefficient)||coefficient< -32768||coefficient>32767)throw new Error('Battle effect graph: invalid coefficient');
  const y=f.multiplierSource===1?add('constant',[],{value:coefficient>>3}):fraction;
  let b=f.zeroAddend?zero:f.accumulatorAsAddend?previous:tap;if(f.negateAddend)b=add('negate',[b]);
  const shifted=add('clip-signed24',[previous],{scale:f.shiftMode===1?2:1});
  accumulator=add('wrap-signed32',[add('add',[add('multiply-shift12',[x,y]),b])]);
  if(f.temporaryWriteEnabled){temporary.set(f.temporaryWrite,shifted);temporaryWrites.set(f.temporaryWrite,shifted);}
  if(f.loadFraction)fraction=add('signed13',[add('extract-fraction',[shifted])]);
  const delayData={address:effect.delayAddresses[f.delayAddressIndex],next:Boolean(f.nextDelayAddress),encoding:f.unpackedDelay?'signed16':'packed-float16',step};
  if(!Number.isInteger(delayData.address)||delayData.address<0||delayData.address>65535)throw new Error('Battle effect graph: invalid delay address');
  const delayKey=(delayData.address+Number(delayData.next))&ringMask,prior=lastDelayWrites.get(delayKey);
  if(f.delayReadEnabled&&step%2)memoryValue=prior?add('delay-roundtrip',[prior.value],{readEncoding:delayData.encoding,writeEncoding:prior.encoding,step}):add('delay-read',[],delayData);
  if(f.delayWriteEnabled&&step%2){delayWrites.push({value:shifted,...delayData});lastDelayWrites.set(delayKey,{value:shifted,encoding:delayData.encoding});}
  if(f.effectWriteEnabled)outputs.set(f.effectOutput,add('add',[outputs.get(f.effectOutput)??zero,add('shift-right8',[shifted])]));
 }
 // Prune dead calculations while preserving stable dependency IDs.
 const roots=[...outputs.values(),...temporaryWrites.values(),...memoryWrites.values(),...delayWrites.map(w=>w.value)],live=new Set();
 const visit=id=>{if(live.has(id))return;live.add(id);for(const input of nodes[id].args)visit(input);};for(const root of roots)visit(root);
 return{status:unresolved.length?'partial':'reference',nodes:nodes.filter(n=>live.has(n.id)),valueCount:nodes.length,outputs:Object.fromEntries(outputs),temporaryWrites:Object.fromEntries(temporaryWrites),memoryWrites:Object.fromEntries(memoryWrites),delayWrites,unresolved,
  ringLengthCode:effect.ringLengthCode,scope:'static source dependency graph; packed delay storage and web execution remain unimplemented'};
}
