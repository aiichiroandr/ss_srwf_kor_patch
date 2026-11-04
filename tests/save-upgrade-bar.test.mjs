import test from 'node:test';
import assert from 'node:assert/strict';
import {FakeDocument} from './helpers/fake-dom.mjs';
import {createUpgradeBar} from '../assets/save-upgrade-bar.mjs';
import {requireSaveScalar} from '../assets/save-field-rules.mjs';

function setup({value=0,limit=5,disabled=false}={}){
  const values=[],doc=new FakeDocument();
  const bar=createUpgradeBar(doc,{label:'HP 개조',field:'hpUpgrade',value,limit,disabled,onChange:v=>{if(v<0||v>limit)throw Error('상한');values.push(v);}});
  const track=bar.querySelector('.save-upgrade-track');
  return {bar,track,values,boxes:bar.querySelectorAll('[data-stage]'),buttons:bar.querySelectorAll('button')};
}

test('stage click respects five-stage limit and keeps rejected value unchanged',()=>{
  const {bar,track,values,boxes}=setup();
  boxes[4].click();assert.deepEqual(values,[5]);assert.equal(track.getAttribute('aria-valuenow'),'5');
  boxes[9].click();assert.deepEqual(values,[5]);assert.equal(track.getAttribute('aria-valuenow'),'5');
  assert.equal(bar.querySelector('output').textContent,'5 / 5단');
});
test('ten-stage mode supports pointer, keyboard, zero and endpoints',()=>{
  const {track,values,boxes,buttons}=setup({limit:10});
  boxes[9].click();assert.equal(values.at(-1),10);
  track.dispatchEvent({type:'keydown',key:'Home'});assert.equal(values.at(-1),0);
  buttons[1].click();assert.equal(values.at(-1),1);
  track.dispatchEvent({type:'keydown',key:'ArrowLeft'});assert.equal(values.at(-1),0);
  track.dispatchEvent({type:'keydown',key:'End'});assert.equal(values.at(-1),10);
  assert.equal(track.getAttribute('aria-valuenow'),'10');
});
test('read-only bar blocks all input paths',()=>{
  const {track,values,boxes,buttons}=setup({disabled:true});
  boxes[2].click();buttons[1].click();track.dispatchEvent({type:'keydown',key:'End'});
  assert.deepEqual(values,[]);assert.equal(track.tabIndex,-1);
});
test('opening an existing value above the current limit preserves it',()=>{
  const {bar,track,values}=setup({value:9});
  assert.equal(track.getAttribute('aria-valuenow'),'9');assert.equal(track.getAttribute('aria-valuemax'),'9');
  assert.equal(bar.classList.contains('is-over-limit'),true);assert.deepEqual(values,[]);
});
test('scalar validation rejects empty, fractional and out-of-storage values',()=>{
  for(const [field,max,min] of [['level',99,1],['experience',65535,0],['money',9999999,0]]){
    assert.doesNotThrow(()=>requireSaveScalar(field,min));assert.doesNotThrow(()=>requireSaveScalar(field,max));
    for(const invalid of [NaN,Infinity,min-1,max+1,1.5,'7'])assert.throws(()=>requireSaveScalar(field,invalid));
  }
});
