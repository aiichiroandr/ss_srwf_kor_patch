import test from 'node:test';
import assert from 'node:assert/strict';
import {createBattleSharedEffectBus} from '../assets/editor-battle-shared-effect-bus.mjs';
import {readBattleEffectBank} from '../assets/editor-battle-effect-bank.mjs';
import {compileBattleEffectSignalGraph} from '../assets/editor-battle-effect-signal-graph.mjs';
const graph=()=>{const bytes=new Uint8Array(1344);bytes.set(new TextEncoder().encode('test.EXB'));return compileBattleEffectSignalGraph(readBattleEffectBank(bytes));};
function context(){const nodes=[];const make=(kind,count)=>{const node={kind,count,gain:{value:1},connections:[],connect(...args){this.connections.push(args);},disconnect(){this.detached=true;}};nodes.push(node);return node;};return{sampleRate:44100,destination:{},nodes,audioWorklet:{async addModule(){}},createGain:()=>make('gain'),createChannelMerger:n=>make('merge',n),createChannelSplitter:n=>make('split',n)};}
class EffectNode {static created=[];constructor(_context,_name,options){this.options=options;this.messages=[];this.port={postMessage:m=>this.messages.push(m)};EffectNode.created.push(this);}connect(output){this.output=output;}disconnect(){this.detached=true;}}
const levels=()=>Array.from({length:16},()=>({left:1,right:1}));
test('music and SE share one effect history and retain independent sixteen-channel volume routes',async()=>{
 EffectNode.created=[];const ctx=context(),bus=await createBattleSharedEffectBus({context:ctx,graph:graph(),outputLevels:levels(),NodeClass:EffectNode});
 const music=bus.createRoute({volume:.35}),se=bus.createRoute({volume:.8});assert.equal(EffectNode.created.length,1);assert.equal(bus.state.routes,2);
 const splits=ctx.nodes.filter(n=>n.kind==='split');assert.equal(splits.length,2);
 for(const split of splits){assert.equal(split.connections.length,16);assert.deepEqual(split.connections.map(c=>c.slice(1)),Array.from({length:16},(_,i)=>[i,i]));}
 assert.equal(splits[0].connections[0][0],splits[1].connections[0][0]);
 music.setVolume(.2);assert.equal(se.state.volume,.8);music.dispose();assert.equal(bus.state.routes,1);assert.equal(EffectNode.created[0].detached,undefined);
 bus.setPlaying(false);bus.setPlaying(true);assert.deepEqual(EffectNode.created[0].messages,[{type:'pause',paused:true},{type:'pause',paused:false}]);
 bus.dispose();assert.equal(se.state.disposed,true);assert.equal(EffectNode.created[0].detached,true);assert.equal(bus.state.routes,0);assert.throws(()=>bus.createRoute(),/disposed/);bus.dispose();
});
test('cancellation during registration cannot construct or connect a late shared bus',async()=>{
 EffectNode.created=[];const ctx=context(),controller=new AbortController();let finish;
 ctx.audioWorklet.addModule=()=>new Promise(resolve=>finish=resolve);
 const pending=createBattleSharedEffectBus({context:ctx,graph:graph(),outputLevels:levels(),NodeClass:EffectNode,signal:controller.signal});
 const rejected=assert.rejects(pending,{name:'AbortError'});controller.abort();finish();await rejected;
 assert.equal(EffectNode.created.length,0);assert.equal(ctx.nodes.length,0);
});
