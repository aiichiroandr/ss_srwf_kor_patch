const $=id=>document.getElementById(id);
const titles={final:'슈퍼로봇대전 F 완결편',f:'슈퍼로봇대전 F',stock:'슈퍼로봇대전 F'};
function title(){ $('game-title').textContent=titles[$('game').value];document.querySelector('.version-tag').textContent=$('game').value==='stock'?'일본어 원본':'한글판'; }
$('game').addEventListener('change',title);
$('disc').addEventListener('change',()=>{
 const files=[...$('disc').files];
 $('disc-label').textContent=files.length===1?files[0].name:files.length?`${files.length}개 파일 선택됨`:'디스크 파일 선택';
 $('disc-hint').textContent=files.length?`${(files.reduce((n,f)=>n+f.size,0)/1048576).toFixed(1)} MB · 실행 준비 완료`:'원본 BIN 또는 CUE + 모든 BIN';
});
// Only a rendered frame hides the start instructions; patching may still fail.
const screenObserver=new MutationObserver(()=>{$('empty-state').hidden=true;});
screenObserver.observe($('screen'),{attributes:true,attributeFilter:['data-frame']});
$('fullscreen').addEventListener('click',async()=>{
 try{if(document.fullscreenElement)await document.exitFullscreen();else await $('stage').requestFullscreen();$('screen').focus();}
 catch{$('status').textContent='전체 화면을 지원하지 않는 브라우저입니다.';}
});
title();
const settings=document.querySelector('.mobile-settings');
const sidebar=document.querySelector('.sidebar');
const workspace=document.querySelector('.workspace');
const mobile=matchMedia('(max-width:1000px)');
function layoutSettings(){if(mobile.matches)settings.append(sidebar);else workspace.append(sidebar);}
mobile.addEventListener('change',layoutSettings);layoutSettings();

$('mobile-boot').onclick=()=>$('boot').click();
new MutationObserver(()=>{$('mobile-boot').disabled=$('boot').disabled;}).observe($('boot'),{attributes:true,attributeFilter:['disabled']});
$('mobile-boot').disabled=$('boot').disabled;
