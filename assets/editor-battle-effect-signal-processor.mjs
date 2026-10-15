import{packBattleEffectDelay,unpackBattleEffectDelay}from'./editor-battle-effect-delay-format.mjs';
// Execute a precompiled signal DAG. There is no instruction fetch, program
// counter, sound CPU, original RAM image or DSP VM in the audio path.
export function createBattleEffectSignalProcessor(graph,{initialDelayWord}={}){
 const types=new Set(['constant','temporary-history','input-history','mix-input','external-input','negate','clip-signed24','wrap-signed32','add','multiply-shift12','signed13','extract-fraction','delay-read','delay-roundtrip','shift-right8']);
 if(graph?.status!=='reference'||!Array.isArray(graph.nodes)||!Number.isInteger(graph.valueCount)||graph.valueCount<1||graph.valueCount>5000||!Number.isInteger(graph.ringLengthCode)||graph.ringLengthCode<0||graph.ringLengthCode>3)throw new Error('Battle effect signal: unsupported graph');
 const known=new Set();for(const n of graph.nodes){if(!Number.isInteger(n.id)||n.id<0||n.id>=graph.valueCount||known.has(n.id)||!types.has(n.type)||!Array.isArray(n.args)||n.args.some(id=>!known.has(id)))throw new Error('Battle effect signal: invalid dependencies');known.add(n.id);}
 const outputs=Object.entries(graph.outputs),tempWrites=Object.entries(graph.temporaryWrites),memWrites=Object.entries(graph.memoryWrites);
 for(const[entries,limit]of [[outputs,16],[tempWrites,128],[memWrites,32]])for(const[index,id]of entries)if(!Number.isInteger(Number(index))||Number(index)<0||Number(index)>=limit||!known.has(id))throw new Error('Battle effect signal: invalid state root');
 const values=new Float64Array(graph.valueCount),temp=new Int32Array(128),memory=new Int32Array(32),delay=new Uint16Array(8192<<graph.ringLengthCode),mask=delay.length-1,result=new Int32Array(16);let frame=0;
 const silentExternal=new Int32Array(2),program=graph.nodes.filter(n=>n.type!=='constant');
 const initializeConstants=()=>{for(const n of graph.nodes)if(n.type==='constant'){if(!Number.isFinite(n.value))throw new Error('Battle effect signal: invalid constant');values[n.id]=n.value;}};initializeConstants();
 // Fresh packed history: shared driver1342 loads60006000 and1352..135A
 // fills the effect work area. Mixed formats need an explicit initial word.
 const signedStorage=graph.nodes.some(n=>n.encoding==='signed16'||n.readEncoding==='signed16'||n.writeEncoding==='signed16')||graph.delayWrites.some(w=>w.encoding==='signed16');
 if(initialDelayWord===undefined){if(signedStorage)throw new Error('Battle effect signal: explicit delay initialization required');initialDelayWord=packBattleEffectDelay(0);}
 if(!Number.isInteger(initialDelayWord)||initialDelayWord<0||initialDelayWord>65535)throw new Error('Battle effect signal: invalid delay initialization');
 delay.fill(initialDelayWord);
 const address=n=>(n.address+Number(n.next)-frame)&mask;
 const encode=(value,encoding)=>encoding==='signed16'?(value>>8)&65535:packBattleEffectDelay(value);
 const decode=(word,encoding)=>encoding==='signed16'?(word<<16>>16)*256:unpackBattleEffectDelay(word);
 const processSample=(mix,external=silentExternal)=>{
  if(!(mix instanceof Int32Array)||mix.length!==16||!(external instanceof Int32Array)||external.length!==2||mix.some(v=>v< -524288||v>524287)||external.some(v=>v< -32768||v>32767))throw new Error('Battle effect signal: bounded source inputs required');
  for(const n of program){const a=values[n.args[0]],b=values[n.args[1]];let v;
   switch(n.type){
    case'constant':v=n.value;break;
    case'temporary-history':v=temp[(n.index-frame)&127];break;
    case'input-history':v=memory[n.index];break;
    case'mix-input':v=mix[n.index]*16;break;
    case'external-input':v=external[n.index]*256;break;
    case'negate':v=-a;break;
    case'clip-signed24':v=Math.max(-8388608,Math.min(8388607,a*n.scale));break;
    case'wrap-signed32':v=a|0;break;
    case'add':v=a+b;break;
    case'multiply-shift12':v=Math.floor(a*b/4096);break;
    case'signed13':v=a<<19>>19;break;
    case'extract-fraction':v=(a>>11)&8191;break;
    case'delay-read':v=decode(delay[address(n)],n.encoding);break;
    case'delay-roundtrip':v=decode(encode(a,n.writeEncoding),n.readEncoding);break;
    case'shift-right8':v=a>>8;break;
   }
   if(!Number.isFinite(v))throw new Error('Battle effect signal: invalid node value');values[n.id]=v;
  }
  result.fill(0);for(const[index,id]of outputs)result[Number(index)]=values[id];
  for(const[index,id]of tempWrites)temp[(Number(index)-frame)&127]=values[id];
  for(const[index,id]of memWrites)memory[Number(index)]=values[id];
  for(const w of graph.delayWrites)delay[address(w)]=encode(values[w.value],w.encoding);
  frame=(frame+1)&65535;return result;
 };
 return{processSample,reset(){temp.fill(0);memory.fill(0);delay.fill(initialDelayWord);values.fill(0);initializeConstants();result.fill(0);frame=0;},scope:'reference signal DAG with fresh web history; native comparison and browser effect routing pending'};
}
