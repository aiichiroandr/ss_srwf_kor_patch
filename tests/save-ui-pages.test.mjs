import {authenticatedSaveCatalog} from './helpers/authenticated-save-catalog.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {FakeElement,installFakeDom,loadHtml} from './helpers/fake-dom.mjs';
import {syntheticSave,syntheticHeroUnits} from './helpers/synthetic-save.mjs';
import {saveChecksum} from '../assets/save-core.mjs';
import {encodeEditorText} from '../assets/editor-text-codec.mjs';
import {createSaveEditor} from '../assets/save-ui.mjs';

test('page navigation keeps selection, edited values, validation and reset',async()=>{
  const doc=installFakeDom();loadHtml(doc,await readFile(new URL('../index.html',import.meta.url),'utf8'));
  Object.defineProperty(FakeElement.prototype,'parentElement',{configurable:true,get(){return this.parentNode;}});
  globalThis.requestAnimationFrame=fn=>{queueMicrotask(fn);return 1;};
  const $=id=>doc.getElementById(id);
  // ROM panel breakpoints switch to a two-column root at short/medium sizes.
  // The save dialog must own its layout rather than inherit those classes.
  assert.equal($('saveEditorDialog').querySelector('.save-editor-shell').classList.contains('editor-data-panel'),false);
  assert.equal($('saveRecordLayout').classList.contains('editor-panel-body'),false);
  $('saveRecordList').clientHeight=110;$('saveUnitFields').clientHeight=136;
  const entries=Array.from({length:16},(_,i)=>({slot:i+1,weaponIndex:i+1}));
  const context={verified:true,gameId:'srwf-final',pilots:[{recordIndex:74,name:'크리스'}],weapons:entries.map(e=>({recordIndex:e.weaponIndex,name:`무기 ${e.weaponIndex}`})),units:Array.from({length:6},(_,i)=>({recordIndex:23+i,name:`기체 ${23+i}`,hp:3000,en:150,partSlots:2,weaponList:{status:'known',entries}}))};
  const f=syntheticSave();for(let i=0;i<6;i++){const offset=0x100+i*30;f.payload[offset+1]=23+i;f.payload[offset+15]=255;}
  new DataView(f.payload.buffer).setUint32(0,saveChecksum(f.payload));f.payloadPositions.forEach((p,i)=>f.raw[p]=f.payload[i]);
  const ui=createSaveEditor(()=>context);await ui.load({name:'synthetic.bcr',size:f.raw.length,arrayBuffer:async()=>f.raw.buffer});
  $('saveUnitTab').click();assert.equal($('saveListPageLabel').textContent,'1 / 3');
  assert.equal($('saveRecordTitle').textContent,'기체 23');$('saveListNext').click();
  assert.equal($('saveListPageLabel').textContent,'2 / 3');assert.equal($('saveRecordTitle').textContent,'기체 23');
  assert.equal($('saveRecordList').children[0].textContent,'기체 25미탑승');
  $('saveUnitWeaponsTab').click();assert.equal($('saveUnitPageLabel').textContent,'1 / 8');
  $('saveUnitFields').querySelectorAll('button')[1].click();assert.equal($('saveUnitFields').querySelector('output').textContent,'1 / 5단');
  $('saveUnitNext').click();assert.equal($('saveUnitPageLabel').textContent,'2 / 8');
  $('saveUnitPrev').click();assert.equal($('saveUnitFields').querySelector('output').textContent,'1 / 5단');
  $('savePilotTab').click();$('saveLevel').value='100';$('saveLevel').dispatchEvent({type:'input'});
  assert.equal($('saveDownload').disabled,true);$('saveUnitTab').click();assert.equal($('saveDownload').disabled,true);
  $('saveReset').click();assert.equal($('saveChangeCount').textContent,'변경 없음');
  assert.equal($('saveDownload').disabled,true);
  $('saveCommonTab').click();$('saveMoney').value='1000';$('saveMoney').dispatchEvent({type:'input'});
  $('saveCommonUpgradeTab').click();assert.equal($('saveMoneyPanel').hidden,true);assert.equal($('saveUpgradePanel').hidden,false);
  $('saveCommonMoneyTab').click();assert.equal($('saveMoney').value,'1000');assert.equal($('saveDownload').disabled,false);
  $('saveReset').click();assert.equal($('saveMoney').value,'123456');
});

