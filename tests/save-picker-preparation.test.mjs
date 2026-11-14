import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createSaveEditor} from '../assets/save-ui.mjs';
import {installFakeDom,FakeElement,loadHtml} from './helpers/fake-dom.mjs';
import {syntheticSave} from './helpers/synthetic-save.mjs';

test('save selection before authenticated catalog stays queued and never survives failure or close',async()=>{
  const doc=installFakeDom();
  loadHtml(doc,await readFile(new URL('../index.html',import.meta.url),'utf8'));
  Object.defineProperty(FakeElement.prototype,'parentElement',{configurable:true,get(){return this.parentNode;}});
  globalThis.requestAnimationFrame=fn=>{queueMicrotask(fn);return 1;};
  const ui=createSaveEditor(()=>({verified:true,gameId:'srwf-final',sessionToken:'one'}));
  const $=id=>doc.getElementById(id),input=$('saveFileInput'),dialog=$('saveEditorDialog');
  const {raw}=syntheticSave();
  const reads=[];
  function pick(name){
    input.files=[{name,size:raw.length,arrayBuffer:async()=>{reads.push(name);return raw.buffer;}}];
    input.dispatchEvent({type:'change'});
  }
  const pending=()=>{
    let resolve,reject;
    const opened=ui.openPrepared(()=>new Promise((r,j)=>{resolve=r;reject=j;}));
    assert.equal(input.disabled,false);
    return {opened,resolve,reject};
  };
  const close=()=>{
    dialog.close();
    dialog.dispatchEvent({type:'close'});
  };
  let prep=pending();
  pick('aborted.bcr');close();prep.resolve();await prep.opened;
  assert.deepEqual(reads,[]);
  prep=pending();
  pick('failed.bcr');prep.reject(Error('검증 실패'));await prep.opened;
  assert.deepEqual(reads,[]);
  assert.match($('saveEditorStatus').textContent,/검증 실패/);
  close();
  prep=pending();
  pick('superseded.bcr');pick('latest.bcr');
  assert.deepEqual(reads,[]);
  assert.match($('saveEditorStatus').textContent,/확인이 끝나면/);
  prep.resolve();await prep.opened;
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(reads,['latest.bcr']);
  assert.equal($('saveFileName').textContent,'latest.bcr');
});
