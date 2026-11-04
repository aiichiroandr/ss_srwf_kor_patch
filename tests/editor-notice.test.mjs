import assert from 'node:assert/strict';import test from 'node:test';
import {installFakeDom} from './helpers/fake-dom.mjs';import {requestEditorNotice} from '../assets/editor-notice.mjs';
const doc=installFakeDom(),memory=new Map();globalThis.localStorage={getItem:key=>memory.get(key),setItem:(key,value)=>memory.set(key,value)};
const dialog=()=>doc.body.querySelector('dialog'),buttons=()=>dialog().querySelectorAll('button');
test('both editor entry paths share one notice; dismissal is remembered only after acknowledgement',async()=>{
 const first=requestEditorNotice();assert.equal(requestEditorNotice(),first);assert.equal(dialog().querySelector('input').checked,true);
 buttons()[0].click();assert.equal(await first,false);assert.equal(memory.size,0);
 const second=requestEditorNotice();dialog().querySelector('input').checked=false;buttons()[1].click();assert.equal(await second,true);assert.equal(memory.size,0);
 const third=requestEditorNotice();buttons()[1].click();assert.equal(await third,true);assert.equal(memory.size,1);
 assert.equal(await requestEditorNotice(),true);assert.equal(dialog(),null);
});

test('an injected showModal exception removes the dialog and permits a fresh shared retry',async()=>{
 memory.clear();
 const proto=Object.getPrototypeOf(doc.createElement('dialog')),original=proto.showModal;
 const failure=new Error('injected showModal exception');let failOnce=true;
 proto.showModal=function(){if(failOnce){failOnce=false;throw failure;}return original.call(this);};
 try{
  const first=requestEditorNotice();assert.equal(requestEditorNotice(),first);
  await assert.rejects(first,error=>error===failure);
  assert.equal(dialog(),null);assert.equal(memory.size,0);
  const retry=requestEditorNotice();assert.notEqual(retry,first);assert.equal(requestEditorNotice(),retry);
  assert.equal(doc.body.querySelectorAll('dialog').length,1);assert.equal(dialog().open,true);
  dialog().querySelector('input').checked=false;buttons()[1].click();assert.equal(await retry,true);
  assert.equal(dialog(),null);assert.equal(memory.size,0);
 }finally{proto.showModal=original;}
});

test('repeated injected modal failures retain no dialog or rejected retry promise',async()=>{
 memory.clear();
 const proto=Object.getPrototypeOf(doc.createElement('dialog')),original=proto.showModal;
 const failure=new Error('injected repeated showModal exception');proto.showModal=()=>{throw failure;};
 let previous;
 try{
  for(let attempt=0;attempt<2;attempt++){
   const current=requestEditorNotice();assert.notEqual(current,previous);
   await assert.rejects(current,error=>error===failure);
   assert.equal(dialog(),null);assert.equal(memory.size,0);previous=current;
  }
 }finally{proto.showModal=original;}
 const recovered=requestEditorNotice();assert.notEqual(recovered,previous);
 let prevented=false;dialog().dispatchEvent({type:'cancel',preventDefault(){prevented=true;}});
 assert.equal(await recovered,false);assert.equal(prevented,true);assert.equal(dialog(),null);assert.equal(memory.size,0);
});