test('replacing a save asks before discarding edits, and a cancelled or invalid file keeps the current work',async()=>{
 const doc=installFakeDom();loadHtml(doc,await readFile(new URL('../index.html',import.meta.url),'utf8'));
 Object.defineProperty(FakeElement.prototype,'parentElement',{configurable:true,get(){return this.parentNode;}});globalThis.requestAnimationFrame=fn=>{queueMicrotask(fn);return 1;};
 const $=id=>doc.getElementById(id),f=syntheticSave(),context={verified:true,gameId:'srwf-final',units:[],pilots:[],sessionToken:'rom-1'},ui=createSaveEditor(()=>context);
 const file=name=>({name,size:f.raw.length,arrayBuffer:async()=>f.raw.buffer});
 const previousConfirm=globalThis.confirm,previousTimeout=globalThis.setTimeout;let questions=0;
 try{
  globalThis.confirm=()=>{questions++;return false;};await ui.load(file('first.bcr'));$('saveCommonTab').click();
  $('saveMoney').value='1000';$('saveMoney').dispatchEvent({type:'input'});
  assert.equal(ui.hasUnsavedEdits(),true);
  await ui.load({name:'bad.bcr',size:4,arrayBuffer:async()=>new Uint8Array(4).buffer});
  assert.equal(questions,0);assert.equal($('saveFileName').textContent,'first.bcr');assert.equal($('saveMoney').value,'1000');
  await ui.load(file('second.bcr'));assert.equal(questions,1);assert.equal($('saveFileName').textContent,'first.bcr');assert.equal($('saveMoney').value,'1000');
  globalThis.confirm=()=>{questions++;return true;};await ui.load(file('second.bcr'));
  assert.equal(questions,2);assert.equal($('saveFileName').textContent,'second.bcr');assert.equal(ui.hasUnsavedEdits(),false);
  $('saveMoney').value='2000';$('saveMoney').dispatchEvent({type:'input'});assert.equal(ui.hasUnsavedEdits(),true);
  globalThis.setTimeout=()=>0;$('saveDownload').click();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(ui.hasUnsavedEdits(),false,'a downloaded snapshot is no longer unsaved');
  $('saveMoney').value='3000';$('saveMoney').dispatchEvent({type:'input'});assert.equal(ui.hasUnsavedEdits(),true);
  $('saveReset').click();assert.equal(ui.hasUnsavedEdits(),false,'returning to the loaded save is not an unsaved edit');
 }finally{globalThis.confirm=previousConfirm;globalThis.setTimeout=previousTimeout;}
});

test('save inspection does not replace work when the ROM session changes during the read',async()=>{
 const doc=installFakeDom();loadHtml(doc,await readFile(new URL('../index.html',import.meta.url),'utf8'));
 Object.defineProperty(FakeElement.prototype,'parentElement',{configurable:true,get(){return this.parentNode;}});globalThis.requestAnimationFrame=fn=>{queueMicrotask(fn);return 1;};
 const $=id=>doc.getElementById(id),f=syntheticSave(),context={verified:true,gameId:'srwf-final',units:[],pilots:[],sessionToken:'rom-1'},ui=createSaveEditor(()=>context);
 await ui.load({name:'first.bcr',size:f.raw.length,arrayBuffer:async()=>f.raw.buffer});
 let finish;const pending=ui.load({name:'other.bcr',size:f.raw.length,arrayBuffer:()=>new Promise(resolve=>{finish=resolve;})});
 context.sessionToken='rom-2';finish(f.raw.buffer);await pending;
 assert.equal($('saveFileName').textContent,'first.bcr');assert.match($('saveEditorStatus').textContent,/ROM|게임/);
});

