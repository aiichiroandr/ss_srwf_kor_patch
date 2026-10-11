import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {installFakeDom,loadHtml} from './helpers/fake-dom.mjs';
const document=installFakeDom();loadHtml(document,await readFile(new URL('../index.html',import.meta.url),'utf8'));
const logger=console.error;console.error=()=>{};
const {__testHooks:hooks}=await import('../assets/app.mjs');await new Promise(r=>setTimeout(r,0));console.error=logger;
const $=id=>document.getElementById(id),control=field=>$('rewardFields').querySelector(`[data-reward-field="${field}"]`);
const set=(el,value)=>{el.value=String(value);el.dispatchEvent({type:el.tagName==='INPUT'?'input':'change',target:el});};
function setup({withUses=false}={}){Object.assign(hooks.state,{mode:'editor',editorGameId:'srwf-final',editorSessionToken:'reward-token',editorBusy:false,busy:false,cueSaving:false,editorSetupOpen:false});$('editorWorkspace').hidden=false;
 const deployments=withUses?['가베라테트라','도벤울프'].map((name,i)=>({recordIndex:`0:${64+i*12}`,physicalIndex:0,mapIndex:0,scenarioSlots:[0],width:6,height:4,name,pilotName:'테스트 파일럿',unitId:107+i,pilotId:1,x:2+i,y:1,rewardSelector:i?16:1,editable:true,identity:`deployment:1:${String(i+1).repeat(64)}`})):[];
 hooks.installEditorRows({gameId:'srwf-final',units:[],pilots:[],weapons:[],partNames:Array.from({length:23},(_,i)=>i===21?'변경할　수　있습니다．':`파츠${i}`),rewards:[{recordIndex:0,name:'보상 표 0',aliases:[0],capacity:0,editable:false},{recordIndex:1,name:'보상 표 1',aliases:withUses?[1,16]:[1],capacity:2,editable:true,part1:3,chance1:60,part2:4,chance2:20,statsValid:true,identity:`reward:1:${'a'.repeat(64)}`} ],
 deployments,scenarios:withUses?[{physicalIndex:0,scenarioSlots:[0],mapIndex:0,placements:deployments,chapter:{source:'user-bin-scenario-chapter',gameId:'srwf-final',episodes:[1],name:'첫 작전',part:1,totalParts:1,order:0,scenarioSlot:0}}]:[],
 maps:withUses?[{mapIndex:0,mapSlots:[0],bankIndex:0,planes:[{width:6,height:4,tiles:Array(24).fill(0),identity:`map:1:${'b'.repeat(64)}`}]}]:[],mapBanks:withUses?[{bankSlots:[0],terrainIds:Array(1024).fill(4)}]:[]});$('rewardTabButton').click();return hooks.state.editorRewards[1];}
test('reward fields preserve focus, reject combined totals, recover and join change/export state',()=>{
 const row=setup(),input=control('chance1');input.focus();set(input,90);assert.equal(row.chance1,60);assert.equal(input.getAttribute('aria-invalid'),'true');assert.equal(hooks.countEditorChanges(),0);
 set(input,70);assert.equal(row.chance1,70);assert.equal(input.getAttribute('aria-invalid'),null);assert.equal(document.activeElement,input);
 set(control('part2'),22);assert.equal(hooks.countEditorChanges(),2);assert.equal($('editorPresetSaveButton').disabled,false);
 assert.deepEqual(hooks.buildEditorExportRequest().rewardEdits,[{recordIndex:1,fields:{part1:3,chance1:70,part2:22,chance2:20}}]);
 assert.equal(control('part1').querySelectorAll('option')[20].textContent,'리페어 키트 S');
 $('editorChangesButton').click();const entry=$('editorChangesList').querySelector('button');entry.click();assert.equal(hooks.state.editorTab,'reward');assert.equal(document.activeElement,control('chance1'));
 $('rewardReset').click();assert.equal(row.chance1,60);assert.equal(row.part2,4);assert.equal(hooks.countEditorChanges(),0);
});
test('empty reward selectors and a busy session cannot mutate values',()=>{
 const row=setup();hooks.state.editorBusy=true;set(control('chance1'),50);assert.equal(row.chance1,60);hooks.state.editorBusy=false;
 set($('rewardSelector'),0);assert.equal($('rewardFields').children.length,0);assert.equal($('rewardReset').disabled,true);assert.equal(hooks.buildEditorExportRequest().rewardEdits.length,1);
});

