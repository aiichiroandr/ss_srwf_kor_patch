import {Sha256} from './sha256.mjs?v=20261110-part2';

// Small byte helpers shared by the editor modules. Every helper is a pure
// function without module state, so a second instance of this module (for
// example one loaded inside a worker) behaves exactly like the first.

// Element-wise strict equality of two array-likes (typed arrays or plain arrays).
export function bytesEqual(a,b){
 return a.length===b.length&&a.every((value,i)=>value===b[i]);
}

// A DataView over exactly the bytes a typed array covers, not its whole buffer.
export function dataView(bytes){
 return new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
}

// Lower-case hexadecimal spelling of every byte, two digits each.
export function bytesToHex(bytes){
 return Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('');
}

// The bytes of a hexadecimal string, two digits per byte. Callers validate the
// spelling first; an empty string has no digit pairs and throws a TypeError.
export function hexToBytes(hex){
 return Uint8Array.from(hex.match(/../g),pair=>parseInt(pair,16));
}

// The bytes of a standard base64 string. Malformed input throws like atob().
export function base64ToBytes(text){
 return Uint8Array.from(atob(text),char=>char.charCodeAt(0));
}

// The bytes of a URL-safe base64 string ('-' and '_' in place of '+' and '/').
export function base64UrlToBytes(text){
 return base64ToBytes(text.replaceAll('-','+').replaceAll('_','/'));
}

// The raw 32-byte SHA-256 digest as a fresh Uint8Array.
export function sha256Digest(bytes){
 return new Sha256().update(bytes).digest();
}

// The 14 root offsets at the head of a decoded scenario body. Each signed
// big-endian 32-bit cell is relative to its own position. This only reads the
// cells: callers that accept an unchecked body must still bound every root.
export function scenarioRootOffsets(bytes){
 const view=dataView(bytes);
 return Array.from({length:14},(_,i)=>i*4+view.getInt32(i*4));
}
