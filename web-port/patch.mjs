import {Sha256,parsePatch,buildVerifiedPatchedBlob} from "../assets/patch-core.mjs";
import {parsePatchV2,buildVerifiedPatchedBlobV2} from "../assets/patch-core-v2.mjs";
import {normalizeSelectedSource} from "../assets/disc-source.mjs";

const releases={
  f:"srwf-f-20260928-v0-5-a",
  final:"srwf-final-20261005-v0-3-c",
};
const cueLines={
  f:["TRACK 01 MODE1/2352","INDEX 01 00:00:00","TRACK 02 MODE2/2352","INDEX 00 22:34:18","INDEX 01 22:36:18","TRACK 03 MODE1/2352","INDEX 01 54:15:41","TRACK 04 AUDIO","INDEX 01 54:26:37"],
  final:["TRACK 01 MODE1/2352","INDEX 01 00:00:00","TRACK 02 MODE2/2352","INDEX 00 17:03:64","INDEX 01 17:06:64","TRACK 03 AUDIO","INDEX 00 48:55:28","INDEX 01 48:57:28"],
};
export async function patchDisc(files, game, progress){
  if(!Object.hasOwn(releases,game))throw Error("지원하지 않는 게임");
  const base=new URL("../",import.meta.url);
  const response=await fetch(new URL(`releases/${releases[game]}.json`,base));
  if(!response.ok)throw Error("승인 패치 정보를 읽을 수 없습니다");
  const r=await response.json();
  if(r.state!=="ACCEPTED"||r.id!==releases[game])throw Error("승인 패치 정보 불일치");
  const candidate=files.find(f=>f.size===r.target.size);
  if(candidate){
    const h=new Sha256();
    for(let offset=0;offset<candidate.size;offset+=4*1024*1024)
      h.update(new Uint8Array(await candidate.slice(offset,offset+4*1024*1024).arrayBuffer()));
    if(h.hex()===r.target.sha256){
      const image=new File([candidate],r.target.filename);
      const cue=new File([`FILE "${image.name}" BINARY\n${cueLines[game].map(l=>"  "+l).join("\n")}\n`],r.target.cueFilename);
      return {files:[cue,image],cue:cue.name,release:r.id,sha256:r.target.sha256};
    }
  }
  const source=await normalizeSelectedSource(files.map(file=>({kind:"file",name:file.name,getFile:async()=>file})),r.source.size,r.source.profileId);
  progress({phase:"patch-download"});
  const patchResponse=await fetch(new URL(r.patch.url,base));
  if(!patchResponse.ok)throw Error("패치 파일을 읽을 수 없습니다");
  const descriptor={
    patchSize:r.patch.size,patchSha256:r.patch.sha256,sourceSize:r.source.size,sourceSha256:r.source.sha256,
    targetSize:r.target.size,targetSha256:r.target.sha256,recordCount:r.patch.recordCount,bodyUncompressedSize:r.patch.bodyUncompressedSize,
  };
  const v2=game==="final";
  if(v2)descriptor.format=r.patch.format;
  const parsed=await (v2?parsePatchV2:parsePatch)(await patchResponse.arrayBuffer(),descriptor);
  const result=await (v2?buildVerifiedPatchedBlobV2:buildVerifiedPatchedBlob)(source.blob,parsed,{onProgress:progress});
  const image=new File([result.blob],r.target.filename,{type:"application/octet-stream"});
  const cue=new File([`FILE "${image.name}" BINARY\n${cueLines[game].map(l=>"  "+l).join("\n")}\n`],r.target.cueFilename);
  return {files:[cue,image],cue:cue.name,release:r.id,sha256:r.target.sha256};
}
