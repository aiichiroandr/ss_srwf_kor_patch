import test from 'node:test';
import assert from 'node:assert/strict';
import {pageItems,fitPages} from '../assets/save-pages.mjs';

test('page boundaries preserve every identity and clamp after filtering',()=>{
  const items=Array.from({length:128},(_,id)=>({id}));
  const pages=Array.from({length:Math.ceil(items.length/7)},(_,p)=>pageItems(items,p,7).items);
  assert.deepEqual(pages.flat(),items);
  assert.deepEqual(pageItems(items.slice(0,2),18,7),{page:0,count:1,start:0,items:items.slice(0,2)});
  assert.deepEqual(pageItems([],20,7),{page:0,count:1,start:0,items:[]});
});
test('variable height pages respect the available space and keep order',()=>{
  const heights=[38,40,62,38,38,76,42,38],items=heights.map((_,id)=>({id}));
  const pages=fitPages(items,heights,142,8);assert.deepEqual(pages.flat(),items);
  for(const page of pages)assert.ok(page.reduce((n,x)=>n+heights[x.id],0)+(page.length-1)*8<=142);
});
test('a smaller viewport repaginates without dropping or mutating items',()=>{
  const items=Array.from({length:16},(_,id)=>Object.freeze({id,value:id%6}));
  const big=fitPages(items,items.map(()=>38),300),small=fitPages(items,items.map(()=>38),100);
  assert.ok(small.length>big.length);assert.deepEqual(small.flat(),big.flat());
  assert.equal(fitPages([],[],0).length,1);
  assert.deepEqual(fitPages([1,2],[60,60],20),[[1],[2]]);
});