test('an error in another tab appears in the change list and returns to the exact input',async()=>{
 const doc=installFakeDom();loadHtml(doc,await readFile(new URL('../index.html',import.meta.url),'utf8'));
 Object.defineProperty(FakeElement.prototype,'parentElement',{configurable:true,get(){return this.parentNode;}});globalThis.requestAnimationFrame=fn=>{queueMicrotask(fn);return 1;};
 const $=id=>doc.getElementById(id),f=syntheticSave(),ui=createSaveEditor(()=>({verified:true,gameId:'srwf-final',units:[],pilots:[]}));
 await ui.load({name:'save.bcr',size:f.raw.length,arrayBuffer:async()=>f.raw.buffer});
 $('savePilotTab').click();$('saveLevel').value='100';$('saveLevel').dispatchEvent({type:'input'});$('saveCommonTab').click();
 assert.match($('saveChangeCount').textContent,/입력 오류 1건/);
 const error=$('saveChanges').querySelector('button');assert.ok(error,'the error must be visible and navigable');
 assert.match(error.textContent,/레벨/);error.click();assert.equal($('savePilotTab').getAttribute('aria-pressed'),'true');
 assert.equal($('saveLevel').value,'100');assert.ok(doc.activeElement===$('saveLevel'));
 $('saveLevel').value='30';$('saveLevel').dispatchEvent({type:'input'});assert.equal(ui.hasUnsavedEdits(),false);
});

test('a ROM change during save export does not download or mark the old work as saved',async()=>{
 const doc=installFakeDom();loadHtml(doc,await readFile(new URL('../index.html',import.meta.url),'utf8'));
 Object.defineProperty(FakeElement.prototype,'parentElement',{configurable:true,get(){return this.parentNode;}});globalThis.requestAnimationFrame=fn=>{queueMicrotask(fn);return 1;};
 const $=id=>doc.getElementById(id),f=syntheticSave(),context={verified:true,gameId:'srwf-final',units:[],pilots:[],sessionToken:'rom-1'},ui=createSaveEditor(()=>context);
 await ui.load({name:'save.bcr',size:f.raw.length,arrayBuffer:async()=>f.raw.buffer});$('saveCommonTab').click();
 $('saveMoney').value='1000';$('saveMoney').dispatchEvent({type:'input'});
 const oldCreate=URL.createObjectURL,oldTimeout=globalThis.setTimeout;let downloads=0;URL.createObjectURL=()=>{downloads++;return 'blob:test';};globalThis.setTimeout=()=>0;
 try{
  $('saveDownload').click();context.sessionToken='rom-2';await new Promise(resolve=>setImmediate(resolve));
  assert.equal(downloads,0);assert.equal(ui.hasUnsavedEdits(),true);assert.match($('saveEditorStatus').textContent,/ROM|게임/);
 }finally{URL.createObjectURL=oldCreate;globalThis.setTimeout=oldTimeout;}
});

test('pilot list thumbnails and selected hero use saved faces and discard late page results',async()=>{
 const doc=installFakeDom();loadHtml(doc,await readFile(new URL('../index.html',import.meta.url),'utf8'));
 Object.defineProperty(FakeElement.prototype,'parentElement',{configurable:true,get(){return this.parentNode;}});
 globalThis.requestAnimationFrame=fn=>{queueMicrotask(fn);return 1;};
 const previousImageData=globalThis.ImageData;globalThis.ImageData=class{constructor(data,width,height){Object.assign(this,{data,width,height});}};
 try{
 const $=id=>doc.getElementById(id);$('saveRecordList').clientHeight=110;
 const f=syntheticSave(),b=new DataView(f.payload.buffer);b.setUint16(0x34,317<<7);b.setUint16(0x38,305<<7);
 for(const [i,id]of[303,74,302].entries()){b.setUint16(0x1000+i*12,id);f.payload[0x1002+i*12]=30;}
 b.setUint32(0,saveChecksum(f.payload));f.payloadPositions.forEach((p,i)=>f.raw[p]=f.payload[i]);
 const original=f.raw.slice(),calls=[],image={width:2,height:1,pixels:new Uint8ClampedArray(8)};let late;
 const context={verified:true,gameId:'srwf-final',sessionToken:'real-session-test',pilots:[{recordIndex:303,name:'자리',imageStatus:'runtime-assembled'},{recordIndex:302,name:'자리',imageStatus:'runtime-assembled'},{recordIndex:74,name:'크리스'}],units:[],preview:(kind,id,options)=>{calls.push({kind,id,options});return id===74?new Promise(resolve=>{late=resolve;}):Promise.resolve({image,imageSource:'save'});}};
 const ui=createSaveEditor(()=>context);await ui.load({name:'synthetic.bcr',size:f.raw.length,arrayBuffer:async()=>f.raw.buffer});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal($('saveRecordList').children.length,2);
 assert.equal($('saveRecordList').querySelectorAll('.save-list-portrait.has-image').length,1);
 assert.equal($('savePilotImage').hidden,false);
 assert.ok(calls.some(c=>c.id===303&&c.options.heroFaceId===317));
 const stale=$('saveRecordList').children[1].querySelector('.save-list-portrait');
 $('saveListNext').click();await new Promise(resolve=>setImmediate(resolve));
 assert.ok(calls.some(c=>c.id===302&&c.options.heroFaceId===305));
 late({image});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(stale.classList.contains('has-image'),false);
 assert.equal($('saveRecordList').querySelectorAll('.save-list-portrait.has-image').length,1);
 assert.equal($('saveDownload').disabled,true);assert.deepEqual(f.raw,original);
 }finally{globalThis.ImageData=previousImageData;}
});

