import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {installFakeDom,loadHtml} from './helpers/fake-dom.mjs';
import {buildPreset,parsePreset,planPresetApplication,applyPreset} from '../assets/editor-preset.mjs';
import {snapshotPilotObjectiveContext} from '../assets/editor-scenario-pilot-context.mjs';
const document=installFakeDom();loadHtml(document,await readFile(new URL('../index.html',import.meta.url),'utf8'));
// Reset focus chooses a visible field group; provide the DOM containment
// relation even though this fixture intentionally does not implement layout.
Object.getPrototypeOf(document.root).contains=function(target){for(let node=target;node;node=node.parentNode)if(node===this)return true;return false;};
// The lightweight DOM does not reflect option value attributes into properties.
for(const select of document.root.querySelectorAll('select'))for(const item of select.options)if(item.hasAttribute('value'))item.value=item.getAttribute('value');
const logger=console.error;console.error=()=>{};
const {__testHooks:hooks}=await import('../assets/app.mjs');await new Promise(r=>setTimeout(r,0));console.error=logger;
const $=id=>document.getElementById(id),set=(id,value)=>{const el=$(id);el.value=String(value);el.dispatchEvent({type:el.tagName==='INPUT'?'input':'change',target:el});};
const deployment={recordIndex:'0:64',physicalIndex:0,mapIndex:0,scenarioSlots:[0,1],width:6,height:4,name:'테스트 기체',pilotName:'테스트 파일럿',unitId:1,pilotId:1,x:2,y:1,rewardSelector:1,editable:true,identity:`deployment:1:${'a'.repeat(64)}`};
function setup(withObjectives=false,withReinforcements=false,withCriteria=false){Object.assign(hooks.state,{mode:'editor',editorGameId:'srwf-f',editorSessionToken:'scenario-token',editorBusy:false,busy:false,cueSaving:false,editorSetupOpen:false});$('editorWorkspace').hidden=false;
 hooks.installEditorRows({units:[],pilots:[],weapons:[],terrains:[{recordIndex:4,name:'지형4'}],rewards:[{recordIndex:1,name:'보상 표1',aliases:[1],capacity:1,editable:true,part1:1,chance1:50}],
 reinforcements:withReinforcements?[{recordIndex:'0:150',physicalIndex:0,mapIndex:0,scenarioSlots:[0,1],enabled:0,templateOffset:64,turn:2,x:2,y:1,rewardSelector:1,width:6,height:4,editable:true,identity:`reinforcement:1:${'9'.repeat(64)}`,name:'새 증원',templates:[{byteOffset:64,name:'테스트 기체',pilotName:'테스트 파일럿',level:10}]}]:[],
 objectives:withObjectives?[{recordIndex:'0:300',physicalIndex:0,scenarioSlots:[0,1],deadline:0,purpose:{victory:'적의 전멸',defeat:'아군의 전멸'},editable:true,identity:`objective:1:${'f'.repeat(64)}`,name:'작전 목적',...withCriteria?{criteriaEditable:true,objectivePriority:0,victoryJoin:0,defeatJoin:0,victoryRule1:1,victoryRule2:0,victoryRule3:0,defeatRule1:2,defeatRule2:0,defeatRule3:0,criteriaDefaults:{objectivePriority:0,victoryJoin:0,defeatJoin:0,victoryRule1:1,victoryRule2:0,victoryRule3:0,defeatRule1:2,defeatRule2:0,defeatRule3:0}}:{}}]:[],
 deployments:[deployment],scenarios:[{physicalIndex:0,scenarioSlots:[0,1],mapIndex:0,placements:[deployment]}],maps:[{mapIndex:0,mapSlots:[0,1],bankIndex:0,planes:[{width:6,height:4,tiles:Array(24).fill(0),identity:`map:1:${'b'.repeat(64)}`},{width:4,height:3,tiles:Array(12).fill(1),identity:`map:1:${'c'.repeat(64)}`}]}],mapBanks:[{bankSlots:[0],terrainIds:Array(1024).fill(4)}]});$('scenarioTabButton').click();return hooks.state.editorScenario;}
const session=m=>({gameId:m.gameId??'srwf-f',units:m.units,pilots:[],weapons:[],deployments:m.deployments,mapCells:m.rows('map'),events:m.events,objectives:m.objectives,reinforcements:m.reinforcements});
test('320px compact selectors retain both source and independent event text before and after field paging',
 {skip:!process.env.SRWF_EDITOR_PLAYWRIGHT},async()=>{
  const {createRequire}=await import('node:module');
  const {chromium}=createRequire(import.meta.url)(process.env.SRWF_EDITOR_PLAYWRIGHT);
  const browser=await chromium.launch({headless:true,...process.env.SRWF_EDITOR_BROWSER?{executablePath:process.env.SRWF_EDITOR_BROWSER}:{}});
  try{
   const page=await browser.newPage({viewport:{width:320,height:568}}),css=await readFile(new URL('../assets/editor-runtime.css',import.meta.url),'utf8');
   for(const paged of [false,true]){
    await page.setContent(`<style>${css}</style><body data-view="editor" style="margin:0;font-family:sans-serif">
     <section class="editor-scenario-panel" data-compact="true" data-paged="${paged}" data-tool="deployment" data-page="fields" style="width:296px;margin:0 12px;box-sizing:border-box">
      <div class="scenario-toolbar"><select id="scenarioSelector"><option>공유 자료 #1 · 23개</option></select>
       <select id="scenarioEventSelector"><option>1. 적군 99턴 이상</option></select>
       <select id="scenarioMapSelector"><option>맵 #26</option></select><select id="scenarioPlaneSelector"><option>상태 1</option></select>
       <div class="scenario-view-pager"${paged?'':' hidden'}><button>맵</button><button>편집값</button></div><details><summary>설명</summary></details>
      </div></section></body>`);
    const measured=await page.locator('#scenarioSelector,#scenarioEventSelector').evaluateAll(selects=>selects.map(select=>{
     const style=getComputedStyle(select),context=document.createElement('canvas').getContext('2d');context.font=style.font;
     return{width:select.getBoundingClientRect().width,required:context.measureText(select.selectedOptions[0].textContent).width+parseFloat(style.paddingLeft)+parseFloat(style.paddingRight)+20,text:select.selectedOptions[0].textContent};
    }));
    for(const item of measured)assert.ok(item.width>=item.required,JSON.stringify({paged,...item}));
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth)<=320);
   }
  }finally{await browser.close();}
 });
