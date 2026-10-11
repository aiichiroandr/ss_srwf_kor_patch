import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { COMPLETION_TITLE_HINT_BINDINGS as bindings } from '../assets/editor-scenario-completion-title-bindings.mjs';
import { bindCompletionScenarioTitleHints as bind, completionTitleHintText } from '../assets/editor-scenario-completion-title-hints.mjs';
import { bindVerifiedScenarioTitles, scenarioSelectionDescription, scenarioSelectionLabel } from '../assets/editor-scenario-labels.mjs';
const fixture = (binding = bindings[0], text = '테스트\u3000완료 제목') => {
 const scene = Object.freeze({ physicalIndex: binding.physicalIndex, scenarioSlots: Object.freeze([binding.scenarioSlot]),
  identity: 'fixture-authenticated-scene', deployments: Object.freeze([]), conditions: Object.freeze([]) });
 const body = Object.freeze(Object.fromEntries(['decodedLength','maskSha256','immutableDecodedSha256'].map(key=>[key,binding[key]])));
 const bodies=[];bodies[binding.physicalIndex]=body;
 const titles=[];titles[binding.titleIndex]=Object.freeze({ titleIndex:binding.titleIndex,text,status:'decoded',source:'user-bin-tsr-root22' });
 return { binding,scene,scope:{scenario:{bodies}},titles };
};
const row = f => bind(f.binding.gameId,[f.scene],f.scope,f.titles)[0];

