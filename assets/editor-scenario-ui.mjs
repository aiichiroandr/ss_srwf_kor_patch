import { packMeasuredGroups } from './editor-layout.mjs?v=20261011-public12';
import { createScenarioTilePicker } from './editor-scenario-tile-picker.mjs?v=20261011-public12';
import { paintTilePreview } from './editor-map-graphics.mjs?v=20261011-public12';
import { eventConditionLabel } from './editor-scenario-events.mjs?v=20261011-public12';
import { rewardOutcomeLabel } from './editor-rewards.mjs?v=20261011-public12';
import { scenarioSelectionLabel, scenarioSelectionDescription, scenarioSharedCaption, sortScenarioSelections } from './editor-scenario-labels.mjs?v=20261011-public12';
import { CRITERIA_FIELDS, encodeObjectiveRule, decodeObjectiveRule, snapshotScenarioCriteria, criteriaPurpose } from './editor-scenario-criteria.mjs?v=20261011-public12';
import { objectiveUnitIdLimit } from './editor-fields.mjs?v=20261011-public12';
import { EVENT_CRITERIA_FIELDS, snapshotEventCriteria, eventCriteriaTurnSummary } from './editor-scenario-event-criteria.mjs?v=20261011-public12';
import { EVENT_PHASE_FIELDS, snapshotPhaseEvent } from './editor-scenario-event-phase.mjs?v=20261011-public12';
import { createRegionRuleControls, paintRegionOutline } from './editor-scenario-region-ui.mjs?v=20261011-public12';
const eventRuleControls=[1,2,3].map(n=>({field:`eventRule${n}`,prefix:`scenarioEventRule${n}`}));
const eventCriteriaIds=['scenarioEventPhaseGroup','scenarioEventPhase','scenarioEventPhaseHint','scenarioEventCriteriaChoice','scenarioEventJoin','scenarioEventAdd','scenarioEventCriteriaReset',...eventRuleControls.flatMap(({prefix})=>['Group','Comparison','Value','Remove'].map(suffix=>prefix+suffix))];
const ruleControls = ['Victory','Defeat'].flatMap(outcome => [1,2,3].map(n => ({field:`${outcome.toLowerCase()}Rule${n}`,prefix:`scenario${outcome}Rule${n}`})));
const criteriaIds = ['scenarioCriteriaChoice','scenarioCriteriaReset','scenarioObjectivePriority','scenarioVictoryChoice','scenarioDefeatChoice','scenarioVictoryJoin','scenarioDefeatJoin','scenarioVictoryAdd','scenarioDefeatAdd',...ruleControls.flatMap(({prefix})=>['Group','Query','Comparison','Value','Remove','UnitGroup','Unit','UnitInfo'].map(suffix=>prefix+suffix))];
const $ = id => document.getElementById(id);
const option = (value, text) => { const el = document.createElement('option'); el.value = String(value); el.textContent = text; return el; };
const modified = (row, fields) => row && fields.some(field => row[field] !== row.original[field]);
const aliasText = ids => ids.length > 2 ? `${ids[0]} 외 ${ids.length - 1}개` : ids.join('·');
const containsElement=(container,target)=>{for(let node=target;node;node=node.parentNode)if(node===container)return true;return false;};

