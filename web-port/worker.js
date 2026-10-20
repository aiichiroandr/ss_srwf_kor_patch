const variant = new URL(location.href).searchParams.get("game") || "stock";
const version=new URL(location.href).searchParams.get("runtime");
if(!version || !/^[a-f0-9]{20}$/.test(version))throw Error("실행 버전 누락");
const buildDir="./runtime/"+version+"/";
importScripts(buildDir + "saturn.js");
if (self.name !== "em-pthread") onmessage = async ({data}) => {
  if (data.type !== "boot") return;
  try {
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
