import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPatchedImageCue,
  createPatchedImageZipWriter,
  crc32,
} from "../assets/zip-writer.mjs";

const decoder = new TextDecoder();

function concatenate(parts) {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

function recordingWriter() {
  const writes = [];
  let closeCount = 0;
  const abortReasons = [];
  let releaseCount = 0;
  return {
    writes,
    abortReasons,
    get closeCount() {
      return closeCount;
    },
    get releaseCount() {
      return releaseCount;
    },
    writer: {
      async write(value) {
        writes.push(value);
      },
      async close() {
        closeCount += 1;
      },
      async abort(reason) {
        abortReasons.push(reason);
      },
      releaseLock() {
        releaseCount += 1;
      },
    },
  };
}

function readLocalEntry(bytes, offset, expectedSize) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(view.getUint32(offset, true), 0x04034b50);
  assert.equal(view.getUint16(offset + 4, true), 20);
  assert.equal(view.getUint16(offset + 6, true), 0x0808);
  assert.equal(view.getUint16(offset + 8, true), 0);
  assert.equal(view.getUint32(offset + 14, true), 0);
  assert.equal(view.getUint32(offset + 18, true), 0);
  assert.equal(view.getUint32(offset + 22, true), 0);
  const nameLength = view.getUint16(offset + 26, true);
  const extraLength = view.getUint16(offset + 28, true);
  assert.equal(extraLength, 0);
  const nameStart = offset + 30;
  const dataStart = nameStart + nameLength;
  const dataEnd = dataStart + expectedSize;
  const descriptorOffset = dataEnd;
  assert.equal(view.getUint32(descriptorOffset, true), 0x08074b50);
  assert.equal(view.getUint32(descriptorOffset + 8, true), expectedSize);
  assert.equal(view.getUint32(descriptorOffset + 12, true), expectedSize);
  return {
    name: decoder.decode(bytes.subarray(nameStart, dataStart)),
    data: bytes.subarray(dataStart, dataEnd),
    crc: view.getUint32(descriptorOffset + 4, true),
    end: descriptorOffset + 16,
  };
}

test("CRC-32 matches the standard check vector", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
});

test("patched image ZIP streams one stored BIN plus its matching CUE", async () => {
  const destination = recordingWriter();
  const first = new Uint8Array([1, 2]);
  const second = new Uint8Array([3, 4, 5]);
  const imageName = "SRWF-KOR-20260812-v1.1-0123456789abcdef01234567.bin";
  const cueName = "SRWF-KOR-20260812-v1.1-0123456789abcdef01234567.cue";
  const zip = createPatchedImageZipWriter(destination.writer, {
    imageName,
    cueName,
    imageSize: 5,
  });

  await zip.write(first);
  await zip.write(second);
  await zip.close();

  // Image chunks are forwarded by reference rather than accumulated or copied.
  assert.ok(destination.writes.includes(first));
  assert.ok(destination.writes.includes(second));
  assert.equal(destination.closeCount, 1);
  assert.equal(destination.releaseCount, 1);
  assert.deepEqual(destination.abortReasons, []);

  const archive = concatenate(destination.writes.map((part) => new Uint8Array(
    part.buffer,
    part.byteOffset,
    part.byteLength,
  )));
  const imageEntry = readLocalEntry(archive, 0, 5);
  assert.equal(imageEntry.name, imageName);
  assert.deepEqual([...imageEntry.data], [1, 2, 3, 4, 5]);
  assert.equal(imageEntry.crc, crc32(imageEntry.data));

  const cueText = buildPatchedImageCue(imageName);
  const cueBytes = new TextEncoder().encode(cueText);
  const cueEntry = readLocalEntry(archive, imageEntry.end, cueBytes.byteLength);
  assert.equal(cueEntry.name, cueName);
  assert.equal(decoder.decode(cueEntry.data), cueText);
  assert.equal(cueEntry.crc, crc32(cueEntry.data));

  const centralOffset = cueEntry.end;
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  assert.equal(view.getUint32(centralOffset, true), 0x02014b50);
  const imageCentralNameLength = view.getUint16(centralOffset + 28, true);
  const imageCentralEnd = centralOffset + 46 + imageCentralNameLength;
  assert.equal(view.getUint32(centralOffset + 20, true), 5);
  assert.equal(view.getUint32(centralOffset + 42, true), 0);
  assert.equal(view.getUint32(imageCentralEnd, true), 0x02014b50);
  const cueCentralNameLength = view.getUint16(imageCentralEnd + 28, true);
  const cueCentralEnd = imageCentralEnd + 46 + cueCentralNameLength;
  assert.equal(view.getUint32(imageCentralEnd + 20, true), cueBytes.byteLength);
  assert.equal(view.getUint32(imageCentralEnd + 42, true), imageEntry.end);
  assert.equal(view.getUint32(cueCentralEnd, true), 0x06054b50);
  assert.equal(view.getUint16(cueCentralEnd + 8, true), 2);
  assert.equal(view.getUint16(cueCentralEnd + 10, true), 2);
  assert.equal(view.getUint32(cueCentralEnd + 16, true), centralOffset);
  assert.equal(cueCentralEnd + 22, archive.byteLength);
});

