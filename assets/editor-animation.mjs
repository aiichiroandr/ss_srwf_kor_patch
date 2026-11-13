import {unitConstructionPreset} from './editor-unit-construction.mjs?v=20261113-alicecopies1';

// A per-launch channel transfers browser-owned Blobs; no ROM URL or persistence.
export function validateAnimationRuntime(descriptor) {
  if (descriptor?.gameId === "srwf-f") {
    if (!["b2a67ed2a409c95de7226d33f2ab934012e93199afb7284bb710c81b6f0223b9",
      "85b9cbf349c421d621f3a6e6819d94f9ee1405137430046469562a2176e798a3",
      "75555116f784115e7104c593fd990491ae182b9493d9f159201e17b3e3d88202"].includes(descriptor.baseTargetSha256))
      throw Error("현재 F 미리보기는 v0.5 a/b/c 폰트를 지원합니다.");
    return "f-current.json";
  }
  if (descriptor?.gameId !== "srwf-final")
    throw Error("F 또는 F 완결편의 검증한 ROM으로 롬에딧을 열어 주세요.");
  const supported = [
    "fd8df11fc7a933cea000d40695325fb290900c72b64f8b316e18b06afee8d73e",
    "9d22ab0ac45e2f8a3728c18825ddd2ea96035704a2ef56b291e077e93e885e23",
    "0fb10cbf4332f94c865c0e8d0a0c7234f8f6083bdbbb5a06198cebff871d195d",
  ];
  if (!supported.includes(descriptor.baseTargetSha256))
    throw Error("현재 미리보기는 F 완결편 v0.3 a/b/c를 지원합니다. 해당 ROM으로 롬에딧을 열어 주세요.");
  return "current.json";
}

export function animationCue(gameId) {
  const lead = 'FILE "preview.bin" BINARY\n  TRACK 01 MODE1/2352\n    INDEX 01 00:00:00\n';
  if (gameId === "srwf-f") return lead +
    '  TRACK 02 MODE2/2352\n    INDEX 00 22:34:18\n    INDEX 01 22:36:18\n  TRACK 03 MODE1/2352\n    INDEX 01 54:15:41\n  TRACK 04 AUDIO\n    INDEX 01 54:26:37\n';
  if (gameId === "srwf-final") return lead +
    '  TRACK 02 MODE2/2352\n    INDEX 00 17:03:64\n    INDEX 01 17:06:64\n  TRACK 03 AUDIO\n    INDEX 00 48:55:28\n    INDEX 01 48:57:28\n';
  throw Error("미리보기 게임 정보가 올바르지 않습니다.");
}

// Preview defaults, keyed by the stable TSR ids in F / Final. Names still
// come from the loaded ROM. These recommendations are not current save-game
// boarding assignments; scenario-only units retain their parsed ROM pairing.
const PILOT_FAMILIES = [
  [10,[1,9,22,23,334,335]], [24,[2,3]], [27,[4]], [22,[5,6]], [53,[7,8]],
  [71,[10]], [74,[11]], [76,[12,14,15]], [78,[13,108,395,396]], [49,[16]], [54,[17]],
  [98,[24,27,218,320]], [99,[25,28,219]], [100,[26,29,220]],
  [85,[30,31,32,217]], [95,[33]], [86,[34,35]], [87,[36,321]], [96,[37]],
  [105,[38,39]], [106,[40]], [107,[41]], [108,[42]], [109,[43]],
  [115,[44,45,46]], [126,[47,48,49,352,353,354]], [127,[50]], [120,[51]],
  [169,[52,53,54,55]], [170,[56,57,58]], [171,[59,60,61]], [172,[62,63,64]],
  [233,[67,68]], [235,[69,70]], [234,[71]], [238,[72]], [237,[73]], [236,[74]],
  [240,[75]], [241,[76]], [303,[77,79,221,319]], [302,[78,222,223,224]],
  [75,[80]], [23,[100,339]], [26,[101,102]], [56,[110]], [57,[341]],
  [11,[126,340,403]], [72,[128]], [129,[168,364]], [128,[169]],
  [12,[180,185,187,191,360]], [151,[202,203,204]], [154,[205,206]],
  [102,[225]], [175,[230]], [178,[231,420]], [181,[232]], [180,[233,318]],
  [182,[234]], [191,[235]], [218,[236]], [220,[237,421]],
  [194,[250,251,252,253,306,358,368,369,370]], [196,[254]], [200,[255,256]],
  [197,[257,258,307,357,361,366,367]], [198,[259]], [199,[270]],
  [204,[271,272,273,274,332]], [207,[275,276]], [208,[277,278]],
  [209,[279,280]], [210,[281,282]], [205,[283]], [206,[284]], [214,[285,286,333]],
  [211,[287,308]], [265,[303]], [266,[304,305]],
  [44,[313,408,409]],
];

