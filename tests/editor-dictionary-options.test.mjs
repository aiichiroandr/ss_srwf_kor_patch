import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,openAsBlob} from 'node:fs';
import {FINAL_OUTPUT_SWITCHES,inspectFinalOutputSwitches,requestedFinalOutputSwitch,writeDictionaryOutputSwitch,writeTitleOutputSwitch} from '../assets/editor-dictionary-options.mjs';
import {PRESET_KINDS} from '../assets/editor-preset.mjs';

const SECTOR=2352;
// Fake image operations: each "blob" is a frozen record of the steps applied.
function fakeOps(log,{portraits=false,additions=false,title='original'}={}){
 const state={portraits,additions,title};
 const step=(blob,name)=>Object.freeze({...blob,steps:[...blob.steps,name]});
 return {
  async changeDictionaryAdditionImage(blob,{alice=false,units=false}={}){
   log.push(['additions',alice,units]);
   const want=alice||units;if(want===state.additions)return {outputBlob:blob,changedSectors:[]};
   state.additions=want;return {outputBlob:step(blob,'additions:'+want),changedSectors:[7],dictionaryAdditions:{alice,units}};
  },
  async applyDictionaryPortraitImage(blob){
   log.push(['portraits',true]);if(state.portraits)return {outputBlob:blob,changedSectors:[],dictionaryPortraits:{enabled:true}};
   state.portraits=true;return {outputBlob:step(blob,'portraits:on'),changedSectors:[1,2],dictionaryPortraits:{enabled:true}};
  },
  async normalizeDictionaryPortraitImage(blob){
   log.push(['portraits',false]);if(!state.portraits)return {outputBlob:blob,changedSectors:[],dictionaryPortraits:{enabled:false}};
   state.portraits=false;return {outputBlob:step(blob,'portraits:off'),changedSectors:[1,2],dictionaryPortraits:{enabled:false}};
  },
  async applyStandaloneFinalTitleLogoImage(blob){
   log.push(['title','purple']);if(state.title==='purple')return {outputBlob:blob,changedSectors:[],titleLogo:{color:'purple'}};
   state.title='purple';return {outputBlob:step(blob,'title:purple'),changedSectors:[9],titleLogo:{color:'purple'}};
  },
  async normalizeFinalTitleLogoImage(blob){
   log.push(['title','original']);if(state.title==='original')return {outputBlob:blob,changedSectors:[],titleLogo:{color:'original'}};
   state.title='original';return {outputBlob:step(blob,'title:original'),changedSectors:[9],titleLogo:{color:'original'}};
  },
 };
}
const finisher=log=>async next=>{log.push(['finish']);return {...next,finished:(next.finished??0)+1};};
const start=()=>({outputBlob:Object.freeze({steps:[]}),bytesChanged:0});

// The exact sequence exportEditedImage ran unconditionally before the switch.
async function legacyDictionary(written,{alice,units},ops,finish){
 const withoutAdditions=await ops.changeDictionaryAdditionImage(written.outputBlob,{});
 if(withoutAdditions.changedSectors.length)written={...written,outputBlob:withoutAdditions.outputBlob,bytesChanged:written.bytesChanged+withoutAdditions.changedSectors.length*SECTOR};
 const dictionary=await ops.applyDictionaryPortraitImage(written.outputBlob,{});
 if(dictionary.changedSectors.length)written=await finish({...written,outputBlob:dictionary.outputBlob,dictionaryPortraits:dictionary.dictionaryPortraits,bytesChanged:written.bytesChanged+dictionary.changedSectors.length*SECTOR});
 const additions=await ops.changeDictionaryAdditionImage(written.outputBlob,{alice,units});
 if(additions.changedSectors.length)written=await finish({...written,outputBlob:additions.outputBlob,dictionaryAdditions:additions.dictionaryAdditions,bytesChanged:written.bytesChanged+additions.changedSectors.length*SECTOR});
 return written;
}
async function legacyTitle(written,ops,finish){
 const title=await ops.applyStandaloneFinalTitleLogoImage(written.outputBlob,{});
 if(title.changedSectors.length)written=await finish({...written,outputBlob:title.outputBlob,titleLogo:title.titleLogo,bytesChanged:written.bytesChanged+title.changedSectors.length*SECTOR});
 return written;
}

