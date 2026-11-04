import test from 'node:test';
import assert from 'node:assert/strict';
import {installFakeDom} from './helpers/fake-dom.mjs';
import {createSrw4SourcePanel} from '../assets/editor-srw4-source-ui.mjs';

const document=installFakeDom();
const wait=()=>new Promise(resolve=>setTimeout(resolve,0));
test('linked fourth-game source shows only its icon cards and keeps disconnect and undo available',async()=>{
 const root=document.createElement('section');document.body.append(root);
 const assets=['s-gundam','exs-gundam','sirbine','zwauss','blood-temple','s-gcruiser','exs-gcruiser'].map((key,i)=>({key,unitId:i+1,iconId:i,pictureId:i,available:false}));
 const report={identity:{title:'제4차 Rev 1',sha256:'a'.repeat(64)},addedUnitCount:7,assets,units:[{unitId:1,hp:1234}],palettes:[]};
 let fail=false,connected=null,undoCount=0;
 const ui=createSrw4SourcePanel(root,{canConnect:()=>true,canUndo:()=>true,connect:async file=>{if(fail)throw Error('확인 실패');connected=file;return file?report:null;},undo:async()=>{undoCount++;return null;}});
 const input=root.querySelector('input[type="file"]');input.files=[{name:'fixture.sfc'}];input.dispatchEvent({type:'change',target:input});await wait();
 assert.equal(connected.name,'fixture.sfc');assert.equal(root.querySelectorAll('.srw4-source-asset').length,7);
 assert.equal(root.querySelector('table'),null);assert.equal(root.querySelector('input[type="search"]'),null);
 assert.match(root.querySelector('[role="status"]').textContent,/7기 추가/);
 fail=true;input.files=[{name:'bad.sfc'}];input.dispatchEvent({type:'change',target:input});await wait();
 assert.match(root.querySelector('[role="status"]').textContent,/확인 실패/);assert.equal(root.querySelectorAll('.srw4-source-asset').length,7);
 root.querySelectorAll('button').find(button=>button.textContent==='가져오기 취소').click();await wait();assert.equal(undoCount,1);assert.equal(root.querySelector('.srw4-source-results').hidden,true);
 ui.reset();assert.equal(root.querySelector('.srw4-source-results').hidden,true);
});

test('source progress stays indeterminate during reading and verification, then clears on success or failure',async()=>{
 const root=document.createElement('section');document.body.append(root);
 let complete,reject;
 const ui=createSrw4SourcePanel(root,{canConnect:()=>true,canUndo:()=>false,connect:()=>new Promise((resolve,fail)=>{complete=resolve;reject=fail;})});
 const file=root.querySelector('input[type="file"]'),bar=root.querySelector('progress'),status=root.querySelector('[role="status"]');
 file.files=[{name:'fixture.sfc'}];file.dispatchEvent({type:'change',target:file});
 assert.equal(bar.hidden,false);assert.equal(bar.hasAttribute('value'),false);assert.match(status.textContent,/읽고/);
 ui.progress({phase:'srw4-source',processed:0,total:1});assert.match(status.textContent,/검증/);
 ui.progress({phase:'srw4-icon-scan',indeterminate:true});assert.match(status.textContent,/아이콘/);assert.equal(bar.hasAttribute('value'),false);
 ui.progress({phase:'srw4-target-check',indeterminate:true});assert.match(status.textContent,/저장 공간/);assert.equal(bar.hasAttribute('value'),false);
 complete({identity:{title:'제4차 Rev 1',sha256:'a'.repeat(64)},addedUnitCount:0,assets:[],palettes:[]});await wait();
 assert.equal(bar.hidden,true);assert.match(status.textContent,/0기 추가/);
 file.files=[{name:'invalid.sfc'}];file.dispatchEvent({type:'change',target:file});assert.equal(bar.hidden,false);
 reject(Error('원본 확인 실패'));await wait();assert.equal(bar.hidden,true);assert.match(status.textContent,/원본 확인 실패/);
});
