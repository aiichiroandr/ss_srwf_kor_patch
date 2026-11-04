// Generated test data; no game bytes.
export function literals(raw){const bytes=[];let flag=0,left=0;const bit=n=>{if(!left){flag=bytes.length;bytes.push(255);left=8;}if(!n)bytes[flag]&=~(1<<--left);else --left;};for(const b of raw){bit(1);bytes.push(b);}bit(0);bit(1);bytes.push(0,0,0);return Uint8Array.from(bytes);}