export function animationChoices(weapons, units, pilots, deployments = [], gameId = null) {
  const availablePilots = pilots.filter(row => row.recordIndex > 0 && row.recordIndex <= 399
    && (row.recordIndex <= 307 || row.recordIndex >= 320) && row.role !== "hero-list")
      .map(row => ({ id: row.recordIndex, name: [302,303].includes(row.recordIndex)?'주인공 · 기본 견본':row.name || `파일럿 #${row.recordIndex}` }));
  const pilotIds = new Set(availablePilots.map(row => row.id)), assignments = new Map(), seen = new Set();
  // CA02 placements are authenticated ROM data. Repeated archive aliases must
  // not give one pilot more weight; roster references are resolved by the game.
  for (const row of deployments) {
    if (row.placementKind && row.placementKind !== 'fixed-unit' || !pilotIds.has(row.pilotId)) continue;
    const identity = row.recordIndex ?? `${row.physicalIndex}:${row.byteOffset}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    const matches = assignments.get(row.unitId) ?? new Map();
    matches.set(row.pilotId, (matches.get(row.pilotId) ?? 0) + 1);
    assignments.set(row.unitId, matches);
  }
  const ranked=id=>[...(assignments.get(id)??[])].sort((a,b)=>b[1]-a[1]||a[0]-b[0]).map(([id])=>id);
  const related=new Map();
  if(['srwf-f','srwf-final'].includes(gameId))for(const [pilotId,family] of PILOT_FAMILIES) {
    if(pilotIds.has(pilotId))for(const id of family)related.set(id,pilotId);
  }

  return {
    weapons: weapons.map(row => ({ id: row.recordIndex, name: row.name || `무기 #${row.recordIndex}`,
      mapType: row.mapType??null,
      clonedFrom:row.weaponClone?.sourceRecordIndex??null,
      owners: (row.owners || []).map(owner => owner.unit),
      conditional: units.some(unit => unit.weaponList?.entries?.some(entry => entry.weaponIndex === row.recordIndex && entry.requiresFlag)),
      unused: row.ownership === "unowned" || row.template === true })),
    units: units.filter(row => row.imageIndex > 0).map(row => {
      const donor=unitConstructionPreset(row.construction?.preset??row.pendingConstruction)?.donor;
      const base=donor??row.recordIndex;
      return {id:row.recordIndex,name:row.name||`기체 #${row.recordIndex}`,
        pilotCandidates:[...new Set([...(related.has(base)?[related.get(base)]:[]),...ranked(base)])],
        defaultPilotSource:donor?'construction-base':related.has(base)?'unit-default':'rom-assignment'};
    }),
    pilots: availablePilots,
  };
}

export function animationDefaultPilot(unitId, choices) {
  return choices.units.find(row => row.id === unitId)?.pilotCandidates?.find(id => choices.pilots.some(row => row.id === id)) ?? null;
}