test('isolated future wave controls add/remove data without granting production bytecode authority',()=>{
  let m=setup(false,true);set('scenarioEventSelector','reinforcement:0:150');$('scenarioSpawnToggle').click();
  assert.equal(m.reinforcements[0].enabled,1);const input=$('scenarioSpawnTurn');input.focus();set('scenarioSpawnTurn',5);set('scenarioSpawnX',1);
  assert.equal(document.activeElement,input);assert.equal(m.reinforcements[0].turn,5);assert.equal(m.reinforcements[0].x,1);
  assert.equal(hooks.buildEditorExportRequest().reinforcementEdits[0].turn,5);assert.ok(hooks.countEditorChanges()>0);
  set('scenarioSpawnY',4);set('scenarioSelector','');assert.equal($('scenarioSelector').value,'0');assert.equal($('scenarioSpawnY').getAttribute('aria-invalid'),'true');
  set('scenarioSpawnY',2);const saved=buildPreset({gameId:'srwf-f'},{reinforcement:m.reinforcements}),preset=parsePreset(JSON.stringify(saved));assert.equal(saved.reinforcements[0].fields.enabled.to,1);
  $('editorChangesButton').click();$('editorChangesList').querySelector('[data-change-kind="reinforcement"]').click();assert.ok(document.activeElement.id.startsWith('scenarioSpawn'));
  $('scenarioSpawnReset').click();assert.equal(m.reinforcements[0].enabled,0);assert.equal(hooks.countEditorChanges(),0);assert.equal(document.activeElement,$('scenarioSpawnToggle'));
  m=setup(false,true);assert.ok(applyPreset(preset,session(m),'matching').applied>0);assert.equal(m.reinforcements[0].turn,5);assert.equal(m.reinforcements[0].enabled,1);
  set('scenarioEventSelector','reinforcement:0:150');$('scenarioSpawnToggle').click();assert.equal(m.reinforcements[0].enabled,0);assert.equal(hooks.countEditorChanges(),0);
  for(const [field,value]of [['templateOffset',65],['x',6],['rewardSelector',48]]){
    const invalid=parsePreset(JSON.stringify({format:'srwf.editor-preset',version:1,gameId:'srwf-f',units:[],pilots:[],weapons:[],reinforcements:[{recordIndex:'0:150',identity:m.reinforcements[0].identity,fields:{[field]:{from:m.reinforcements[0][field],to:value}}}]}));
    assert.equal(applyPreset(invalid,session(m),'all').applied,0);
  }
});
test('without an authorized new wave, its controls and selector are absent while map editing remains usable',()=>{
  const m=setup();assert.deepEqual(m.reinforcements,[]);
  assert.equal($('scenarioSpawnChoice').hidden,true);assert.equal($('scenarioSpawnPosition').hidden,true);assert.equal($('scenarioSpawnRewardGroup').hidden,true);
  assert.equal($('scenarioEventSelector').querySelectorAll('option').some(option=>option.value.startsWith('reinforcement:')),false);
  set('scenarioX',3);assert.equal(m.deployments[0].x,3);
  for(const id of ['scenarioEventCriteriaChoice','scenarioEventRule1Group','scenarioEventRule2Group','scenarioEventRule3Group'])assert.equal($(id).hidden,true);
});