test('switch requests are own booleans, omitted means keep, and ON needs an available image',()=>{
 const session={dictionaryPortraits:{available:true,enabled:false},titleLogo:{available:false,enabled:false}};
 assert.deepEqual(Object.keys(FINAL_OUTPUT_SWITCHES),['dictionaryPortraits','titleLogo']);
 assert.equal(requestedFinalOutputSwitch(session,{},'dictionaryPortraits'),undefined);
 assert.equal(requestedFinalOutputSwitch(session,{dictionaryPortraits:true},'dictionaryPortraits'),true);
 assert.equal(requestedFinalOutputSwitch(session,{titleLogo:false},'titleLogo'),false);
 for(const value of [1,'true',null,undefined])
  assert.throws(()=>requestedFinalOutputSwitch(session,{dictionaryPortraits:value},'dictionaryPortraits'),{code:'EDITOR_REQUEST_INVALID'});
 assert.throws(()=>requestedFinalOutputSwitch(session,{titleLogo:true},'titleLogo'),{code:'EDITOR_REQUEST_INVALID'});
 assert.throws(()=>requestedFinalOutputSwitch(session,Object.defineProperty({},'dictionaryPortraits',{get:()=>true,enumerable:true}),'dictionaryPortraits'),{code:'EDITOR_REQUEST_INVALID'});
 assert.equal(requestedFinalOutputSwitch(session,Object.create({dictionaryPortraits:true}),'dictionaryPortraits'),undefined);
});

test('dictionary ON writes exactly the former unconditional sequence',async()=>{
 for(const flags of [{alice:false,units:false},{alice:true,units:false},{alice:true,units:true}]){
  for(const initial of [{},{portraits:true,additions:true}]){
   const a=[],b=[];
   const now=await writeDictionaryOutputSwitch(start(),{enabled:true,gameId:'srwf-final',...flags},{finish:finisher(a),ops:fakeOps(a,initial)});
   const before=await legacyDictionary(start(),flags,fakeOps(b,initial),finisher(b));
   assert.deepEqual(now,before);assert.deepEqual(a,b);
  }
 }
});

test('dictionary OFF leaves a clean image untouched and adds no dictionary entries',async()=>{
 const log=[],input=start();
 const out=await writeDictionaryOutputSwitch(input,{enabled:false,gameId:'srwf-final',alice:true,units:true},{finish:finisher(log),ops:fakeOps(log)});
 assert.equal(out,input);
 assert.deepEqual(log,[['additions',false,false],['portraits',false]]);
});

test('dictionary OFF removes portraits and their additions from an older output, finishing once',async()=>{
 const log=[];
 const out=await writeDictionaryOutputSwitch(start(),{enabled:false,gameId:'srwf-final',alice:true},{finish:finisher(log),ops:fakeOps(log,{portraits:true,additions:true})});
 assert.deepEqual(out.outputBlob.steps,['additions:false','portraits:off']);
 assert.equal(out.finished,1);assert.equal(out.bytesChanged,3*SECTOR);
 assert.ok(!log.some(([kind,on])=>kind==='portraits'&&on===true));
 await assert.rejects(writeDictionaryOutputSwitch(start(),{gameId:'srwf-final'},{finish:finisher([]),ops:fakeOps([])}),{code:'EDITOR_REQUEST_INVALID'});
});

test('title: omitted keeps the input, ON matches the former write, OFF restores the original',async()=>{
 const none=[],input=start();
 assert.equal(await writeTitleOutputSwitch(input,{enabled:undefined,gameId:'srwf-final'},{finish:finisher(none),ops:fakeOps(none,{title:'purple'})}),input);
 assert.deepEqual(none,[]);
 const a=[],b=[];
 assert.deepEqual(await writeTitleOutputSwitch(start(),{enabled:true,gameId:'srwf-final'},{finish:finisher(a),ops:fakeOps(a)}),
  await legacyTitle(start(),fakeOps(b),finisher(b)));
 assert.deepEqual(a,b);
 const off=[],clean=start();
 assert.equal(await writeTitleOutputSwitch(clean,{enabled:false,gameId:'srwf-final'},{finish:finisher(off),ops:fakeOps(off)}),clean);
 const restored=await writeTitleOutputSwitch(start(),{enabled:false,gameId:'srwf-final'},{finish:finisher([]),ops:fakeOps([],{title:'purple'})});
 assert.deepEqual(restored.outputBlob.steps,['title:original']);
});

