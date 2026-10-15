import {tickBattleActorPool} from './editor-battle-clock.mjs?v=20261015-stocknames2';

// Entry prefix F0603251A..32540 / Final0603778A..377B6. Side
// bytes are copied even when context+71 bit7 stops actor advancement.
// Final060434DC clears two of four retained1024-byte buffers before the pool.
export function runBattleActorPoolTask(pool,shared,{gameId,sideBytes,shadowBytes,finalBuffers}={}){
  const fail=()=>{throw new Error('Battle actor task: unresolved native entry state');};
  if(!['srwf-f','srwf-final'].includes(gameId)||!shared
    ||!Number.isInteger(shared.mainContextByte71)||shared.mainContextByte71<0||shared.mainContextByte71>255
    ||!(sideBytes instanceof Uint8Array)||sideBytes.length!==2
    ||!(shadowBytes instanceof Uint8Array)||shadowBytes.length!==2
    ||!pool||!Array.isArray(pool.records)||pool.records.length!==128
    ||!Number.isInteger(shared.flags)||shared.flags<0||shared.flags>0xffffffff)fail();
  const enabled=Boolean(shared.mainContextByte71&128);
  if(enabled&&gameId==='srwf-final'&&(!(finalBuffers?.bytes instanceof Uint8Array)
    ||finalBuffers.bytes.length!==4096||!Number.isInteger(finalBuffers.flagsByte)
    ||finalBuffers.flagsByte<0||finalBuffers.flagsByte>255))fail();
  shadowBytes.set(sideBytes);
  if(!enabled)return {status:'waiting',reason:'actor-update-disabled',tick:pool.tick??0,frames:[],blocked:[]};
  if(gameId==='srwf-final'){
    const alternate=Boolean(finalBuffers.flagsByte&128);
    finalBuffers.flagsByte&=alternate?0xcf:0xf3;
    for(const index of alternate?[0,2]:[1,3])finalBuffers.bytes.fill(255,index*1024,(index+1)*1024);
  }
  return {status:'advanced',...tickBattleActorPool(pool,shared)};
}