test("ZIP writer rejects short and overflowing image streams and remains abortable", async (t) => {
  await t.test("short", async () => {
    const destination = recordingWriter();
    const zip = createPatchedImageZipWriter(destination.writer, {
      imageName: "patched.bin",
      cueName: "patched.cue",
      imageSize: 3,
    });
    await zip.write(new Uint8Array([1, 2]));
    await assert.rejects(
      () => zip.close(),
      (error) => error?.code === "ZIP_IMAGE_SIZE_MISMATCH",
    );
    const reason = new Error("caller preserves original failure");
    await zip.abort(reason);
    assert.deepEqual(destination.abortReasons, [reason]);
    assert.equal(destination.closeCount, 0);
  });

  await t.test("overflow", async () => {
    const destination = recordingWriter();
    const zip = createPatchedImageZipWriter(destination.writer, {
      imageName: "patched.bin",
      cueName: "patched.cue",
      imageSize: 2,
    });
    const overflow = new Uint8Array([1, 2, 3]);
    await assert.rejects(
      () => zip.write(overflow),
      (error) => error?.code === "ZIP_IMAGE_SIZE_MISMATCH",
    );
    assert.ok(!destination.writes.includes(overflow));
    await zip.abort();
  });
});

test("ZIP writer validates safe matching entry names before acquiring a stream", () => {
  let getWriterCount = 0;
  const destination = {
    getWriter() {
      getWriterCount += 1;
      throw new Error("must not acquire invalid destination");
    },
  };
  assert.throws(
    () => createPatchedImageZipWriter(destination, {
      imageName: "track.bin",
      cueName: "other.cue",
      imageSize: 1,
    }),
    (error) => error?.code === "ZIP_ENTRY_NAME_MISMATCH",
  );
  assert.throws(
    () => createPatchedImageZipWriter(destination, {
      imageName: "../track.bin",
      cueName: "../track.cue",
      imageSize: 1,
    }),
    (error) => error?.code === "ZIP_ENTRY_NAME_INVALID",
  );
  assert.equal(getWriterCount, 0);
});

test("underlying ZIP close failures can be aborted without being masked", async () => {
  const closeFailure = new Error("synthetic close failure");
  let abortReason = null;
  const zip = createPatchedImageZipWriter({
    async write() {},
    async close() {
      throw closeFailure;
    },
    async abort(reason) {
      abortReason = reason;
      throw new Error("synthetic abort failure");
    },
  }, {
    imageName: "patched.bin",
    cueName: "patched.cue",
    imageSize: 1,
  });
  await zip.write(new Uint8Array([1]));
  await assert.rejects(() => zip.close(), (error) => error === closeFailure);
  await assert.rejects(() => zip.abort(closeFailure), /synthetic abort failure/);
  assert.equal(abortReason, closeFailure);
});
