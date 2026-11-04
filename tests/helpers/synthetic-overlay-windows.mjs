// Deliberately synthetic verification windows; no proprietary instructions are
// included in this fixture. Load the unchanged reader/writer functions with
// only their digest declarations rebound to these fabricated bytes. Production
// modules have no fixture switch or caller-supplied acceptance path. A separate
// private-source comparison exercises the real production pins and output bytes.
import {readFile} from 'node:fs/promises';
import {sha256Hex} from '../../assets/sha256.mjs';
import {CRITICAL_FIX_PROFILES as realCritical} from '../../assets/editor-critical-fix.mjs';
import {COLLECTION_UNLOCK as realCollection} from '../../assets/editor-collection-unlock.mjs';
import {DEBUG_ENTRY as realDebug} from '../../assets/editor-debug-entry.mjs';
const bytes=(n,seed)=>Uint8Array.from({length:n},(_,i)=>(i*37+seed)&255);
const hex=b=>Buffer.from(b).toString('hex');
const u32=n=>{const b=new Uint8Array(4);new DataView(b.buffer).setUint32(0,n);return b;};
const masked=(b,at,n)=>{const copy=b.slice();copy.fill(0,at,at+n);return sha256Hex(copy);};
const calc=bytes(8,31),display=bytes(8,43),criticalReplacements=new Map();
export const CRITICAL_FIX_PROFILES=Object.fromEntries(Object.entries(realCritical).map(([game,p],i)=>{
 const context=bytes(p.contextBytes,17+i);context.set(u32(p.loadBase+p.calc.offset),p.offset-p.start);
 criticalReplacements.set(p.contextSha256,masked(context,p.offset-p.start,4));
 criticalReplacements.set(p.calc.sha256,sha256Hex(calc));criticalReplacements.set(p.display.sha256,sha256Hex(display));
 return[game,{...p,context:hex(context),original:hex(u32(p.loadBase+p.calc.offset)),enabled:hex(u32(p.loadBase+p.display.offset)),
  calc:{...p.calc,bytes:hex(calc)},display:{...p.display,bytes:hex(display)}}];
}));
const c=bytes(realCollection.contextBytes,57);new DataView(c.buffer).setUint16(realCollection.returnOffset,0x6083);
export const COLLECTION_UNLOCK={...realCollection,original:hex(c)};
const d=bytes(realDebug.contextBytes,71);d[realDebug.offset-realDebug.start]=realDebug.original;
export const DEBUG_ENTRY={...realDebug,context:hex(d)};
const replacements=new Map([
 ['editor-critical-fix.mjs',criticalReplacements],
 ['editor-collection-unlock.mjs',new Map([[realCollection.contextSha256,masked(c,realCollection.returnOffset,2)]])],
 ['editor-debug-entry.mjs',new Map([[realDebug.contextSha256,masked(d,realDebug.offset-realDebug.start,1)]])],
]);
const urls=new Map();
async function moduleUrl(name,overrides={}){
 const key=name+JSON.stringify(overrides);if(urls.has(key))return urls.get(key);
 const file=new URL('../../assets/'+name,import.meta.url);let source=await readFile(file,'utf8');
 for(const[from,to]of replacements.get(name)??[])source=source.replaceAll(from,to);
 source=source.replace(/(from\s*|import\s*\(\s*)(['"])(\.\.?\/[^'"]+)\2/g,(_m,prefix,quote,path)=>{
  const base=path.split('/').at(-1).split('?')[0],url=overrides[base]??new URL(path,file).href;
  return prefix+quote+url+quote;
 });
 const url='data:text/javascript;base64,'+Buffer.from(source).toString('base64');urls.set(key,url);return url;
}
const criticalUrl=await moduleUrl('editor-critical-fix.mjs');
const collectionUrl=await moduleUrl('editor-collection-unlock.mjs');
const debugUrl=await moduleUrl('editor-debug-entry.mjs');
export const critical=await import(criticalUrl),collection=await import(collectionUrl),debug=await import(debugUrl);
export const native=await import(await moduleUrl('editor-native-overlays.mjs',{'editor-critical-fix.mjs':criticalUrl,'editor-collection-unlock.mjs':collectionUrl}));
// This entry keeps the same actual writer/inspector and every provenance rule;
// only the debug detector's context digest is rebound for a synthetic TSR.
export async function syntheticDebugCore(){return import(await moduleUrl('editor-core.mjs',{'editor-debug-entry.mjs':debugUrl}));}
// Exercise image discovery and CD rewrite using the same synthetic digest pins.
export const criticalImage=await import(await moduleUrl('editor-critical-fix-image.mjs',{'editor-critical-fix.mjs':criticalUrl}));
