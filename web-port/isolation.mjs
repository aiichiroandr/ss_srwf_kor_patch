if(!crossOriginIsolated){
  const status=document.getElementById("status");
  const boot=document.getElementById("boot");
  boot.disabled=true;
  try{
    if(!("serviceWorker" in navigator))throw Error("이 브라우저는 필요한 실행 환경을 지원하지 않습니다.");
    await navigator.serviceWorker.register("./isolation-sw.js",{scope:"./"});
    await navigator.serviceWorker.ready;
    if(sessionStorage.getItem("srwf-isolation-reload")==="1"){
      throw Error("실행 환경을 준비하지 못했습니다. 최신 Chrome 또는 Edge에서 다시 열어 주세요.");
    }
    sessionStorage.setItem("srwf-isolation-reload","1");
    location.reload();
  }catch(error){status.textContent=error.message;}
}else{
  sessionStorage.removeItem("srwf-isolation-reload");
}