test('save hero and partner names keep valid edits, reject missing glyphs across tabs and reset invalid drafts',async()=>{
 const doc=installFakeDom();loadHtml(doc,await readFile(new URL('../index.html',import.meta.url),'utf8'));
 Object.defineProperty(FakeElement.prototype,'parentElement',{configurable:true,get(){return this.parentNode;}});globalThis.requestAnimationFrame=fn=>{queueMicrotask(fn);return 1;};
 const $=id=>doc.getElementById(id),f=syntheticSave(),context=await authenticatedSaveCatalog({verified:true,gameId:'srwf-final',units:[],pilots:[]}),ui=createSaveEditor(()=>context);
 await ui.load({name:'names.bcr',size:f.raw.length,arrayBuffer:async()=>f.raw.buffer});$('saveCommonTab').click();$('saveCommonNamesTab').click();assert.equal($('saveNamesPanel').hidden,false);
 const input=$('saveHeroName');input.focus();input.value='크리스';input.dispatchEvent({type:'input'});assert.equal($('saveDownload').disabled,false);assert.equal($('saveSlotHero').textContent,'크리스');assert.equal(doc.activeElement,input);
 input.value='😀';input.dispatchEvent({type:'input'});assert.equal($('saveDownload').disabled,true);$('saveCommonMoneyTab').click();assert.equal($('saveDownload').disabled,true);$('saveCommonNamesTab').click();assert.equal(input.value,'😀');
 $('saveReset').click();assert.equal($('saveChangeCount').textContent,'변경 없음');assert.equal($('saveDownload').disabled,true);
});

test('four personal names and three Final form names remain independent, update the unit list and block invalid drafts',async()=>{
 const doc=installFakeDom();loadHtml(doc,await readFile(new URL('../index.html',import.meta.url),'utf8'));
 Object.defineProperty(FakeElement.prototype,'parentElement',{configurable:true,get(){return this.parentNode;}});globalThis.requestAnimationFrame=fn=>{queueMicrotask(fn);return 1;};
 const $=id=>doc.getElementById(id),f=syntheticSave();f.payload[0x36]=1;new DataView(f.payload.buffer).setUint16(0x100,222);
 new DataView(f.payload.buffer).setUint32(0,saveChecksum(f.payload));f.payloadPositions.forEach((p,i)=>f.raw[p]=f.payload[i]);
 const context=await authenticatedSaveCatalog({verified:true,gameId:'srwf-final',units:syntheticHeroUnits(),pilots:[]}),ui=createSaveEditor(()=>context);
 await ui.load({name:'names.bcr',size:f.raw.length,arrayBuffer:async()=>f.raw.buffer});$('saveCommonTab').click();$('saveCommonNamesTab').click();
 const set=(id,text)=>{const el=$(id);el.focus();el.value=text;el.dispatchEvent({type:'input'});assert.equal(doc.activeElement,el);};
 for(const [id,text]of [['saveHeroName','천지인'],['saveHeroAlias','미나'],['savePartnerName','아무로'],['savePartnerAlias','크리']])set(id,text);
 $('saveCommonUnitNamesTab').click();assert.equal($('saveUnitNamesPanel').hidden,false);
 assert.equal($('saveHeroUnitName1').placeholder,'형태일');
 for(const [i,text]of ['단공검','발칸','건담'].entries()){assert.equal($('saveHeroUnitName'+(i+1)).disabled,false);set('saveHeroUnitName'+(i+1),text);}
 assert.equal($('saveDownload').disabled,false);$('saveUnitTab').click();assert.ok($('saveRecordList').textContent.includes('단공검'));
 $('saveCommonTab').click();$('saveCommonNamesTab').click();assert.equal($('saveHeroName').value,'천지인');assert.equal($('savePartnerAlias').value,'크리');
 set('saveHeroAlias','가나다');assert.equal($('saveDownload').disabled,true);$('saveCommonUnitNamesTab').click();assert.equal($('saveDownload').disabled,true);
 $('saveReset').click();assert.equal($('saveHeroUnitName1').value,'');assert.equal($('saveChangeCount').textContent,'변경 없음');
 const first=syntheticSave({name:'SROBOT_F_01'});context.gameId='srwf-f';await ui.load({name:'f.bcr',size:first.raw.length,arrayBuffer:async()=>first.raw.buffer});
 assert.equal($('saveCommonUnitNamesTab').hidden,true);assert.equal($('saveUnitNamesPanel').hidden,true);assert.equal($('saveHeroUnitName1').disabled,true);assert.equal($('saveNamesPanel').hidden,false);
});