export function validateAnimationSelection(selection, choices) {
  for (const [key, list] of [["weapon", choices.weapons], ["unit", choices.units], ["pilot", choices.pilots]]) {
    if (!Number.isSafeInteger(selection?.[key]) || !list.some(row => row.id === selection[key]))
      throw Error(`${key === "weapon" ? "무기" : key === "unit" ? "기체" : "파일럿"}를 목록에서 선택하세요.`);
  }
  return { weapon: selection.weapon, unit: selection.unit, pilot: selection.pilot };
}

export function animationEndStatus(code, applied, completed) {
  if (code !== 0 || !applied) return "재생 중단";
  return completed ? "재생 끝 · 다시 재생 가능" : "시연 시간 끝 · 연출 완료 미확인";
}

// 302/303 are runtime hero instances. A standalone demo has no player-created
// hero; native portrait alias 304 is its explicit, recorded default specimen.
// Passing the unbuilt runtime instance can leave BMESS waiting on invalid data.
export function animationRuntimeSelection(selection){
  return {...selection,pilot:[302,303].includes(selection.pilot)?304:selection.pilot};
}

export function createInlineAnimationPreview({button, panel, getSource, getChoices, getWeapon, getUnit = () => null,getPilot=()=>null,onSelection,getRevision=()=>0,onTimeline,onVisibility=()=>{},preferBattleCrop=false,getPreviewPage=()=>null}) {
  let frame, channel, timer, token,pendingSource,pendingUpdate;
  async function latestSource(){
    for(let attempt=0;attempt<3;attempt++){
      if(!pendingSource){const revision=getRevision();pendingSource={revision,promise:Promise.resolve(getSource())};}
      const pending=pendingSource;
      try{const source=await pending.promise;if(pending.revision===getRevision())return {...source,revision:pending.revision,choices:getChoices()};}
      catch(error){if(pending.revision===getRevision())throw error;}
      finally{if(pendingSource===pending)pendingSource=null;}
    }
    throw Error('편집값이 계속 바뀌었습니다. 입력을 마친 뒤 다시 재생하세요.');
  }
  globalThis.addEventListener?.('message',async event=>{
    if(event.origin!==location.origin||event.source!==frame?.contentWindow||event.data?.token!==token)return;
    if(event.data?.type==='preview-selection'&&['weapon','unit','pilot'].every(k=>Number.isSafeInteger(event.data.selection?.[k])))onSelection?.(event.data.selection);
    if(event.data?.type==='preview-timeline'){
      onTimeline?.(event.data.payload);
      if(event.data.payload?.kind==='end'&&event.data.payload.precomputed===true){
        const recipient=frame.contentWindow,launchToken=token,run=event.data.payload.run;
        requestAnimationFrame(()=>requestAnimationFrame(()=>{if(token===launchToken&&frame?.contentWindow===recipient)recipient.postMessage({type:'preview-timeline-ready',token,run},location.origin);}));
      }
    }
    if(event.data?.type==='preview-viewport-state'&&typeof event.data.cropped==='boolean')panel.dataset.battleView=event.data.cropped?'battle':'full';
    if(event.data?.type==='preview-source-check'&&Number.isSafeInteger(event.data.requestId)&&event.data.requestId>0){
      const launchToken=token,recipient=frame.contentWindow,requestId=event.data.requestId;
      try{const source=event.data.revision===getRevision()?{revision:getRevision(),unchanged:true}:await latestSource();if(token===launchToken&&frame?.contentWindow===recipient)recipient.postMessage({type:'preview-source',token,requestId,...source},location.origin);}
      catch(error){if(token===launchToken&&frame?.contentWindow===recipient)recipient.postMessage({type:'preview-source',token,requestId,error:error.message||'최신 편집본을 준비하지 못했습니다.'},location.origin);}
    }
  });
  const viewport=()=>frame?.contentWindow?.postMessage({type:'preview-viewport',token,mobile:preferBattleCrop||globalThis.matchMedia?.('(max-width:760px)').matches===true},location.origin);
  globalThis.addEventListener?.('resize',viewport);
  const visibility = paused => frame?.contentWindow?.postMessage({type:"preview-visibility",token,paused},location.origin);
  const hide = () => {
    visibility(true); panel.hidden = true;
    onVisibility(false);
    button.setAttribute("aria-checked","false"); button.textContent = "미리보기 OFF";
  };
  const close = () => {
    hide(); clearTimeout(timer); channel?.close(); channel = null;
    frame?.remove(); frame = null; token = null; pendingSource=null;pendingUpdate=null;panel.replaceChildren();
  };
  const queueUpdate = selection => {
    if(!frame)return;
    if(pendingUpdate){pendingUpdate.selection ||= selection;return;}
    const update={recipient:frame.contentWindow,token,selection};pendingUpdate=update;
    // Rendering can select several records before the edit revision advances.
    // Send one catalog and the final selection after that synchronous work.
    queueMicrotask(()=>{
      if(pendingUpdate!==update)return;pendingUpdate=null;
      if(token!==update.token||frame?.contentWindow!==update.recipient)return;
      update.recipient?.postMessage({type:update.selection?'select-weapon':'preview-choices',token,revision:getRevision(),choices:getChoices(),
        ...(update.selection?{weapon:getWeapon(),unit:getUnit(),pilot:getPilot()}:{})},location.origin);
    });
  };
  const select = () => queueUpdate(true);
  const refreshChoices = () => queueUpdate(false);
  const show = () => {
    if(!frame&&preferBattleCrop&&panel.dataset)panel.dataset.battleView='battle';
    panel.hidden = false; button.setAttribute("aria-checked","true"); button.textContent = "미리보기 ON";
    onVisibility(true);
    if (frame) { visibility(false); return; }
    if (!crossOriginIsolated) {
      panel.textContent = "미리보기 실행 환경을 준비하지 못했습니다. 편집값을 저장한 뒤 페이지를 새로 열어 주세요.";
      return;
    }
    token = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2,"0")).join("");
    channel = new BroadcastChannel(`srwf-animation-${token}`);
    let pending, source;
    const fail = text => { clearTimeout(timer); channel?.close(); channel=null; frame?.remove(); frame=null; panel.textContent=text; };
    channel.onmessage = async ({data}) => {
      if (data?.type === "received") { clearTimeout(timer); channel?.close();channel=null;return; }
      if (data?.type !== "ready") return;
      const launchToken=token;
      try {
        source ??= await (pending ??= latestSource());
        // Executable/verified resources are accepted only from this parent
        // window, never from a BroadcastChannel sender claiming verification.
        if (token===launchToken && channel) frame.contentWindow.postMessage({type:'preview-source-initial',token,...source,weapon:getWeapon(),unit:getUnit(),pilot:getPilot(),paused:panel.hidden},location.origin);
      } catch(error) { if(token===launchToken)fail(error.message); }
    };
    timer=setTimeout(()=>fail("ROM 연결 시간이 초과됐습니다. 미리보기를 껐다 켜세요."),120000);
    frame=document.createElement("iframe"); frame.title="선택한 무기 연출";
    frame.addEventListener('load',viewport);
    const localPage=getPreviewPage();
    const page=localPage?new URL(localPage,location.href):new URL('../weapon-preview/',import.meta.url);
    if(localPage&&page.origin!==location.origin){fail('미리보기 페이지의 출처가 다릅니다.');return;}
    page.search=`embedded=1&v=20261110-part2${onTimeline?'&timeline=1':''}`;page.hash=`handoff=${token}`;
    frame.src=page.href;
    panel.replaceChildren(frame);
  };
  button.addEventListener("click", () => panel.hidden ? show() : hide());
  close();
  return {close,hide,select,refreshChoices,show,invalidate:()=>frame?.contentWindow?.postMessage({type:'preview-source-invalidated',token,revision:getRevision()},location.origin)};
}
