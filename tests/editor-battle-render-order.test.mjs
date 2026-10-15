import test from 'node:test';import assert from 'node:assert/strict';
import {orderBattleRenderCommands} from '../assets/editor-battle-render-order.mjs';
test('native two-level publication orders depth descending and preserves equal-depth emission order',()=>{
 const commands=[{id:'a',pass:0,depthWord:80},{id:'b',pass:0,depthWord:75},{id:'c',pass:0,depthWord:80},{id:'d',pass:0,depthWord:256},{id:'e',pass:0,depthWord:255},{id:'f',pass:0,depthWord:32767}];
 const before=commands.slice();assert.deepEqual(orderBattleRenderCommands(commands).map(c=>c.id),['f','d','e','a','c','b']);assert.deepEqual(commands,before);
});
test('second native pass follows the first independently of depth',()=>{
 const commands=[{id:'a',pass:1,depthWord:32767},{id:'b',pass:0,depthWord:0},{id:'c',pass:1,depthWord:0}];
 assert.deepEqual(orderBattleRenderCommands(commands).map(c=>c.id),['b','a','c']);assert.deepEqual(orderBattleRenderCommands([]),[]);
});
test('unresolved pass or out-of-table depth cannot manufacture publication order',()=>{
 for(const command of [{depthWord:1},{pass:0,depthWord:32768},{pass:2,depthWord:0},{pass:0,depthWord:-1}])assert.throws(()=>orderBattleRenderCommands([command]),/invalid/);
});