test('editing one transformed-unit name preserves an invalid draft in another name',async()=>{
 const doc=installFakeDom();loadHtml(doc,await readFile(new URL('../index.html',import.meta.url),'utf8'));
 Object.defineProperty(FakeElement.prototype,'parentElement',{configurable:true,get(){return this.parentNode;}});globalThis.requestAnimationFrame=fn=>{queueMicrotask(fn);return 1;};
 const $=id=>doc.getElementById(id),f=syntheticSave();f.payload[0x36]=1;new DataView(f.payload.buffer).setUint16(0x100,222);
 new DataView(f.payload.buffer).setUint32(0,saveChecksum(f.payload));f.payloadPositions.forEach((p,i)=>f.raw[p]=f.payload[i]);
 const ui=createSaveEditor(()=>({verified:true,gameId:'srwf-final',units:syntheticHeroUnits(),pilots:[]}));
 await ui.load({name:'names.bcr',size:f.raw.length,arrayBuffer:async()=>f.raw.buffer});$('saveCommonTab').click();$('saveCommonUnitNamesTab').click();
 const first=$('saveHeroUnitName1'),second=$('saveHeroUnitName2');first.focus();first.value='😀';first.dispatchEvent({type:'input'});
 assert.equal(first.getAttribute('aria-invalid'),'true');second.focus();second.value='건담';second.dispatchEvent({type:'input'});
 assert.equal(first.value,'😀');assert.equal(first.getAttribute('aria-invalid'),'true');assert.equal($('saveDownload').disabled,true);
 const error=$('saveChanges').querySelector('button');error.click();assert.ok(doc.activeElement===first);assert.equal(first.value,'😀');
});

test('change history uses each save slot’s own protagonist name',async()=>{
 const doc=installFakeDom();loadHtml(doc,await readFile(new URL('../index.html',import.meta.url),'utf8'));
 Object.defineProperty(FakeElement.prototype,'parentElement',{configurable:true,get(){return this.parentNode;}});globalThis.requestAnimationFrame=fn=>{queueMicrotask(fn);return 1;};
 const $=id=>doc.getElementById(id),a=syntheticSave({foreign:false}),b=syntheticSave({name:'SROBOTFC_02',foreign:false});
 for(const [f,name] of [[a,'아무로'],[b,'크리스']]){
  f.payload.set(encodeEditorText(name,{gameId:'srwf-final',kind:'save'}),0x3c);
  const d=new DataView(f.payload.buffer);d.setUint16(0x1000,303);d.setUint32(0,saveChecksum(f.payload));f.payloadPositions.forEach((p,i)=>f.raw[p]=f.payload[i]);
 }
 const shift=30,size=512;for(const block of b.blocks)a.raw.set(b.raw.subarray(block*size,(block+1)*size),(block+shift)*size);
 for(const [i,block] of b.blocks.slice(1).entries()){const p=(b.blocks[0]+shift)*size+34+i*2;a.raw[p]=(block+shift)>>8;a.raw[p+1]=(block+shift)&255;}
 const ui=createSaveEditor(()=>({verified:true,gameId:'srwf-final',units:[],pilots:[]}));
 await ui.load({name:'multi.bcr',size:a.raw.length,arrayBuffer:async()=>a.raw.buffer});
 $('saveLevel').value='31';$('saveLevel').dispatchEvent({type:'input'});
 $('saveRecordSelect').value=String(b.blocks[0]+shift);$('saveRecordSelect').dispatchEvent({type:'change'});
 $('saveLevel').value='32';$('saveLevel').dispatchEvent({type:'input'});
 const entries=$('saveChanges').children.map(item=>item.textContent);
 assert.equal(entries.length,2);assert.match(entries[0],/아무로/);assert.match(entries[1],/크리스/);
});

