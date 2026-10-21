import {MobilePause} from './mobile-pause.mjs?mobile=9';
import {formatPerformance} from "./performance-probe.mjs?mobile=9";
import {executionProfile, isMobileDevice} from "./mobile-profile.mjs?mobile=9";
import {MobileSpeedGuard} from "./mobile-speed-guard.mjs?mobile=9";
import {selectRuntime} from "./runtime-selection.mjs?mobile=9";
import {createIntermission} from "./intermission.mjs";
import {readSave, writeSave, exportBackup, importBackup, validateBackup, lockSave} from "./saves.mjs";
const $ = id => document.getElementById(id);
const canvas = $("screen"), ctx = canvas.getContext("2d");
const mobileDevice = isMobileDevice(navigator);
document.documentElement.classList.toggle("mobile-device",mobileDevice);
$("mobile-options").hidden = !mobileDevice;
$("mobile-optimize").checked = mobileDevice;
$("mobile-preload").checked=mobileDevice && Number(navigator.deviceMemory)>=8;
$("performance-panel").hidden = !mobileDevice;
let activeProfile = executionProfile(navigator);
let mobilePause=null, manualPaused=false;
$("pause-game").hidden=!mobileDevice;
$("pause-game").onclick=()=>{
  if(!mobilePause)return;
  manualPaused=!manualPaused;
  $("pause-game").setAttribute('aria-pressed',String(manualPaused));
  $("pause-game").textContent=manualPaused?'▶ 재개':'Ⅱ 일시정지';
  release();resetSpeedGuard();mobilePause.update(document.hidden||manualPaused);
};
$("resume-mobile").onclick=()=>mobilePause?.update(document.hidden||manualPaused);
let speedGuard=null, speedGuardReady=false, speedNotice="";
function resetSpeedGuard(){
  speedGuard?.reset(performance.now(),Number(canvas.dataset.audioGaps||0));
}
$("diagnostic-copy").onclick=async()=>{
  const text=JSON.stringify({type:'SRWF local performance report',...diagnosticMeta,rows:diagnosticRows,audioEvents:diagnosticAudioEvents},null,2);
  $("diagnostic-text").value=text;$("diagnostic-text").hidden=false;
  try{await navigator.clipboard.writeText(text);$("diagnostic-copy-status").textContent="복사했습니다. 대화창에 붙여넣어 주세요.";}
  catch{$("diagnostic-text").select();$("diagnostic-copy-status").textContent="아래 진단 내용을 선택해 복사해 주세요.";}
};
const keys = {ArrowRight:0x8000,ArrowLeft:0x4000,ArrowDown:0x2000,ArrowUp:0x1000,Enter:0x800,
  KeyZ:0x400,KeyX:0x100,KeyC:0x200,KeyA:0x40,KeyS:0x20,KeyD:0x10,KeyQ:8,KeyW:0x80};
