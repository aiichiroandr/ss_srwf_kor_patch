// Incremental SHA-256 for large browser-side Blob streams.
// This module intentionally has no Node.js dependencies.

const ROUND_CONSTANTS = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
  0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const INITIAL_STATE = new Uint32Array([
  0x6a09e667,
  0xbb67ae85,
  0x3c6ef372,
  0xa54ff53a,
  0x510e527f,
  0x9b05688c,
  0x1f83d9ab,
  0x5be0cd19,
]);

function rotateRight(value, amount) {
  return (value >>> amount) | (value << (32 - amount));
}

function asBytes(value) {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  throw new TypeError('SHA-256 input must be an ArrayBuffer or an ArrayBuffer view');
}

function bytesToHex(bytes) {
  let result = '';
  for (const byte of bytes) {
    result += byte.toString(16).padStart(2, '0');
  }
  return result;
}

export class Sha256 {
  constructor() {
    this._state = new Uint32Array(INITIAL_STATE);
    this._block = new Uint8Array(64);
    this._words = new Uint32Array(64);
    this._blockLength = 0;
    this._bytesHashed = 0n;
    this._finished = false;
    this._result = null;
  }

  update(value) {
    if (this._finished) {
      throw new Error('SHA-256 digest has already been finalized');
    }

    const bytes = asBytes(value);
    this._bytesHashed += BigInt(bytes.byteLength);
    let position = 0;

    if (this._blockLength !== 0) {
      const needed = 64 - this._blockLength;
      const copied = Math.min(needed, bytes.byteLength);
      this._block.set(bytes.subarray(0, copied), this._blockLength);
      this._blockLength += copied;
      position += copied;

      if (this._blockLength === 64) {
        this._compress(this._block, 0);
        this._blockLength = 0;
      }
    }

    while (position + 64 <= bytes.byteLength) {
      this._compress(bytes, position);
      position += 64;
    }

    if (position < bytes.byteLength) {
      this._block.set(bytes.subarray(position), 0);
      this._blockLength = bytes.byteLength - position;
    }

    return this;
  }

  digest() {
    if (this._finished) {
      return this._result.slice();
    }

    const paddedLength = this._blockLength < 56 ? 64 : 128;
    const padded = new Uint8Array(paddedLength);
    padded.set(this._block.subarray(0, this._blockLength), 0);
    padded[this._blockLength] = 0x80;

    const bitLength = BigInt.asUintN(64, this._bytesHashed * 8n);
    const view = new DataView(padded.buffer);
    view.setUint32(paddedLength - 8, Number((bitLength >> 32n) & 0xffffffffn), false);
    view.setUint32(paddedLength - 4, Number(bitLength & 0xffffffffn), false);

    for (let position = 0; position < paddedLength; position += 64) {
      this._compress(padded, position);
    }

    const result = new Uint8Array(32);
    const resultView = new DataView(result.buffer);
    for (let index = 0; index < this._state.length; index += 1) {
      resultView.setUint32(index * 4, this._state[index], false);
    }

    this._finished = true;
    this._result = result;
    return result.slice();
  }

  hex() {
    return bytesToHex(this.digest());
  }

  _compress(bytes, offset) {
    const words = this._words;
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 64);

    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(index * 4, false);
    }
    for (let index = 16; index < 64; index += 1) {
      const word15 = words[index - 15];
      const word2 = words[index - 2];
      const sigma0 = rotateRight(word15, 7) ^ rotateRight(word15, 18) ^ (word15 >>> 3);
      const sigma1 = rotateRight(word2, 17) ^ rotateRight(word2, 19) ^ (word2 >>> 10);
      words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0;
    }

    let a = this._state[0];
    let b = this._state[1];
    let c = this._state[2];
    let d = this._state[3];
    let e = this._state[4];
    let f = this._state[5];
    let g = this._state[6];
    let h = this._state[7];

    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temporary1 = (h + sum1 + choose + ROUND_CONSTANTS[index] + words[index]) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temporary2 = (sum0 + majority) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temporary1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) >>> 0;
    }

    this._state[0] = (this._state[0] + a) >>> 0;
    this._state[1] = (this._state[1] + b) >>> 0;
    this._state[2] = (this._state[2] + c) >>> 0;
    this._state[3] = (this._state[3] + d) >>> 0;
    this._state[4] = (this._state[4] + e) >>> 0;
    this._state[5] = (this._state[5] + f) >>> 0;
    this._state[6] = (this._state[6] + g) >>> 0;
    this._state[7] = (this._state[7] + h) >>> 0;
  }
}

export function sha256Hex(value) {
  return new Sha256().update(value).hex();
}
