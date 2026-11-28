import test from 'node:test';
import assert from 'node:assert/strict';
import {carryoverDownloadName,carryoverFormatLabel} from '../assets/save-carryover-format.mjs';
import {findAutomaticCarryoverInputs,createAutoCarryoverUI} from '../assets/save-auto-carryover-ui.mjs';
function handle(name,size,header=/\.(?:bkr|bcr|sav|srm|gz)$/i.test(name)?'BackUpRam Format'.repeat(4):''){
 return {kind:'file',name,async getFile(){return {name,size,slice(){return new Blob([header]);}}}};
}
const f=handle('mod.bin',578512032,'SEGA SEGASATURN T-20610G');
const final=handle('final.bin',521680656,'SEGA SEGASATURN T-20612G');
const save=handle('f-ch34.bkr',32768);
test('same-folder companion uses one F disc and one backup without choosing Final disc again',async()=>{
 const r=await findAutomaticCarryoverInputs([f,final,save,handle('another.txt',10)]);
 assert.equal(r.f.name,f.name);assert.equal(r.save.name,save.name);assert.equal(r.ambiguous,false);
});
test('multiple saves are not guessed and a verified already-open F can be reused',async()=>{
 const r=await findAutomaticCarryoverInputs([f,final,save,handle('other.bcr',65536)],{rememberedF:{name:'already linked'}});
 assert.equal(r.f.name,'already linked');assert.equal(r.save,null);assert.equal(r.ambiguous,true);
});
test('stale or cancelled folder inputs reveal no companion candidates',async()=>{
 let calls=0;
 const r=await findAutomaticCarryoverInputs([f,save],{stale:()=>++calls>1});
 assert.deepEqual(r,{});
});
test('an existing converted companion cannot compete with the original save',async()=>{
 const r=await findAutomaticCarryoverInputs([f,final,save,handle('FINAL-승계전용-f-ch34.bkr',32768)]);
 assert.equal(r.save.name,save.name);assert.equal(r.ambiguous,false);
});
for(const [suffix,format,bytes] of [['.bkr','(내장 메모리)',0x8000],['.bcr','(백업 카트리지)',0x80000],['.sav','(내장 메모리)',0x8000]]){
 test(`companion shows the exact ${suffix} download name only while its output is ready`,async()=>{
  class Element extends EventTarget {
   removeAttribute(name){delete this[name];}
   replaceChildren(){}
  }
  const root=new Element(),status=new Element(),details=new Element(),fInput=new Element(),
   saveInput=new Element(),slot=new Element(),download=new Element(),filename=new Element();
  const nameValue=new Element(),formatValue=new Element();

  class Worker extends EventTarget {
   postMessage({type}){if(type==='AUTO')this.dispatchEvent(new MessageEvent('message',{data:{type:'COMPLETE',bytes:new Uint8Array([1]),format:{bytes}}}));}
   terminate(){}
  }
  const ui=createAutoCarryoverUI({root,status,details,fInput,saveInput,slot,download,filename,filenameValue:nameValue,filenameFormat:formatValue,createWorker:()=>new Worker()});
  await ui.start({bin:new Blob(['Final']),handles:[f,handle('클리어'+suffix,32768)]});
  assert.equal(download.hidden,false);
  assert.equal(filename.hidden,false);
  assert.equal(nameValue.textContent,download.download);
  assert.equal(nameValue.textContent,'FINAL-승계전용-클리어'+suffix);
  assert.equal(formatValue.textContent,format);
  assert.equal(ui.result().name,download.download);
  ui.clear();
  assert.equal(filename.hidden,true);
  assert.equal(nameValue.textContent,'');
  assert.equal(formatValue.textContent,'');
  assert.equal(download.hidden,true);
  assert.equal(ui.result(),null);
 });
}
test('verified Saturn .ram and .bin pick up raw or interleaved backups, not unrelated binary files',async()=>{
 const signature='BackUpRam Format'.repeat(4);
 const wrapped=Uint8Array.from([...signature].flatMap(c=>[255,c.charCodeAt(0)]));
 const good=handle('final-save.ram',32768,signature);
 const malformed=handle('not-a-save.bin',32768,'something unrelated');
 const inter={kind:'file',name:'real-backup.bin',async getFile(){
  return {name:this.name,size:65536,slice(){return new Blob([wrapped]);}};
 }};
 const r=await findAutomaticCarryoverInputs([f,final,good,malformed,handle('unrelated.srm',32768,'Not Saturn')]);
 assert.equal(r.f.name,f.name);assert.equal(r.save.name,good.name);assert.equal(r.ambiguous,false);
 assert.equal((await findAutomaticCarryoverInputs([f,inter])).save.name,inter.name);
});
test('output filename preserves nested compression and emulator suffixes without guessing .bcr',()=>{
 assert.equal(carryoverDownloadName('F-play.BKR.gz',{bytes:32768,gzipLayers:1}),'FINAL-승계전용-F-play.BKR.gz');
 assert.equal(carryoverDownloadName('F-ext512K.ram',{bytes:0x80000}),'FINAL-승계전용-F-ext512K.ram');
 assert.equal(carryoverDownloadName('InternalBackupRAM.bin',{bytes:32768}),'FINAL-승계전용-InternalBackupRAM.bin');
 assert.equal(carryoverDownloadName('unknown.dat',{bytes:32768}),'FINAL-승계전용-unknown.dat.bin');
 assert.equal(carryoverFormatLabel({bytes:0x80000,interleaved:true,gzipLayers:1}),'백업 카트리지 · 인터리브 · gzip');
});
