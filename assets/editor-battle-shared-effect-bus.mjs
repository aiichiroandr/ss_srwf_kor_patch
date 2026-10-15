import {prepareBattleEffectNodes} from './editor-battle-effect-node.mjs?v=20261015-stocknames2';

// One selected source effect graph receives both music and SE sends. Separate
// per-source routes preserve volume control without duplicating delay history.
export async function createBattleSharedEffectBus({context,graph,outputLevels,
  output=context?.destination,signal,NodeClass=globalThis.AudioWorkletNode}={}){
 const checkAbort=()=>{if(signal?.aborted)throw signal.reason??new DOMException('Effect bus preparation cancelled','AbortError');};
 checkAbort();
 if(!context?.createGain||!context.createChannelMerger||!context.createChannelSplitter||!output)
  throw new Error('Battle effect bus: explicit channel routing context required');
 const create=await prepareBattleEffectNodes(context,{NodeClass});checkAbort();
 let effect=null,input=null,disposed=false,playing=true;const routes=new Set();
 const live=()=>{if(disposed)throw new Error('Battle effect bus: disposed');};
 try{
  effect=create({graph,outputLevels});input=context.createChannelMerger(16);
  input.channelInterpretation='discrete';input.connect(effect);effect.connect(output);
 }catch(error){effect?.port.postMessage({type:'stop'});effect?.disconnect();input?.disconnect();throw error;}
 return {
  createRoute({volume=1}={}){
   live();if(!Number.isFinite(volume)||volume<0||volume>1)throw new Error('Battle effect route: invalid volume');
   const owned=[];let routeDisposed=false;
   try{
    const routeInput=context.createChannelMerger(16);owned.push(routeInput);
    const gain=context.createGain();owned.push(gain);
    gain.channelCount=16;gain.channelCountMode='explicit';gain.channelInterpretation='discrete';gain.gain.value=volume;
    const split=context.createChannelSplitter(16);owned.push(split);
    routeInput.channelInterpretation='discrete';routeInput.connect(gain);gain.connect(split);
    for(let channel=0;channel<16;channel++)split.connect(input,channel,channel);
    const route={input:routeInput,
     setVolume(value){live();if(routeDisposed)throw new Error('Battle effect route: disposed');if(!Number.isFinite(value)||value<0||value>1)throw new Error('Battle effect route: invalid volume');gain.gain.value=value;},
     dispose(){if(routeDisposed)return;routeDisposed=true;for(const node of owned)node.disconnect();routes.delete(route);},
     get state(){return{disposed:routeDisposed,volume:gain.gain.value};}};
    routes.add(route);return route;
   }catch(error){for(const node of owned)node.disconnect();throw error;}
  },
  setPlaying(value){live();if(typeof value!=='boolean')throw new Error('Battle effect bus: invalid playback state');if(playing!==value){playing=value;effect.port.postMessage({type:'pause',paused:!value});}},
  reset(){live();effect.port.postMessage({type:'reset'});},
  dispose(){if(disposed)return;for(const route of [...routes])route.dispose();disposed=true;effect.port.postMessage({type:'stop'});input.disconnect();effect.disconnect();},
  get state(){return{disposed,playing,routes:routes.size};},
  limitations:['source-effect-selection-is-explicit','effect-history-before-seek-not-reconstructed']
 };
}
