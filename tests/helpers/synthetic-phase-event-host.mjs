import { eventHostArchive } from './synthetic-event-host.mjs';
import { packGreedy } from './synthetic-iso.mjs';

// This separate fixture supplies the declared final root-4 wait/continuation.
// The pre-existing TE02 fixture and its frozen profile remain unchanged.
export function phaseEventHostArchive(){
  const source=eventHostArchive(),raw=source.raw.slice();raw.set([0xe9,1,255,254],2786);
  const bytes=source.bytes.slice(),view=new DataView(bytes.buffer),cell=106*8;
  const start=cell+view.getUint32(cell),end=cell+view.getUint32(cell+4),packed=packGreedy(raw);
  if(packed.length>end-start)throw new Error('Synthetic phase host exceeds its existing slot.');
  bytes.fill(0,start,end);bytes.set(packed,start);return {...source,bytes,raw};
}
