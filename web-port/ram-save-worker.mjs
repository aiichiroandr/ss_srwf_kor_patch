import {parseRam,readWebEntries,mergeRam,encodeRam} from './ram-save.mjs?v=ram1';
self.onmessage=({data:d})=>{
 try{
  let result;
  if(d.type==='inspect')result=parseRam(d.bytes);
  else if(d.type==='merge')result=mergeRam(d.current,parseRam(d.bytes).entries,d.names,d.game,d.overwrite);
  else if(d.type==='export')result=encodeRam(readWebEntries(d.bytes),d.options);
  else throw Error('알 수 없는 저장 요청입니다.');
  self.postMessage({result});
 }catch(e){self.postMessage({error:e.message});}
};