let receivedFiles=[];
let diagnosticRows=[],diagnosticMeta={},diagnosticAudioEvents=[];
let worker, pad, audio, masterGain, audioNode, nextAudio = 0;
let modernMenu=false;
try { modernMenu=localStorage.getItem("srwf-im-ui-v1")==="modern"; } catch {}
$("modern-menu").checked=modernMenu;
const intermission=createIntermission({stage:$("stage"),canvas,initialEnabled:modernMenu,onEnabledChange:enabled=>{
  $("modern-menu").checked=enabled;
  try { localStorage.setItem("srwf-im-ui-v1",enabled?"modern":"original"); } catch {}
},send:(index,epoch)=>{
  if(!worker||activeGame!=="final")return;
  Atomics.store(pad,0,0);
  Atomics.store(pad,3,epoch);
  Atomics.store(pad,2,index+1);
}});
$("modern-menu").onchange=()=>intermission.setEnabled($("modern-menu").checked);
const scheduledAudio = new Set();
let unlockSave, saveQueue = Promise.resolve(), liveBackup, activeGame, temporaryRun;
let saveFailure = false;
let saveBusy = false, hasPreviousSave = false;
function saveControls(running) {
  saveBusy = running;
  for (const id of ["game", "disc", "route", "replay-save", "temporary", "save-load", "cd-rate", "mobile-optimize", "mobile-preload"])
    $(id).disabled = running;
  $("cd-rate").disabled = running || $("game").value !== "final";
  $("save-restore").disabled = running || !hasPreviousSave;
}
async function refreshSave() {
  const game = $("game").value;
  try {
    const record = await readSave(game);
    if (game !== $("game").value) return;
    hasPreviousSave = !!record?.previous;
    $("save-status").textContent = record
      ? `마지막 저장 · ${new Date(record.updatedAt).toLocaleString()}`
      : "아직 저장된 데이터가 없습니다.";
    $("save-restore").disabled = saveBusy || !hasPreviousSave;
  } catch (error) { $("save-status").textContent = `저장소 오류: ${error.message}`; }
}
$("game").onchange = () => {
  $("fast-label").textContent = $("game").value === "final" ? "최대 2배속 · 소리 유지" : "빠르게 진행 · 무음";
  $("cd-rate").disabled = $("game").value !== "final";
  $("modern-menu").disabled = $("game").value !== "final";
  refreshSave();
};
$("save-export").onclick = async () => {
  try {
    await saveQueue;
    const game = worker ? activeGame : $("game").value;
    const bytes = (worker || saveFailure) && activeGame === game && !temporaryRun && liveBackup
      ? liveBackup : (await readSave(game))?.bytes;
    if (!bytes) throw Error("내보낼 저장이 없습니다. 먼저 게임 안에서 저장하세요.");
    const text = await exportBackup(game, bytes);
    const url = URL.createObjectURL(new Blob([text], {type:"application/json"}));
    const link = document.createElement("a");
    link.href = url; link.download = `srwf-${game}-save-${Date.now()}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) { $("save-status").textContent = `백업 실패: ${error.message}`; }
};
async function replaceSave(getBytes) {
  if (worker) return;
  const game = $("game").value;
  let release;
  $("boot").disabled = true;
  saveControls(true);
  try {
    release = await lockSave(game);
    await writeSave(game, await getBytes(game));
    liveBackup=undefined;saveFailure=false;
    await refreshSave();
  } catch (error) { $("save-status").textContent = `저장 변경 실패: ${error.message}`; }
  finally { release?.(); saveControls(false); $("boot").disabled = false; }
}
$("save-load").onchange = async () => {
  const file = $("save-load").files[0];
  if (!file) return;
  await replaceSave(async game => {
    if (file.size > 100000) throw Error("백업 파일이 너무 큽니다.");
    return importBackup(await file.text(), game);
  });
  $("save-load").value = "";
};
$("save-restore").onclick = () => replaceSave(async game => {
  const record = await readSave(game);
  if (!record?.previous) throw Error("이전 저장본이 없습니다.");
  return record.previous;
});
void refreshSave();
$("volume").oninput=()=>{
  const level=Number($("volume").value)/100;
  $("volume-value").textContent=`${Math.round(level*100)}%`;
  if(masterGain&&audio)masterGain.gain.setTargetAtTime((activeGame!=="final" && $("fast").checked) ? 0 : level,audio.currentTime,0.02);
};
let recordingAudio, recorder, recordingTimer, recordingUrl;
function stopRecording(){
  if(recorder?.state==="recording")recorder.stop();
}
$("record-stop").onclick=stopRecording;
$("record").onclick=async()=>{
  if(!audio||!worker)return;
  if(!canvas.captureStream||!window.MediaRecorder){
    $("record-status").textContent="이 브라우저는 화면 녹화를 지원하지 않습니다.";return;
  }
  await audio.resume();
  if(!recordingAudio){
    recordingAudio=audio.createMediaStreamDestination();
    masterGain.connect(recordingAudio);
  }
  if(activeGame!=="final") { $("fast").checked=false;Atomics.store(pad,1,0);$("fast").disabled=true; }
  const videoStream=canvas.captureStream(30);
  const stream=new MediaStream([...videoStream.getVideoTracks(),...recordingAudio.stream.getAudioTracks()]);
  const mimeType=["video/webm;codecs=vp8,opus","video/webm","video/mp4"].find(t=>MediaRecorder.isTypeSupported(t));
  const chunks=[];
  try{recorder=new MediaRecorder(stream,mimeType?{mimeType}:{});}
  catch(error){$("record-status").textContent=`녹화 실패: ${error.message}`;$("fast").disabled=false;videoStream.getTracks().forEach(t=>t.stop());return;}
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  recorder.onstop=()=>{
    clearInterval(recordingTimer);
    videoStream.getTracks().forEach(t=>t.stop());
    const blob=new Blob(chunks,{type:recorder.mimeType});
    if(recordingUrl)URL.revokeObjectURL(recordingUrl);
    recordingUrl=URL.createObjectURL(blob);
    const link=$("record-download");link.href=recordingUrl;
    link.download=`srwf-browser-${$("game").value}-${Date.now()}.${blob.type.includes("mp4")?"mp4":"webm"}`;
    link.hidden=false;$("record-status").textContent=`녹화 완료 · ${(blob.size/1048576).toFixed(1)} MB`;
    $("record").disabled=!worker;$("record-stop").disabled=true;$("fast").disabled=false;
  };
  recorder.start(1000);
  $("record").disabled=true;$("record-stop").disabled=false;$("record-download").hidden=true;
  const started=performance.now();
  recordingTimer=setInterval(()=>{
    const elapsed=(performance.now()-started)/1000;
    $("record-status").textContent=`화면·게임 소리 녹화 중 · ${Math.floor(elapsed)} / 180초`;
    if(elapsed>=180)stopRecording();
  },250);
};
canvas.addEventListener("pointerdown",()=>canvas.focus());
for(const button of document.querySelectorAll("[data-pad]")){
  button.addEventListener("click",()=>{
    if(!worker)return;
    const bit=Number(button.dataset.pad), currentPad=pad;
    Atomics.or(currentPad,0,bit);
    setTimeout(()=>Atomics.and(currentPad,0,~bit),150);
    canvas.focus();
  });
}
function release() { if(pad) Atomics.store(pad,0,0); }
window.addEventListener("blur",release);
document.addEventListener("visibilitychange",()=>{if(document.hidden)release();resetSpeedGuard();mobilePause?.update(document.hidden||manualPaused);});
canvas.addEventListener("blur",release);
for(const type of ["keydown","keyup"]) window.addEventListener(type,event=>{
  if(!worker || !keys[event.code]) return;
  if(document.activeElement!==canvas)return;
  event.preventDefault();
  const bit=keys[event.code];
  if(type==="keydown") Atomics.or(pad,0,bit); else Atomics.and(pad,0,~bit);
});
$("fast").onchange=()=>{
  if(pad) Atomics.store(pad,1,Number($("fast").checked));
  resetSpeedGuard();speedNotice="";$("speed-status").hidden=true;
  if(activeGame!=="final") {
    for(const source of scheduledAudio) source.stop();
    scheduledAudio.clear(); nextAudio=0;audioNode?.port.postMessage({type:"clear"});
    if(masterGain&&audio)masterGain.gain.setValueAtTime($("fast").checked ? 0 : Number($("volume").value)/100,audio.currentTime);
  }
};
async function stopRun(){
  mobilePause?.dispose();mobilePause=null;manualPaused=false;
  $("pause-game").disabled=true;$("pause-game").textContent='Ⅱ 일시정지';$("pause-game").setAttribute('aria-pressed','false');$("resume-mobile").hidden=true;
  intermission.reset();
  speedGuard=null;speedGuardReady=false;speedNotice="";
  stopRecording();$("record").disabled=true;
  worker?.terminate();worker=null;release();audio?.close();audio=null;scheduledAudio.clear();
  await saveQueue;
  unlockSave?.();unlockSave=null;saveControls(false);
  $("boot").disabled=false;$("stop").disabled=true;$("status").textContent="종료됨";
}
$("stop").onclick=stopRun;
$("boot").onclick=async()=>{
  if(!crossOriginIsolated){$("status").textContent="실행 환경을 준비 중입니다. 잠시 후 다시 시작해 주세요.";return;}
  const game=$("game").value;
  let files=receivedFiles.length?receivedFiles:[...$("disc").files], cue=files.find(f=>/\.cue$/i.test(f.name));
  if(!files.length){$("status").textContent="원본 디스크 파일을 선택하세요.";return;}
  $("boot").disabled=true;
  saveControls(true);
  if(game!=="stock"){
    try{
      $("status").textContent="원본 확인 및 한글패치 준비";
      const {patchDisc}=await import("./patch.mjs");
      const patched=await patchDisc(files,game,p=>{$("status").textContent=`한글패치 검증 중 · ${p.phase??p.stage??""}`;});
      files=patched.files;cue=files.find(f=>f.name===patched.cue);
      $("log").textContent=`검증 완료: ${patched.release}\nSHA-256 ${patched.sha256}`;
    }catch(error){$("status").textContent=`패치 실패: ${error.message}`;$("boot").disabled=false;saveControls(false);return;}
  }
  if(!cue){$("status").textContent="CUE와 모든 트랙 BIN을 함께 선택하세요.";$("boot").disabled=false;saveControls(false);return;}
  const temporary=$("temporary").checked;
  try {
    const replaySave=$("replay-save").files[0];
    if (replaySave && !temporary)
      throw Error("재생 시작용 백업은 ‘검증용 임시 저장’을 선택해서 실행하세요.");
    if (!temporary) {
      unlockSave=await lockSave(game);
      const record=await readSave(game);
      if(record && $("route").files.length)
        throw Error("기존 저장이 있으면 입력 기록은 ‘검증용 임시 저장’을 선택해서 실행하세요.");
      liveBackup=record ? validateBackup(record.bytes) : undefined;
    } else {
      if (replaySave && replaySave.size > 100000) throw Error("백업 파일이 너무 큽니다.");
      liveBackup=replaySave ? await importBackup(await replaySave.text(), game) : undefined;
    }
  } catch(error) {
    unlockSave?.();unlockSave=null;
    $("status").textContent=`저장 준비 실패: ${error.message}`;$("boot").disabled=false;saveControls(false);return;
  }
  activeGame=game;temporaryRun=temporary;saveFailure=false;saveControls(true);
  $("save-status").textContent=temporary ? "임시 실행: 영구 저장을 변경하지 않습니다."
    : liveBackup ? "기존 저장을 불러왔습니다. 맵 중단 저장은 ‘이어하기’, 일반 저장은 ‘로드’를 선택하세요." : "새 저장으로 시작합니다.";
  try {
  activeProfile=executionProfile(navigator,$("mobile-optimize").checked);
  speedGuard=activeProfile.optimized&&game==="final" ? new MobileSpeedGuard() : null;
  speedGuardReady=false;speedNotice="";resetSpeedGuard();$("speed-status").hidden=true;
  if(mobileDevice){
    diagnosticRows=[];diagnosticAudioEvents=[];diagnosticMeta={browser:navigator.userAgent,started:new Date().toISOString(),version:'pending',profile:activeProfile.name,frontend:'mobile-9',audioTargetMs:activeProfile.optimized?60:120,audioQueueCapMs:500};
    $("performance-status").textContent="성능 진단: 실행 후 측정합니다.";
    $("diagnostic-text").hidden=true;$("diagnostic-copy-status").textContent="";
  }
  pad=new Int32Array(new SharedArrayBuffer(mobileDevice?44:16));
  Atomics.store(pad,1,Number($("fast").checked));
  canvas.dataset.audioFrames="0";canvas.dataset.audioDrops="0";canvas.dataset.audioGaps="0";
  canvas.dataset.menuTrace="[]";canvas.dataset.runtimeVersion="legacy";
  canvas.dataset.executionProfile=activeProfile.name;
  audio=new AudioContext({sampleRate:44100,latencyHint:"playback"});await audio.resume();nextAudio=0;
  if(mobileDevice){diagnosticMeta.sampleRate=audio.sampleRate;diagnosticMeta.baseLatency=audio.baseLatency;diagnosticMeta.outputLatency=audio.outputLatency;}
  recordingAudio=activeProfile.optimized ? null : audio.createMediaStreamDestination();
  masterGain=audio.createGain();
  masterGain.gain.value=(game!=="final" && $("fast").checked) ? 0 : Number($("volume").value)/100;
  masterGain.connect(audio.destination);
  if(recordingAudio)masterGain.connect(recordingAudio);
  const audioWorklet=activeProfile.optimized ? './mobile-audio-worklet.mjs?mobile=9' : './audio-worklet.mjs';
  const audioProcessor=activeProfile.optimized ? 'saturn-mobile-audio' : 'saturn-audio';
  await audio.audioWorklet.addModule(new URL(audioWorklet,import.meta.url));
  audioNode=new AudioWorkletNode(audio,audioProcessor,{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2]});
  audioNode.connect(masterGain);
  audioNode.port.onmessage=({data})=>{
    if(data.type==='audio-event'){
      if(mobileDevice){diagnosticAudioEvents.push(data);if(diagnosticAudioEvents.length>16)diagnosticAudioEvents.shift();}
      return;
    }
    canvas.dataset.audioFrames=String(data.frames);canvas.dataset.audioDrops=String(data.drops);
    canvas.dataset.audioGaps=String(data.gaps);canvas.dataset.audioBufferMs=String(data.bufferMs);
    canvas.dataset.audioState=audio?.state||'closed';
  };
  if(mobileDevice)mobilePause=new MobilePause({pad,audio,
    onState:paused=>{$("resume-mobile").hidden=true;$("status").textContent=paused?(document.hidden?"백그라운드 · 일시정지":manualPaused?"일시정지":"재개 중"):"플레이 중";},
    onError:()=>{$("resume-mobile").hidden=false;$("status").textContent="재개 버튼을 눌러 계속하세요.";}});
  const audioChannel=new MessageChannel();
  audioNode.port.postMessage({type:'connect',port:audioChannel.port1,feedback:activeProfile.optimized?pad.buffer:undefined},[audioChannel.port1]);

  const selectedRuntime=await selectRuntime({optimized:activeProfile.optimized,game},fetch);
  const runtimeVersion=`&runtime=${selectedRuntime.version}`;
  canvas.dataset.runtimeVersion=selectedRuntime.version;
  $("runtime-source").href=`./runtime/source-${selectedRuntime.version}.tar.gz`;
  if(mobileDevice){diagnosticMeta.version=selectedRuntime.version;diagnosticMeta.mobileCore=selectedRuntime.mobile;diagnosticMeta.runtimeFallback=selectedRuntime.fallback;}
  if(selectedRuntime.fallback)$("log").textContent+="\n모바일 실행 코드를 읽지 못해 기본 실행 코드를 사용합니다.";
  worker=new Worker(`./worker.js?game=${game}${runtimeVersion}&audio=worklet1&mobile=9`);
  $("boot").disabled=true;$("stop").disabled=false;$("pause-game").disabled=!mobilePause;
  $("status").textContent="실행 코드 준비 중";
  worker.onerror=async e=>{await stopRun();$("status").textContent=`실행 오류: ${e.message}`;};
  worker.onmessage=async ({data:d})=>{
    if(d.type==='preload'){
      $("status").textContent=`디스크 미리 읽기 · ${Math.round(100*d.done/d.total)}%`;
    }else if(d.type==='disc-mode'){
      diagnosticMeta.discMode=d.mode;diagnosticMeta.discMemoryBytes=d.bytes;
      if(d.mode!=='memory')$("log").textContent+='\n디스크 미리 읽기를 사용할 수 없어 기존 캐시를 사용합니다.';
    }else if(d.type==="performance"&&mobileDevice){
      const row={...d,gaps:Number(canvas.dataset.audioGaps||0),drops:Number(canvas.dataset.audioDrops||0),bufferMs:Number(canvas.dataset.audioBufferMs||0),audioState:audio?.state||'closed',visibility:document.visibilityState};
      diagnosticRows.push(row);if(diagnosticRows.length>30)diagnosticRows.shift();
      $("performance-status").textContent=formatPerformance(row,row.gaps,row.bufferMs);
      if(speedGuard&&speedGuardReady&&speedGuard.observe(row,{now:performance.now(),visible:document.visibilityState==="visible",audioRunning:audio?.state==="running"})){
        Atomics.store(pad,1,0);$("fast").checked=false;
        speedNotice=" · 자동 1배속";
        $("status").textContent=mobileDevice&&document.hidden?"백그라운드 · 일시정지":"플레이 중"+speedNotice;
        $("speed-status").textContent="2배속 처리량이 부족해 소리 끊김을 줄이도록 1배속으로 전환했습니다. 원하면 다시 켤 수 있습니다.";
        $("speed-status").hidden=false;
        row.speedGuard="fell-back-to-1x";
      }
      canvas.dataset.performance=JSON.stringify(row);
    } else if(d.type==="intermission"){
      if(activeGame==="final"){
        const recent=JSON.parse(canvas.dataset.menuTrace||"[]");
        recent.push({...d,frame:canvas.dataset.frame});
        canvas.dataset.menuTrace=JSON.stringify(recent.slice(-32));
        intermission.update(d);
      }
    } else if(d.type==="save"){
      if (temporary) return;
      try { liveBackup=validateBackup(d.bytes); }
      catch(error) { $("save-status").textContent=`저장 데이터 오류: ${error.message}`;return; }
      const snapshot=liveBackup;
      $("save-status").textContent="브라우저에 저장 중…";
      saveQueue=saveQueue.then(()=>writeSave(game,snapshot)).then(async ()=>{
        hasPreviousSave=!!(await readSave(game))?.previous;
        saveFailure=false;
        $("save-status").textContent=`저장 완료 · ${new Date().toLocaleTimeString()}`;
      }).catch(error=>{
        saveFailure=true;
        $("save-status").textContent=`영구 저장 실패: ${error.message} — 백업 내보내기로 보관하세요.`;
      });
    } else if(d.type==="frame"){
      if(speedGuard&&!speedGuardReady){speedGuardReady=true;resetSpeedGuard();}
      if(canvas.width!==d.w||canvas.height!==d.h){canvas.width=d.w;canvas.height=d.h;}
      if(mobileDevice && canvas.dataset.displaySize!==`${d.w}x${d.h}`){
        canvas.dataset.displaySize=`${d.w}x${d.h}`;
        $("stage").style.setProperty("--game-aspect",`${d.w} / ${d.h}`);
      }
      ctx.putImageData(new ImageData(d.rgba,d.w,d.h),0,0);
      $("status").textContent=mobileDevice&&document.hidden?"백그라운드 · 일시정지":"플레이 중"+speedNotice;
      canvas.dataset.frame=d.frame;
      if(recorder?.state!=="recording")$("record").disabled=false;
    } else if(d.type==="audio"&&audio&&(activeGame==="final" || !$("fast").checked)){
      const n=d.samples.length/2;
      canvas.dataset.audioFrames=String(Number(canvas.dataset.audioFrames)+n);
      canvas.dataset.audioTime=String(audio.currentTime);canvas.dataset.audioState=audio.state;
      if(nextAudio>audio.currentTime+0.3){canvas.dataset.audioDrops=String(Number(canvas.dataset.audioDrops)+n);return;}
      if(nextAudio && nextAudio<audio.currentTime-0.02)canvas.dataset.audioGaps=String(Number(canvas.dataset.audioGaps)+1);
      const b=audio.createBuffer(2,n,44100);
      for(let c=0;c<2;c++){const out=b.getChannelData(c);for(let i=0;i<n;i++)out[i]=d.samples[i*2+c]/32768;}
      const source=audio.createBufferSource();source.buffer=b;source.connect(masterGain);
      scheduledAudio.add(source);source.onended=()=>scheduledAudio.delete(source);
      nextAudio=Math.max(nextAudio,audio.currentTime+0.02);source.start(nextAudio);nextAudio+=n/44100;
    } else if(d.type==="exited"){
      await stopRun();
      $("status").textContent=d.code ? `실행 오류로 종료됨 (코드 ${d.code}) · 아래 로그를 확인하세요.` : "실행 종료";
    } else if(d.type==="log"||d.type==="error"){
      $("log").textContent=($("log").textContent+"\n"+d.text).slice(-16000);
      if(d.type==="error"){await stopRun();$("status").textContent="실행 오류 · 아래 로그를 확인하세요.";}
      else if(d.text.includes("FATAL"))$("status").textContent="실행 오류 · 아래 로그를 확인하세요.";
    }
  };
  const routeFile=$("route").files[0];
  const route=routeFile?await routeFile.text():undefined;
  worker.postMessage({type:"boot",files,cue:cue.name,pad:pad.buffer,route,temporary,backup:liveBackup,cdRate:Number($("cd-rate").value),audioPort:audioChannel.port2,preloadDisc:activeProfile.optimized&&$("mobile-preload").checked,mobileOptimized:activeProfile.optimized,mobileDiagnostics:mobileDevice},[audioChannel.port2]);
  if(mobileDevice&&document.hidden)mobilePause.update(true);
  } catch(error) {
    mobilePause?.dispose();mobilePause=null;
    speedGuard=null;speedGuardReady=false;
    worker?.terminate();worker=null;audio?.close();audio=null;
    unlockSave?.();unlockSave=null;saveControls(false);
    $("boot").disabled=false;$("stop").disabled=true;$("pause-game").disabled=true;manualPaused=false;
    $("status").textContent=`실행 준비 실패: ${error.message}`;
  }
};

// Files stay in memory; no ROM upload, browser database, or cache storage.
const handoffToken=new URLSearchParams(location.hash.slice(1)).get('handoff');
if(handoffToken && /^[a-f0-9]{32}$/.test(handoffToken)){
  const channel=new BroadcastChannel('srwf-web-port-'+handoffToken);
  const request=()=>channel.postMessage({type:'ready'});
  const retry=setInterval(request,1000);
  const timeout=setTimeout(()=>{clearInterval(retry);channel.close();},120000);
  channel.onmessage=({data})=>{
    if(data?.type!=='disc'||!(data.blob instanceof Blob)||data.game!=='final')return;
    receivedFiles=[new File([data.blob],data.name||'selected.bin')];
    $('disc-label').textContent='패치 페이지에서 선택한 디스크';
    $('disc-hint').textContent='파일 전달 완료 · 다시 선택하지 않고 시작하세요';
    $('status').textContent='디스크 전달 완료';
    $('empty-state').querySelector('h2').textContent='실행 준비 완료';
    $('empty-state').querySelector('p').textContent='선택한 디스크로 게임을 시작하세요.';
    channel.postMessage({type:'received'});clearInterval(retry);clearTimeout(timeout);channel.close();
    history.replaceState(null,'',location.pathname);
  };request();
}
$('disc').addEventListener('change',()=>{receivedFiles=[];});
for(const button of document.querySelectorAll('[data-pad]')){
  const bit=Number(button.dataset.pad);
  button.addEventListener('pointerdown',event=>{event.preventDefault();button.setPointerCapture(event.pointerId);if(pad)Atomics.or(pad,0,bit);});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,()=>{if(pad)Atomics.and(pad,0,~bit);});
}
