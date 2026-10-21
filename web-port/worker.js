const variant = new URL(location.href).searchParams.get("game") || "stock";
const version=new URL(location.href).searchParams.get("runtime");
if(!version || !/^[a-f0-9]{20}$/.test(version))throw Error("실행 버전 누락");
const buildDir="./runtime/"+version+"/";
importScripts(buildDir + "saturn.js");
if (self.name !== "em-pthread") onmessage = async ({data}) => {
  if (data.type !== "boot") return;
  try {
    let probe=null,discCache=null;
    if(data.mobileDiagnostics){
      const {PerformanceProbe}=await import("./performance-probe.mjs?mobile=1");
      probe=new PerformanceProbe();
    }
    const hostPostMessage=self.postMessage.bind(self);
    const audioPad=new Int32Array(data.pad);
    self.postMessage=(message,transfer)=>{
      if(message.type==='audio'&&data.audioPort){
        if(probe)probe.audio(performance.now(),message.samples.length/2);
        if(variant==='final'||!Atomics.load(audioPad,1))data.audioPort.postMessage(message,transfer);
      }else {
        hostPostMessage(message,transfer);
        if(probe&&message.type==='frame'){
          const report=probe.tick(performance.now(),message.frame,Atomics.load(audioPad,1)?2:1);
          if(report)hostPostMessage({type:'performance',...report,discCache:discCache?.stats});
        }
      }
    };
    const runtime = await createSaturn({
      noInitialRun: true,
      srwPad: new Int32Array(data.pad),
      print: text => postMessage({type:"log", text}),
      printErr: text => postMessage({type:"log", text}),
      onExit: code => postMessage({type:"exited", code}),
      onAbort: reason => postMessage({type:"error", text:String(reason)}),
      locateFile: name => new URL(buildDir + name, location.href).href,
    });
    runtime.FS.mkdir("/disc");
    runtime.FS.mkdir("/out");
    runtime.FS.mount(runtime.WORKERFS, {files:data.files}, "/disc");
    if(data.mobileOptimized){
      const {installDiscCache}=await import('./disc-cache.mjs?mobile=1');
      discCache=installDiscCache(runtime.FS);
    }
    if(probe)for(const file of data.files){
      const node=runtime.FS.lookupPath('/disc/'+file.name).node;
      const read=node.stream_ops.read;
      node.stream_ops={...node.stream_ops,read(...args){
        const start=performance.now();
        try{return read.apply(this,args);}finally{probe.read(performance.now()-start);}
      }};
    }
    const savePath = "/out/backup.bin";
    if (data.backup) runtime.FS.writeFile(savePath, data.backup);
    if (!data.temporary) {
      // The BIOS commits a complete backup via atomic rename after each
      // in-game save/delete. Send only successfully committed snapshots.
      const rename = runtime.FS.rename.bind(runtime.FS);
      runtime.FS.rename = (oldPath, newPath) => {
        const result = rename(oldPath, newPath);
        if (newPath === savePath) {
          const bytes = runtime.FS.readFile(savePath);
          postMessage({type:"save", bytes}, [bytes.buffer]);
        }
        return result;
      };
    }
    const args = ["--cue", "/disc/" + data.cue, "--save", data.temporary && !data.backup ? "-" : savePath, "--settings", "-", "--out", "/out"];
    if (variant === "final") {
      if (![300,600,1200].includes(data.cdRate)) throw Error("지원하지 않는 CD 읽기 속도");
      args.push("--cd-rate", String(data.cdRate));
    }
    if (data.route) {
      runtime.FS.writeFile("/route.txt", data.route);
      const frames=data.route.trim().split(",").filter(Boolean).map(event=>Number(event.split(":")[0]));
      if(!frames.length||frames.some(frame=>!Number.isSafeInteger(frame)||frame<0))
        throw Error("입력 기록의 프레임 번호가 올바르지 않습니다.");
      args.push("--input", "@/route.txt", "--resume", String(Math.max(...frames)+1),
                "--clock", "2026-10-20T12:00:00");
    }
    postMessage({type:"started"});
    // Asyncify may return here while the game is sleeping, not terminated.
    // onExit reports a real runtime exit.
    runtime.callMain(args);
  } catch (error) {
    postMessage({type:"error", text:String(error?.stack || error)});
  }
};