export function createScenarioEditor(host) {
  const ui = Object.fromEntries(['scenarioEditorPanel', 'scenarioSelector', 'scenarioMapSelector', 'scenarioPlaneSelector',
    'scenarioMapViewport', 'scenarioMapCanvas', 'scenarioMapSummary', 'scenarioSelectionDescription', 'scenarioCellInfo', 'scenarioZoom',
    'scenarioDeploymentTool', 'scenarioEventTool', 'scenarioObjectiveTool', 'scenarioTileTool', 'scenarioTaskHint', 'scenarioMapLegend', 'scenarioTilePickerOpen', 'scenarioCurrentTilePreview', 'scenarioCurrentTileName', 'scenarioTileName', 'scenarioDeploymentFields', 'scenarioTileFields',
    'scenarioDeploymentSelector', 'scenarioX', 'scenarioY', 'scenarioMove', 'scenarioReward', 'scenarioRewardDetail', 'scenarioPilotName',
    'scenarioDeploymentReset', 'scenarioTileSelector', 'scenarioTilePickerOpen', 'scenarioApplyTile', 'scenarioBrush', 'scenarioTerrainLink',
    'scenarioTileReset', 'scenarioTilePreview', 'scenarioStatus', 'scenarioViewPager', 'scenarioMapPage', 'scenarioFieldsPage',
    'scenarioFieldsPager', 'scenarioFieldsPrev', 'scenarioFieldsNext', 'scenarioFieldsPosition',
    'scenarioSpawnChoice','scenarioSpawnPosition','scenarioSpawnRewardGroup','scenarioSpawnTemplate','scenarioSpawnPilot','scenarioSpawnToggle','scenarioSpawnReset','scenarioSpawnTurn','scenarioSpawnX','scenarioSpawnY','scenarioSpawnMove','scenarioSpawnReward',
    'scenarioObjectiveFields','scenarioObjectiveDescription','scenarioDeadline','scenarioDeadlineRule','scenarioObjectiveReset','scenarioVictoryText','scenarioDefeatText',
    ...criteriaIds,...eventCriteriaIds,'scenarioObjectiveNote','scenarioEventSelector','scenarioFactionSelector','scenarioRelatedDeploymentButton','scenarioEventFields','scenarioEventChoice','scenarioConditionSelector','scenarioTurn','scenarioConditionRule','scenarioEventReset'].map(id => [id, $(id)]));
  let mapIndex = null, planeIndex = 0, selected = null, scenarioIndex = null, tool = 'deployment', mode = 'placement';
  let x = 0, y = 0, brush = false, paintedTile = 0, zoom = 1, page = 'map';
  let fieldsPage = 0, fieldsPaged = false;
  let fieldsPages = [];
  let explanationContent, explanationPager, explanationPrevious, explanationNext, explanationPosition;
  let explanationPages = [], explanationPage = 0, explanationSource;
  let eventIndex=null,conditionIndex=null,faction='all';
  const factionNames={player:'아군',enemy:'적군',other:'기타 진영',unknown:'미확인'};
  const filterNames={...factionNames,sortie:'출격 위치'};
  const factionColors={player:'#66c7ff',enemy:'#ff8e8e',other:'#c6baff',unknown:'#e6f9ff'};
  const initialFaction=item=>item.factionSource==='ca02-group-selector'&&Object.hasOwn(factionNames,item.faction)?item.faction:'unknown';
  const inFaction=item=>faction==='all'||(faction==='sortie'?['roster-reference','sortie-position'].includes(item.placementKind):initialFaction(item)===faction);
  const texture = document.createElement('canvas');
  const model = () => host.model(), map = () => model().mapFor(mapIndex), plane = () => map()?.planes[planeIndex];
  const scene=()=>model().scenarios.find(item=>item.physicalIndex===scenarioIndex);
  const onMap=item=>map()?.mapSlots.includes(item.mapIndex);
  const scenePlacements=()=>scenarioIndex===null?[]:model().deployments.filter(item=>item.physicalIndex===scenarioIndex);
  const relatedWaves=()=>mode==='events'&&eventIndex?.startsWith('event:')
    ?(scene()?.waves??[]).filter(item=>item.guards?.some(guard=>guard.recordIndex===eventIndex.slice(6))):[];
  const placements=()=>scenePlacements().filter(item=>inFaction(item)&&(eventIndex===null||eventIndex==='all'
    ||eventIndex==='later'&&(scene()?.waves??[]).some(w=>!w.initial&&w.placementStage!=='scenario-script'&&w.recordIndex===item.waveIndex)
    ||item.waveIndex===eventIndex));
  const relatedPlacements=()=>scenePlacements().filter(item=>inFaction(item)&&relatedWaves().some(w=>w.recordIndex===item.waveIndex));
  const positioned=item=>Number.isInteger(item.x)&&Number.isInteger(item.y);
  const shownPlacements=()=>((mode==='placement'?placements():relatedPlacements())).filter(item=>onMap(item)&&positioned(item)&&item.x>=0&&item.y>=0&&item.x<plane()?.width&&item.y<plane()?.height);
  const unreadPlacements=()=>Boolean(scene()&&!scenePlacements().length);
  const incompletePlacements=()=>Array.isArray(scene()?.coverage?.frontiers)?scene().coverage.frontiers.length>0
    :Boolean(scene()?.frontiers?.some(item=>/unknown-command|state-limit|budget|boundary-conflict/u.test(item.reason)));
  const placementName=item=>item.name||item.unitName||(item.placementKind==='sortie-position'?'출격 선택 기체':'편성 기체');
  const placementLabel=(item,index)=>`${index+1}. ${placementName(item)} · ${positioned(item)?`(${item.x}, ${item.y})`:'위치 미확인'}`;
  const placementDescription=item=>`${placementName(item)} · ${item.pilotName||'파일럿 미확인'} · ${positioned(item)?`(${item.x}, ${item.y})`:'위치 미확인'} · 초기 진영 ${factionNames[initialFaction(item)]}${Number.isInteger(item.rosterReference)?` · 편성 참조 0x${item.rosterReference.toString(16).toUpperCase()}`:''}${onMap(item)?'':model().mapFor(item.mapIndex)?' · 다른 맵':' · 맵 연결 미확인'}${item.readOnlyReason?' · '+item.readOnlyReason:''}`;
  const condition=()=>model().events.find(item=>item.recordIndex===conditionIndex);
  const reinforcement=()=>model().reinforcements.find(item=>item.physicalIndex===scenarioIndex);
  const spawnMode=()=>Boolean(eventIndex?.startsWith('reinforcement:'));
  const spawnGroups=()=>[ui.scenarioSpawnChoice,ui.scenarioSpawnPosition,ui.scenarioSpawnRewardGroup];
  const spawnFields=['enabled','templateOffset','turn','x','y','rewardSelector'];
  const objective=()=>model().objectives.find(item=>item.physicalIndex===scenarioIndex);
  const criteriaGroups=()=>[ui.scenarioCriteriaChoice,ui.scenarioVictoryChoice,ui.scenarioDefeatChoice,...ruleControls.map(({prefix})=>ui[prefix+'Group'])];
  let lastCriteriaControl=null;
  const pendingCriteria=new Set();
  const pendingEventCriteria=new Set();
  const eventCriteriaActive=()=>mode==='events'&&Boolean(condition()?.eventCriteriaEditable);
  const eventCriteriaGroups=()=>[ui.scenarioEventPhaseGroup,ui.scenarioEventCriteriaChoice,...eventRuleControls.map(({prefix})=>ui[prefix+'Group'])];
  const eventCriteriaFields=row=>Object.fromEntries(EVENT_CRITERIA_FIELDS.map(field=>[field,row[field]]));
  const eventFields=row=>row?.eventPhaseEditable?EVENT_PHASE_FIELDS:EVENT_CRITERIA_FIELDS;
  const eventPhaseName=row=>row?.eventPhaseEditable?(row.eventPhase===1?'아군':'적군'):row?.phase==='enemy-start'?'적군':row?.phase==='player-start'?'아군':'';
  const showDeadline=()=>!objective()?.criteriaEditable||Boolean(objective().deadline||objective().original.deadline);
  const criteriaActive=()=>mode==='objective'&&objective()?.criteriaEditable&&eventIndex?.startsWith('objective:');
  const criteriaFields=row=>Object.fromEntries(CRITERIA_FIELDS.map(field=>[field,row[field]]));
  const objectiveContext=()=>model().objectiveContextFor?.(objective()?.physicalIndex)??model().objectiveContext;
  const criterionUnits=()=>model().units.filter(row=>Number.isInteger(row.recordIndex)&&row.recordIndex>=1&&row.recordIndex<=objectiveUnitIdLimit(objectiveContext()));
  const criterionPilots=()=>objective()?.pilotCriteriaEditable
    ?model().pilots.filter(row=>objectiveContext().pilotContext?.catalog.some(([id])=>id===row.recordIndex)):[];
  const entityQuery=query=>['unitKind','pilotLookup'].includes(query);
  const regionAvailable=()=>Boolean(objective()?.regionCriteriaEditable&&objectiveContext()?.regionContext);
  const structuredQuery=query=>entityQuery(query)||query==='factionRegion';
  let regionPicker=null;
  const regionControls=new Map(ruleControls.map(({field,prefix})=>[field,createRegionRuleControls({
    group:ui[prefix+'Group'],prefix,context:()=>objectiveContext()?.regionContext,
    onInput:input=>acceptCriteria({trigger:input}),onPick:control=>startRegionPick(control),onExplain:text=>say(text),
  })]));
  const unitKindExplanation='같은 종류 전체(아군·적군)를 검사합니다. 미출현·퇴각·변형·합체 연결도 ‘없음’일 수 있습니다.';
  const pilotExplanation='맵에서 해당 파일럿이 연결된 기체를 찾습니다. 미출현·퇴각·연결 변경도 ‘없음’일 수 있습니다. 격추 여부를 뜻하지 않습니다.';
  const customCriteria=row=>row?.criteriaEditable&&CRITERIA_FIELDS.some(field=>row[field]!==row.criteriaDefaults[field]);
  const wave=()=>scene()?.waves?.find(item=>item.recordIndex===eventIndex);
  const row = () => mode==='placement' ? placements().find(row => row.recordIndex === selected) : null;
  const cell = () => map() ? model().cell(map().mapIndex, planeIndex, x, y) : null;
  const terrainId = tileId => model().bankFor(map())?.terrainIds[tileId];
  const terrainName = id => host.terrainName(id) || `지형 #${id}`;
  function say(text = '',description=text) { ui.scenarioStatus.textContent = text;ui.scenarioStatus.title=description; requestAnimationFrame(measure); }

  function draw() {
    const current = plane(), viewport = ui.scenarioMapViewport;
    const ctx = ui.scenarioMapCanvas.getContext?.('2d');
    if (!current || !ctx?.fillRect || ui.scenarioEditorPanel.hidden) return;
    const fit = Math.min(viewport.clientWidth / current.width, viewport.clientHeight / current.height);
    viewport.dataset.zoom = String(zoom);
    const size = Math.max(1, fit * zoom), width = Math.max(1, Math.floor(current.width * size)), height = Math.max(1, Math.floor(current.height * size));
    const ratio = Math.min(window.devicePixelRatio || 1, 2), canvas = ui.scenarioMapCanvas;
    canvas.width = Math.ceil(width * ratio); canvas.height = Math.ceil(height * ratio);
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    ctx.scale(ratio, ratio);
    const graphic = model().graphics.map(model(), mapIndex, planeIndex), source = texture.getContext?.('2d');
    if (graphic && source?.createImageData && ctx.drawImage) {
      texture.width = graphic.width; texture.height = graphic.height;
      const pixels = source.createImageData(graphic.width, graphic.height); pixels.data.set(graphic.data); source.putImageData(pixels, 0, 0);
      ctx.imageSmoothingEnabled = false; ctx.drawImage(texture, 0, 0, width, height);
    }
    for (let cy = 0; cy < current.height; cy++) for (let cx = 0; cx < current.width; cx++) {
      const id = model().tile(mapIndex, planeIndex, cx, cy), terrain = terrainId(id);
      if (!graphic) { ctx.fillStyle = `hsl(${(terrain * 137.508) % 360} 24% ${34 + (terrain % 3) * 6}%)`; ctx.fillRect(cx * size, cy * size, size + .5, size + .5); }
      if (size >= 20) { ctx.strokeStyle = '#ffffff18'; ctx.lineWidth = .5; ctx.strokeRect(cx * size, cy * size, size, size); }
    }
    // Only proved CA02 constructors provide an initial faction. Runtime
    // roster references remain unknown; keep every occupant in a stack.
    const shown = shownPlacements(), list = mode==='placement'?placements():relatedPlacements();
    if (planeIndex === 0) for (const item of shown) {
      if (item.x >= current.width || item.y >= current.height) continue;
      const active = item.recordIndex === selected;
      ctx.fillStyle = factionColors[initialFaction(item)];
      ctx.beginPath(); ctx.arc((item.x + .5) * size, (item.y + .5) * size, Math.max(1.5, size * .28), 0, Math.PI * 2); ctx.fill();
      if(active){ctx.strokeStyle='#ffe39e';ctx.lineWidth=Math.max(1,size*.06);ctx.stroke();}
      if (size >= 23) { ctx.fillStyle = '#07192d'; ctx.font = `bold ${Math.min(14, size * .42)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(list.indexOf(item) + 1), (item.x + .5) * size, (item.y + .5) * size); }
    }
    if(spawnMode()&&reinforcement()?.enabled&&planeIndex===0){
      const added=reinforcement();ctx.fillStyle='#ff9689';ctx.beginPath();ctx.arc((added.x+.5)*size,(added.y+.5)*size,Math.max(2,size*.32),0,Math.PI*2);ctx.fill();
    }
    if(criteriaActive()&&regionAvailable()&&planeIndex===0&&model().mapFor(objectiveContext().regionContext.mapIndex)===map()){
      for(const {field}of ruleControls){
        const value=objective()[field];if(!value)continue;
        const rule=decodeObjectiveRule(value,objectiveContext());
        if(rule?.query==='factionRegion')paintRegionOutline(ctx,rule,size,field.startsWith('victory')?'#a3e56b':'#ff9689',`${field.startsWith('victory')?'승':'패'}${field.at(-1)}`);
      }
      if(regionPicker?.first)paintRegionOutline(ctx,{x0:Math.min(regionPicker.first.x,x),y0:Math.min(regionPicker.first.y,y),x1:Math.max(regionPicker.first.x,x),y1:Math.max(regionPicker.first.y,y)},size,'#ffe39e');
    }
    ctx.strokeStyle = '#ffe39e'; ctx.lineWidth = 2;
    ctx.strokeRect(x * size + 1, y * size + 1, Math.max(1, size - 2), Math.max(1, size - 2));
    const enterAction=regionPicker?'영역 위치 지정':mode==='tile'?'타일 적용':mode==='placement'?'선택 기체 이동':'';
    canvas.setAttribute('aria-label', `맵 #${map().mapIndex}, 맵 데이터 ${planeIndex + 1}, ${current.width}×${current.height}. 선택 (${x}, ${y}). 방향키로 칸 선택${enterAction?`, Enter로 ${enterAction}`:''}.`);
  }

  function describeCell() {
    if (ui.scenarioSelectionDescription) ui.scenarioSelectionDescription.textContent = `${scenarioSelectionDescription(scene())}${scene()?unreadPlacements()
      ?' 이 시나리오의 배치 명령을 아직 읽지 못했습니다. 기체가 없다는 뜻이 아닙니다.'
      :` 읽은 배치 ${scenePlacements().length}기만 표시합니다.${incompletePlacements()?' 일부 명령은 아직 읽지 못해 초기 배치나 다른 증원이 빠질 수 있습니다.':''} 초기 진영이 확인된 고정 기체만 아군·적군·기타로 구분합니다. 출격 편성 참조의 기체·파일럿은 게임 실행 시 결정됩니다. 게임 중 진영 변경은 반영하지 않습니다.`:''}`;
    const current = plane();
    if (!current) { ui.scenarioCellInfo.textContent = '맵 데이터가 없습니다'; return; }
    const tileId = model().tile(mapIndex, planeIndex, x, y), terrain = terrainId(tileId);
    ui.scenarioCellInfo.textContent = `선택 칸 (${x}, ${y}) · ${terrainName(terrain)} · #${tileId}`;
    ui.scenarioCellInfo.title = `X는 왼쪽부터, Y는 위쪽부터 0으로 셉니다. 선택 칸 (${x}, ${y}), ${terrainName(terrain)}, 타일 #${tileId}.`;
    const shown=shownPlacements();
    const listed=mode==='placement'?placements():relatedPlacements();
    const count=shown.length===listed.length?`${shown.length}기`:`${shown.length}/${listed.length}기`;
    ui.scenarioMapLegend.hidden = planeIndex!==0||!listed.length;
    ui.scenarioMapLegend.textContent=mode==='events'?`● 연계 배치 ${count}`:faction==='all'?`● 배치 ${count}`:`● ${filterNames[faction]} ${count}`;
    ui.scenarioMapLegend.title=`현재 지도에 ${shown.length}기 / 선택 목록 ${listed.length}기 표시. 맵 연결·좌표가 확인되지 않은 항목과 다른 맵의 배치는 표시하지 않습니다. 아군 파랑 · 적군 빨강 · 기타 진영 보라 · 미확인 흰색 · 선택 노란 테두리. 기체 생성 시 초기 진영이며 게임 중 변경은 별도입니다.${mode==='events'?' 선택한 사건에 연결된 배치입니다. 점을 누르거나 ‘배치 보기’로 편집합니다.':''}`;
    const bank=model().bankFor(map()),orientation=current.orientations?.[y*current.width+x]??0;
    ui.scenarioCurrentTilePreview.hidden=!paintTilePreview(ui.scenarioCurrentTilePreview,bank&&model().graphics.tile(bank,tileId,orientation));
    ui.scenarioCurrentTileName.textContent=terrainName(terrain);ui.scenarioCurrentTileName.title=`${terrainName(terrain)} · #${tileId}`;
    ui.scenarioMove.textContent=`(${x},${y})로 이동`;
    ui.scenarioMove.title=`선택한 기체를 (${x}, ${y}) 칸으로 이동`;
    ui.scenarioApplyTile.title=`(${x}, ${y}) 칸을 고른 타일로 교체`;
    const shared = mode==='tile'?'':scenarioSharedCaption(scene());
    ui.scenarioMapSummary.textContent = `${model().bankFor(map())?.graphics ? '맵' : '지형 배치도'}${planeIndex===1?' · 데이터 2':''} · ${current.width}×${current.height}${shared ? ` · ${shared}` : map().mapSlots.length > 1 ? ` · 공유 맵 ${map().mapSlots.length}` : ''}`;
    ui.scenarioMapSummary.title = `${scenarioSelectionDescription(scene())} 맵 선택 번호: ${map().mapSlots.map(id => `#${id}`).join(' · ')}.`;
    ui.scenarioTileReset.disabled = !host.canEdit() || !modified(cell(), ['tileId']);
  }
  function showPage(next) {
    page = next; ui.scenarioEditorPanel.dataset.page = next;
    ui.scenarioMapPage.setAttribute('aria-pressed', String(next === 'map'));
    ui.scenarioFieldsPage.setAttribute('aria-pressed', String(next === 'fields'));
    draw();
  }
  function showFieldsPage() {
    const groups = fieldGroups();
    fieldsPage = Math.max(0, Math.min(fieldsPage, fieldsPages.length - 1));
    groups.forEach(group => { group.hidden = fieldsPaged && !fieldsPages[fieldsPage]?.includes(group); });
    ui.scenarioFieldsPager.hidden = !fieldsPaged;
    ui.scenarioFieldsPosition.textContent = `${fieldsPage + 1}/${fieldsPages.length}`;
    ui.scenarioFieldsPrev.disabled = fieldsPage === 0; ui.scenarioFieldsNext.disabled = fieldsPage === fieldsPages.length - 1;
  }
  function focusAfterReset(...controls) {
    const groups = fieldGroups();
    const control = controls.find(input => input && !input.disabled && groups.some(group => containsElement(group,input)));
    if (!control) return;
    measure();
    const next = fieldsPages.findIndex(pageGroups => pageGroups.some(group => containsElement(group,control)));
    if (next >= 0) fieldsPage = next;
    showFieldsPage(); showPage('fields'); control.focus({ preventScroll: true });
  }
  function fieldGroups(){
    const groups=[...(tool==='deployment'?ui.scenarioDeploymentFields:ui.scenarioTileFields).children];
    if(tool==='tile')return groups;
    if(spawnMode())return groups.filter(group=>spawnGroups().includes(group)&&Boolean(reinforcement()));
    if(mode==='objective')return groups.filter(group=>Boolean(objective())&&(group===ui.scenarioObjectiveFields&&showDeadline()||group===ui.scenarioObjectiveDescription||criteriaActive()&&criteriaGroups().includes(group)&&!ruleControls.some(({field,prefix})=>group===ui[prefix+'Group']&&!objective()[field]&&!pendingCriteria.has(field))));
    const eventGroups=[ui.scenarioEventFields,ui.scenarioEventChoice,...eventCriteriaGroups()];
    if(mode==='events')return groups.filter(group=>eventGroups.includes(group)
      &&(!eventCriteriaGroups().includes(group)||eventCriteriaActive()&&(group!==ui.scenarioEventPhaseGroup||condition().eventPhaseEditable)&&(group!==ui.scenarioEventCriteriaChoice||!condition().eventExactTurnOnly)&&!eventRuleControls.some(({field,prefix})=>group===ui[prefix+'Group']&&!condition()[field]&&!pendingEventCriteria.has(field)))
      &&(group!==ui.scenarioEventFields||Boolean(condition())&&!eventCriteriaActive())
      &&(group!==ui.scenarioEventChoice||ui.scenarioConditionSelector.children.length>1));
    const current=row();
    return groups.filter(group=>!spawnGroups().includes(group)&&!criteriaGroups().includes(group)&&!eventGroups.includes(group)&&group!==ui.scenarioObjectiveFields&&group!==ui.scenarioObjectiveDescription
      &&(containsElement(group,ui.scenarioDeploymentSelector)||Boolean(current))
      &&(!containsElement(group,ui.scenarioX)||positioned(current))
      &&(!containsElement(group,ui.scenarioReward)||current?.rewardSelector!==null));
  }
  function measureExplanation() {
    const popup = ui.scenarioSelectionDescription?.closest?.('.reward-explanation');
    if (!popup?.getClientRects().length) return;
    if (!explanationContent) {
      explanationContent = document.createElement('div'); explanationContent.className = 'scenario-explanation-content';
      explanationContent.append(...popup.children);
      explanationPager = document.createElement('div'); explanationPager.className = 'scenario-explanation-pager';
      const button = (text, label, action) => {
        const control = document.createElement('button'); control.type = 'button'; control.textContent = text;
        control.setAttribute('aria-label', label); control.addEventListener('click', action); return control;
      };
      explanationPrevious = button('‹', '설명 이전 페이지', () => { explanationPage--; showExplanationPage(); });
      explanationNext = button('›', '설명 다음 페이지', () => { explanationPage++; showExplanationPage(); });
      explanationPosition = document.createElement('span'); explanationPosition.setAttribute('aria-live', 'polite');
      const close = button('닫기', '설명 닫기', () => {
        const details = popup.closest('details'); details.open = false; details.querySelector('summary').focus({ preventScroll: true });
      });
      explanationPager.append(explanationPrevious, explanationPosition, explanationNext, close);
      popup.append(explanationContent, explanationPager);
      popup.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        event.preventDefault(); close.click();
      });
    }
    const paragraphs = [...explanationContent.children];
    const anchor = explanationSource === scenarioIndex ? explanationPages[explanationPage]?.[0] : null;
    explanationSource = scenarioIndex;
    paragraphs.forEach(paragraph => { paragraph.hidden = false; });
    popup.style.position = ''; popup.style.top = ''; popup.style.right = '';
    explanationPager.hidden = true;
    let available = Math.max(0, Math.floor(window.innerHeight - popup.getBoundingClientRect().top - 8));
    const style = getComputedStyle(popup), contentStyle = getComputedStyle(explanationContent);
    const chrome = ['paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth'].reduce((sum, key) => sum + (Number.parseFloat(style[key]) || 0), 0);
    const gap = Number.parseFloat(contentStyle.rowGap) || 0;
    const heights = new Map(paragraphs.map(paragraph => [paragraph, paragraph.getBoundingClientRect().height]));
    const height = groups => groups.reduce((sum, paragraph) => sum + heights.get(paragraph), 0) + Math.max(0, groups.length - 1) * gap;
    explanationPages = [paragraphs];
    if (height(paragraphs) + chrome > available) {
      explanationPager.hidden = false;
      const controls = explanationPager.getBoundingClientRect().height + gap;
      // A short landscape viewport may leave less than one paragraph below the toolbar.
      // Keep the fixed explanation below the header, which paints above the editor.
      // An explicit close control remains available when it covers its trigger.
      if (Math.max(...heights.values()) + chrome + controls > available) {
        const header = document.querySelector('.site-header');
        const top = Math.max(8, (header?.getClientRects().length ? header.getBoundingClientRect().bottom : 0) + 8);
        popup.style.position = 'fixed'; popup.style.top = `${top}px`; popup.style.right = '8px';
        available = Math.max(0, window.innerHeight - top - 8);
      }
      const budget = Math.max(0, available - chrome - controls);
      explanationPages = packMeasuredGroups(paragraphs, groups => height(groups) <= budget);
    }
    explanationPage = Math.max(0, anchor ? explanationPages.findIndex(groups => groups.includes(anchor)) : 0);
    popup.style.setProperty('--reward-help-max-height', `${available}px`);
    showExplanationPage();
  }
  function showExplanationPage() {
    explanationPage = Math.max(0, Math.min(explanationPage, explanationPages.length - 1));
    const shown = explanationPages[explanationPage] ?? [];
    for (const paragraph of explanationContent.children) paragraph.hidden = !shown.includes(paragraph);
    explanationPosition.textContent = `${explanationPage + 1}/${explanationPages.length}`;
    explanationPrevious.disabled = explanationPage === 0;
    explanationNext.disabled = explanationPage === explanationPages.length - 1;
    explanationPrevious.hidden = explanationNext.hidden = explanationPosition.hidden = explanationPages.length < 2;
    if (document.activeElement === explanationPrevious && explanationPrevious.disabled && !explanationNext.disabled) explanationNext.focus({ preventScroll: true });
    if (document.activeElement === explanationNext && explanationNext.disabled && !explanationPrevious.disabled) explanationPrevious.focus({ preventScroll: true });
    explanationContent.scrollTop = 0;
  }
  function measure() {
    const panel = ui.scenarioEditorPanel;
    if (panel.hidden || !panel.getClientRects?.().length) return;
    const footer = document.querySelector('.editor-footer'), top = panel.getBoundingClientRect().top;
    panel.dataset.compact = String(window.innerHeight - top < 540);
    const available = Math.max(100, window.innerHeight - top - (footer?.getBoundingClientRect().height ?? 80) - 28);
    panel.style.setProperty('--scenario-height', `${available}px`);
    panel.dataset.paged = 'false'; ui.scenarioViewPager.hidden = true;
    const inspector = panel.querySelector('.scenario-inspector'), work = panel.querySelector('.scenario-workarea');
    const groups = fieldGroups();
    const focused = groups.findIndex(group => containsElement(group,document.activeElement));
    for(const group of [...ui.scenarioDeploymentFields.children,...ui.scenarioTileFields.children])group.hidden=!groups.includes(group);
    ui.scenarioFieldsPager.hidden = true;
    const stackHeight=(element,minimumChild=null)=>{
      const children=[...element.children].filter(child=>child.getClientRects().length),style=getComputedStyle(element);
      const pixel=key=>Number.parseFloat(style[key])||0;
      return children.reduce((sum,child)=>sum+(child===minimumChild?64:child.getBoundingClientRect().height),0)
        +Math.max(0,children.length-1)*pixel('rowGap')+pixel('paddingTop')+pixel('paddingBottom')+pixel('borderTopWidth')+pixel('borderBottomWidth');
    };
    let inspectorHeight = stackHeight(inspector);
    // Keep a 64px map picture plus its measured caption, cell line and gaps.
    // Compact fields share the screen with it whenever both actually fit.
    let minimumMapHeight=stackHeight(panel.querySelector('.scenario-map-area'),ui.scenarioMapViewport);
    // A tight screen can fit both by using the existing compact controls.
    // Try their measured layout before separating the map from its fields.
    if(window.innerWidth<760&&panel.dataset.compact!=='true'&&work.getBoundingClientRect().height<inspectorHeight+minimumMapHeight){
      panel.dataset.compact='true';
      inspectorHeight=stackHeight(inspector);
      minimumMapHeight=stackHeight(panel.querySelector('.scenario-map-area'),ui.scenarioMapViewport);
    }
    const heights = new Map(groups.map(group => [group, group.getBoundingClientRect().height]));
    const paged = window.innerWidth < 760 && work.getBoundingClientRect().height < inspectorHeight + minimumMapHeight;
    panel.dataset.paged = String(paged); ui.scenarioViewPager.hidden = !paged;
    fieldsPaged = work.getBoundingClientRect().height < inspectorHeight;
    // A needed pager must participate in the same height budget as its fields.
    ui.scenarioFieldsPager.hidden = !fieldsPaged;
    const budget = work.getBoundingClientRect().height - panel.querySelector('.scenario-tools').getBoundingClientRect().height
      - ui.scenarioStatus.getBoundingClientRect().height - 16;
    const groupGap=typeof getComputedStyle==='function'?Number.parseFloat(getComputedStyle(tool==='deployment'?ui.scenarioDeploymentFields:ui.scenarioTileFields).rowGap)||0:6;
    fieldsPages = fieldsPaged ? packMeasuredGroups(groups, pageGroups => pageGroups.reduce((sum, group) => sum + heights.get(group), 0) + (pageGroups.length - 1) * groupGap <= budget) : [groups];
    fieldsPaged = fieldsPaged && fieldsPages.length > 1;
    if (focused >= 0) fieldsPage = fieldsPages.findIndex(pageGroups => pageGroups.includes(groups[focused]));
    showFieldsPage();
    if (paged && containsElement(inspector,document.activeElement)) page = 'fields';
    showPage(page);
    measureExplanation();
    draw();
  }
  function sync() {
    const editable = host.canEdit(), current = row();
    for(const [next,id]of Object.entries(modeButtons))ui[id].disabled=!editable||!modeEntries(next).length;
    if(!editable&&regionPicker){regionPicker=null;say();draw();}
    for (const id of ['scenarioSelector', 'scenarioMapSelector', 'scenarioPlaneSelector', 'scenarioZoom']) ui[id].disabled = !editable || !map();
    ui.scenarioDeploymentSelector.disabled=!editable||mode!=='placement'||!placements().length||planeIndex!==0;
    for (const id of ['scenarioX', 'scenarioY', 'scenarioMove', 'scenarioReward']) ui[id].disabled = !editable || !current?.editable || planeIndex !== 0;
    ui.scenarioMove.hidden=!current?.editable;ui.scenarioDeploymentReset.hidden=!current?.editable;
    for (const id of ['scenarioTileSelector', 'scenarioTilePickerOpen', 'scenarioApplyTile', 'scenarioBrush', 'scenarioTerrainLink']) ui[id].disabled = !editable || !map();
    ui.scenarioRewardDetail.disabled=!editable||!current||!host.rewardRows().some(item=>item.editable&&item.aliases.includes(current.rewardSelector));
    ui.scenarioDeploymentReset.disabled = !editable || !current?.editable || !modified(current, ['x', 'y', 'rewardSelector']);
    ui.scenarioTileReset.disabled = !editable || !modified(cell(), ['tileId']);
    const spawn=reinforcement();
    for(const id of ['scenarioSpawnTemplate','scenarioSpawnTurn','scenarioSpawnX','scenarioSpawnY','scenarioSpawnMove','scenarioSpawnReward'])ui[id].disabled=!editable||!spawn?.enabled||planeIndex!==0;
    ui.scenarioSpawnToggle.disabled=!editable||!spawn?.editable||planeIndex!==0;
    ui.scenarioSpawnReset.disabled=!editable||!modified(spawn,spawnFields);
    for(const [field,id]of [['turn','scenarioSpawnTurn'],['x','scenarioSpawnX'],['y','scenarioSpawnY'],['rewardSelector','scenarioSpawnReward']])ui[id].classList.toggle('is-modified',Boolean(modified(spawn,[field])));
    ui.scenarioDeadline.disabled=!editable||!objective()?.editable;
    ui.scenarioObjectiveReset.disabled=!editable||!modified(objective(),['deadline']);
    ui.scenarioDeadline.classList.toggle('is-modified',Boolean(modified(objective(),['deadline'])));
    const obj=objective(),criteriaEditable=editable&&criteriaActive();
    for(const [field,id]of [['objectivePriority','scenarioObjectivePriority'],['victoryJoin','scenarioVictoryJoin'],['defeatJoin','scenarioDefeatJoin']]){ui[id].disabled=!criteriaEditable;ui[id].classList.toggle('is-modified',Boolean(modified(obj,[field])));}
    ui.scenarioCriteriaReset.disabled=!criteriaEditable||!modified(obj,CRITERIA_FIELDS)&&!pendingCriteria.size;
    for(const outcome of ['Victory','Defeat']){
      const count=ruleControls.filter(({field})=>field.startsWith(outcome.toLowerCase())&&(obj?.[field]||pendingCriteria.has(field))).length;
      ui[`scenario${outcome}Add`].disabled=!criteriaEditable||count>=3;
      for(const {field,prefix}of ruleControls.filter(({field})=>field.startsWith(outcome.toLowerCase()))){
        for(const suffix of ['Query','Comparison','Value','Unit']){ui[prefix+suffix].disabled=!criteriaEditable||!obj?.[field]&&!pendingCriteria.has(field);ui[prefix+suffix].classList.toggle('is-modified',Boolean(modified(obj,[field])));}
        ui[prefix+'Remove'].disabled=!criteriaEditable||!obj?.[field]&&!pendingCriteria.has(field)||count<=1;
        regionControls.get(field).sync({disabled:!criteriaEditable||!obj?.[field]&&!pendingCriteria.has(field),modified:Boolean(modified(obj,[field]))});
      }
    }
    ui.scenarioEventSelector.disabled=!editable;
    if(ui.scenarioFactionSelector){ui.scenarioFactionSelector.hidden=!scene()||!['placement','events'].includes(mode);ui.scenarioFactionSelector.disabled=!editable;ui.scenarioFactionSelector.value=faction;}
    if(ui.scenarioRelatedDeploymentButton)ui.scenarioRelatedDeploymentButton.disabled=!editable||!relatedPlacements().some(item=>positioned(item)&&model().mapFor(item.mapIndex));
    ui.scenarioConditionSelector.disabled=!editable;
    ui.scenarioTurn.disabled=!editable||!condition()?.editable;
    ui.scenarioEventReset.disabled=!editable||!condition()?.editable||!modified(condition(),['turn']);
    ui.scenarioTurn.classList.toggle('is-modified',Boolean(modified(condition(),['turn'])));
    const playerEvent=Boolean(condition()?.eventPhaseEditable&&condition().eventPhase===1);
    const exactEvent=playerEvent||condition()?.eventExactTurnOnly===true;
    ui.scenarioEventPhase.disabled=!editable||!eventCriteriaActive()||!condition()?.eventPhaseEditable;
    ui.scenarioEventPhase.classList.toggle('is-modified',Boolean(condition()?.eventPhaseEditable&&modified(condition(),['eventPhase'])));
    ui.scenarioEventJoin.disabled=!editable||!eventCriteriaActive()||exactEvent;
    ui.scenarioEventJoin.classList.toggle('is-modified',Boolean(eventCriteriaActive()&&modified(condition(),['eventJoin'])));
    ui.scenarioEventCriteriaReset.disabled=!editable||!eventCriteriaActive()||!modified(condition(),eventFields(condition()))&&!pendingEventCriteria.size;
    const eventCount=eventRuleControls.filter(({field})=>condition()?.[field]||pendingEventCriteria.has(field)).length;
    const committedEventCount=eventRuleControls.filter(({field})=>condition()?.[field]).length;
    ui.scenarioEventAdd.disabled=!editable||!eventCriteriaActive()||eventCount>=(condition()?.eventCriteriaLimit??3)||exactEvent;
    for(const{field,prefix}of eventRuleControls){
      const active=eventCriteriaActive()&&Boolean(condition()[field]||pendingEventCriteria.has(field));
      for(const suffix of ['Value','Comparison']){ui[prefix+suffix].disabled=!editable||!active;ui[prefix+suffix].classList.toggle('is-modified',Boolean(active&&modified(condition(),[field])));}
      if(exactEvent)ui[prefix+'Comparison'].disabled=true;
      ui[prefix+'Remove'].disabled=!editable||!active||eventCount<=1||Boolean(condition()?.[field])&&committedEventCount<=1;
    }
    for (const [field, input] of [['x', ui.scenarioX], ['y', ui.scenarioY], ['rewardSelector', ui.scenarioReward]]) input.classList.toggle('is-modified', Boolean(current && current[field] !== current.original[field]));
  }
  function renderDeployment() {
    const rows = placements();
    ui.scenarioDeploymentFields.dataset.spawnOnly=String(spawnMode());
    ui.scenarioDeploymentFields.dataset.eventOnly=String(mode==='events'&&!spawnMode());
    ui.scenarioDeploymentFields.dataset.objectiveOnly=String(Boolean(eventIndex?.startsWith('objective:')));
    if (!rows.some(item => item.recordIndex === selected)) selected = rows.find(item => item.editable&&onMap(item))?.recordIndex ?? rows.find(onMap)?.recordIndex ?? rows.find(item=>item.editable)?.recordIndex ?? rows[0]?.recordIndex ?? null;
    ui.scenarioDeploymentSelector.replaceChildren(...rows.map((item, i) => {const choice=option(item.recordIndex,placementLabel(item,i));choice.title=placementDescription(item);return choice;}));
    if (!rows.length) ui.scenarioDeploymentSelector.append(option('', unreadPlacements()?'배치 데이터 읽기 미지원':faction==='all'?'이 선택에서 읽은 배치 0기':`${filterNames[faction]} · 읽은 배치 0기`));
    ui.scenarioDeploymentSelector.value = selected ?? '';
    const current = row();
    for (const [field, input] of [['x', ui.scenarioX], ['y', ui.scenarioY]]) {
      input.value = current&&Number.isInteger(current[field]) ? String(current[field]) : ''; input.max = String((current?.[field === 'x' ? 'width' : 'height'] ?? 64) - 1);
      input.setCustomValidity(''); input.removeAttribute('aria-invalid');
    }
    ui.scenarioReward.replaceChildren(option(255, '보상 없음'), ...host.rewardRows().flatMap(item => item.aliases.map(id => {
      const choice=option(id,rewardOutcomeLabel(item,host.partName,{compact:true}));
      choice.title=`${rewardOutcomeLabel(item,host.partName)}${item.capacity?' · 남은 확률은 보상 없음':''}`;return choice;
    })));
    ui.scenarioReward.title=ui.scenarioReward.selectedOptions?.[0]?.title??'';
    if(current&&!Array.from(ui.scenarioReward.options).some(item=>Number(item.value)===current.rewardSelector))ui.scenarioReward.append(option(current.rewardSelector??'unknown',current.rewardSelector===null?'게임 실행 시 결정':'현재 보상(명칭 미확인)'));
    ui.scenarioReward.value = String(current?current.rewardSelector??'unknown':255);
    ui.scenarioReward.title=ui.scenarioReward.selectedOptions?.[0]?.title??'';
    ui.scenarioPilotName.textContent = current ? current.pilotName : '';
    ui.scenarioPilotName.title = current?.pilotName ?? '';
    const readOnlyHint=current?.readOnlyReason&&(!onMap(current)?model().mapFor(current.mapIndex)?'다른 맵의 배치 · 목록에서 위치 확인':'맵 연결 미확인 · 지도 표시 불가':current.placementKind==='roster-reference'?'출격 편성 참조 · 읽기 전용':current.placementKind==='sortie-position'?'출격 목표 위치 · 읽기 전용':current.placementStage==='scenario-script'?'등장 시점 미확인 · 읽기 전용':current.readOnlyReason);
    say(mode==='placement'?(readOnlyHint || (planeIndex !== 0 ? '기체 배치는 맵 데이터 1에서 편집합니다.' : !rows.length&&faction!=='all'?'선택 진영에서 읽은 배치 0기':incompletePlacements()?'일부 배치 읽기 미지원 · 도움말 확인':'')):mode==='tile'&&unreadPlacements()?'배치 읽기 미지원 · 도움말 확인':'',current?.readOnlyReason);
    if(mode==='placement')ui.scenarioTaskHint.textContent=current&&!current.editable?['roster-reference','sortie-position'].includes(current.placementKind)?'출격 위치 확인 · 기체는 게임에서 결정':'배치 확인 · 위치 수정 불가':'기체 선택 → 지도에서 칸 선택 → 이동';
    const visible=fieldGroups();for(const group of [...ui.scenarioDeploymentFields.children,...ui.scenarioTileFields.children])group.hidden=!visible.includes(group);
    sync();
  }
  function waveLabel(item){
    const script=item.placementStage==='scenario-script',others=(scene()?.waves??[]).filter(w=>script?w.placementStage==='scenario-script':!w.initial&&w.placementStage!=='scenario-script'),number=others.indexOf(item)+1;
    const guards=(item.guards??[]).flatMap(guard=>{const event=model().events.find(row=>row.recordIndex===guard.recordIndex);return event?[eventConditionLabel(event,guard.taken).split(' · ')[0]]:[];});
    const count=scenePlacements().filter(row=>row.waveIndex===item.recordIndex&&inFaction(row)).length;
    return `${script?`시나리오 배치 ${number}`:item.initial?'초기':`증원 ${number}`}${guards.length?' · '+(guards.length>1?`턴 조건 ${guards.length}개`:guards[0]):''} · ${count}기`;
  }
  function waveDescription(item){
    const rules=(item.guards??[]).flatMap(guard=>{const event=model().events.find(row=>row.recordIndex===guard.recordIndex);return event?[`${eventConditionLabel(event,guard.taken)}${eventPhaseName(event)?' · '+eventPhaseName(event)+' 시작 검사':''}`]:[];});
    return `${waveLabel(item)}${rules.length?'. '+rules.join(' + ')+'. 다른 플래그·분기 조건도 유지됩니다.':item.placementStage==='scenario-script'?' · 초기·증원 구분은 아직 확인하지 못했습니다.':item.initial?' · 시나리오 시작 명령에서 읽은 배치':' · 출현 조건을 아직 확인하지 못했습니다.'}`;
  }
  const eventRules=row=>eventRuleControls.map(({field})=>row?.[field]?decodeObjectiveRule(row[field]):null).filter(Boolean);
  const eventRuleText=c=>`${c.value}턴${({eq:'',ne:' 외',le:' 이하',ge:' 이상'}[c.comparison])??''}`;
  function standaloneLabel(row,index){
    const rules=eventRules(row);
    const text=!row.eventCriteriaEditable?eventConditionLabel(row):rules.length>1
      ?eventCriteriaTurnSummary(eventCriteriaFields(row))?.label??`조건 ${rules.length}개`:eventRuleText(rules[0]);
    return `${index+1}. ${eventPhaseName(row)?eventPhaseName(row)+' ':''}${text}`;
  }
  function standaloneDescription(row,index){
    const text=row.eventCriteriaEditable?eventRules(row).map(eventRuleText).join(row.eventJoin?' 또는 ':' + '):eventConditionLabel(row);
    const impossible=row.eventCriteriaEditable&&eventCriteriaTurnSummary(eventCriteriaFields(row))?.possible===false;
    const related=(scene()?.waves??[]).flatMap(item=>{const guard=item.guards?.find(g=>g.recordIndex===row.recordIndex);return guard?[`${waveLabel(item)} (${eventConditionLabel(row,guard.taken)})`]:[];});
    return `${text}${impossible?' · 함께 충족되는 턴 없음':''}${eventPhaseName(row)?' · '+eventPhaseName(row)+' 시작 검사':''} · 사건 ${index+1}${related.length?`. 연결: ${related.join(' / ')}. 다른 플래그와 조건도 유지됩니다.`:''}`;
  }
  function describeEventSelection(){
    const selected=ui.scenarioEventSelector.selectedOptions?.[0]??ui.scenarioEventSelector.options[ui.scenarioEventSelector.selectedIndex];
    const text=selected?.title||selected?.textContent||'';
    ui.scenarioEventSelector.title=text;
    const related=relatedPlacements();
    if(ui.scenarioRelatedDeploymentButton){
      ui.scenarioRelatedDeploymentButton.hidden=!related.length;
      ui.scenarioRelatedDeploymentButton.textContent=`배치 ${related.length}기`;
      ui.scenarioRelatedDeploymentButton.title='연결된 초기·증원 기체의 위치와 격추 보상 편집';
    }
    if(mode==='events'&&eventIndex?.startsWith('event:')){
      ui.scenarioTaskHint.textContent=related.length?`턴 검사 · 연결 배치 ${related.length}기`:'턴 검사 편집 · 다른 이벤트 조건 유지';
    }
    ui.scenarioEventSelector.setAttribute('aria-label',`등장·사건 선택${text?`. ${text}`:''}`);
  }
  const modeButtons={placement:'scenarioDeploymentTool',events:'scenarioEventTool',objective:'scenarioObjectiveTool',tile:'scenarioTileTool'};
  function modeEntries(next){
    const current=scene(),waves=(current?.waves??[]).filter(w=>w.placements.length),events=model().events.filter(row=>row.physicalIndex===scenarioIndex);
    if(next==='placement'){
      const rows=scenePlacements(),later=waves.filter(item=>!item.initial&&item.placementStage!=='scenario-script'),scripts=waves.filter(item=>item.placementStage==='scenario-script');
      if(!rows.length)return [];
      const all=['all',`전체 · ${rows.filter(inFaction).length}기`,`읽은 초기·증원 배치 ${rows.length}기. 다른 맵의 기체를 고르면 그 맵으로 이동합니다.${incompletePlacements()?' 아직 읽지 못한 명령이 있어 실제 전체 배치 수는 다를 수 있습니다.':''}`];
      return waves.length?[...(waves.length>1?[all]:[]),...waves.filter(item=>item.initial&&item.placementStage!=='scenario-script').map(item=>[item.recordIndex,waveLabel(item),waveDescription(item)]),...(later.length>1?[['later',`증원 전체 · ${rows.filter(row=>inFaction(row)&&later.some(item=>item.recordIndex===row.waveIndex)).length}기`]]:[]),...later.map(item=>[item.recordIndex,waveLabel(item),waveDescription(item)]),...scripts.map(item=>[item.recordIndex,waveLabel(item),waveDescription(item)])]:[all];
    }
    if(next==='events')return [...events.map((item,i)=>[`event:${item.recordIndex}`,standaloneLabel(item,i),standaloneDescription(item,i)]),...(reinforcement()?.editable?[[`reinforcement:${reinforcement().recordIndex}`,'새 증원 · 적군 시작']]:[])];
    if(next==='objective')return objective()?.editable?[[`objective:${objective().recordIndex}`,objective().criteriaEditable?'승리·패배 조건':'추가 턴 제한']]:[];
    return map()?[['tile','타일']]:[];
  }
  function renderMode(){
    tool=mode==='tile'?'tile':'deployment';
    ui.scenarioEditorPanel.dataset.mode=mode;ui.scenarioEditorPanel.dataset.tool=tool;
    for(const [next,id]of Object.entries(modeButtons)){
      const available=modeEntries(next).length>0;
      ui[id].disabled=!host.canEdit()||!available;ui[id].setAttribute('aria-pressed',String(next===mode));
      ui[id].title=available?({placement:'읽은 초기·증원 기체의 위치와 격추 보상 편집',events:'확인된 턴 검사 편집',objective:'이 시나리오에서 지원하는 승리·패배 조건 편집',tile:'지도 한 칸의 그림과 지형 교체'}[next]):next==='placement'&&scene()?'배치 명령 읽기 미지원 · 기체가 없다는 뜻은 아닙니다':'이 시나리오에서 확인된 편집 대상이 없습니다';
    }
    const details=ui.scenarioMapSelector.closest?.('details');
    if(details){details.hidden=mode!=='tile';if(details.hidden)details.open=false;}
    ui.scenarioTaskHint.textContent=({placement:'기체 선택 → 지도에서 칸 선택 → 이동',events:'턴 검사 편집 · 다른 이벤트 조건 유지',objective:objective()?.criteriaEditable?'승리·패배 조건을 조합하세요':'기존 승패에 추가할 턴 제한을 정하세요',tile:'칸 선택 → 타일 고르기 → 교체'}[mode]);
    ui.scenarioDeploymentFields.hidden=tool!=='deployment';ui.scenarioTileFields.hidden=tool!=='tile';
  }
  function renderEvents(){
    if(!modeEntries(mode).length)mode=['placement','objective','events','tile'].find(next=>modeEntries(next).length)||'tile';
    renderMode();
    const entries=mode==='tile'?[]:modeEntries(mode);
    if(!entries.some(([id])=>id===eventIndex))eventIndex=entries[0]?.[0]??null;
    ui.scenarioEventSelector.replaceChildren(...entries.map(([id,label,description])=>{const item=option(id,label);item.title=description??label;return item;}));
    ui.scenarioEventSelector.value=eventIndex??'';
    if(mode==='placement'&&wave()&&model().mapFor(wave().mapIndex))mapIndex=wave().mapIndex;
    else if(mode==='placement'&&placements().length&&!placements().some(onMap)){
      const first=placements().find(item=>model().mapFor(item.mapIndex));if(first)mapIndex=first.mapIndex;
    }
    else if(mode==='events'&&relatedWaves().length&&!relatedPlacements().some(onMap)){
      const first=relatedWaves().find(item=>model().mapFor(item.mapIndex));if(first){mapIndex=first.mapIndex;planeIndex=0;}
    }
    ui.scenarioMapSelector.value=String(model().mapFor(mapIndex)?.mapIndex??'');ui.scenarioPlaneSelector.value=String(planeIndex);
    ui.scenarioEventSelector.hidden=!entries.length||mode==='objective';
    describeEventSelection();
    const selectedConditions=mode==='events'&&eventIndex?.startsWith('event:')?[eventIndex.slice(6)]:[];
    if(!selectedConditions.includes(conditionIndex))conditionIndex=selectedConditions.at(-1)??null;
    ui.scenarioConditionSelector.replaceChildren(...selectedConditions.map(id=>option(id,eventConditionLabel(model().events.find(row=>row.recordIndex===id)))));
    ui.scenarioConditionSelector.value=conditionIndex??'';renderCondition();renderObjective();renderSpawn();
  }
  function renderSpawn(){
    const current=reinforcement(),shown=spawnMode()&&Boolean(current);
    spawnGroups().forEach(group=>{group.hidden=!shown;});
    ui.scenarioSpawnTemplate.replaceChildren(...(current?.templates??[]).map(t=>option(t.byteOffset,`${t.name} · Lv${t.level}`)));
    ui.scenarioSpawnTemplate.value=String(current?.templateOffset??'');
    const template=current?.templates.find(t=>t.byteOffset===current.templateOffset);
    ui.scenarioSpawnPilot.textContent=template?.pilotName??'';ui.scenarioSpawnPilot.title=template?.pilotName??'';
    ui.scenarioSpawnToggle.textContent=current?.enabled?'증원 삭제':'증원 추가';
    for(const [field,id]of [['turn','scenarioSpawnTurn'],['x','scenarioSpawnX'],['y','scenarioSpawnY']]){
      ui[id].value=String(current?.[field]??'');ui[id].setCustomValidity('');ui[id].removeAttribute('aria-invalid');
    }
    ui.scenarioSpawnX.max=String((current?.width??64)-1);ui.scenarioSpawnY.max=String((current?.height??64)-1);
    ui.scenarioSpawnReward.replaceChildren(option(255,'보상 없음'),...host.rewardRows().flatMap(item=>item.aliases.map(id=>{const choice=option(id,rewardOutcomeLabel(item,host.partName,{compact:true}));choice.title=rewardOutcomeLabel(item,host.partName);return choice;})));
    ui.scenarioSpawnReward.value=String(current?.rewardSelector??255);
  }
  function acceptSpawn({report=false}={}){
    const current=reinforcement();if(!spawnMode()||!current?.enabled||!host.canEdit())return true;
    const wanted={templateOffset:Number(ui.scenarioSpawnTemplate.value),rewardSelector:Number(ui.scenarioSpawnReward.value)};
    for(const [field,id,min,max]of [['turn','scenarioSpawnTurn',2,99],['x','scenarioSpawnX',0,current.width-1],['y','scenarioSpawnY',0,current.height-1]]){
      const input=ui[id];input.setCustomValidity('');input.removeAttribute('aria-invalid');
      wanted[field]=input.value===''?NaN:Number(input.value);
      if(!Number.isInteger(wanted[field])||wanted[field]<min||wanted[field]>max){
        const text=`${field==='turn'?'턴':field.toUpperCase()}는 ${min}~${max}의 정수로 입력해주세요.`;
        input.setCustomValidity(text);input.setAttribute('aria-invalid','true');say(text);if(report)input.reportValidity();return false;
      }
    }
    if(!current.templates.some(t=>t.byteOffset===wanted.templateOffset)||!(wanted.rewardSelector>=0&&wanted.rewardSelector<48||wanted.rewardSelector===255))return false;
    const changed=Object.keys(wanted).some(k=>current[k]!==wanted[k]);Object.assign(current,wanted);
    const template=current.templates.find(t=>t.byteOffset===current.templateOffset);ui.scenarioSpawnPilot.textContent=template.pilotName;
    say();sync();draw();if(changed)host.onChange('reinforcement',current);return true;
  }
  function renderCondition(){
    const current=condition();ui.scenarioEventFields.hidden=mode!=='events'||!current||eventCriteriaActive();
    ui.scenarioEventChoice.hidden=!current||ui.scenarioConditionSelector.children.length<2;
    ui.scenarioTurn.value=current?String(current.turn):'';
    ui.scenarioTurn.setCustomValidity('');ui.scenarioTurn.removeAttribute('aria-invalid');
    const taken=wave()?.guards.find(guard=>guard.recordIndex===conditionIndex)?.taken;
    const text=current?eventConditionLabel({...current,turn:''},taken).replace(/^턴/,'해당 턴'):'';
    ui.scenarioConditionRule.textContent=text;ui.scenarioConditionRule.title='선택한 턴 비교값만 바꿉니다. 기존 플래그·대사·분기 순서와 다른 조건은 유지됩니다.';
    renderEventCriteria();
  }
  function renderEventCriteria(){
    const current=condition(),shown=eventCriteriaActive();eventCriteriaGroups().forEach(group=>{group.hidden=!shown;});
    ui.scenarioEventPhaseGroup.hidden=!shown||!current?.eventPhaseEditable;
    ui.scenarioEventPhase.value=String(current?.eventPhase??0);
    ui.scenarioEventPhaseHint.hidden=!shown||!current?.eventPhaseEditable||current.eventPhase!==1;
    ui.scenarioEventJoin.value=String(current?.eventJoin??0);
    // A one-condition host has no meaningful join/add/delete action. Keep
    // reset alongside its turn instead of spending a row on disabled controls.
    const exact=current?.eventExactTurnOnly===true;
    ui.scenarioDeploymentFields.dataset.eventExactTurnOnly=String(exact);
    ui.scenarioEventCriteriaChoice.hidden=!shown||exact;
    const resetParent=(exact?ui.scenarioEventRule1Group:ui.scenarioEventCriteriaChoice).firstElementChild;
    if(ui.scenarioEventCriteriaReset.parentElement!==resetParent)resetParent.append(ui.scenarioEventCriteriaReset);
    ui.scenarioEventRule1Remove.hidden=exact;
    for(const{field,prefix}of eventRuleControls){
      const c=shown&&current[field]?decodeObjectiveRule(current[field]):null;
      ui[prefix+'Group'].hidden=!shown||!c&&!pendingEventCriteria.has(field);
      ui[prefix+'Value'].value=c?String(c.value):'';ui[prefix+'Comparison'].value=c?.comparison??'eq';
      ui[prefix+'Value'].min=String(current?.eventPhaseEditable&&current.eventPhase===1?2:1);
      ui[prefix+'Value'].setCustomValidity('');ui[prefix+'Value'].removeAttribute('aria-invalid');
    }
  }
  function updateEventLabels(){
    const current=condition();
    for(const item of scene()?.waves??[]){const el=ui.scenarioEventSelector.querySelector(`option[value="${item.recordIndex}"]`);if(el) el.title=el.textContent=waveLabel(item);}
    const standalone=ui.scenarioEventSelector.querySelector(`option[value="event:${current.recordIndex}"]`);
    if(standalone){
      const events=model().events.filter(row=>row.physicalIndex===scenarioIndex);
      const index=events.indexOf(current);standalone.textContent=standaloneLabel(current,index);standalone.title=standaloneDescription(current,index);
    }
    describeEventSelection();
    const chosen=ui.scenarioConditionSelector.querySelector(`option[value="${conditionIndex}"]`);
    if(chosen){const taken=wave()?.guards.find(g=>g.recordIndex===conditionIndex)?.taken;chosen.textContent=`${eventConditionLabel(current,taken)}${eventPhaseName(current)?' · '+eventPhaseName(current)+' 시작 검사':''}`;}
  }
  function acceptEventCriteria({report=false}={}){
    if(!eventCriteriaActive()||!host.canEdit())return true;
    const current=condition(),wanted={...eventCriteriaFields(current),eventJoin:Number(ui.scenarioEventJoin.value)};
    const hadInvalid=eventRuleControls.some(({prefix})=>ui[prefix+'Value'].getAttribute('aria-invalid')==='true');
    if(current.eventPhaseEditable)wanted.eventPhase=Number(ui.scenarioEventPhase.value);
    for(const{field,prefix}of eventRuleControls){
      if(!current[field]&&!pendingEventCriteria.has(field))continue;
      const input=ui[prefix+'Value'],value=input.value===''?NaN:Number(input.value),comparison=ui[prefix+'Comparison'].value;
      input.setCustomValidity('');input.removeAttribute('aria-invalid');
      const minimum=wanted.eventPhase===1?2:1,message=`턴은 ${minimum}~99의 정수로 입력해주세요.`;
      if(!Number.isInteger(value)||value<minimum||value>99||!['eq','ne','le','ge'].includes(comparison)){
        input.setCustomValidity(message);input.setAttribute('aria-invalid','true');say(message);
        if(report){focusAfterReset(input);input.reportValidity();}return false;
      }
      wanted[field]=encodeObjectiveRule('turn',comparison,value);
    }
    try{if(current.eventPhaseEditable)snapshotPhaseEvent(wanted,{gameId:model().gameId});else snapshotEventCriteria(wanted);}catch{say(current.eventExactTurnOnly?'이 사건은 같음 조건 1개만 가능합니다. 아군 시작은 2~99턴입니다.':wanted.eventPhase===1?'아군 시작은 2~99턴·같음 조건 1개만 가능합니다.':'사건에는 턴 조건이 하나 이상 필요합니다.');return false;}
    const changed=eventFields(current).some(field=>wanted[field]!==current[field]);
    if(changed){
      Object.assign(current,wanted);for(const field of EVENT_CRITERIA_FIELDS)if(current[field])pendingEventCriteria.delete(field);
      if(current.eventExactTurnOnly)current.turn=decodeObjectiveRule(current.eventRule1).value;
      host.onChange('event',current);
    }
    ui.scenarioEventPhaseHint.hidden=!current.eventPhaseEditable||current.eventPhase!==1;
    for(const{prefix}of eventRuleControls)ui[prefix+'Value'].min=String(current.eventPhaseEditable&&current.eventPhase===1?2:1);
    // A blur with the same valid values must not erase an unrelated phase
    // error and move the mobile inspector underneath a pending button click.
    updateEventLabels();if(changed||hadInvalid)say();sync();return true;
  }
  function changeEventRule(field,remove){
    if(!eventCriteriaActive()||!host.canEdit())return;
    const current=condition();
    if(remove){
      if(eventRuleControls.filter(({field:f})=>current[f]||pendingEventCriteria.has(f)).length<=1)return;
      if(current[field]&&eventRuleControls.filter(({field:f})=>current[f]).length<=1)return;
      pendingEventCriteria.delete(field);
      const remaining=eventRuleControls.filter(({field:f})=>f!==field&&current[f]).map(({field:f})=>current[f]);
      eventRuleControls.forEach(({field:f},i)=>{current[f]=remaining[i]??0;});
      renderEventCriteria();updateEventLabels();say();sync();measure();host.onChange('event',current);focusAfterReset(ui.scenarioEventJoin);
    }else{
      if(current.eventExactTurnOnly||current.eventPhaseEditable&&current.eventPhase===1)return;
      if(!acceptEventCriteria({report:true}))return;
      const control=eventRuleControls.find(({field:f})=>!current[f]&&!pendingEventCriteria.has(f));if(!control)return;
      pendingEventCriteria.add(control.field);renderEventCriteria();sync();measure();focusAfterReset(ui[control.prefix+'Value']);
    }
  }
  function acceptTurn({report=false}={}){
    if(eventCriteriaActive())return acceptEventCriteria({report});
    const current=condition(),input=ui.scenarioTurn;
    if(mode!=='events'||!current?.editable||!host.canEdit()) return true;
    input.setCustomValidity('');input.removeAttribute('aria-invalid');
    const turn=input.value===''?NaN:Number(input.value);
    if(!Number.isInteger(turn)||turn<1||turn>99){
      input.setCustomValidity('턴은 1~99의 정수로 입력해주세요.');input.setAttribute('aria-invalid','true');say('턴은 1~99의 정수로 입력해주세요.');
      if(report){host.open();chooseTool('deployment');fieldsPage=fieldsPages.findIndex(groups=>groups.some(group=>containsElement(group,input)));showFieldsPage();showPage('fields');input.reportValidity();}
      return false;
    }
    if(current.turn!==turn){current.turn=turn;host.onChange('event',current);}
    // Keep the focused input in place while labels and map markers update.
    updateEventLabels();
    say();sync();return true;
  }
  function renderObjective(){
    const current=objective();ui.scenarioObjectiveDescription.hidden=!eventIndex?.startsWith('objective:')||!current;
    ui.scenarioObjectiveFields.hidden=ui.scenarioObjectiveDescription.hidden||!showDeadline();
    ui.scenarioDeadline.value=current?String(current.deadline):'';
    ui.scenarioDeadline.setCustomValidity('');ui.scenarioDeadline.removeAttribute('aria-invalid');
    renderCriteria();describeObjective();
  }
  function describeObjective(){
    const current=objective(),deadline=current?.deadline??0;
    ui.scenarioDeadlineRule.textContent=deadline?`${deadline+1}턴부터 패배`:'추가 제한 없음';
    const text=customCriteria(current)?{...criteriaPurpose(criteriaFields(current),deadline,objectiveContext())}:{victory:current?.purpose.victory??'',defeat:current?`${current.purpose.defeat}${deadline?` 또는 ${deadline+1}턴 이상`:''}`:''};
    if(customCriteria(current))for(const outcome of ['victory','defeat'])text[outcome]=text[outcome]
      .replace(/(\d+)번기체(있음|없음)/g,(_,id,comparison)=>`${model().units.find(row=>row.recordIndex===Number(id))?.name??`${id}번 기체`} ${comparison}`)
      .replace(/(\d+)번파일럿(있음|없음)/g,(_,id,comparison)=>`${model().pilots.find(row=>row.recordIndex===Number(id))?.name??`${id}번 파일럿`} ${comparison}`);
    ui.scenarioVictoryText.textContent=text.victory;ui.scenarioDefeatText.textContent=text.defeat;
    ui.scenarioVictoryText.title=text.victory;ui.scenarioDefeatText.title=text.defeat;
    ui.scenarioObjectiveNote.textContent=current?.criteriaEditable?'적·아군 수는 기존 전멸 판정의 집계':'기존 승패 우선 · 0은 추가 제한 없음';
  }
  function acceptDeadline({report=false}={}){
    const current=objective(),input=ui.scenarioDeadline;
    if(!current?.editable||!host.canEdit()||!eventIndex?.startsWith('objective:'))return true;
    input.setCustomValidity('');input.removeAttribute('aria-invalid');
    const deadline=input.value===''?NaN:Number(input.value);
    if(!Number.isInteger(deadline)||deadline<0||deadline>98){
      input.setCustomValidity('추가 턴 제한은 0~98의 정수입니다.');input.setAttribute('aria-invalid','true');say('추가 턴 제한은 0~98의 정수입니다.');
      if(report){host.open();chooseTool('deployment');fieldsPage=fieldsPages.findIndex(groups=>groups.some(group=>containsElement(group,input)));showFieldsPage();showPage('fields');input.reportValidity();}
      return false;
    }
    if(customCriteria(current)){try{criteriaPurpose(criteriaFields(current),deadline,objectiveContext());}catch{return criteriaError(input,'목적 문구가 18자를 넘습니다. 조건을 줄이거나 간단하게 해주세요.',report);}}
    if(current.deadline!==deadline){current.deadline=deadline;host.onChange('objective',current);}
    ui.scenarioObjectiveFields.hidden=!showDeadline();describeObjective();say();sync();return true;
  }
  function renderCriteria(){
    regionPicker=null;
    const current=objective(),shown=Boolean(criteriaActive());
    const units=criterionUnits(),pilots=criterionPilots();
    criteriaGroups().forEach(group=>{group.hidden=!shown;});
    for(const [field,id]of [['objectivePriority','scenarioObjectivePriority'],['victoryJoin','scenarioVictoryJoin'],['defeatJoin','scenarioDefeatJoin']]){ui[id].value=String(current?.[field]??0);ui[id].setCustomValidity('');ui[id].removeAttribute('aria-invalid');}
    for(const {field,prefix}of ruleControls){
      const c=current?.criteriaEditable?decodeObjectiveRule(current[field],objectiveContext()):null;
      ui[prefix+'Group'].hidden=!shown||!c&&!pendingCriteria.has(field);
      ui[prefix+'Query'].replaceChildren(...[['','대상 선택'],['enemyCount','적군 수'],['allyCount','아군 수'],['turn','턴'],...units.length?[['unitKind','기체 종류']]:[],...pilots.length?[['pilotLookup','파일럿']]:[],...regionAvailable()?[['factionRegion','위치']]:[]].map(([value,label])=>option(value,label)));
      ui[prefix+'Query'].value=c?.query??'';
      configureCriteriaKind(prefix,c?.query??'',c?.comparison,c?.value,c??null);
      const input=ui[prefix+'Value'];input.value=c&&!structuredQuery(c.query)?String(c.value):'';input.min=c?.query==='turn'?'1':'0';input.max=c?.query==='turn'?'99':'74';
      for(const suffix of ['Query','Comparison','Value','Unit']){ui[prefix+suffix].setCustomValidity('');ui[prefix+suffix].removeAttribute('aria-invalid');}
    }
    lastCriteriaControl=null;
  }
  function configureCriteriaKind(prefix,query,comparison=null,value=null,regionRule=undefined){
    const isEntity=entityQuery(query),isRegion=query==='factionRegion',isPilot=query==='pilotLookup',choices=isEntity||isRegion?[['present','있음'],['absent','없음']]:[['eq','같음'],['ne','다름'],['le','이하'],['ge','이상']];
    const control=ui[prefix+'Comparison'],previous=comparison??control.value;
    control.replaceChildren(...choices.map(([value,label])=>option(value,label)));control.value=choices.some(([value])=>value===previous)?previous:choices[0][0];
    const entries=isPilot?criterionPilots():criterionUnits(),kind=isPilot?'파일럿':'기체',names=new Map();
    for(const row of entries)if(row.name)names.set(row.name,(names.get(row.name)??0)+1);
    ui[prefix+'Unit'].replaceChildren(option('',`${kind} 선택`),...entries.map(row=>{
      const name=row.name||`${kind} #${row.recordIndex}`,label=names.get(row.name)>1?`${name} · #${row.recordIndex}`:name;
      const item=option(row.recordIndex,label);item.title=`${name} · ${kind} #${row.recordIndex}`;return item;
    }));
    ui[prefix+'Unit'].value=isEntity&&entries.some(row=>row.recordIndex===value)?String(value):'';
    const caption=prefix.replace('scenarioVictoryRule','승리 조건 ').replace('scenarioDefeatRule','패배 조건 ');
    ui[prefix+'Unit'].setAttribute('aria-label',`${caption} ${isPilot?'파일럿':'기체 종류'} 선택`);
    ui[prefix+'UnitInfo'].setAttribute('aria-label',`${caption} ${isPilot?'파일럿':'기체 종류'} 판정 설명`);
    ui[prefix+'UnitInfo'].title=`${isPilot?'파일럿':'기체 종류'} 판정 설명`;
    ui[prefix+'Value'].hidden=isEntity||isRegion;ui[prefix+'UnitGroup'].hidden=!isEntity;ui[prefix+'Group'].dataset.query=query;
    const regionControl=regionControls.get(ruleControls.find(c=>c.prefix===prefix).field);
    if(regionRule!==undefined)regionControl.set(regionRule?.query==='factionRegion'?regionRule:null);
    regionControl.setVisible(isRegion);
  }
  function criteriaError(input,text,report){
    input.setCustomValidity(text);input.setAttribute('aria-invalid','true');say(text);
    if(report){host.open();chooseTool('deployment');fieldsPage=fieldsPages.findIndex(groups=>groups.some(group=>containsElement(group,input)));showFieldsPage();showPage('fields');input.focus();input.reportValidity();}
    return false;
  }
  function validateCriteria(wanted,input,report=false){
    try{snapshotScenarioCriteria(wanted,objectiveContext());criteriaPurpose(wanted,objective().deadline,objectiveContext());return true;}
    catch{return criteriaError(input,'목적 문구가 18자를 넘거나 조건이 비어 있습니다. 조건을 간단하게 해주세요.',report);}
  }
  function acceptCriteria({report=false,trigger=null,ignore=null}={}){
    const current=objective();if(!criteriaActive()||!host.canEdit())return true;
    if(trigger)regionPicker=null;
    if(trigger)lastCriteriaControl=trigger;
    const wanted=criteriaFields(current);
    const changedRule=ruleControls.find(({prefix})=>trigger===ui[prefix+'Query']);
    if(changedRule){
      const {field,prefix}=changedRule,query=trigger.value,previous=ui[prefix+'Group'].dataset.query;
      if(query!==previous){
        if(structuredQuery(query)||structuredQuery(previous)){ui[prefix+'Value'].value='';ui[prefix+'Unit'].value='';regionControls.get(field).set();pendingCriteria.add(field);}
        configureCriteriaKind(prefix,query);sync();measure();
      }
    }
    for(const [field,id]of [['objectivePriority','scenarioObjectivePriority'],['victoryJoin','scenarioVictoryJoin'],['defeatJoin','scenarioDefeatJoin']]){const input=ui[id];input.setCustomValidity('');input.removeAttribute('aria-invalid');wanted[field]=Number(input.value);}
    for(const {field,prefix}of ruleControls){
      if(field===ignore||!current[field]&&!pendingCriteria.has(field))continue;
      const query=ui[prefix+'Query'].value;
      const isEntity=entityQuery(query),comparison=ui[prefix+'Comparison'].value,input=ui[prefix+(isEntity?'Unit':'Value')],value=input.value===''?NaN:Number(input.value),min=query==='turn'?1:0,max=query==='turn'?99:74;
      if(!isEntity){input.min=String(min);input.max=String(max);}
      for(const suffix of ['Query','Comparison','Value','Unit']){ui[prefix+suffix].setCustomValidity('');ui[prefix+suffix].removeAttribute('aria-invalid');}
      if(!['enemyCount','allyCount','turn','unitKind','pilotLookup',...regionAvailable()?['factionRegion']:[]].includes(query))return criteriaError(ui[prefix+'Query'],'검사 대상을 선택해주세요.',report);
      if(query==='factionRegion'){
        const result=regionControls.get(field).read(comparison==='present');
        if(!result.valid)return criteriaError(result.input,result.message,report);
        try{wanted[field]=encodeObjectiveRule(query,comparison,result.value,objectiveContext());}catch{return criteriaError(ui[prefix+'Comparison'],'맵과 위치 조건의 연결을 확인할 수 없습니다.',report);}
        continue;
      }
      const entities=query==='pilotLookup'?criterionPilots():criterionUnits();
      if(isEntity?!entities.some(row=>row.recordIndex===value):!Number.isInteger(value)||value<min||value>max)return criteriaError(input,isEntity?`${query==='pilotLookup'?'파일럿':'기체 종류'}를 선택해주세요.`:`기준값은 ${min}~${max}의 정수입니다.`,report);
      try{wanted[field]=encodeObjectiveRule(query,comparison,value,objectiveContext());}catch{return criteriaError(ui[prefix+'Comparison'],'검사 대상과 비교를 선택해주세요.',report);}
    }
    const control=trigger??lastCriteriaControl??ui.scenarioObjectivePriority;
    if(!validateCriteria(wanted,control,report))return false;
    if(CRITERIA_FIELDS.some(field=>current[field]!==wanted[field])){Object.assign(current,wanted);for(const field of CRITERIA_FIELDS)if(current[field])pendingCriteria.delete(field);host.onChange('objective',current);}
    describeObjective();say();sync();draw();return true;
  }
  function changeCriteriaRule(field,remove){
    if(!criteriaActive()||!host.canEdit())return;
    const current=objective(),outcome=field.startsWith('victory')?'Victory':'Defeat',members=ruleControls.filter(c=>c.field.startsWith(outcome.toLowerCase()));
    const chosen=remove?members.find(c=>c.field===field):members.find(c=>!current[c.field]&&!pendingCriteria.has(c.field));if(!chosen)return;
    if(remove&&pendingCriteria.has(field)&&!current[field]){
      pendingCriteria.delete(field);ui[chosen.prefix+'Group'].hidden=true;say();sync();measure();focusAfterReset(ui[`scenario${outcome}Add`]);return;
    }
    if(!acceptCriteria({report:true,ignore:remove?field:null}))return;
    if(remove){
      if(members.filter(c=>current[c.field]).length<=1)return;
      const wanted={...criteriaFields(current),[chosen.field]:0};
      if(!validateCriteria(wanted,ui[chosen.prefix+'Remove']))return;
      pendingCriteria.delete(chosen.field);Object.assign(current,wanted);host.onChange('objective',current);
    }else pendingCriteria.add(chosen.field);
    renderCriteria();describeObjective();say(remove?'':'검사 대상과 기준값을 입력해주세요.');sync();measure();
    const control=remove?ui[`scenario${outcome}Add`]:ui[chosen.prefix+'Query'];
    fieldsPage=fieldsPages.findIndex(groups=>groups.some(group=>containsElement(group,control)));showFieldsPage();showPage('fields');control.focus();
  }
  function validateAll(){return acceptSpawn({report:true})&&acceptCriteria({report:true})&&acceptDeadline({report:true})&&acceptTurn({report:true})&&accept({report:true});}
  function chooseTool(next){
    // Internal error/focus paths retain their current editing context.
    if(next==='tile')mode='tile';
    if(next!=='deployment')regionPicker=null;
    tool=mode==='tile'?'tile':'deployment';brush=false;ui.scenarioBrush.setAttribute('aria-pressed','false');
    renderMode();measure();sync();
  }
  function chooseMode(next){
    if(next===mode||!modeEntries(next).length||!host.canEdit()||!validateAll())return;
    regionPicker=null;mode=next;eventIndex=conditionIndex=selected=null;fieldsPage=0;brush=false;ui.scenarioBrush.setAttribute('aria-pressed','false');
    if(next!=='tile'){planeIndex=0;if(model().mapFor(scene()?.mapIndex))mapIndex=scene().mapIndex;}
    ui.scenarioPlaneSelector.value=String(planeIndex);renderEvents();renderMap();
    if(next==='events'||next==='objective')showPage('fields');else showPage('map');
  }
  function renderMap() {
    const current = plane(); if (current) { x = Math.min(x, current.width - 1); y = Math.min(y, current.height - 1); }
    const bank = map() ? model().bankFor(map()) : null;
    ui.scenarioTileSelector.replaceChildren(...(bank ? Array.from(bank.terrainIds, (id, tileId) => option(tileId, `#${tileId} · ${terrainName(id)}`)) : []));
    paintedTile = model().tile(mapIndex, planeIndex, x, y) ?? 0;
    ui.scenarioTileSelector.value = String(paintedTile);
    previewTile();
    renderDeployment(); describeCell(); measure(); draw();
  }
  function previewTile() {
    const bank = map() && model().bankFor(map());
    const orientation = plane()?.orientations?.[y * plane().width + x] ?? 0;
    const pixels = bank && model().graphics.tile(bank, paintedTile, orientation);
    ui.scenarioTilePreview.hidden = !paintTilePreview(ui.scenarioTilePreview, pixels);
    const text=`${terrainName(terrainId(paintedTile))} · #${paintedTile}`;
    ui.scenarioTilePreview.setAttribute('aria-label',text);ui.scenarioTileName.textContent=terrainName(terrainId(paintedTile));ui.scenarioTileName.title=text;
  }
  function refresh() {
    const m = model();
    const supportedObjective=scene=>m.objectives.some(row=>row.physicalIndex===scene.physicalIndex&&row.editable);
    const scenes = sortScenarioSelections(m.scenarios.filter(scene => (scene.chapter?.source === 'user-bin-scenario-chapter'
      || scene.placements.length || scene.conditions?.length || supportedObjective(scene)) && m.mapFor(scene.mapIndex)));
    if (!m.mapFor(mapIndex)) { const first = scenes.find(scene => scene.placements.some(item => item.editable))??scenes.find(supportedObjective); mapIndex = first?.mapIndex ?? m.maps[0]?.mapIndex ?? null; scenarioIndex = first?.physicalIndex ?? null; }
    ui.scenarioSelector.replaceChildren(option('', '시나리오 선택'), ...scenes.map(scene => {
      const item = option(scene.physicalIndex, scenarioSelectionLabel(scene));
      item.title = scenarioSelectionDescription(scene); return item;
    }));
    ui.scenarioSelector.value = scenarioIndex === null ? '' : String(scenarioIndex);
    ui.scenarioSelector.title = scenarioSelectionDescription(scene());
    ui.scenarioSelector.setAttribute('aria-label', `시나리오 선택. ${scenarioSelectionDescription(scene())}`);
    ui.scenarioMapSelector.replaceChildren(...m.maps.map(item => option(item.mapIndex, `맵 #${aliasText(item.mapSlots)}`)));
    ui.scenarioMapSelector.value = mapIndex === null ? '' : String(m.mapFor(mapIndex).mapIndex);
    ui.scenarioPlaneSelector.value = String(planeIndex);
    renderEvents();renderMap();
  }
  function accept({ report = false } = {}) {
    const current = row();
    if (!current?.editable || !host.canEdit() || planeIndex !== 0) return true;
    let invalid = null;
    const wanted = {};
    for (const [field, input] of [['x', ui.scenarioX], ['y', ui.scenarioY]]) {
      input.setCustomValidity(''); input.removeAttribute('aria-invalid');
      wanted[field] = input.value === '' ? NaN : Number(input.value);
      if (!Number.isInteger(wanted[field]) || wanted[field] < 0 || wanted[field] >= current[field === 'x' ? 'width' : 'height'] || !input.validity.valid) invalid ??= input;
    }
    if (invalid) {
      invalid.setCustomValidity('맵 범위 안의 정수를 입력해주세요.'); invalid.setAttribute('aria-invalid', 'true');
      say('맵 범위 안의 정수를 입력해주세요.');
      if (report) { host.open(); chooseTool('deployment'); fieldsPage = fieldsPages.findIndex(groups => groups.some(group => containsElement(group,invalid))); showFieldsPage(); showPage('fields'); invalid.reportValidity(); }
      return false;
    }
    wanted.rewardSelector = Number(ui.scenarioReward.value);
    if (!(Number.isInteger(wanted.rewardSelector) && (wanted.rewardSelector >= 0 && wanted.rewardSelector < 48 || wanted.rewardSelector === 255))) return false;
    const changed = Object.keys(wanted).some(field => current[field] !== wanted[field]);
    Object.assign(current, wanted);ui.scenarioReward.title=ui.scenarioReward.selectedOptions?.[0]?.title??'';say(); sync(); draw();
    const chosen = ui.scenarioDeploymentSelector.querySelector(`option[value="${current.recordIndex}"]`);
    if (chosen) {chosen.textContent = placementLabel(current,placements().indexOf(current));chosen.title=placementDescription(current);}
    if (changed) host.onChange('deployment', current);
    return true;
  }
  function move() {
    const current = row(); if (mode!=='placement' || !host.canEdit() || !current?.editable || planeIndex !== 0) return;
    ui.scenarioX.value = String(x); ui.scenarioY.value = String(y); accept();
  }
  function applyTile() {
    const current = cell();
    if (!host.canEdit() || !current || !Number.isInteger(paintedTile) || paintedTile < 0 || paintedTile > 1023) return;
    if (model().exportMap().length >= 20000 && !modified(current, ['tileId'])) { say('한 번에 바꿀 수 있는 타일은 20,000칸입니다.'); return; }
    if (current.tileId !== paintedTile) { current.tileId = paintedTile; host.onChange('map', current); }
    describeCell(); sync(); draw();
  }
  function selectCell(cx, cy, { clicked = false } = {}) {
    const current = plane(); if (!current) return;
    x = Math.max(0, Math.min(current.width - 1, cx)); y = Math.max(0, Math.min(current.height - 1, cy));
    if(clicked&&regionPicker){describeCell();selectRegionPoint();return;}
    if(clicked&&mode==='events'&&planeIndex===0){
      const target=shownPlacements().find(item=>item.x===x&&item.y===y);
      if(target){openRelatedDeployment(target,true);return;}
    }
    if (clicked && mode === 'placement' && planeIndex === 0 && !eventIndex?.startsWith('objective:')) {
      const occupied = shownPlacements().filter(item => item.x === x && item.y === y);
      if (occupied.length) {
        if(!validateAll())return;
        const next=(occupied.findIndex(item=>item.recordIndex===selected)+1)%occupied.length;
        selected=occupied[next].recordIndex;renderDeployment();
      }
    }
    describeCell(); previewTile(); if (clicked && tool === 'tile' && brush) applyTile(); draw();
  }
  function openRelatedDeployment(target=relatedPlacements().find(item=>positioned(item)&&model().mapFor(item.mapIndex)),edit=false){
    if(!target||!positioned(target)||!host.canEdit()||!model().mapFor(target.mapIndex)||!validateAll())return;
    mode='placement';eventIndex=target.waveIndex??'all';conditionIndex=null;selected=target.recordIndex;
    mapIndex=target.mapIndex;planeIndex=0;x=target.x;y=target.y;fieldsPage=0;regionPicker=null;
    brush=false;ui.scenarioBrush.setAttribute('aria-pressed','false');renderEvents();renderMap();
    if(edit&&target.editable)focusAfterReset(ui.scenarioX);
    else{showPage('map');ui.scenarioMapCanvas.focus({preventScroll:true});}
  }
  ui.scenarioRelatedDeploymentButton?.addEventListener('click',()=>openRelatedDeployment());
  ui.scenarioFactionSelector?.addEventListener('change',()=>{
    const wanted=ui.scenarioFactionSelector.value;
    if(!host.canEdit()||wanted!=='all'&&!Object.hasOwn(filterNames,wanted)||!validateAll()){ui.scenarioFactionSelector.value=faction;return;}
    faction=wanted;selected=null;renderEvents();renderMap();
  });
  function startRegionPick(control){
    if(!criteriaActive()||!regionAvailable()||!host.canEdit())return;
    const target=objectiveContext().regionContext;if(!target||!model().mapFor(target.mapIndex))return;
    mapIndex=target.mapIndex;planeIndex=0;
    ui.scenarioMapSelector.value=String(model().mapFor(mapIndex).mapIndex);
    ui.scenarioPlaneSelector.value='0';renderMap();
    regionPicker={control,first:null};
    say(control.pointsNeeded===2?'영역의 시작 칸과 끝 칸을 선택해주세요. Esc로 취소합니다.':'검사할 한 칸을 선택해주세요. Esc로 취소합니다.');
    measure();showPage('map');ui.scenarioMapCanvas.focus({preventScroll:true});
  }
  function selectRegionPoint(){
    const picker=regionPicker;if(!picker)return;
    if(!host.canEdit()||!criteriaActive()||!regionAvailable()){regionPicker=null;say();draw();return;}
    if(picker.control.pointsNeeded===2&&!picker.first){picker.first={x,y};say('영역의 끝 칸을 선택해주세요. Esc로 취소합니다.');draw();return;}
    regionPicker=null;
    picker.control.applyMapSelection(picker.first??{x,y},{x,y});
    focusAfterReset(picker.control.side.value===''?picker.control.side:picker.control.inputs.x0);
    draw();
  }
  function cancelRegionPick(){
    const control=regionPicker?.control;if(!control)return;
    regionPicker=null;say();focusAfterReset(control.pick);draw();
  }
  ui.scenarioMapCanvas.addEventListener('click', event => {
    const current = plane(), rect = ui.scenarioMapCanvas.getBoundingClientRect(); if (!current || !rect.width || !rect.height) return;
    selectCell(Math.floor((event.clientX - rect.left) / rect.width * current.width), Math.floor((event.clientY - rect.top) / rect.height * current.height), { clicked: true });
  });
  ui.scenarioMapCanvas.addEventListener('keydown', event => {
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (arrows[event.key]) { event.preventDefault(); const [dx, dy] = arrows[event.key]; selectCell(x + dx, y + dy); }
    if(event.key==='Escape'&&regionPicker){event.preventDefault();cancelRegionPick();return;}
    if (event.key === 'Enter') { event.preventDefault(); if(regionPicker)selectRegionPoint();else if (tool === 'tile') applyTile(); else move(); }
  });
  ui.scenarioEditorPanel.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&regionPicker){event.preventDefault();cancelRegionPick();}
  });
  ui.scenarioSelector.addEventListener('change', () => {
    if(!acceptSpawn({report:true})||!acceptCriteria({report:true})||!acceptDeadline({report:true})||!acceptTurn({report:true})||!accept({report:true})){ui.scenarioSelector.value=String(scenarioIndex??'');return;}
    scenarioIndex = ui.scenarioSelector.value === '' ? null : Number(ui.scenarioSelector.value);
    const scene = model().scenarios.find(item => item.physicalIndex === scenarioIndex);
    if (scene && model().mapFor(scene.mapIndex)) { mapIndex = scene.mapIndex; planeIndex = 0; selected = null; x = y = 0; }
    eventIndex=conditionIndex=null;faction='all';refresh();
  });
  ui.scenarioEventSelector.addEventListener('change',()=>{
    if(!acceptSpawn({report:true})||!acceptCriteria({report:true})||!acceptDeadline({report:true})||!acceptTurn({report:true})||!accept({report:true})){ui.scenarioEventSelector.value=eventIndex??'';return;}
    eventIndex=ui.scenarioEventSelector.value;conditionIndex=selected=null;const current=wave();if(current&&model().mapFor(current.mapIndex))mapIndex=current.mapIndex;
    else if(mode==='placement'&&eventIndex==='all'&&model().mapFor(scene()?.mapIndex))mapIndex=scene().mapIndex;
    renderEvents();renderMap();
  });
  for(const id of ['scenarioSpawnTemplate','scenarioSpawnTurn','scenarioSpawnX','scenarioSpawnY','scenarioSpawnReward'])for(const type of ['input','change'])ui[id].addEventListener(type,()=>acceptSpawn());
  ui.scenarioSpawnToggle.addEventListener('click',()=>{
    const current=reinforcement();if(!host.canEdit()||!current?.editable||!spawnMode()||planeIndex!==0)return;
    if(current.enabled){current.enabled=0;if(!current.original.enabled)Object.assign(current,current.original);}
    else{current.enabled=1;current.x=x;current.y=y;}
    renderSpawn();sync();draw();measure();host.onChange('reinforcement',current);
  });
  ui.scenarioSpawnReset.addEventListener('click',()=>{const current=reinforcement();if(!host.canEdit()||!current)return;Object.assign(current,current.original);renderSpawn();sync();draw();host.onChange('reinforcement',current);focusAfterReset(ui.scenarioSpawnTurn,ui.scenarioSpawnToggle);});
  ui.scenarioSpawnMove.addEventListener('click',()=>{if(!reinforcement()?.enabled||planeIndex!==0)return;ui.scenarioSpawnX.value=String(x);ui.scenarioSpawnY.value=String(y);acceptSpawn();});
  ui.scenarioConditionSelector.addEventListener('change',()=>{if(!acceptTurn({report:true})){ui.scenarioConditionSelector.value=conditionIndex??'';return;}conditionIndex=ui.scenarioConditionSelector.value;renderCondition();sync();});
  for(const id of ['scenarioObjectivePriority','scenarioVictoryJoin','scenarioDefeatJoin'])ui[id].addEventListener('change',()=>acceptCriteria({trigger:ui[id]}));
  for(const {field,prefix}of ruleControls){
    for(const suffix of ['Query','Comparison','Value','Unit'])for(const type of suffix==='Value'?['input','change']:['change'])ui[prefix+suffix].addEventListener(type,()=>{
      acceptCriteria({trigger:ui[prefix+suffix]});
    });
    ui[prefix+'UnitInfo'].addEventListener('click',()=>{
      if(!criteriaActive())return;
      const text=ui[prefix+'Group'].dataset.query==='pilotLookup'?pilotExplanation:unitKindExplanation;
      say(ui.scenarioStatus.textContent===text?'':text);
    });
    ui[prefix+'Remove'].addEventListener('click',()=>changeCriteriaRule(field,true));
  }
  for(const outcome of ['Victory','Defeat'])ui[`scenario${outcome}Add`].addEventListener('click',()=>changeCriteriaRule(outcome.toLowerCase(),false));
  ui.scenarioCriteriaReset.addEventListener('click',()=>{const current=objective();if(!criteriaActive()||!host.canEdit())return;const wanted=criteriaFields(current.original);if(!validateCriteria(wanted,ui.scenarioCriteriaReset,true))return;pendingCriteria.clear();Object.assign(current,wanted);renderCriteria();describeObjective();say();sync();measure();host.onChange('objective',current);focusAfterReset(ui.scenarioObjectivePriority);});
  for(const type of ['input','change'])ui.scenarioDeadline.addEventListener(type,()=>acceptDeadline());
  ui.scenarioObjectiveReset.addEventListener('click',()=>{const current=objective();if(!current?.editable||!host.canEdit())return;ui.scenarioDeadline.value=String(current.original.deadline);if(acceptDeadline({report:true}))focusAfterReset(ui.scenarioDeadline,ui.scenarioObjectivePriority);});
  for(const type of ['input','change'])ui.scenarioTurn.addEventListener(type,()=>acceptTurn());
  ui.scenarioEventJoin.addEventListener('change',()=>acceptEventCriteria());
  ui.scenarioEventPhase.addEventListener('change',()=>{if(!acceptEventCriteria())ui.scenarioEventPhase.value=String(condition()?.eventPhase??0);measure();});
  for(const{field,prefix}of eventRuleControls){
    for(const suffix of ['Value','Comparison'])for(const type of suffix==='Value'?['input','change']:['change'])ui[prefix+suffix].addEventListener(type,()=>acceptEventCriteria());
    ui[prefix+'Remove'].addEventListener('click',()=>changeEventRule(field,true));
  }
  ui.scenarioEventAdd.addEventListener('click',()=>changeEventRule(null,false));
  ui.scenarioEventCriteriaReset.addEventListener('click',()=>{const current=condition();if(!eventCriteriaActive()||!host.canEdit())return;pendingEventCriteria.clear();Object.assign(current,Object.fromEntries(eventFields(current).map(field=>[field,current.original[field]])));if(current.eventExactTurnOnly)current.turn=current.original.turn;renderEvents();say();sync();measure();host.onChange('event',current);focusAfterReset(current.eventPhaseEditable?ui.scenarioEventPhase:ui.scenarioEventJoin);});
  ui.scenarioEventReset.addEventListener('click',()=>{const current=condition();if(!current?.editable||!host.canEdit())return;current.turn=current.original.turn;renderEvents();say();sync();host.onChange('event',current);focusAfterReset(ui.scenarioTurn);});
  ui.scenarioMapSelector.addEventListener('change', () => { if(!acceptSpawn({report:true})||!acceptCriteria({report:true})||!acceptDeadline({report:true})||!acceptTurn({report:true})||!accept({report:true})){ui.scenarioMapSelector.value=String(mapIndex);return;}mapIndex = Number(ui.scenarioMapSelector.value); scenarioIndex = null;mode='tile';eventIndex=conditionIndex=null;selected = null; x = y = 0; refresh();ui.scenarioMapSelector.closest?.('details')?.removeAttribute('open'); });
  ui.scenarioPlaneSelector.addEventListener('change', () => { if(!acceptSpawn({report:true})||!acceptCriteria({report:true})||!acceptDeadline({report:true})||!acceptTurn({report:true})||!accept({report:true})){ui.scenarioPlaneSelector.value=String(planeIndex);return;}regionPicker=null;planeIndex = Number(ui.scenarioPlaneSelector.value); if(planeIndex!==0&&mode==='placement'){mode='tile';eventIndex=conditionIndex=null;renderEvents();}brush = false; ui.scenarioBrush.setAttribute('aria-pressed', 'false'); renderMap(); });
  ui.scenarioDeploymentSelector.addEventListener('change', () => {
    if(!validateAll()){ui.scenarioDeploymentSelector.value=selected??'';return;}
    selected=ui.scenarioDeploymentSelector.value;const target=row();
    if(target&&model().mapFor(target.mapIndex)){mapIndex=target.mapIndex;ui.scenarioMapSelector.value=String(map().mapIndex);if(positioned(target)){x=target.x;y=target.y;}}
    renderMap();
  });
  for (const input of [ui.scenarioX, ui.scenarioY, ui.scenarioReward]) { input.addEventListener('input', () => accept()); input.addEventListener('change', () => accept()); }
  ui.scenarioMove.addEventListener('click', move);
  ui.scenarioRewardDetail.addEventListener('click',()=>{if(host.canEdit()&&row()&&validateAll())host.openReward?.(row().rewardSelector);});
  ui.scenarioDeploymentReset.addEventListener('click', () => { const current = row(); if (!host.canEdit() || !current?.editable) return; const changed = ['x', 'y', 'rewardSelector'].find(field => current[field] !== current.original[field]); Object.assign(current, current.original); renderDeployment(); draw(); host.onChange('deployment', current); focusAfterReset(changed === 'rewardSelector' ? ui.scenarioReward : changed === 'y' ? ui.scenarioY : ui.scenarioX); });
  for(const [next,id]of Object.entries(modeButtons))ui[id].addEventListener('click',()=>chooseMode(next));
  const tilePicker=createScenarioTilePicker({el:$,model,terrainName,selection:()=>({mapIndex,planeIndex,x,y,tileId:paintedTile}),choose:tileId=>{
    if(!host.canEdit())return;paintedTile=tileId;ui.scenarioTileSelector.value=String(tileId);previewTile();measure();
  }});
  ui.scenarioTileSelector.addEventListener('change', () => { paintedTile = Number(ui.scenarioTileSelector.value); previewTile(); });
  ui.scenarioApplyTile.addEventListener('click', applyTile);
  ui.scenarioBrush.addEventListener('click', () => { if (!host.canEdit()) return; brush = !brush; ui.scenarioBrush.setAttribute('aria-pressed', String(brush)); say(brush ? '누른 칸에 선택한 타일을 칠합니다.' : '칸 선택 → 타일 고르기 → 교체'); });
  ui.scenarioTileReset.addEventListener('click', () => { const current = cell(); if (!host.canEdit() || !current) return; current.tileId = current.original.tileId; describeCell();previewTile(); draw(); host.onChange('map', current); focusAfterReset(ui.scenarioTilePickerOpen); });
  ui.scenarioTerrainLink.addEventListener('click', () => host.openTerrain(terrainId(paintedTile)));
  ui.scenarioZoom.addEventListener('change', () => { zoom = Number(ui.scenarioZoom.value); draw(); });
  ui.scenarioMapPage.addEventListener('click', () => showPage('map'));
  ui.scenarioFieldsPage.addEventListener('click', () => showPage('fields'));
  ui.scenarioFieldsPrev.addEventListener('click', () => { fieldsPage--; showFieldsPage(); if(ui.scenarioFieldsPrev.disabled&&!ui.scenarioFieldsNext.disabled)ui.scenarioFieldsNext.focus({preventScroll:true}); });
  ui.scenarioFieldsNext.addEventListener('click', () => { fieldsPage++; showFieldsPage(); if(ui.scenarioFieldsNext.disabled&&!ui.scenarioFieldsPrev.disabled)ui.scenarioFieldsPrev.focus({preventScroll:true}); });
  ui.scenarioSelectionDescription?.closest?.('details')?.addEventListener('toggle', measureExplanation);
  function measureMapDetails(){
    const details=ui.scenarioMapSelector.closest?.('details'),popup=details?.querySelector('.scenario-map-options');if(!details?.open||!popup)return;
    popup.style.top='';popup.style.left='';popup.style.right='';
    const toolbar=ui.scenarioEditorPanel.querySelector('.scenario-toolbar').getBoundingClientRect(),rect=popup.getBoundingClientRect();
    popup.style.top=`${Math.max(8-toolbar.top,Math.min(rect.top-toolbar.top,window.innerHeight-rect.height-8-toolbar.top))}px`;
  }
  const mapDetails=ui.scenarioMapSelector.closest?.('details');mapDetails?.addEventListener('toggle',measureMapDetails);
  $('scenarioMapDetailsClose')?.addEventListener('click',()=>{if(mapDetails){mapDetails.open=false;mapDetails.querySelector('summary').focus({preventScroll:true});}});
  window.addEventListener('resize',measureMapDetails);
  window.addEventListener('resize', measure); document.fonts?.ready.then(measure);
  return Object.freeze({ refresh, sync, measure, validate: () => acceptSpawn({report:true})&&acceptCriteria({report:true})&&acceptDeadline({report:true})&&acceptTurn({report:true})&&accept({ report: true }),
    openCell: target => { mode='tile';mapIndex = target.mapIndex; planeIndex = target.plane; scenarioIndex = null; selected = null;
      x = target.x; y = target.y; refresh(); chooseTool('tile'); showPage('map'); ui.scenarioMapCanvas.focus(); },
    reset: () => { mode='placement';faction='all';regionPicker=null;pendingCriteria.clear();pendingEventCriteria.clear();mapIndex = selected = scenarioIndex = eventIndex=conditionIndex=null; planeIndex = 0; x = y = 0; brush = false; zoom = 1; ui.scenarioZoom.value = '1'; page = 'map'; chooseTool('deployment'); refresh(); },
    focus: (kind, id, fields = []) => {
      if(['deployment','event','reinforcement'].includes(kind))faction='all';
      if(kind==='reinforcement'){mode='events';
        const target=model().reinforcements.find(item=>item.recordIndex===id);if(!target)return false;
        scenarioIndex=target.physicalIndex;mapIndex=target.mapIndex;planeIndex=0;eventIndex=`reinforcement:${id}`;conditionIndex=selected=null;
        refresh();chooseTool('deployment');showPage('fields');
        const control=({turn:ui.scenarioSpawnTurn,x:ui.scenarioSpawnX,y:ui.scenarioSpawnY,rewardSelector:ui.scenarioSpawnReward,templateOffset:ui.scenarioSpawnTemplate}[fields[0]]??ui.scenarioSpawnToggle);
        fieldsPage=fieldsPages.findIndex(groups=>groups.some(group=>containsElement(group,control)));showFieldsPage();control.focus();
      }else if(kind==='objective'){mode='objective';
        const target=model().objectives.find(item=>item.recordIndex===id);if(!target)return false;
        scenarioIndex=target.physicalIndex;mapIndex=scene()?.mapIndex;planeIndex=0;eventIndex=`objective:${id}`;conditionIndex=selected=null;
        refresh();chooseTool('deployment');showPage('fields');
        const selectedRule=ruleControls.find(c=>c.field===fields[0]);
        const selectedKind=selectedRule&&target[selectedRule.field]?decodeObjectiveRule(target[selectedRule.field],objectiveContext())?.query:null;
        const control=selectedRule?(selectedKind==='factionRegion'?regionControls.get(selectedRule.field).inputs.x0:ui[selectedRule.prefix+(target[selectedRule.field]?(entityQuery(selectedKind)?'Unit':'Value'):'Query')]):({objectivePriority:ui.scenarioObjectivePriority,victoryJoin:ui.scenarioVictoryJoin,defeatJoin:ui.scenarioDefeatJoin}[fields[0]]??ui.scenarioDeadline);
        const activeControl=selectedRule&&!target[selectedRule.field]?ui[`scenario${selectedRule.field.startsWith('victory')?'Victory':'Defeat'}Add`]:control;
        fieldsPage=fieldsPages.findIndex(groups=>groups.some(group=>containsElement(group,activeControl)));showFieldsPage();activeControl.focus();
      }else if(kind==='event'){mode='events';const target=model().events.find(item=>item.recordIndex===id);if(!target)return false;scenarioIndex=target.physicalIndex;
        const current=scene();mapIndex=current.mapIndex;planeIndex=0;eventIndex=`event:${id}`;conditionIndex=id;selected=null;
        refresh();conditionIndex=id;ui.scenarioConditionSelector.value=id;renderCondition();chooseTool('deployment');showPage('fields');
        const eventControl=eventCriteriaActive()?(fields[0]==='eventPhase'&&target.eventPhaseEditable?ui.scenarioEventPhase:fields[0]==='eventJoin'?ui.scenarioEventJoin:ui[(eventRuleControls.find(c=>c.field===fields[0])?.prefix??'scenarioEventRule1')+'Value']):ui.scenarioTurn;
        fieldsPage=fieldsPages.findIndex(groups=>groups.some(group=>containsElement(group,eventControl)));showFieldsPage();eventControl.focus();
      }else if (kind === 'deployment') { mode='placement';const target = model().deployments.find(item => item.recordIndex === id); if (!target) return false;
        mapIndex = target.mapIndex; planeIndex = 0; scenarioIndex = target.physicalIndex;eventIndex=target.waveIndex??null;conditionIndex=null; selected = id; x = target.x; y = target.y; refresh(); chooseTool('deployment'); showPage('fields');
        const control = ({ x: ui.scenarioX, y: ui.scenarioY, rewardSelector: ui.scenarioReward }[fields[0]] ?? ui.scenarioDeploymentSelector);
        fieldsPage = fieldsPages.findIndex(groups => groups.some(group => containsElement(group,control))); showFieldsPage(); control.focus();
      } else { mode='tile';const target = model().rows('map').find(item => item.recordIndex === id); if (!target) return false;
        mapIndex = target.mapIndex; planeIndex = target.plane; scenarioIndex = null; x = target.x; y = target.y; refresh(); chooseTool('tile'); showPage('fields'); ui.scenarioTilePickerOpen.focus(); }
      return true;
    },
  });
}