test('a verified live ROM refresh exposes new units without disc reload and blocks download if that form was removed',async()=>{
 const doc=installFakeDom();loadHtml(doc,await readFile(new URL('../index.html',import.meta.url),'utf8'));
 Object.defineProperty(FakeElement.prototype,'parentElement',{configurable:true,get(){return this.parentNode;}});globalThis.requestAnimationFrame=fn=>{queueMicrotask(fn);return 1;};
 const $=id=>doc.getElementById(id),f=syntheticSave(),unit={recordIndex:430,name:'S건담',hp:4000,en:180,partSlots:2,identity:'unit:430',construction:{preset:'s-gundam'},recordKind:'constructed-unit',saveUnitKind:1,saveUnitForm:0},context={verified:true,gameId:'srwf-final',sessionToken:'unchanged-rom-session',units:[],pilots:[]};let remove=false,checks=0;
 const ui=createSaveEditor(()=>context,{verifyOutputCatalog:async()=>{checks++;context.units=remove?[]:[unit];}});
 await ui.load({name:'live.bcr',size:f.raw.length,arrayBuffer:async()=>f.raw.buffer});
 context.units=[unit];ui.open();$('saveUnitTab').click();$('saveAddUnitRow').open=true;$('saveAddUnitRow').dispatchEvent({type:'toggle'});
 const option=$('saveAddUnitSelect').options.find(o=>o.value==='430');assert.ok(option);assert.match(option.textContent,/추가 기체/);$('saveAddUnitSelect').value='430';$('saveAddUnitButton').click();
 const oldCreate=URL.createObjectURL,oldTimeout=globalThis.setTimeout;let downloads=0;URL.createObjectURL=()=>{downloads++;return'blob:live';};globalThis.setTimeout=()=>0;
 try{
  remove=true;$('saveDownload').click();await new Promise(resolve=>setImmediate(resolve));assert.equal(downloads,0);assert.match($('saveEditorStatus').textContent,/ROM 구성이 바뀌/);assert.equal(ui.hasUnsavedEdits(),true);
  remove=false;$('saveDownload').click();await new Promise(resolve=>setImmediate(resolve));assert.equal(checks,2);assert.equal(downloads,1);assert.equal(ui.hasUnsavedEdits(),false);assert.match($('saveEditorStatus').textContent,/BIN\/CUE/);
 }finally{URL.createObjectURL=oldCreate;globalThis.setTimeout=oldTimeout;}
});

test('the save dialog opens immediately during catalog preparation; closing cancels it and preserves prior edits',async()=>{
 const doc=installFakeDom();loadHtml(doc,await readFile(new URL('../index.html',import.meta.url),'utf8'));
 Object.defineProperty(FakeElement.prototype,'parentElement',{configurable:true,get(){return this.parentNode;}});globalThis.requestAnimationFrame=fn=>{queueMicrotask(fn);return 1;};
 const $=id=>doc.getElementById(id),f=syntheticSave(),context={verified:true,gameId:'srwf-final',sessionToken:'same-rom',units:[],pilots:[]},ui=createSaveEditor(()=>context);await ui.load({name:'loaded.bcr',size:f.raw.length,arrayBuffer:async()=>f.raw.buffer});
 $('saveCommonTab').click();$('saveMoney').value='1000';$('saveMoney').dispatchEvent({type:'input'});let signal;
 const pending=ui.openPrepared(options=>{signal=options.signal;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));});
 assert.equal($('saveEditorDialog').open,true);assert.equal(ui.isBusy(),true);assert.match($('saveEditorStatus').textContent,/확인하고 있습니다/);
 $('saveEditorClose').click();$('saveEditorDialog').dispatchEvent({type:'close'});await pending;assert.equal(signal.aborted,true);assert.equal(ui.isBusy(),false);assert.equal(ui.hasUnsavedEdits(),true);
 await ui.openPrepared(async()=>{});assert.equal($('saveEditorDialog').open,true);assert.equal($('saveMoney').value,'1000');assert.equal(ui.isBusy(),false);assert.equal($('saveFileName').textContent,'loaded.bcr');
});