test('isolated event combinations keep blank drafts, validate before navigation, compact deletions and restore focus',()=>{
 const m0=setup(),defaults={eventJoin:0,eventRule1:67,eventRule2:0,eventRule3:0};
 const event={recordIndex:'9:2792',physicalIndex:9,scenarioSlots:[106],turn:4,comparison:'ne',actionTaken:false,phase:'enemy-start',editable:true,eventCriteriaEditable:true,...defaults};
 hooks.state.editorGameId='srwf-final';hooks.installEditorRows({gameId:'srwf-final',units:[],pilots:[],weapons:[],terrains:[],rewards:[],events:[event],maps:m0.maps,mapBanks:m0.banks,
  scenarios:[{physicalIndex:9,scenarioSlots:[106],mapIndex:0,placements:[],conditions:[event],waves:[]}]});
 $('scenarioTabButton').click();const m=hooks.state.editorScenario,current=m.events[0];
 // UI rows alone do not grant carrier/provenance writer permission.
 assert.deepEqual(current.original,{turn:4,...defaults});set('scenarioSelector',9);set('scenarioEventSelector','event:9:2792');
 assert.equal($('scenarioEventFields').hidden,true);assert.equal($('scenarioEventCriteriaChoice').hidden,false);
 assert.equal($('scenarioEventRule1Value').value,'4');assert.equal($('scenarioEventRule1Comparison').value,'eq');
 $('scenarioEventAdd').click();assert.equal($('scenarioEventRule2Value').value,'');assert.equal(current.eventRule2,0);
 assert.equal(document.activeElement,$('scenarioEventRule2Value'));assert.equal($('scenarioEventRule1Remove').disabled,true);
 set('scenarioSelector','');assert.equal($('scenarioSelector').value,'9');assert.equal($('scenarioEventRule2Value').getAttribute('aria-invalid'),'true');
 set('scenarioEventRule2Value',7);set('scenarioEventRule2Comparison','le');assert.equal(current.eventRule2,123);
 assert.equal(hooks.countEditorChanges(),1);assert.equal($('editorPresetSaveButton').disabled,false);
 assert.deepEqual(hooks.buildEditorExportRequest().eventEdits,[{recordIndex:'9:2792',eventJoin:0,eventRule1:67,eventRule2:123,eventRule3:0}]);
 assert.equal(document.activeElement,$('scenarioEventRule2Value'));assert.equal($('scenarioEventSelector').selectedOptions[0].textContent,'1. 적군 4턴');
 set('scenarioEventJoin',1);assert.equal(current.eventJoin,1);
 $('editorChangesButton').click();const change=$('editorChangesList').querySelector('[data-change-kind="event"]');
 assert.ok(change);assert.doesNotMatch(change.querySelector('.editor-changes-name').textContent,/#9:2792/);
 change.querySelector('[data-change-field="eventRule2"]').click();assert.equal(document.activeElement,$('scenarioEventRule2Value'));
 $('scenarioEventAdd').click();assert.equal(current.eventRule3,0);set('scenarioEventRule3Value',5);set('scenarioEventRule3Comparison','ne');assert.equal(current.eventRule3,87);
 assert.equal($('scenarioEventAdd').disabled,true);$('scenarioEventRule1Remove').click();
 assert.equal(current.eventRule1,123);assert.equal(current.eventRule2,87);assert.equal(current.eventRule3,0);assert.equal(document.activeElement,$('scenarioEventJoin'));
 $('scenarioEventRule2Remove').click();assert.equal(current.eventRule2,0);assert.equal($('scenarioEventRule1Remove').disabled,true);
 $('scenarioEventAdd').click();$('scenarioEventCriteriaReset').click();
 for(const key of Object.keys(defaults))assert.equal(current[key],defaults[key]);assert.equal(document.activeElement,$('scenarioEventJoin'));
 assert.equal($('scenarioEventRule2Group').hidden,true);assert.equal($('scenarioEventCriteriaReset').disabled,true);
 hooks.state.editorBusy=true;set('scenarioEventRule1Value',8);assert.equal(current.eventRule1,67);hooks.state.editorBusy=false;
});
test('bounded phase controls retain chosen turns, explain player bounds, join JSON/diff/export and restore the loaded phase',()=>{
 const m0=setup(),defaults={eventJoin:0,eventRule1:67,eventRule2:0,eventRule3:0};
 const event={recordIndex:'9:2792',physicalIndex:9,scenarioSlots:[106],turn:4,comparison:'ne',actionTaken:false,phase:'enemy-start',editable:true,eventCriteriaEditable:true,eventPhaseEditable:true,eventPhaseDefaults:0,eventPhase:0,eventCriteriaDefaults:defaults,identity:`event:1:${'e'.repeat(64)}`,...defaults};
 hooks.state.editorGameId='srwf-final';hooks.installEditorRows({gameId:'srwf-final',units:[],pilots:[],weapons:[],terrains:[],rewards:[],events:[event],maps:m0.maps,mapBanks:m0.banks,
  scenarios:[{physicalIndex:9,scenarioSlots:[106],mapIndex:0,placements:[],conditions:[event],waves:[]}]});
 $('scenarioTabButton').click();const m=hooks.state.editorScenario,current=m.events[0];set('scenarioSelector',9);set('scenarioEventSelector','event:9:2792');
 assert.equal($('scenarioEventPhaseGroup').hidden,false);assert.equal(current.original.eventPhase,0);
 $('scenarioEventPhase').focus();set('scenarioEventPhase',1);assert.equal(current.eventPhase,1,JSON.stringify({gameId:m.gameId,status:$('scenarioStatus').textContent,phase:$('scenarioEventPhase').value,join:$('scenarioEventJoin').value,rule:$('scenarioEventRule1Comparison').value}));assert.equal(current.eventRule1,67);
 assert.equal(document.activeElement,$('scenarioEventPhase'));assert.equal($('scenarioEventSelector').selectedOptions[0].textContent,'1. 아군 4턴');
 assert.equal($('scenarioEventAdd').disabled,true);assert.equal($('scenarioEventRule1Comparison').disabled,true);assert.equal($('scenarioEventRule1Value').min,'2');assert.equal($('scenarioEventPhaseHint').hidden,false);
 assert.deepEqual(hooks.buildEditorExportRequest().eventEdits,[{recordIndex:current.recordIndex,eventPhase:1,...defaults}]);
 const saved=parsePreset(JSON.stringify(buildPreset({gameId:'srwf-final'},{event:m.events})));assert.equal(saved.entries.event[0].fields[0].field,'eventPhase');
 set('scenarioEventRule1Value',1);assert.equal(current.eventRule1,67);assert.equal($('scenarioEventRule1Value').getAttribute('aria-invalid'),'true');assert.match($('scenarioStatus').textContent,/2~99/);
 set('scenarioSelector','');assert.equal($('scenarioSelector').value,'9');
 set('scenarioEventRule1Value',99);assert.equal(current.eventRule1,1587);assert.equal($('scenarioEventRule1Value').getAttribute('aria-invalid'),null);
 $('editorChangesButton').click();const change=$('editorChangesList').querySelector('[data-change-kind="event"]');assert.match(change.textContent,/아군 시작/);change.querySelector('[data-change-field="eventPhase"]').click();assert.equal(document.activeElement,$('scenarioEventPhase'));
 $('scenarioEventCriteriaReset').click();assert.equal(current.eventPhase,0);assert.equal(current.eventRule1,67);assert.equal(document.activeElement,$('scenarioEventPhase'));assert.equal($('scenarioEventAdd').disabled,false);assert.equal($('scenarioEventRule1Comparison').disabled,false);assert.equal($('scenarioEventPhaseHint').hidden,true);
 // A phase switch cannot silently delete the user's existing combination.
 $('scenarioEventAdd').click();set('scenarioEventRule2Value',7);set('scenarioEventPhase',1);assert.equal(current.eventPhase,0);assert.equal(current.eventRule2,115);assert.equal($('scenarioEventPhase').value,'0');assert.match($('scenarioStatus').textContent,/조건 1개/);
 set('scenarioEventRule2Value',7);assert.match($('scenarioStatus').textContent,/조건 1개/);
 $('scenarioEventRule2Remove').click();set('scenarioEventPhase',1);assert.equal(current.eventPhase,1);assert.equal(current.eventRule1,67);
 // Labels use the editable scalar, not the original reader's phase string.
 assert.equal(current.phase,'enemy-start');set('scenarioEventPhase',0);assert.equal($('scenarioEventSelector').selectedOptions[0].textContent,'1. 적군 4턴');
});
test('scenario controls retain focus, reject invalid coordinates and combine placement/tile changes in export and reset',()=>{
 const m=setup(),input=$('scenarioX');input.focus();set('scenarioX',6);assert.equal(m.deployments[0].x,2);assert.equal(input.getAttribute('aria-invalid'),'true');assert.equal(hooks.countEditorChanges(),0);
 set('scenarioX',3);assert.equal(m.deployments[0].x,3);assert.equal(document.activeElement,input);assert.equal(input.getAttribute('aria-invalid'),null);
 $('scenarioTileTool').click();set('scenarioTileSelector',1000);$('scenarioApplyTile').click();assert.equal(m.cell(0,0,0,0).tileId,1000);
 assert.equal(hooks.countEditorChanges(),2);assert.equal($('editorPresetSaveButton').disabled,false);
 const request=hooks.buildEditorExportRequest();assert.deepEqual(request.deploymentEdits,[{recordIndex:'0:64',x:3,y:1,rewardSelector:1}]);assert.deepEqual(request.mapEdits,[{mapIndex:0,plane:0,x:0,y:0,tileId:1000}]);
 $('editorChangesButton').click();const entry=$('editorChangesList').querySelector('[data-change-kind="deployment"]');entry.click();assert.equal(hooks.state.editorTab,'scenario');assert.equal(document.activeElement,input);
 $('scenarioDeploymentReset').click();assert.equal(document.activeElement,input);assert.equal($('scenarioDeploymentReset').disabled,true);
 $('editorChangesButton').click();$('editorChangesList').querySelector('[data-change-kind="map"]').click();$('scenarioTileReset').click();assert.equal(hooks.countEditorChanges(),0);assert.equal(document.activeElement,$('scenarioTileSelector'));
});
test('placement resets focus the coordinate or reward that changed and allow another edit immediately',()=>{
 const m=setup();
 for(const [id,value,field,original]of [['scenarioY',2,'y',1],['scenarioReward',255,'rewardSelector',1]]){
  set(id,value);$('scenarioDeploymentReset').focus();$('scenarioDeploymentReset').click();
  assert.equal(m.deployments[0][field],original);assert.equal(document.activeElement,$(id));assert.equal($(id).disabled,false);
  set(id,value);assert.equal(m.deployments[0][field],value);$('scenarioDeploymentReset').click();
 }
});
test('busy sessions cannot change a placement/tile and aliased maps use one canonical cell',()=>{
 const m=setup();hooks.state.editorBusy=true;set('scenarioX',3);$('scenarioTileTool').click();set('scenarioTileSelector',10);$('scenarioApplyTile').click();assert.equal(hooks.countEditorChanges(),0);assert.equal(m.deployments[0].x,2);
 hooks.state.editorBusy=false;assert.equal(m.cell(1,0,2,1),m.cell(0,0,2,1));
});
test('saved map rows are hydrated on load; structure identities, map bounds and reward domains are enforced in both modes',()=>{
 let m=setup();m.deployments[0].x=3;m.cell(0,0,4,2).tileId=6;
 const preset=parsePreset(JSON.stringify(buildPreset({gameId:'srwf-f'},{deployment:m.deployments,map:m.rows('map')})));
 m=setup();m.preparePreset(preset);assert.equal(planPresetApplication(preset,session(m)).counts.apply,2);assert.equal(applyPreset(preset,session(m),'matching').applied,2);assert.equal(m.cell(0,0,4,2).tileId,6);
 m=setup();m.preparePreset(preset);m.deployments[0].identity=`deployment:1:${'d'.repeat(64)}`;m.cell(0,0,4,2).identity=`map:1:${'e'.repeat(64)}`;assert.equal(planPresetApplication(preset,session(m)).counts.skip,2);
 for(const fields of [{x:{from:2,to:63}},{rewardSelector:{from:1,to:49}}]){
  const bad=parsePreset(JSON.stringify({format:'srwf.editor-preset',version:1,gameId:'srwf-f',units:[],pilots:[],weapons:[],deployments:[{recordIndex:'0:64',identity:deployment.identity,fields}]}));
  for(const mode of ['matching','all']){m=setup();assert.equal(applyPreset(bad,session(m),mode).applied,0);assert.equal(m.deployments[0].x,2);}
 }
});
test('scenario presets require canonical bounded locations and explicit structure identities',()=>{
 const entry={recordIndex:'0:64',identity:deployment.identity,fields:{x:{from:2,to:3}}};
 const preset={format:'srwf.editor-preset',version:1,gameId:'srwf-f',units:[],pilots:[],weapons:[],deployments:[entry]};
 for(const id of [0,'00:64','0:55','200:64','0:262144','0:64:0'])assert.throws(()=>parsePreset(JSON.stringify({...preset,deployments:[{...entry,recordIndex:id}]})),{code:'PRESET_BAD_RECORD'});
 assert.throws(()=>parsePreset(JSON.stringify({...preset,deployments:[{recordIndex:'0:64',fields:entry.fields}]})),{code:'PRESET_MISSING_KEY'});
});

test('a bounded 20,000-cell edit survives JSON save/load without building mutable rows for untouched maps',async()=>{
 const {createScenarioModel}=await import('../assets/editor-scenario-model.mjs');
 const {serializePreset,isPresetSizeAllowed}=await import('../assets/editor-preset.mjs');
 const maps=Array.from({length:5},(_,mapIndex)=>({mapIndex,mapSlots:[mapIndex],bankIndex:0,planes:Array.from({length:2},()=>({width:64,height:64,tiles:Array(4096).fill(0),identity:`map:1:${'a'.repeat(64)}`}))}));
 const m=createScenarioModel({maps,mapBanks:[{bankSlots:[0],terrainIds:Array(1024).fill(0)}]});
 assert.equal(m.rows('map').length,0);
 for(let i=0;i<20000;i++){const mapIndex=Math.floor(i/8192),plane=Math.floor(i%8192/4096),n=i%4096;m.cell(mapIndex,plane,n%64,Math.floor(n/64)).tileId=1023;}
 const text=serializePreset(buildPreset({gameId:'srwf-f'},{map:m.rows('map')}));assert.ok(new Blob([text]).size>1024*1024);assert.ok(isPresetSizeAllowed(new Blob([text]).size));
 const preset=parsePreset(text);assert.equal(preset.changeCount,20000);
 const fresh=createScenarioModel({maps});assert.equal(fresh.rows('map').length,0);fresh.preparePreset(preset);
 assert.equal(applyPreset(preset,session(fresh),'matching').applied,20000);assert.equal(fresh.exportMap().length,20000);
 const extra=fresh.cell(4,1,63,63);extra.tileId=2;
 const one=parsePreset(serializePreset(buildPreset({gameId:'srwf-f'},{map:[extra]})));extra.tileId=0;
 for(const mode of ['matching','all']){const result=applyPreset(one,session(fresh),mode);assert.equal(result.applied,0);assert.equal(result.plan.skipReasons['map-capacity'],1);assert.equal(extra.tileId,0);}
});


test('turn and reinforcement controls preserve focus, block invalid navigation, join diff/preset/export, and reset independently',()=>{
 const m0=setup();
 const initial={...deployment,waveIndex:'0:100'},reinforcement={...deployment,recordIndex:'0:200',waveIndex:'0:197',name:'증원 기체',x:4,y:2};
 const event={recordIndex:'0:150',physicalIndex:0,commandOffset:150,scenarioSlots:[0,1],turn:5,comparison:'eq',phase:'enemy-start',editable:true,name:'5턴 사건',identity:`event:1:${'f'.repeat(64)}`};
 hooks.installEditorRows({units:[],pilots:[],weapons:[],terrains:[],rewards:[{recordIndex:1,aliases:[1],editable:true}],deployments:[initial,reinforcement],events:[event],maps:m0.maps,mapBanks:m0.banks,
 scenarios:[{physicalIndex:0,scenarioSlots:[0,1],mapIndex:0,placements:[initial,reinforcement],conditions:[event],waves:[
  {recordIndex:'0:100',initial:true,root:4,mapIndex:0,guards:[],placements:[initial]},
  {recordIndex:'0:197',initial:false,root:5,mapIndex:0,phase:'enemy-start',guards:[{recordIndex:'0:150',taken:true}],placements:[reinforcement]},
 ]}]});$('scenarioTabButton').click();const m=hooks.state.editorScenario;
 set('scenarioEventSelector','0:197');assert.equal($('scenarioDeploymentSelector').children.length,1);assert.equal($('scenarioTurn').value,'5');
 const input=$('scenarioTurn');input.focus();set('scenarioTurn',6);assert.equal(document.activeElement,input);assert.equal(m.events[0].turn,6);assert.equal(hooks.countEditorChanges(),1);
 set('scenarioX',3);assert.equal(hooks.countEditorChanges(),2);
 assert.deepEqual(hooks.buildEditorExportRequest().eventEdits,[{recordIndex:'0:150',turn:6}]);
 const preset=parsePreset(JSON.stringify(buildPreset({gameId:'srwf-f'},{event:m.events,deployment:m.deployments})));
 m.events[0].turn=5;m.deployments[1].x=4;assert.equal(applyPreset(preset,session(m),'matching').applied,2);
 set('scenarioTurn',100);set('scenarioEventSelector','0:100');assert.equal($('scenarioEventSelector').value,'0:197');assert.equal(input.getAttribute('aria-invalid'),'true');
 set('scenarioTurn',6);$('editorChangesButton').click();$('editorChangesList').querySelector('[data-change-kind="event"]').click();assert.equal(document.activeElement,input);
 $('scenarioEventReset').click();assert.equal(m.events[0].turn,5);assert.equal(m.deployments[1].x,3);assert.equal(hooks.countEditorChanges(),1);assert.equal(document.activeElement,input);assert.equal(input.disabled,false);assert.equal($('scenarioEventReset').disabled,true);
 hooks.state.editorBusy=true;set('scenarioTurn',9);assert.equal(m.events[0].turn,5);hooks.state.editorBusy=false;
});

test('independent turn events update their selected labels without losing input focus or selection',()=>{
 const m0=setup();
 const events=[4,6].map((turn,i)=>({recordIndex:`0:${150+i*10}`,physicalIndex:0,commandOffset:150+i*10,
  scenarioSlots:[0,1],turn,comparison:'eq',phase:'enemy-start',editable:true,name:`${turn}턴 사건`,identity:`event:1:${String(i+1).repeat(64)}`}));
 hooks.installEditorRows({units:[],pilots:[],weapons:[],terrains:[],rewards:[{recordIndex:1,aliases:[1],editable:true}],
  deployments:[deployment],events,maps:m0.maps,mapBanks:m0.banks,
  scenarios:[{physicalIndex:0,scenarioSlots:[0,1],mapIndex:0,placements:[deployment],conditions:events,waves:[]}]});
 $('scenarioTabButton').click();set('scenarioEventSelector','event:0:160');
 const input=$('scenarioTurn'),selector=$('scenarioEventSelector');input.focus();
 // Real HTMLOptionElement.value reflects its attribute; this fixture does not.
 for(const id of ['scenarioEventSelector','scenarioConditionSelector'])for(const item of $(id).options)item.setAttribute('value',item.value);
 const selectedLabel=()=>selector.options.find(item=>item.value==='event:0:160').textContent;
 assert.equal(selectedLabel(),'2. 적군 6턴');set('scenarioTurn',7);
 assert.equal(hooks.state.editorScenario.events[1].turn,7);assert.equal(selectedLabel(),'2. 적군 7턴');
 assert.equal(selector.value,'event:0:160');assert.equal(document.activeElement,input);
 assert.equal(selector.title,'7턴 · 적군 시작 검사 · 사건 2');assert.match(selector.getAttribute('aria-label'),/7턴 · 적군 시작 검사 · 사건 2/);
 assert.equal($('scenarioConditionSelector').querySelector('option[value="0:160"]').textContent,'7턴 · 적군 시작 검사');
 set('scenarioTurn',100);assert.equal(selectedLabel(),'2. 적군 7턴');assert.equal(hooks.state.editorScenario.events[1].turn,7);
 set('scenarioTurn',7);$('scenarioEventReset').click();
 assert.equal(selectedLabel(),'2. 적군 6턴');assert.equal(selector.value,'event:0:160');assert.equal(document.activeElement,input);
 assert.equal(selector.title,'6턴 · 적군 시작 검사 · 사건 2');
 assert.equal($('scenarioEventReset').disabled,true);assert.equal(hooks.countEditorChanges(),0);
});

test('supported objectives remain reachable without decoded appearances while empty or unmapped scenes stay absent',()=>{
 const m0=setup(true,false,true),objectives=[2,3,4].map(physicalIndex=>({...m0.objectives[0],
  physicalIndex,recordIndex:`${physicalIndex}:300`,scenarioSlots:[physicalIndex],editable:physicalIndex!==4}));
 const scenes=[0,2,3,4].map(physicalIndex=>({physicalIndex,scenarioSlots:[physicalIndex],mapIndex:physicalIndex===3?999:0,
  placements:[],conditions:[],waves:[]}));
 const install=deployments=>hooks.installEditorRows({units:[],pilots:[],weapons:[],terrains:[],rewards:[],
  deployments,objectives,maps:m0.maps,mapBanks:m0.banks,scenarios:scenes});
 install([]);$('scenarioTabButton').click();
 assert.deepEqual($('scenarioSelector').options.map(item=>item.value),['','2']);
 assert.equal($('scenarioSelector').value,'2');assert.equal($('scenarioEventSelector').value,'objective:2:300');
 assert.equal($('scenarioObjectiveDescription').hidden,false);assert.equal($('scenarioObjectivePriority').disabled,false);
 set('scenarioObjectivePriority',1);assert.equal(hooks.state.editorScenario.objectives[0].objectivePriority,1);
 assert.deepEqual(hooks.buildEditorExportRequest().deadlineEdits.map(row=>row.recordIndex),['2:300']);
 const placement={...deployment,physicalIndex:5,recordIndex:'5:64',scenarioSlots:[5]};
 scenes.push({physicalIndex:5,scenarioSlots:[5],mapIndex:0,placements:[placement],conditions:[],waves:[]});
 install([placement]);$('scenarioTabButton').click();assert.equal($('scenarioSelector').value,'5');
});

test('unit-kind criteria use actual names and bounded selections, preserve focus, and never reuse numeric values as ids',()=>{
 const m0=setup(true,false,true),units=[0,1,2,367,368].map(recordIndex=>({recordIndex,name:recordIndex===2?'가베라테트라':`기체 ${recordIndex}`}));
 hooks.installEditorRows({gameId:'srwf-f',units,pilots:[],weapons:[],terrains:[],rewards:[],deployments:[deployment],
  objectives:m0.objectives,maps:m0.maps,mapBanks:m0.banks,scenarios:m0.scenarios});
 $('scenarioTabButton').click();set('scenarioEventSelector','objective:0:300');
 set('scenarioVictoryRule1Query','unitKind');assert.equal($('scenarioVictoryRule1Unit').value,'');assert.equal($('scenarioCriteriaReset').disabled,false);
 assert.equal(hooks.state.editorScenario.objectives[0].victoryRule1,1);$('scenarioCriteriaReset').click();
 assert.equal($('scenarioVictoryRule1Query').value,'enemyCount');assert.equal($('scenarioVictoryRule1Value').value,'0');assert.equal(hooks.countEditorChanges(),0);
 $('scenarioVictoryAdd').click();
 const prefix='scenarioVictoryRule2',unit=$(prefix+'Unit');set(prefix+'Query','unitKind');
 assert.equal($(prefix+'Value').hidden,true);assert.equal($(prefix+'Value').value,'');assert.equal($(prefix+'UnitGroup').hidden,false);assert.equal(unit.value,'');
 assert.deepEqual($(prefix+'Comparison').options.map(item=>item.value),['present','absent']);
 assert.deepEqual(unit.options.map(item=>item.value),['','1','2','367']);
 unit.focus();set(prefix+'Unit','368');assert.equal(hooks.state.editorScenario.objectives[0].victoryRule2,0);assert.equal(unit.getAttribute('aria-invalid'),'true');
 set(prefix+'Unit','2');assert.equal(hooks.state.editorScenario.objectives[0].victoryRule2,0x8005);assert.equal(document.activeElement,unit);
 assert.match($('scenarioVictoryText').textContent,/가베라테트라 있음/);assert.equal(unit.options.find(item=>item.value==='2').textContent,'가베라테트라');
 set(prefix+'Comparison','absent');assert.equal(hooks.state.editorScenario.objectives[0].victoryRule2,0x8004);assert.equal(unit.value,'2');
 $(prefix+'UnitInfo').click();assert.match($('scenarioStatus').textContent,/같은 종류 전체/);assert.match($('scenarioStatus').textContent,/미출현·퇴각·변형/);
 const request=hooks.buildEditorExportRequest();assert.equal(request.deadlineEdits[0].victoryRule2,0x8004);
 const saved=parsePreset(JSON.stringify(buildPreset({gameId:'srwf-f'},{objective:hooks.state.editorScenario.objectives})));
 $('editorChangesButton').click();$('editorChangesList').querySelector('[data-change-kind="objective"]').click();assert.equal(document.activeElement,unit);
 set(prefix+'Query','turn');assert.equal($(prefix+'Value').value,'');assert.equal($(prefix+'Comparison').value,'eq');assert.equal($(prefix+'Value').hidden,false);assert.equal($(prefix+'UnitGroup').hidden,true);
 assert.equal(hooks.state.editorScenario.objectives[0].victoryRule2,0x8004);set(prefix+'Value',3);assert.equal(hooks.state.editorScenario.objectives[0].victoryRule2,51);
 set(prefix+'Query','unitKind');assert.equal(unit.value,'');assert.equal($(prefix+'Value').value,'');assert.equal(hooks.state.editorScenario.objectives[0].victoryRule2,51);
 set(prefix+'Unit',367);assert.equal(hooks.state.editorScenario.objectives[0].victoryRule2,0x82df);
 $('scenarioCriteriaReset').click();assert.equal(hooks.state.editorScenario.objectives[0].victoryRule2,0);assert.equal($(prefix+'UnitGroup').hidden,true);assert.equal(hooks.countEditorChanges(),0);
 assert.ok(applyPreset(saved,session(hooks.state.editorScenario),'matching').applied>0);
 hooks.refreshEditorAfterPreset();assert.equal(unit.value,'2');assert.equal($(prefix+'Comparison').value,'absent');assert.equal($(prefix+'UnitGroup').hidden,false);
 set(prefix+'Query','turn');assert.equal($(prefix+'Value').value,'');$(prefix+'Remove').click();
 assert.equal(hooks.state.editorScenario.objectives[0].victoryRule2,0);assert.equal($(prefix+'Group').hidden,true);assert.equal(hooks.countEditorChanges(),0);
});

test('authenticated legacy deployment identities apply only at the same location; event identities never remap',()=>{
 const m=setup(),legacy=`deployment:1:${'d'.repeat(64)}`;
 m.deployments[0].identityAliases=Object.freeze([legacy]);
 const preset=recordIndex=>parsePreset(JSON.stringify({format:'srwf.editor-preset',version:1,gameId:'srwf-f',units:[],pilots:[],weapons:[],deployments:[{recordIndex,identity:legacy,fields:{x:{from:2,to:3}}}]}));
 assert.equal(applyPreset(preset('0:64'),session(m),'matching').applied,1);
 m.deployments[0].x=2;
 assert.equal(applyPreset(preset('0:65'),session(m),'all').applied,0);
 assert.equal(m.deployments[0].x,2);
 const identity=`event:1:${'e'.repeat(64)}`;
 m.events.push({recordIndex:'0:150',turn:5,original:{turn:5},editable:true,identity});
 const eventPreset=parsePreset(JSON.stringify({format:'srwf.editor-preset',version:1,gameId:'srwf-f',units:[],pilots:[],weapons:[],events:[{recordIndex:'0:151',identity,fields:{turn:{from:5,to:6}}}]}));
 assert.equal(applyPreset(eventPreset,session(m),'all').applied,0);
 assert.equal(m.events[0].turn,5);
});

test('additional deadline UI preserves focus, blocks invalid scene changes and joins JSON, diff, export, reset and strict identities',()=>{
  let m=setup(true,false,true);set('scenarioEventSelector','objective:0:300');$('scenarioVictoryAdd').click();$('scenarioVictoryRule2Remove').focus();$('scenarioVictoryRule2Remove').click();assert.equal(hooks.countEditorChanges(),0);assert.equal($('scenarioVictoryRule2Group').hidden,true);assert.equal(document.activeElement,$('scenarioVictoryAdd'));
 m=setup(true);set('scenarioEventSelector','objective:0:300');const input=$('scenarioDeadline');input.focus();set('scenarioDeadline',5);
  assert.equal(m.objectives[0].deadline,5);assert.equal(document.activeElement,input);assert.equal(hooks.countEditorChanges(),1);
  assert.match($('scenarioDeadlineRule').textContent,/6턴/);assert.match($('scenarioDefeatText').textContent,/6턴/);
  assert.deepEqual(hooks.buildEditorExportRequest().deadlineEdits,[{recordIndex:'0:300',deadline:5}]);
  set('scenarioDeadline',99);set('scenarioSelector','');assert.equal($('scenarioSelector').value,'0');assert.equal(m.objectives[0].deadline,5);
  set('scenarioDeadline',5);const saved=buildPreset({gameId:"srwf-f"},{objective:m.objectives}),preset=parsePreset(JSON.stringify(saved));assert.equal(saved.objectives[0].fields.deadline.to,5);
  $('editorChangesButton').click();$('editorChangesList').querySelector('[data-change-kind="objective"]').click();assert.equal(document.activeElement,input);
  $('scenarioObjectiveReset').click();assert.equal(m.objectives[0].deadline,0);assert.equal(hooks.countEditorChanges(),0);assert.equal(document.activeElement,input);
  m=setup(true);assert.equal(applyPreset(preset,session(m),'matching').applied,1);assert.equal(m.objectives[0].deadline,5);
  m=setup(true);m.objectives[0].identity=`objective:1:${'e'.repeat(64)}`;assert.equal(applyPreset(preset,session(m),'all').applied,0);
  delete saved.objectives[0].identity;assert.throws(()=>parsePreset(JSON.stringify(saved)),{code:'PRESET_MISSING_KEY'});
});


test('objective criteria add/delete, atomic invalid inputs, joins, priority, presets, diff focus and independent resets',()=>{
 let m=setup(true,false,true);set('scenarioEventSelector','objective:0:300');
 assert.equal($('scenarioVictoryRule1Group').hidden,false);assert.equal($('scenarioVictoryRule2Group').hidden,true);
 assert.equal($('scenarioVictoryRule1Remove').disabled,true);
 $('scenarioVictoryAdd').click();assert.equal(m.objectives[0].victoryRule2,0);assert.equal($('scenarioVictoryRule2Query').value,'');assert.equal($('scenarioVictoryRule2Value').value,'');assert.equal(hooks.countEditorChanges(),0);assert.equal(document.activeElement,$('scenarioVictoryRule2Query'));
 set('scenarioVictoryRule2Query','turn');set('scenarioVictoryRule2Comparison','le');set('scenarioVictoryRule2Value',5);assert.equal(m.objectives[0].victoryRule2,91);
 const input=$('scenarioVictoryRule2Value');input.focus();set('scenarioVictoryRule2Value',4);assert.equal(m.objectives[0].victoryRule2,75);assert.equal(document.activeElement,input);
 set('scenarioVictoryRule2Value',100);assert.equal(m.objectives[0].victoryRule2,75);assert.equal(input.getAttribute('aria-invalid'),'true');
 set('scenarioSelector','');assert.equal($('scenarioSelector').value,'0');assert.equal(document.activeElement,input);
 set('scenarioVictoryRule2Value',5);set('scenarioVictoryJoin',1);set('scenarioObjectivePriority',1);
 $('scenarioDefeatAdd').click();assert.equal(m.objectives[0].defeatRule2,0);assert.equal($('scenarioDefeatRule2Query').value,'');assert.equal($('scenarioDefeatRule2Value').value,'');
 set('scenarioDefeatRule2Query','turn');set('scenarioDefeatRule2Comparison','ge');set('scenarioDefeatRule2Value',6);set('scenarioDefeatJoin',1);
 assert.equal($('scenarioVictoryText').textContent,'적전멸또는5턴이하');assert.equal($('scenarioDefeatText').textContent,'아군전멸또는6턴이상');
 const saved=parsePreset(JSON.stringify(buildPreset({gameId:'srwf-f'},{objective:m.objectives}))),request=hooks.buildEditorExportRequest();
 assert.equal(request.deadlineEdits[0].victoryRule2,91);assert.equal(request.deadlineEdits[0].defeatRule2,111);assert.equal(request.deadlineEdits[0].objectivePriority,1);
 $('editorChangesButton').click();$('editorChangesList').querySelector('[data-change-kind="objective"]').click();assert.ok(document.activeElement.id.startsWith('scenario'));
 $('scenarioVictoryRule1Remove').click();assert.equal(m.objectives[0].victoryRule1,0);assert.equal($('scenarioVictoryRule1Group').hidden,true);assert.equal($('scenarioVictoryRule2Remove').disabled,true);
 $('scenarioCriteriaReset').click();assert.equal(hooks.countEditorChanges(),0);assert.equal(document.activeElement,$('scenarioObjectivePriority'));assert.equal($('scenarioObjectivePriority').disabled,false);
 m=setup(true,false,true);assert.ok(applyPreset(saved,session(m),'matching').applied>0);assert.equal(m.objectives[0].defeatRule2,111);
 set('scenarioEventSelector','objective:0:300');set('scenarioDeadline',2);$('scenarioCriteriaReset').click();assert.equal(m.objectives[0].deadline,2);assert.equal(m.objectives[0].victoryRule2,0);
 $('scenarioObjectiveReset').click();assert.equal(hooks.countEditorChanges(),0);assert.equal(document.activeElement,$('scenarioObjectivePriority'));
 // Canonical fields that leave an empty outcome or exceed the display bound
 // are skipped as a group in both modes, without a partial priority edit.
 for(const fields of [{victoryRule1:{from:1,to:0},objectivePriority:{from:0,to:1}},{victoryRule1:{from:1,to:0}},{victoryRule2:{from:0,to:1194},victoryRule3:{from:0,to:1194},defeatRule2:{from:0,to:1194}}]){
  const bad=parsePreset(JSON.stringify({format:'srwf.editor-preset',version:1,gameId:'srwf-f',units:[],pilots:[],weapons:[],objectives:[{recordIndex:'0:300',identity:m.objectives[0].identity,fields}]}));
  for(const mode of ['matching','all']){m=setup(true,false,true);assert.equal(applyPreset(bad,session(m),mode).applied,0);assert.equal(m.objectives[0].objectivePriority,0);assert.equal(m.objectives[0].victoryRule1,1);}
 }
 m=setup(true);set('scenarioEventSelector','objective:0:300');assert.equal($('scenarioCriteriaChoice').hidden,true);assert.equal($('scenarioVictoryChoice').hidden,true);
});


test('pilot conditions use authenticated ordinary heads, named selections and a fresh draft when changing the query',()=>{
 const m0=setup(true,false,true),pilot=(recordIndex,patch={})=>({recordIndex,name:recordIndex===80?'시마 가라하우':'같은 이름',
  identity:`pilot:1:${recordIndex.toString(16).padStart(64,'0')}`,statsValid:true,recordKind:'regular',role:null,aliasIds:[],...patch});
 const pilots=[pilot(80),pilot(159),pilot(200),pilot(304,{recordKind:'hero-slot',role:'hero-slot'}),pilot(1,{recordKind:'alias-group',aliasIds:[312]})];
 const pilotContext=snapshotPilotObjectiveContext({gameId:'srwf-final',scenarioLayout:'latest',pilotCount:400,unitCount:448,pilots});
 hooks.state.editorGameId='srwf-final';
 const install=allowed=>hooks.installEditorRows({gameId:'srwf-final',units:[{recordIndex:447,name:'가베라테트라'}],pilots,weapons:[],terrains:[],rewards:[],
  scenarioObjectiveContext:{pilotContext},deployments:[deployment],objectives:[{...m0.objectives[0],pilotCriteriaEditable:allowed}],maps:m0.maps,mapBanks:m0.banks,scenarios:m0.scenarios});
 install(true);$('scenarioTabButton').click();set('scenarioEventSelector','objective:0:300');
 const prefix='scenarioVictoryRule1';set(prefix+'Query','pilotLookup');
 const select=$(prefix+'Unit');assert.equal(select.value,'');assert.equal($(prefix+'Value').hidden,true);
 assert.deepEqual(select.options.map(option=>option.value),['','80','159','200']);
 assert.match(select.options.find(option=>option.value==='159').textContent,/#159/);
 assert.equal(select.getAttribute('aria-label'),'승리 조건 1 파일럿 선택');
 assert.deepEqual($(prefix+'Comparison').options.map(option=>option.value),['present','absent']);
 select.focus();set(prefix+'Unit','304');assert.equal(hooks.state.editorScenario.objectives[0].victoryRule1,1);
 assert.equal(select.getAttribute('aria-invalid'),'true');
 set(prefix+'Unit','80');assert.equal(hooks.state.editorScenario.objectives[0].victoryRule1,0x40a1);
 assert.equal(document.activeElement,select);assert.match($('scenarioVictoryText').textContent,/시마 가라하우 있음/);
 $(prefix+'UnitInfo').click();assert.match($('scenarioStatus').textContent,/파일럿이 연결된 기체/);
 assert.match($('scenarioStatus').textContent,/격추 여부/);
 set(prefix+'Comparison','absent');assert.equal(hooks.buildEditorExportRequest().deadlineEdits[0].victoryRule1,0x40a0);
 $('editorChangesButton').click();$('editorChangesList').querySelector('[data-change-kind="objective"]').click();assert.equal(document.activeElement,select);
 set(prefix+'Query','unitKind');assert.equal(select.value,'');assert.equal($(prefix+'Value').value,'');
 assert.deepEqual(select.options.map(option=>option.value),['','447']);assert.equal(select.getAttribute('aria-label'),'승리 조건 1 기체 종류 선택');
 assert.equal(hooks.state.editorScenario.objectives[0].victoryRule1,0x40a0);
 assert.notEqual($('scenarioStatus').textContent,'');
 $('scenarioCriteriaReset').click();assert.equal(hooks.countEditorChanges(),0);assert.equal(document.activeElement,$('scenarioObjectivePriority'));assert.equal($('scenarioStatus').textContent,'');
 install(false);$('scenarioTabButton').click();set('scenarioEventSelector','objective:0:300');
 assert.equal($(prefix+'Query').options.some(option=>option.value==='pilotLookup'),false);
});
