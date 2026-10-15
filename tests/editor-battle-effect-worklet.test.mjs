import test from 'node:test';
import assert from 'node:assert/strict';
import {readBattleEffectBank} from '../assets/editor-battle-effect-bank.mjs';
import {compileBattleEffectSignalGraph} from '../assets/editor-battle-effect-signal-graph.mjs';
test('paused effect output is silent and retains its processing history without ending the worklet',async()=>{
 const keys=['AudioWorkletProcessor','sampleRate','registerProcessor'],saved=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));let Processor;
 globalThis.AudioWorkletProcessor=class{constructor(){this.port={};}};globalThis.sampleRate=44100;globalThis.registerProcessor=(_name,type)=>Processor=type;
 try{
  await import('../assets/editor-battle-effect-worklet.mjs?test=paused-history');
  const bytes=new Uint8Array(1344);bytes.set(new TextEncoder().encode('test.EXB'));
  const p=new Processor({processorOptions:{graph:compileBattleEffectSignalGraph(readBattleEffectBank(bytes))}});
  let rendered=0,resets=0;const process=p.processor.processSample,reset=p.processor.reset;
  p.processor.processSample=(...args)=>{rendered++;return process(...args);};p.processor.reset=()=>{resets++;reset();};
  const channels=Array.from({length:16},()=>new Float32Array(4).fill(1));
  p.port.onmessage({data:{type:'pause',paused:true}});assert.equal(p.process([[]],[channels]),true);assert.equal(rendered,0);assert.equal(resets,0);assert.ok(channels.every(channel=>channel.every(value=>value===0)));
  p.port.onmessage({data:{type:'pause',paused:false}});assert.equal(p.process([[]],[channels]),true);assert.equal(rendered,4);assert.equal(resets,0);
  p.port.onmessage({data:{type:'stop'}});assert.equal(p.process([[]],[channels]),false);
 }finally{for(const key of keys){const descriptor=saved.get(key);if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
});
