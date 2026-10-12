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
const $=id=>document.getElementById(id),set=(id,value)=>{const el=$(id);if(id==='scenarioEventSelector'){const mode=String(value).startsWith('objective:')?'scenarioObjectiveTool':String(value).startsWith('event:')||String(value).startsWith('reinforcement:')?'scenarioEventTool':'scenarioDeploymentTool';$(mode).click();}el.value=String(value);el.dispatchEvent({type:el.tagName==='INPUT'?'input':'change',target:el});};
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
       <div class="scenario-mode-row"><button>기체 배치</button><button>이벤트</button><button>승리·패배</button><button>타일</button></div><div class="scenario-context-row"><select id="scenarioEventSelector"><option>1. 적군 99턴 이상</option></select>

       <div class="scenario-view-pager"${paged?'':' hidden'}><button>맵</button><button>편집값</button></div><details><summary>도움말</summary></details><details hidden><summary>지도 설정</summary></details></div>
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
 $('editorChangesButton').click();$('editorChangesList').querySelector('[data-change-kind="map"]').click();$('scenarioTileReset').click();assert.equal(hooks.countEditorChanges(),0);assert.equal(document.activeElement,$('scenarioTilePickerOpen'));
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
 set('scenarioEventSelector','0:197');assert.equal($('scenarioDeploymentSelector').children.length,1);assert.equal($('scenarioEventFields').hidden,true);set('scenarioX',3);assert.equal(m.deployments[1].x,3);set('scenarioEventSelector','event:0:150');assert.equal($('scenarioTurn').value,'5');
 const input=$('scenarioTurn');input.focus();set('scenarioTurn',6);assert.equal(document.activeElement,input);assert.equal(m.events[0].turn,6);assert.equal(hooks.countEditorChanges(),2);
 assert.equal(hooks.countEditorChanges(),2);
 assert.deepEqual(hooks.buildEditorExportRequest().eventEdits,[{recordIndex:'0:150',turn:6}]);
 const preset=parsePreset(JSON.stringify(buildPreset({gameId:'srwf-f'},{event:m.events,deployment:m.deployments})));
 m.events[0].turn=5;m.deployments[1].x=4;assert.equal(applyPreset(preset,session(m),'matching').applied,2);
 set('scenarioTurn',100);$('scenarioDeploymentTool').click();assert.equal($('scenarioEventSelector').value,'event:0:150');assert.equal($('scenarioEditorPanel').dataset.mode,'events');assert.equal(input.getAttribute('aria-invalid'),'true');
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