test('117 source rows contain only approved numeric coordinates and scope hashes; native2 excluded',()=>{
 assert.equal(bindings.length,117);assert.equal(bindings.filter(b=>b.gameId==='srwf-f').length,38);assert.equal(bindings.filter(b=>b.gameId==='srwf-final').length,79);
 assert.ok(Object.isFrozen(bindings));assert.equal(new Set(bindings.map(b=>b.gameId+':'+b.physicalIndex)).size,117);
 for(const b of bindings){
  assert.deepEqual(Object.keys(b).sort(),['gameId','physicalIndex','scenarioSlot','titleIndex','decodedLength','maskSha256','immutableDecodedSha256'].sort());
  assert.ok(Object.isFrozen(b));for(const k of ['physicalIndex','scenarioSlot','titleIndex','decodedLength'])assert.ok(Number.isSafeInteger(b[k])&&b[k]>=0);
  for(const k of ['maskSha256','immutableDecodedSha256'])assert.match(b[k],/^[a-f0-9]{64}$/);
  assert.ok(!((b.gameId==='srwf-f'&&b.physicalIndex===47)||(b.gameId==='srwf-final'&&b.physicalIndex===9)));
 }
});
test('all117 exact source scopes read only the matching user title cell and preserve edit fields',()=>{
 for(const b of bindings){const f=fixture(b),scope=JSON.stringify(f.scope),before=JSON.stringify(f.scene),result=row(f);
  assert.notEqual(result,f.scene);assert.deepEqual(Object.keys(result).filter(k=>!Object.hasOwn(f.scene,k)),['completionTitleHint']);
  assert.equal(result.completionTitleHint.name,'테스트 완료 제목');assert.equal(result.completionTitleHint.source,'source-local-completion-title');
  assert.equal(result.completionTitleHint.titleIndex,b.titleIndex);assert.equal(result.completionTitleHint.scenarioSlot,b.scenarioSlot);
  assert.ok(Object.isFrozen(result));assert.ok(Object.isFrozen(result.completionTitleHint));
  assert.equal(result.verifiedTitle,undefined);assert.equal(result.episode,undefined);assert.equal(result.route,undefined);
  for(const k of Object.keys(f.scene))assert.equal(result[k],f.scene[k]);
  assert.equal(JSON.stringify(f.scope),scope);assert.equal(JSON.stringify(f.scene),before);
  assert.equal(scenarioSelectionLabel(result),`자료 #${b.scenarioSlot}`);
  assert.match(scenarioSelectionDescription(result),/스크립트의 완료 제목: 테스트 완료 제목/);
  assert.match(scenarioSelectionDescription(result),/실제 완료 화면은 아직 확인하지 못했습니다/);
 }
});
test('wrong game, shared/unknown/duplicate/sparse selector and physical index stay generic',()=>{
 const f=fixture();
 for(const game of ['unknown','constructor','__proto__','toString',null,{},f.binding.gameId==='srwf-f'?'srwf-final':'srwf-f'])assert.equal(bind(game,[f.scene],f.scope,f.titles)[0],f.scene);
 for(const changes of [{physicalIndex:-1},{physicalIndex:f.binding.physicalIndex+1},{scenarioSlots:[]},{scenarioSlots:[f.binding.scenarioSlot,999]},{scenarioSlots:[f.binding.scenarioSlot,f.binding.scenarioSlot]},{scenarioSlots:new Array(1)},{scenarioSlots:[''+f.binding.scenarioSlot]}]){
  const scene={...f.scene,...changes};assert.equal(bind(f.binding.gameId,[scene],f.scope,f.titles)[0],scene);assert.equal(completionTitleHintText(scene),'');
 }
 assert.deepEqual(bind(f.binding.gameId,new Array(1),f.scope,f.titles),[]);
});
test('each of the3 pins must match exactly; scope/title inherited data and accessors are never used',()=>{
 const f=fixture();
 for(const key of ['decodedLength','maskSha256','immutableDecodedSha256']){
  const body={...f.scope.scenario.bodies[f.binding.physicalIndex],[key]:key==='decodedLength'?f.binding[key]+1:'0'.repeat(64)},bodies=[];bodies[f.binding.physicalIndex]=body;
  assert.equal(bind(f.binding.gameId,[f.scene],{scenario:{bodies}},f.titles)[0],f.scene);
 }
 for(const scope of [null,{},Object.create(f.scope),{scenario:Object.create(f.scope.scenario)},{scenario:{bodies:{[f.binding.physicalIndex]:f.scope.scenario.bodies[f.binding.physicalIndex]}}}])assert.equal(bind(f.binding.gameId,[f.scene],scope,f.titles)[0],f.scene);
 let calls=0;const getter={get(){calls++;throw Error('must not read getter')},enumerable:true};
 for(const key of ['scenario','bodies','decodedLength','maskSha256','immutableDecodedSha256']){
  const scope={scenario:{bodies:[...f.scope.scenario.bodies]}},body={...scope.scenario.bodies[f.binding.physicalIndex]};scope.scenario.bodies[f.binding.physicalIndex]=body;
  Object.defineProperty(key==='scenario'?scope:key==='bodies'?scope.scenario:body,key,getter);
  assert.equal(bind(f.binding.gameId,[f.scene],scope,f.titles)[0],f.scene);
 }
 for(const key of ['titleIndex','status','source','text']){const titles=[...f.titles],title={...titles[f.binding.titleIndex]};titles[f.binding.titleIndex]=title;Object.defineProperty(title,key,getter);assert.equal(bind(f.binding.gameId,[f.scene],f.scope,titles)[0],f.scene)}
 const titles=[];Object.defineProperty(titles,String(f.binding.titleIndex),getter);assert.equal(bind(f.binding.gameId,[f.scene],f.scope,titles)[0],f.scene);
 const ids=[];Object.defineProperty(ids,'0',getter);const scene={...f.scene,scenarioSlots:ids};assert.equal(bind(f.binding.gameId,[scene],f.scope,f.titles)[0],scene);
 assert.equal(calls,0);
});
test('malformed titles fail closed, synthetic64-character names remain description-only',()=>{
 const f=fixture();
 for(const change of [{titleIndex:999},{status:'unknown-glyph'},{status:'no-title-cell'},{source:'preset'},{text:''},{text:'  '},{text:'x'.repeat(65)},{text:'title\nline'},{text:'title\u2028line'},{text:'\u0000'},{text:'\u202e'},{text:'\u2066'},{text:'\ud800'},{text:123}]){
  const titles=[...f.titles];titles[f.binding.titleIndex]={...titles[f.binding.titleIndex],...change};assert.equal(bind(f.binding.gameId,[f.scene],f.scope,titles)[0],f.scene);
 }
 for(const text of ['가'.repeat(64),'W'.repeat(64)]){const result=row(fixture(f.binding,text));assert.equal(result.completionTitleHint.name,text);assert.equal(scenarioSelectionLabel(result),`자료 #${f.binding.scenarioSlot}`);assert.ok(scenarioSelectionDescription(result).includes(text))}
});
test('rebind clears prior hints after source/pin/title mismatch and ignores injected hints',()=>{
 const f=fixture(),opened=row(f),bodies=[...f.scope.scenario.bodies];bodies[f.binding.physicalIndex]={...bodies[f.binding.physicalIndex],decodedLength:0};
 for(const [game,scope,titles]of [['unknown',f.scope,f.titles],[f.binding.gameId,{scenario:{bodies}},f.titles],[f.binding.gameId,f.scope,[]]]){
  const result=bind(game,[opened],scope,titles)[0];assert.equal(result.completionTitleHint,undefined);assert.equal(scenarioSelectionLabel(result),`자료 #${f.binding.scenarioSlot}`);assert.equal(completionTitleHintText(result),'');
 }
 const injected={...f.scene,completionTitleHint:{gameId:f.binding.gameId,name:'forged',scenarioSlot:f.binding.scenarioSlot,titleIndex:f.binding.titleIndex,source:'preset'}};
 assert.equal(completionTitleHintText(injected),'');assert.equal(bind(f.binding.gameId,[injected],{},[])[0].completionTitleHint,undefined);
});
test('native binding name and object remain distinct; source hints never turn into verifiedTitle',()=>{
 const native={gameId:'srwf-final',physicalIndex:9,scenarioSlot:106,titleIndex:106,decodedLength:12645,maskSha256:'f5addcb2ef2442522d82c7e5d9da9647cfa4de9fcb3372a0a8c9521b3b65dfe4',immutableDecodedSha256:'e24ee5ccadfae119d609fb6b4c834befec3ec963004a94dd7c41ac0b0c583541'};
 const f=fixture(native,'테스트 실제 확인 이름');const result=bindVerifiedScenarioTitles(native.gameId,[f.scene],f.scope,f.titles)[0];assert.equal(result.verifiedTitle.name,'테스트 실제 확인 이름');assert.equal(result.completionTitleHint,undefined);assert.equal(scenarioSelectionLabel(result),'테스트 실제 확인 이름');
 assert.equal(bind(native.gameId,[result],f.scope,f.titles)[0],result);
 const source=fixture(),hinted=bindVerifiedScenarioTitles(source.binding.gameId,[source.scene],source.scope,source.titles)[0];assert.ok(hinted.completionTitleHint);assert.equal(hinted.verifiedTitle,undefined);assert.equal(scenarioSelectionLabel(hinted),`자료 #${source.binding.scenarioSlot}`);
});
test('private DOM reuses existing popup paragraph; no title added toselect or mapcaption text',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8'),ui=await readFile(new URL('../assets/editor-scenario-ui.mjs',import.meta.url),'utf8'),css=await readFile(new URL('../assets/editor-runtime.css',import.meta.url),'utf8');
 assert.equal((html.match(/id="scenarioSelectionDescription"/g)??[]).length,1);assert.match(html,/<div class="reward-explanation">\s*<p id="scenarioSelectionDescription">/);
 assert.match(ui,/if \(ui\.scenarioSelectionDescription\) ui\.scenarioSelectionDescription\.textContent = `\$\{scenarioSelectionDescription\(scene\(\)\)\}/);
 assert.match(ui,/option\(scene\.physicalIndex, scenarioSelectionLabel\(scene\)\)/);
 assert.match(css,/#scenarioSelectionDescription \{ overflow-wrap: anywhere; \}/);
 assert.match(css,/\.reward-explanation \{ position: absolute;[^}]*max-height:[^}]*overflow-y: auto;/);
});
test('worker clone and ordinary model/preset paths keep hints outside edit requests',async()=>{
 const {createScenarioModel}=await import('../assets/editor-scenario-model.mjs');
 const {buildPreset}=await import('../assets/editor-preset.mjs');
 const f=fixture(),base={gameId:f.binding.gameId,units:[],pilots:[],scenarios:[f.scene]},decorated={...base,scenarios:structuredClone([row(f)])},before=createScenarioModel(base),after=createScenarioModel(decorated);
 assert.equal(after.scenarios[0].completionTitleHint.name,'테스트 완료 제목');assert.equal(scenarioSelectionLabel(after.scenarios[0]),`자료 #${f.binding.scenarioSlot}`);
 for(const fn of ['exportDeployments','exportEvents','exportDeadlines','exportReinforcements','exportMap'])assert.deepEqual(after[fn](),before[fn]());
 const options={gameId:f.binding.gameId,createdAt:new Date('2026-10-11T00:00:00Z')};
 assert.deepEqual(buildPreset(options,{units:[],pilots:[],weapons:[],deployment:after.deployments,event:after.events,objective:after.objectives,reinforcement:after.reinforcements,map:[]}),buildPreset(options,{units:[],pilots:[],weapons:[],deployment:before.deployments,event:before.events,objective:before.objectives,reinforcement:before.reinforcements,map:[]}));
});