test('reset recovers an invalid pending probability even when the stored row still equals its original values',()=>{
 const row=setup(),input=control('chance1');
 assert.equal($('rewardReset').disabled,true);
 for(const bad of [100,'']){
  set(control('chance1'),bad);
  assert.equal(row.chance1,60);assert.equal(hooks.countEditorChanges(),0);
  assert.equal(control('chance1').getAttribute('aria-invalid'),'true');
  assert.equal($('rewardReset').disabled,false);
  $('rewardReset').click();
  assert.equal(control('chance1').value,'60');assert.equal(control('chance1').getAttribute('aria-invalid'),null);
  assert.equal(control('chance1').validity.valid,true);assert.equal($('rewardReset').disabled,true);
  assert.equal($('rewardSummary').textContent,'파츠 획득 80% · 미획득 20%');
 }
 set(control('chance1'),70);$('rewardReset').click();set(control('chance1'),100);
 assert.equal($('rewardReset').disabled,false);$('rewardReset').click();assert.equal(row.chance1,60);
 assert.equal(hooks.buildEditorExportRequest().rewardEdits[0].fields.chance1,60);
 assert.notEqual(control('chance1'),input);
});

test('part names and acquisition probabilities replace numbered table labels while shared appearances are explicit',()=>{
 const row=setup({withUses:true});
 const selected=Array.from($('rewardSelector').options).find(x=>x.value==='1');
 assert.equal(selected.textContent,'파츠3 60% 외 1종');
 assert.equal(selected.title,'파츠3 60% / 파츠4 20%');
 assert.equal($('rewardSummary').textContent,'파츠 획득 80% · 미획득 20%');
 assert.equal($('rewardScope').textContent,'확인된 등장 2곳에 공통 적용');
 assert.ok($('rewardScope').title.includes('모든 등장 기체'));
 assert.equal(control('part1').getAttribute('aria-label'),'획득 후보 1 강화파츠');
 assert.equal(control('chance2').getAttribute('aria-label'),'획득 후보 2 확률 (%)');
 const options=Array.from($('rewardUsageSelector').options);
 assert.equal(options[0].textContent,'가베라테트라 · 1화');
 assert.ok(options[0].title.includes('완결편 1화 · 첫 작전'));
 assert.ok(options[1].textContent.includes('도벤울프'));
 const input=control('chance1');input.focus();set(input,70);
 assert.equal(control('chance1'),input);assert.equal(document.activeElement,input);
 assert.equal(selected.textContent,'파츠3 70% 외 1종');
 assert.equal($('rewardSummary').textContent,'파츠 획득 90% · 미획득 10%');
 assert.equal(row.chance1,70);
});

test('reward search accepts unit, part and verified episode names, retains focus and recovers from no matches',()=>{
 const row=setup({withUses:true}),search=$('rewardSearch');search.focus();
 for(const query of ['도벤울프','파츠4','파 츠 4','첫 작전','첫작전','1화']){
  set(search,query);assert.equal($('rewardSelector').value,'1');assert.equal(document.activeElement,search);assert.equal(control('chance1').value,'60');
 }
 set(search,'없는 기체');assert.equal($('rewardSelector').disabled,true);assert.equal($('rewardFields').children.length,0);assert.equal($('rewardReset').disabled,true);assert.equal($('rewardUsageOpen').disabled,true);
 assert.equal(hooks.countEditorChanges(),0);assert.equal(row.chance1,60);
 set(search,'');assert.equal($('rewardSelector').disabled,false);assert.equal($('rewardSelector').value,'1');assert.equal($('rewardScope').textContent,'확인된 등장 2곳에 공통 적용');
 setup();assert.equal(search.value,'');assert.equal($('rewardScope').textContent,'확인된 등장 연결 없음');assert.equal($('rewardUsageOpen').disabled,true);
});

test('a duplicate part candidate displays its combined probability without merging or rewriting either stored slot',()=>{
 const row=setup();set(control('part2'),3);
 const selected=Array.from($('rewardSelector').options).find(x=>x.value==='1');
 assert.equal(selected.textContent,'파츠3 80%');assert.equal(selected.title,'파츠3 60% / 파츠3 20%');
 assert.equal(control('chance1').value,'60');assert.equal(control('chance2').value,'20');
 assert.equal(row.part2,3);assert.equal(row.capacity,2);
 assert.deepEqual(hooks.buildEditorExportRequest().rewardEdits,[{recordIndex:1,fields:{part1:3,chance1:60,part2:3,chance2:20}}]);
});

test('a shared reward usage opens the exact appearance and reflects changed selectors without changing the configuration',()=>{
 const row=setup({withUses:true});
 set($('rewardUsageSelector'),'deployment:0:76');$('rewardUsageOpen').click();
 assert.equal(hooks.state.editorTab,'scenario');assert.equal($('scenarioDeploymentSelector').value,'0:76');
 assert.equal($('scenarioReward').value,'16');assert.equal(hooks.countEditorChanges(),0);
 hooks.state.editorScenario.deployments[1].rewardSelector=255;$('rewardTabButton').click();
 assert.equal($('rewardScope').textContent,'확인된 등장 1곳에 공통 적용');
 assert.equal($('rewardUsageSelector').options.length,1);assert.equal(row.chance1,60);
});