test('chronological selector preserves physical edit targets and includes authenticated map-only battles',()=>{
 const m0=setup(),chapter=(n,name)=>({source:'user-bin-scenario-chapter',gameId:'srwf-f',name,
  scenarioSlot:n,episodes:[n===31?1:n],routeCode:'real',part:1,totalParts:1,order:n});
 const rows=[2,31,1].map(physicalIndex=>({...deployment,physicalIndex,rewardSelector:255,recordIndex:`${physicalIndex}:64`,
  scenarioSlots:[physicalIndex],identity:`deployment:1:${physicalIndex.toString(16).padStart(2,'0').repeat(32)}`}));
 const scenes=rows.map(row=>({physicalIndex:row.physicalIndex,scenarioSlots:row.scenarioSlots,mapIndex:0,
  placements:[row],chapter:chapter(row.physicalIndex,`작전 ${row.physicalIndex}`)}));
 scenes.push({physicalIndex:3,scenarioSlots:[3],mapIndex:0,placements:[],conditions:[],chapter:chapter(3,'맵만 있는 작전')});
 scenes.push({physicalIndex:4,scenarioSlots:[4],mapIndex:0,placements:[],conditions:[]});
 hooks.installEditorRows({units:[],pilots:[],weapons:[],terrains:[],rewards:[],deployments:rows,
  objectives:[],maps:m0.maps,mapBanks:m0.banks,scenarios:scenes});$('scenarioTabButton').click();
 assert.deepEqual($('scenarioSelector').options.map(item=>item.value),['','1','31','2','3']);
 set('scenarioSelector',31);set('scenarioX',3);
 const model=hooks.state.editorScenario;
 assert.equal(model.deployments.find(row=>row.physicalIndex===31).x,3);
 assert.equal(model.deployments.find(row=>row.physicalIndex===1).x,2);
 assert.deepEqual(hooks.buildEditorExportRequest().deploymentEdits.map(row=>row.recordIndex),['31:64']);
 assert.equal($('scenarioSelector').value,'31');
 $('scenarioDeploymentReset').click();assert.equal(hooks.countEditorChanges(),0);assert.equal($('scenarioSelector').value,'31');
 set('scenarioSelector',3);$('scenarioTileTool').click();
 assert.equal($('scenarioSelector').value,'3');assert.equal($('scenarioTileFields').hidden,false);
 assert.equal($('scenarioSelector').options.find(item=>item.value==='3').textContent,'제3화 · 맵만 있는 작전');
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

test('task switching separates deployment, turn and purpose fields and blocks abandoning an invalid draft',()=>{
 const m0=setup(true,false,true),event={recordIndex:'0:150',physicalIndex:0,scenarioSlots:[0,1],turn:5,comparison:'eq',phase:'enemy-start',editable:true};
 hooks.installEditorRows({units:[],pilots:[],weapons:[],terrains:[],rewards:[{recordIndex:1,aliases:[1],editable:true}],deployments:[deployment],events:[event],objectives:m0.objectives,maps:m0.maps,mapBanks:m0.banks,scenarios:[{...m0.scenarios[0],conditions:[event]}]});$('scenarioTabButton').click();
 const m=hooks.state.editorScenario;
 assert.equal($('scenarioEditorPanel').dataset.mode,'placement');assert.equal($('scenarioEventFields').hidden,true);assert.equal($('scenarioObjectiveDescription').hidden,true);
 $('scenarioEventTool').click();assert.equal($('scenarioEditorPanel').dataset.mode,'events');assert.deepEqual($('scenarioEventSelector').options.map(o=>o.value),['event:0:150']);
 assert.equal($('scenarioX').parentNode.parentNode.parentNode.hidden,true);assert.equal($('scenarioEventFields').hidden,false);
 set('scenarioTurn',100);$('scenarioTileTool').click();assert.equal($('scenarioEditorPanel').dataset.mode,'events');assert.equal($('scenarioTurn').getAttribute('aria-invalid'),'true');assert.equal(m.events[0].turn,5);
 set('scenarioTurn',6);$('scenarioObjectiveTool').click();assert.equal($('scenarioEditorPanel').dataset.mode,'objective');assert.equal($('scenarioEventFields').hidden,true);assert.equal($('scenarioObjectiveDescription').hidden,false);
 assert.deepEqual($('scenarioEventSelector').options.map(o=>o.value),['objective:0:300']);assert.equal(m.events[0].turn,6);assert.deepEqual(m.exportDeployments(),[]);
 $('scenarioDeploymentTool').click();assert.equal($('scenarioEditorPanel').dataset.mode,'placement');assert.equal($('scenarioObjectiveDescription').hidden,true);
});

test('advanced shared-map selection enters tile editing without merging other scenarios placement targets',()=>{
 const m=setup();set('scenarioMapSelector',1);
 assert.equal($('scenarioSelector').value,'');assert.equal($('scenarioEditorPanel').dataset.mode,'tile');
 assert.equal($('scenarioEventSelector').hidden,true);assert.equal($('scenarioDeploymentFields').hidden,true);assert.equal($('scenarioDeploymentTool').disabled,true);
 assert.equal($('scenarioEventTool').disabled,true);assert.equal($('scenarioObjectiveTool').disabled,true);
 set('scenarioTileSelector',12);$('scenarioApplyTile').click();assert.equal(m.cell(0,0,0,0).tileId,12);assert.deepEqual(m.exportDeployments(),[]);
 set('scenarioSelector',0);$('scenarioDeploymentTool').click();assert.equal($('scenarioEditorPanel').dataset.mode,'placement');assert.equal($('scenarioDeploymentTool').disabled,false);
});

test('map settings belong to tile editing and other tasks restore the scene map and its first plane',()=>{
 const m0=setup(true),initial={...deployment,waveIndex:'0:100'},later={...deployment,recordIndex:'0:200',mapIndex:2,waveIndex:'0:197',x:3,y:2};
 const event={recordIndex:'0:150',physicalIndex:0,scenarioSlots:[0,1],turn:5,comparison:'eq',phase:'enemy-start',editable:true};
 const otherMap={...m0.maps[0],mapIndex:2,mapSlots:[2]};
 hooks.installEditorRows({units:[],pilots:[],weapons:[],terrains:[],rewards:[],deployments:[initial,later],events:[event],objectives:m0.objectives,maps:[...m0.maps,otherMap],mapBanks:m0.banks,scenarios:[{physicalIndex:0,scenarioSlots:[0,1],mapIndex:0,placements:[initial,later],conditions:[event],waves:[
  {recordIndex:'0:100',initial:true,mapIndex:0,guards:[],placements:[initial]},
  {recordIndex:'0:197',initial:false,mapIndex:2,guards:[],placements:[later]},
 ]}]});$('scenarioTabButton').click();
 const settings=$('scenarioMapSelector').closest('details'),m=hooks.state.editorScenario;
 assert.equal(settings.querySelector('summary').textContent,'지도 설정');
 assert.equal(settings.hidden,true);
 for(const [button,mode] of [['scenarioDeploymentTool','placement'],['scenarioEventTool','events'],['scenarioObjectiveTool','objective']]){
  // Enter a later wave's other map, then its second tile plane. Returning
  // to any scenario task must not leave the actor overlay on tile data 2.
  $('scenarioDeploymentTool').click();set('scenarioEventSelector','0:197');
  assert.equal($('scenarioMapSelector').value,'2');
  $('scenarioTileTool').click();assert.equal(settings.hidden,false);
  set('scenarioPlaneSelector',1);assert.equal($('scenarioPlaneSelector').value,'1');
  $(button).click();
  assert.equal($('scenarioEditorPanel').dataset.mode,mode);
  assert.equal($('scenarioPlaneSelector').value,'0',mode);
  assert.equal($('scenarioMapSelector').value,'0',mode);
  assert.equal(settings.hidden,true,mode);
  assert.equal($('scenarioSelector').value,'0');
 }
 assert.deepEqual(m.exportDeployments(),[]);assert.deepEqual(m.exportMap(),[]);assert.deepEqual(m.exportEvents(),[]);
});

test('returning to the placement overview restores the starting map after a wave on another map',()=>{
 const m0=setup(),initial={...deployment,waveIndex:'0:100'},later={...deployment,recordIndex:'0:200',mapIndex:2,waveIndex:'0:197',name:'후속 기체',x:4,y:2};
 const otherMap={...m0.maps[0],mapIndex:2,mapSlots:[2]};
 hooks.installEditorRows({units:[],pilots:[],weapons:[],terrains:[],rewards:[{recordIndex:1,aliases:[1],editable:true}],deployments:[initial,later],maps:[...m0.maps,otherMap],mapBanks:m0.banks,scenarios:[{physicalIndex:0,scenarioSlots:[0,1],mapIndex:0,placements:[initial,later],waves:[
  {recordIndex:'0:100',initial:true,mapIndex:0,guards:[],placements:[initial]},
  {recordIndex:'0:197',initial:false,mapIndex:2,guards:[],placements:[later]},
 ]}]});$('scenarioTabButton').click();set('scenarioEventSelector','0:197');
 assert.equal($('scenarioMapSelector').value,'2');assert.equal($('scenarioDeploymentSelector').value,'0:200');
 $('scenarioTileTool').click();$('scenarioDeploymentTool').click();
 assert.equal($('scenarioEventSelector').value,'all');assert.equal($('scenarioMapSelector').value,'0');
 assert.equal($('scenarioDeploymentSelector').value,'0:64');assert.match($('scenarioDeploymentSelector').options[0].textContent,/테스트 기체/);
 assert.equal($('scenarioDeploymentSelector').options.length,2);
 set('scenarioDeploymentSelector','0:200');assert.equal($('scenarioMapSelector').value,'2');assert.equal($('scenarioX').value,'4');
 assert.equal($('scenarioEventSelector').value,'all');
 assert.deepEqual(hooks.state.editorScenario.exportDeployments(),[]);
});

test('placement overview keeps physical scenes isolated, follows map aliases, and allows readonly entries to be inspected',()=>{
 const m0=setup(),initial={...deployment,mapIndex:1,waveIndex:'0:100'},later={...deployment,recordIndex:'0:200',mapIndex:2,waveIndex:'0:197',name:'읽기 전용 기체',editable:false,readOnlyReason:'위치 편집 미지원',x:4,y:2},foreign={...deployment,physicalIndex:1,recordIndex:'1:64',waveIndex:'1:100'};
 const otherMap={...m0.maps[0],mapIndex:2,mapSlots:[2]};
 hooks.installEditorRows({units:[],pilots:[],weapons:[],terrains:[],rewards:[],deployments:[initial,later,foreign],maps:[...m0.maps,otherMap],mapBanks:m0.banks,scenarios:[
  {physicalIndex:0,scenarioSlots:[0,1],mapIndex:0,placements:[initial,later],waves:[{recordIndex:'0:100',initial:true,mapIndex:1,guards:[],placements:[initial]},{recordIndex:'0:197',initial:false,mapIndex:2,guards:[],placements:[later]}]},
  {physicalIndex:1,scenarioSlots:[2],mapIndex:0,placements:[foreign],waves:[]},
 ]});$('scenarioTabButton').click();
 assert.equal($('scenarioEventSelector').value,'all');
 assert.deepEqual($('scenarioDeploymentSelector').options.map(item=>item.value),['0:64','0:200']);
 assert.equal($('scenarioMapLegend').hidden,false);assert.equal($('scenarioMapLegend').textContent,'● 배치 1/2기');
 set('scenarioDeploymentSelector','0:200');assert.equal($('scenarioMapSelector').value,'2');assert.equal($('scenarioX').disabled,true);
 assert.equal($('scenarioDeploymentSelector').disabled,false);assert.match($('scenarioStatus').textContent,/위치 편집 미지원/);
 set('scenarioDeploymentSelector','0:64');assert.equal($('scenarioMapSelector').value,'0');assert.equal($('scenarioX').disabled,false);
 set('scenarioEventSelector','0:197');assert.deepEqual($('scenarioDeploymentSelector').options.map(item=>item.value),['0:200']);assert.equal($('scenarioDeploymentSelector').disabled,false);
 assert.deepEqual(hooks.state.editorScenario.exportDeployments(),[]);
});

test('a turn event exposes its linked placement and validates drafts before navigating to the wave',()=>{
 const m0=setup(),initial={...deployment,waveIndex:'0:100'},later={...deployment,recordIndex:'0:200',waveIndex:'0:197',name:'증원 기체',x:4,y:2};
 const event={recordIndex:'0:150',physicalIndex:0,scenarioSlots:[0,1],turn:5,comparison:'eq',phase:'enemy-start',editable:true};
 hooks.installEditorRows({units:[],pilots:[],weapons:[],terrains:[],rewards:[],deployments:[initial,later],events:[event],maps:m0.maps,mapBanks:m0.banks,scenarios:[{physicalIndex:0,scenarioSlots:[0,1],mapIndex:0,placements:[initial,later],conditions:[event],waves:[
  {recordIndex:'0:100',initial:true,mapIndex:0,guards:[],placements:[initial]},
  {recordIndex:'0:197',initial:false,mapIndex:0,phase:'enemy-start',guards:[{recordIndex:event.recordIndex,taken:true}],placements:[later]},
 ]}]});$('scenarioTabButton').click();
 assert.match($('scenarioEventSelector').options.find(item=>item.value==='0:197').textContent,/증원 1.*5턴.*1기/);
 set('scenarioEventSelector','event:0:150');assert.equal($('scenarioRelatedDeploymentButton').hidden,false);assert.equal($('scenarioRelatedDeploymentButton').textContent,'배치 1기');
 assert.equal($('scenarioMapLegend').hidden,false);assert.equal($('scenarioMapLegend').textContent,'● 연계 배치 1기');assert.match($('scenarioMapLegend').title,/초기 진영/);
 set('scenarioTurn',100);$('scenarioRelatedDeploymentButton').click();assert.equal($('scenarioEditorPanel').dataset.mode,'events');assert.equal($('scenarioTurn').getAttribute('aria-invalid'),'true');
 set('scenarioTurn',6);$('scenarioRelatedDeploymentButton').click();assert.equal($('scenarioEditorPanel').dataset.mode,'placement');assert.equal($('scenarioEventSelector').value,'0:197');assert.equal($('scenarioDeploymentSelector').value,'0:200');
 assert.equal($('scenarioX').value,'4');assert.equal($('scenarioY').value,'2');assert.equal($('scenarioRelatedDeploymentButton').hidden,true);
 assert.match($('scenarioCellInfo').textContent,/\(4, 2\)/);assert.deepEqual(hooks.state.editorScenario.exportDeployments(),[]);
 const input=$('scenarioX');input.focus();set('scenarioX',3);assert.equal(document.activeElement,input);assert.equal(hooks.state.editorScenario.deployments[1].x,3);
 $('scenarioDeploymentReset').click();assert.equal(hooks.state.editorScenario.deployments[1].x,4);assert.equal(document.activeElement,input);
});

test('unread placement commands are described as unsupported rather than an empty battle',()=>{
 const m0=setup(),chapter={source:'user-bin-scenario-chapter',gameId:'srwf-f',name:'읽기 미지원 작전',scenarioSlot:3,episodes:[3],routeCode:'real',part:1,totalParts:1,order:3};
 hooks.installEditorRows({units:[],pilots:[],weapons:[],terrains:[],rewards:[],deployments:[],maps:m0.maps,mapBanks:m0.banks,scenarios:[{physicalIndex:3,scenarioSlots:[3],mapIndex:0,chapter,placements:[],conditions:[],waves:[],frontiers:[{root:4,reason:'unknown-command'}]}]});$('scenarioTabButton').click();set('scenarioSelector',3);
 assert.equal($('scenarioDeploymentTool').disabled,true);assert.match($('scenarioDeploymentTool').title,/읽기 미지원/);
 assert.match($('scenarioDeploymentSelector').options[0].textContent,/읽기 미지원/);assert.doesNotMatch($('scenarioDeploymentSelector').options[0].textContent,/기체 없음/);
 assert.match($('scenarioStatus').textContent,/배치 읽기 미지원/);assert.match($('scenarioSelectionDescription').textContent,/기체가 없다는 뜻이 아닙니다/);
 assert.equal($('scenarioTileTool').disabled,false);assert.equal($('scenarioRelatedDeploymentButton').hidden,true);
});

test('map clicks cannot select a different map occupant at the same coordinates in the overview',()=>{
 const m0=setup(),initial={...deployment,waveIndex:'0:100'},other={...deployment,recordIndex:'0:200',mapIndex:2,waveIndex:'0:197',name:'다른 맵 기체'};
 const otherMap={...m0.maps[0],mapIndex:2,mapSlots:[2]};
 hooks.installEditorRows({units:[],pilots:[],weapons:[],terrains:[],rewards:[],deployments:[initial,other],maps:[...m0.maps,otherMap],mapBanks:m0.banks,scenarios:[{physicalIndex:0,scenarioSlots:[0,1],mapIndex:0,placements:[initial,other],waves:[{recordIndex:'0:100',initial:true,mapIndex:0,guards:[],placements:[initial]},{recordIndex:'0:197',initial:false,mapIndex:2,guards:[],placements:[other]}]}]});$('scenarioTabButton').click();
 const canvas=$('scenarioMapCanvas'),saved=canvas.getBoundingClientRect;canvas.getBoundingClientRect=()=>({left:0,top:0,width:600,height:400});
 try{canvas.dispatchEvent({type:'click',clientX:250,clientY:150});}finally{canvas.getBoundingClientRect=saved;}
 assert.equal($('scenarioDeploymentSelector').value,'0:64');assert.equal($('scenarioMapSelector').value,'0');
 set('scenarioX',3);assert.equal(hooks.state.editorScenario.deployments[0].x,3);assert.equal(hooks.state.editorScenario.deployments[1].x,2);
});

test('read-only sortie references retain runtime names, unknown positions and uncertain script stages',()=>{
 const m0=setup(),first={...deployment,waveIndex:'0:100'},reference={...deployment,recordIndex:'0:220',waveIndex:'0:210',placementKind:'roster-reference',placementStage:'scenario-script',name:undefined,unitName:'편성 기체',unitId:null,pilotId:null,pilotName:'게임 실행 시 결정',rosterReference:0xc001,x:undefined,y:undefined,rewardSelector:null,editable:false,readOnlyReason:'편성 참조는 게임 실행 시 결정되며 편집하지 않습니다.'};
 hooks.installEditorRows({units:[],pilots:[],weapons:[],terrains:[],rewards:[],deployments:[first,reference],maps:m0.maps,mapBanks:m0.banks,scenarios:[{physicalIndex:0,scenarioSlots:[0,1],mapIndex:0,placements:[first,reference],waves:[{recordIndex:'0:100',initial:true,mapIndex:0,guards:[],placements:[first]},{recordIndex:'0:210',initial:false,placementStage:'scenario-script',mapIndex:0,guards:[],placements:[reference]}]}]});$('scenarioTabButton').click();
 const choice=$('scenarioEventSelector').options.find(item=>item.value==='0:210');assert.match(choice.textContent,/시나리오 배치 1/);assert.doesNotMatch(choice.textContent,/증원/);assert.match(choice.title,/초기·증원 구분은 아직 확인하지 못했습니다/);
 set('scenarioDeploymentSelector','0:220');assert.match($('scenarioDeploymentSelector').selectedOptions[0].textContent,/편성 기체 · 위치 미확인/);assert.match($('scenarioDeploymentSelector').selectedOptions[0].title,/편성 참조 0xC001/);
 assert.equal($('scenarioX').value,'');assert.equal($('scenarioY').value,'');assert.equal($('scenarioX').disabled,true);assert.equal($('scenarioPilotName').textContent,'게임 실행 시 결정');assert.equal($('scenarioReward').value,'unknown');
 assert.equal($('scenarioDeploymentSelector').disabled,false);assert.deepEqual(hooks.state.editorScenario.exportDeployments(),[]);
 assert.equal($('scenarioX').closest('.scenario-edit-group').hidden,true);assert.equal($('scenarioReward').closest('.scenario-edit-group').hidden,true);assert.equal($('scenarioMove').hidden,true);assert.equal($('scenarioDeploymentReset').hidden,true);
 assert.equal($('scenarioMapLegend').textContent,'● 배치 1/2기');
});

test('runtime sortie targets draw unknown markers only with a proved map and retain unmapped target coordinates',()=>{
 const m0=setup(),enemy={...deployment,waveIndex:'0:100',faction:'enemy',factionSource:'ca02-group-selector'};
 const target={...deployment,recordIndex:'0:220',waveIndex:'0:210',placementKind:'roster-reference',placementStage:'scenario-script',name:'편성 기체',unitId:null,pilotId:null,pilotName:'게임 실행 시 결정',rosterReference:0x1234,x:1,y:2,rewardSelector:null,editable:false,faction:'unknown',factionSource:null,readOnlyReason:'게임에서 편성한 기체의 출격 목표 위치입니다.'};
 const unmapped={...target,recordIndex:'0:230',waveIndex:'0:225',placementKind:'sortie-position',name:'출격 선택 기체',mapIndex:null,width:null,height:null,x:3,y:2};
 const rows=[enemy,target,unmapped],canvas=$('scenarioMapCanvas'),viewport=$('scenarioMapViewport');
 const savedContext=canvas.getContext,savedWidth=viewport.clientWidth,savedHeight=viewport.clientHeight,points=[];
 const context={fillRect(){},strokeRect(){},clearRect(){},scale(){points.length=0;},beginPath(){},stroke(){},fillText(){},arc(x,y,r){this.point={x,y,r};},fill(){points.push({...this.point,color:this.fillStyle});}};
 canvas.getContext=()=>context;viewport.clientWidth=600;viewport.clientHeight=400;
 try{
  hooks.installEditorRows({units:[],pilots:[],weapons:[],terrains:[],rewards:[],deployments:rows,maps:m0.maps,mapBanks:m0.banks,scenarios:[{physicalIndex:0,scenarioSlots:[0,1],mapIndex:0,placements:rows,waves:[{recordIndex:'0:100',initial:true,mapIndex:0,guards:[],placements:[enemy]},{recordIndex:'0:210',initial:false,placementStage:'scenario-script',mapIndex:0,guards:[],placements:[target]},{recordIndex:'0:225',initial:false,placementStage:'scenario-script',mapIndex:null,guards:[],placements:[unmapped]}]}]});$('scenarioTabButton').click();
  assert.equal($('scenarioDeploymentSelector').options.length,3);
  assert.equal(points.length,2,'one verified enemy and one mapped runtime target, never the unmapped target');
  assert.deepEqual(points.map(point=>point.color),['#ff8e8e','#e6f9ff']);
  assert.deepEqual(points.map(({x,y})=>[x,y]),[[250,150],[150,250]]);
  assert.match($('scenarioMapLegend').textContent,/배치 2\/3기/);
  set('scenarioFactionSelector','player');assert.equal(points.length,0,'runtime roster targets do not acquire an unproved player faction');
  set('scenarioFactionSelector','unknown');assert.equal(points.length,1);assert.equal(points[0].color,'#e6f9ff');
  assert.deepEqual($('scenarioDeploymentSelector').options.map(option=>option.value),[target.recordIndex,unmapped.recordIndex]);
  set('scenarioFactionSelector','sortie');assert.deepEqual($('scenarioDeploymentSelector').options.map(option=>option.value),[target.recordIndex,unmapped.recordIndex]);
  assert.equal(points.length,1);assert.equal(points[0].color,'#e6f9ff');
  assert.match($('scenarioDeploymentSelector').options[0].title,/초기 진영 미확인/);
  set('scenarioDeploymentSelector',target.recordIndex);const beforeUnmappedCell=$('scenarioCellInfo').textContent;
  set('scenarioDeploymentSelector',unmapped.recordIndex);
  assert.match($('scenarioDeploymentSelector').selectedOptions[0].textContent,/출격 선택 기체.*\(3, 2\)/);
  assert.match($('scenarioDeploymentSelector').selectedOptions[0].title,/맵 연결 미확인/);
  assert.equal($('scenarioStatus').textContent,'맵 연결 미확인 · 지도 표시 불가');
  assert.equal($('scenarioX').value,'3');assert.equal($('scenarioY').value,'2');
  assert.equal($('scenarioX').disabled,true);assert.equal($('scenarioY').disabled,true);
  assert.equal(points.length,1,'selecting an unmapped coordinate must not invent a point on the active map');
  assert.equal($('scenarioCellInfo').textContent,beforeUnmappedCell,'the canvas selected tile is not moved to an unassociated target');
  assert.equal(hooks.state.editorScenario.deployments.find(row=>row.recordIndex===unmapped.recordIndex).mapIndex,null);
  set('scenarioEventSelector',unmapped.waveIndex);assert.equal(points.length,0);
  assert.equal($('scenarioMapLegend').hidden,false);assert.match($('scenarioMapLegend').textContent,/0\/1기/);
  assert.deepEqual($('scenarioDeploymentSelector').options.map(option=>option.value),[unmapped.recordIndex]);
  set('scenarioEventSelector',enemy.waveIndex);
  assert.equal($('scenarioFactionSelector').value,'sortie');
  assert.equal($('scenarioDeploymentSelector').options.length,1);
  assert.equal($('scenarioDeploymentSelector').options[0].textContent,'출격 위치 · 읽은 배치 0기');
  assert.equal(points.length,0);assert.equal($('scenarioMapLegend').hidden,true);
  assert.deepEqual(hooks.state.editorScenario.exportDeployments(),[]);assert.equal(hooks.countEditorChanges(),0);
 }finally{canvas.getContext=savedContext;viewport.clientWidth=savedWidth;viewport.clientHeight=savedHeight;}
});

test('initial faction filters use verified constructor metadata and preserve uncertain roster entries',()=>{
 const m0=setup(),rows=['player','enemy','other','unknown','player'].map((faction,i)=>({...deployment,recordIndex:`0:${64+i*12}`,x:i,y:1,faction,waveIndex:'0:100',factionSource:i<3?'ca02-group-selector':null,placementKind:i===3?'roster-reference':'fixed-unit',editable:i!==3}));
 const wave={recordIndex:'0:100',initial:true,mapIndex:0,guards:[],placements:rows};
 hooks.installEditorRows({units:[],pilots:[],weapons:[],terrains:[],rewards:[],deployments:rows,maps:m0.maps,mapBanks:m0.banks,scenarios:[{physicalIndex:0,scenarioSlots:[0,1],mapIndex:0,placements:rows,waves:[wave]}]});$('scenarioTabButton').click();
 assert.equal($('scenarioFactionSelector').hidden,false);assert.equal($('scenarioFactionSelector').value,'all');assert.equal($('scenarioDeploymentSelector').options.length,5);
 for(const [faction,indices]of [['player',[0]],['enemy',[1]],['other',[2]],['unknown',[3,4]]]){
  set('scenarioFactionSelector',faction);assert.deepEqual($('scenarioDeploymentSelector').options.map(item=>item.value),indices.map(i=>rows[i].recordIndex));
  assert.match($('scenarioEventSelector').selectedOptions[0].textContent,new RegExp(`${indices.length}기`));
 }
 assert.match($('scenarioDeploymentSelector').options[1].title,/초기 진영 미확인/);
 set('scenarioFactionSelector','enemy');set('scenarioX',9);set('scenarioFactionSelector','other');assert.equal($('scenarioFactionSelector').value,'enemy');assert.equal($('scenarioX').getAttribute('aria-invalid'),'true');
 set('scenarioX',1);set('scenarioFactionSelector','other');assert.equal($('scenarioFactionSelector').value,'other');assert.deepEqual(hooks.state.editorScenario.exportDeployments(),[]);
 hooks.state.editorBusy=true;set('scenarioFactionSelector','player');assert.equal($('scenarioFactionSelector').value,'other');hooks.state.editorBusy=false;
 set('scenarioSelector',0);assert.equal($('scenarioFactionSelector').value,'all');assert.equal($('scenarioDeploymentSelector').options.length,5);
 $('scenarioTileTool').click();assert.equal($('scenarioFactionSelector').hidden,true);
});

test('stacked placement clicks cycle every entry and cannot discard an invalid coordinate draft',()=>{
 const m0=setup(),rows=[64,76,88].map(offset=>({...deployment,recordIndex:`0:${offset}`}));
 hooks.installEditorRows({units:[],pilots:[],weapons:[],terrains:[],rewards:[],deployments:rows,maps:m0.maps,mapBanks:m0.banks,scenarios:[{physicalIndex:0,scenarioSlots:[0,1],mapIndex:0,placements:rows,waves:[]}]});$('scenarioTabButton').click();
 const canvas=$('scenarioMapCanvas'),saved=canvas.getBoundingClientRect;canvas.getBoundingClientRect=()=>({left:0,top:0,width:600,height:400});
 const click=()=>canvas.dispatchEvent({type:'click',clientX:250,clientY:150});
 try{
  set('scenarioX',9);click();assert.equal($('scenarioDeploymentSelector').value,'0:64');assert.equal($('scenarioX').value,'9');assert.equal($('scenarioX').getAttribute('aria-invalid'),'true');
  set('scenarioX',2);for(const id of ['0:76','0:88','0:64']){click();assert.equal($('scenarioDeploymentSelector').value,id);}
 }finally{canvas.getBoundingClientRect=saved;}
 assert.deepEqual(hooks.state.editorScenario.exportDeployments(),[]);
});

test('a readonly appearance can open its independently verified shared reward table without enabling placement writes',()=>{
 const m0=setup(),current={...deployment,editable:false,readOnlyReason:'맵 연결 미확인'};
 hooks.installEditorRows({units:[],pilots:[],weapons:[],terrains:[],rewards:[...hooks.state.editorRewards],deployments:[current],maps:m0.maps,mapBanks:m0.banks,scenarios:[{physicalIndex:0,scenarioSlots:[0,1],mapIndex:0,placements:[current],waves:[]}]});$('scenarioTabButton').click();set('scenarioSelector',0);$('scenarioDeploymentTool').click();
 assert.equal($('scenarioReward').disabled,true);assert.equal($('scenarioRewardDetail').disabled,false);assert.equal($('scenarioX').disabled,true);
 $('scenarioRewardDetail').click();assert.equal(hooks.state.editorTab,'reward');assert.deepEqual(hooks.state.editorScenario.exportDeployments(),[]);
});

test('display-reader frontiers keep partial coverage explicit independently of the writable reader',()=>{
 const m0=setup();
 for(const reason of ['display-unknown-command','display-budget','unknown-leaf']){
  hooks.installEditorRows({units:[],pilots:[],weapons:[],terrains:[],rewards:[],deployments:[deployment],maps:m0.maps,mapBanks:m0.banks,scenarios:[{physicalIndex:0,scenarioSlots:[0,1],mapIndex:0,placements:[deployment],waves:[],frontiers:[],coverage:{frontiers:[{root:4,reason}]}}]});$('scenarioTabButton').click();
  assert.match($('scenarioStatus').textContent,/일부 배치 읽기 미지원/);assert.match($('scenarioSelectionDescription').textContent,/읽은 배치 1기만 표시/);assert.match($('scenarioSelectionDescription').textContent,/일부 명령은 아직 읽지 못해/);
 }
});

test('literal fixed-unit default coordinates stay visible without granting a runtime binding or writer permission',()=>{
 const m0=setup(),initial={...deployment,waveIndex:'0:100'},fixed={...deployment,recordIndex:'0:240',waveIndex:'0:237',placementKind:'fixed-unit',placementStage:'scenario-script',mapIndex:null,x:1,y:2,editable:false,readOnlyReason:'원본 좌표 · 읽기 전용'};
 const rows=[initial,fixed];hooks.installEditorRows({units:[],pilots:[],weapons:[],terrains:[],rewards:[],deployments:rows,maps:m0.maps,mapBanks:m0.banks,scenarios:[{physicalIndex:0,scenarioSlots:[0],mapIndex:0,placements:rows,waves:[{recordIndex:'0:100',initial:true,mapIndex:0,guards:[],placements:[initial]},{recordIndex:'0:237',root:4,initial:false,placementStage:'scenario-script',mapIndex:null,guards:[],placements:[fixed]}]}]});$('scenarioTabButton').click();
 assert.match($('scenarioMapLegend').textContent,/배치 2기/);set('scenarioDeploymentSelector',fixed.recordIndex);
 assert.match($('scenarioDeploymentSelector').selectedOptions[0].title,/기본 맵 기준 좌표/);
 assert.equal(hooks.state.editorScenario.deployments.find(r=>r.recordIndex===fixed.recordIndex).mapIndex,null);
 assert.deepEqual(hooks.state.editorScenario.exportDeployments(),[]);
 assert.equal($('scenarioX').disabled,true);
});