test('switches are unavailable outside Final and never part of presets',async()=>{
 const off=await inspectFinalOutputSwitches(new Blob([new Uint8Array(16)]),{gameId:'srwf-f'});
 assert.deepEqual(off,{dictionaryPortraits:{available:false,enabled:false},titleLogo:{available:false,enabled:false}});
 const small=await inspectFinalOutputSwitches(new Blob([new Uint8Array(16)]),{gameId:'srwf-final'});
 assert.deepEqual(small,off);
 for(const key of ['dictionaryPortraits','titleLogo','dictionary','title'])assert.ok(!PRESET_KINDS.includes(key));
});

test('the switches sit with the other optional output fixes, default OFF',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const misc=html.slice(html.indexOf('id="miscEditorPanel"'),html.indexOf('id="rewardEditorPanel"'));
 const collection=misc.indexOf('id="collectionUnlockSettings"'),debug=misc.indexOf('id="debugEntrySettings"');
 for(const id of ['dictionaryPortrait','titleLogo']){
  const at=misc.indexOf(`id="${id}Settings"`);
  assert.ok(at>collection&&at>debug,id); // after the local misc cards (index.html order since 15b034a)
  const section=misc.slice(misc.lastIndexOf('<section',at),misc.indexOf('</section>',at));
  assert.match(section,/class="game-panel collection-unlock-panel"/);assert.match(section,/ hidden>/);
  assert.match(section,new RegExp(`<input id="${id}Toggle" type="checkbox">`));
  assert.match(section,new RegExp(`<button id="${id}Reset" class="record-tool" type="button">불러온 값으로</button>`));
 }
 const app=readFileSync(new URL('../assets/app.mjs',import.meta.url),'utf8');
 assert.match(app,/OUTPUT_SWITCH_KEYS\.filter\(key=>state\.editorOutputSwitches\[key\]\)\.map\(key=>\[key,state\.editorOutputSwitches\[key\]\.enabled\]\)/);
 assert.match(app,/view\.gameId==='srwf-final'&&view\[key\]\?\.available===true/);
});

// Real Final BIN (optional, read in place): OFF keeps DIC.BIN, EXEC and the
// title slots byte-identical to the input; ON equals the former sequence.
const binFixture=process.env.SRWF_DICTIONARY_FACE_BIN_FIXTURE;
test('real Final image: OFF leaves dictionary/title regions unchanged and ON matches the former bytes',{skip:!binFixture},async()=>{
 const {locateIsoFiles,readCdUserExtent}=await import('../assets/editor-core.mjs');
 const portrait=await import('../assets/editor-dictionary-portrait-image.mjs');
 const addition=await import('../assets/editor-dictionary-addition-image.mjs');
 const title=await import('../assets/editor-title-logo-image.mjs');
 const ops={...portrait,...addition,...title},blob=await openAsBlob(binFixture),gameId='srwf-final';
 const finish=async next=>next;
 const regions=async image=>{const files=await locateIsoFiles(image,undefined,['0','DIC.BIN','EFFECT.BIN']);
  return Promise.all([files['0'],files.dic,files.effect].map(f=>readCdUserExtent(image,f.extentLba,f.byteLength)));};
 const input=await regions(blob);
 const off=await writeDictionaryOutputSwitch({outputBlob:blob,bytesChanged:0},{enabled:false,gameId},{finish,ops});
 const offTitle=await writeTitleOutputSwitch(off,{enabled:false,gameId},{finish,ops});
 const state=await inspectFinalOutputSwitches(blob,{gameId});
 if(!state.dictionaryPortraits.enabled&&!state.titleLogo.enabled){
  assert.equal(offTitle.outputBlob,blob);assert.deepEqual(await regions(offTitle.outputBlob),input);
 }
 const on=await writeTitleOutputSwitch(await writeDictionaryOutputSwitch({outputBlob:blob,bytesChanged:0},{enabled:true,gameId},{finish,ops}),{enabled:true,gameId},{finish,ops});
 const before=await legacyTitle(await legacyDictionary({outputBlob:blob,bytesChanged:0},{alice:false,units:false},
  {changeDictionaryAdditionImage:(b,o)=>addition.changeDictionaryAdditionImage(b,{...o,gameId}),applyDictionaryPortraitImage:b=>portrait.applyDictionaryPortraitImage(b,{gameId})},finish),
  {applyStandaloneFinalTitleLogoImage:b=>title.applyStandaloneFinalTitleLogoImage(b,{gameId})},finish);
 assert.deepEqual(await regions(on.outputBlob),await regions(before.outputBlob));
 assert.equal(on.bytesChanged,before.bytesChanged);
 if(!state.dictionaryPortraits.enabled)assert.ok(on.bytesChanged>0&&on.outputBlob!==blob);
});
