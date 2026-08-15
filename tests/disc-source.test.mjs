import assert from "node:assert/strict";
import { openAsBlob } from "node:fs";
import { mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  DiscSourceError,
  SRWF_REV_B_CUE_NAME,
  SRWF_REV_B_MERGED_SIZE,
  SRWF_REV_B_TRACKS,
  normalizeSelectedSource,
  normalizeSourceDirectory,
  parseSrwfRevBCue,
} from "../assets/disc-source.mjs";

function cueText({ trailing = "\r\n", track2Mode = "MODE2/2352", track3Index = "00:02:00" } = {}) {
  return [
    "CATALOG 0000000000000",
    `FILE "${SRWF_REV_B_TRACKS[0].name}" BINARY`,
    "  TRACK 01 MODE1/2352",
    "    INDEX 01 00:00:00",
    `FILE "${SRWF_REV_B_TRACKS[1].name}" BINARY`,
    `  TRACK 02 ${track2Mode}`,
    "    INDEX 00 00:00:00",
    "    INDEX 01 00:03:00",
    `FILE "${SRWF_REV_B_TRACKS[2].name}" BINARY`,
    "  TRACK 03 AUDIO",
    "    INDEX 00 00:00:00",
    `    INDEX 01 ${track3Index}`,
  ].join("\r\n") + trailing;
}

async function sparseFile(directory, name, size, fill = 0) {
  const path = join(directory, name);
  const descriptor = await open(path, "w");
  try {
    await descriptor.truncate(size);
    if (size > 0) {
      await descriptor.write(Uint8Array.of(fill), 0, 1, 0);
    }
  } finally {
    await descriptor.close();
  }
  return new File([await openAsBlob(path)], name);
}

function fileHandle(file) {
  return Object.freeze({
    kind: "file",
    name: file.name,
    async getFile() {
      return file;
    },
  });
}

function directoryHandle(entries, { name = "source", readError = null } = {}) {
  return Object.freeze({
    kind: "directory",
    name,
    async *entries() {
      if (readError) {
        throw readError;
      }
      for (const entry of entries) {
        yield [entry.name, entry];
      }
    },
  });
}

async function expectDiscError(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof DiscSourceError);
    assert.equal(error.code, code);
    return true;
  });
}

test("strict Rev B CUE parser accepts the exact Redump three-track layout", () => {
  const parsed = parseSrwfRevBCue(cueText());
  assert.equal(parsed.format, "cue-bin");
  assert.deepEqual(parsed.referencedNames, SRWF_REV_B_TRACKS.map((track) => track.name));
  assert.equal(new TextEncoder().encode(cueText()).byteLength, 418);
});

test("strict Rev B CUE parser rejects changed modes, timings, paths, and extra commands", () => {
  assert.throws(
    () => parseSrwfRevBCue(cueText({ track2Mode: "MODE1/2352" })),
    (error) => error.code === "CUE_TRACK_MISMATCH",
  );
  assert.throws(
    () => parseSrwfRevBCue(cueText({ track3Index: "00:03:00" })),
    (error) => error.code === "CUE_INDEX_MISMATCH",
  );
  assert.throws(
    () => parseSrwfRevBCue(cueText().replace(SRWF_REV_B_TRACKS[0].name, `sub/${SRWF_REV_B_TRACKS[0].name}`)),
    (error) => error.code === "CUE_FILE_MISMATCH",
  );
  assert.throws(
    () => parseSrwfRevBCue(`${cueText()}REM unsupported\r\n`),
    (error) => error.code === "CUE_LAYOUT_INVALID",
  );
});

test("normalizer orders selected tracks by CUE without reading 579 MB into JavaScript memory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "srwf-disc-source-"));
  try {
    const cue = new File([cueText()], SRWF_REV_B_CUE_NAME);
    const tracks = await Promise.all(SRWF_REV_B_TRACKS.map(
      (track, index) => sparseFile(directory, track.name, track.size, index + 1),
    ));
    const handles = [fileHandle(tracks[2]), fileHandle(cue), fileHandle(tracks[0]), fileHandle(tracks[1])];

    const normalized = await normalizeSelectedSource(handles, SRWF_REV_B_MERGED_SIZE);
    assert.equal(normalized.format, "cue-bin");
    assert.equal(normalized.fileCount, 4);
    assert.equal(normalized.displayName, SRWF_REV_B_CUE_NAME);
    assert.equal(normalized.anchorHandle.name, SRWF_REV_B_CUE_NAME);
    assert.equal(normalized.blob.size, SRWF_REV_B_MERGED_SIZE);
    assert.deepEqual(normalized.trackFiles.map((file) => file.name), SRWF_REV_B_TRACKS.map((track) => track.name));

    const boundaries = [
      0,
      SRWF_REV_B_TRACKS[0].size,
      SRWF_REV_B_TRACKS[0].size + SRWF_REV_B_TRACKS[1].size,
    ];
    for (let index = 0; index < boundaries.length; index += 1) {
      const byte = new Uint8Array(await normalized.blob.slice(boundaries[index], boundaries[index] + 1).arrayBuffer());
      assert.equal(byte[0], index + 1, `track ${index + 1} begins at its canonical merged offset`);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("normalizer fails closed on a wrong track size, missing file, wrong name, and wrong release size", async () => {
  const directory = await mkdtemp(join(tmpdir(), "srwf-disc-source-fail-"));
  try {
    const cue = new File([cueText()], SRWF_REV_B_CUE_NAME);
    const tracks = await Promise.all(SRWF_REV_B_TRACKS.map(
      (track) => sparseFile(directory, track.name, track.size),
    ));
    const shortTrack3 = await sparseFile(directory, `short-${tracks[2].name}`, tracks[2].size - 1);
    Object.defineProperty(shortTrack3, "name", { value: tracks[2].name });
    await expectDiscError(
      normalizeSelectedSource(
        [fileHandle(cue), fileHandle(tracks[0]), fileHandle(tracks[1]), fileHandle(shortTrack3)],
        SRWF_REV_B_MERGED_SIZE,
      ),
      "TRACK_SIZE_MISMATCH",
    );
    await expectDiscError(
      normalizeSelectedSource([fileHandle(cue), fileHandle(tracks[0]), fileHandle(tracks[1])], SRWF_REV_B_MERGED_SIZE),
      "SOURCE_FILE_COUNT_INVALID",
    );
    await expectDiscError(
      normalizeSelectedSource(
        [fileHandle(new File([cueText()], "renamed.cue")), ...tracks.map(fileHandle)],
        SRWF_REV_B_MERGED_SIZE,
      ),
      "CUE_NAME_MISMATCH",
    );
    await expectDiscError(
      normalizeSelectedSource([fileHandle(cue), ...tracks.map(fileHandle)], SRWF_REV_B_MERGED_SIZE - 1),
      "SOURCE_PROFILE_UNSUPPORTED",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("single raw BIN/IMG/ISO path remains supported and size gated", async () => {
  for (const name of ["stock.img", "stock.bin", "raw-sectors.iso"]) {
    const file = new File([new Uint8Array(32)], name);
    const normalized = await normalizeSelectedSource([fileHandle(file)], 32);
    assert.equal(normalized.format, "raw");
    assert.equal(normalized.blob, file);
    assert.equal(normalized.anchorHandle.name, name);
  }
  const file = new File([new Uint8Array(31)], "stock.img");
  await expectDiscError(normalizeSelectedSource([fileHandle(file)], 32), "SOURCE_SIZE_MISMATCH");
});

test("directory discovery accepts an unordered pinned CUE/BIN set without descending", async () => {
  const directory = await mkdtemp(join(tmpdir(), "srwf-disc-directory-cue-"));
  try {
    const cue = new File([cueText()], SRWF_REV_B_CUE_NAME);
    const tracks = await Promise.all(SRWF_REV_B_TRACKS.map(
      (track, index) => sparseFile(directory, track.name, track.size, index + 1),
    ));
    const priorOutput = await sparseFile(directory, "previous-patched.bin", SRWF_REV_B_MERGED_SIZE, 9);
    let nestedRead = false;
    const nestedDirectory = Object.freeze({
      kind: "directory",
      name: "unrelated-subfolder",
      async *entries() {
        nestedRead = true;
        throw new Error("must not descend");
      },
    });
    const selectedDirectory = directoryHandle([
      nestedDirectory,
      fileHandle(tracks[2]),
      fileHandle(priorOutput),
      fileHandle(cue),
      fileHandle(tracks[0]),
      fileHandle(tracks[1]),
    ]);

    const normalized = await normalizeSourceDirectory(selectedDirectory, SRWF_REV_B_MERGED_SIZE);
    assert.equal(normalized.format, "cue-bin");
    assert.equal(normalized.directoryHandle, selectedDirectory);
    assert.equal(normalized.displayName, SRWF_REV_B_CUE_NAME);
    assert.deepEqual(normalized.trackFiles.map((file) => file.name), SRWF_REV_B_TRACKS.map((track) => track.name));
    assert.equal(nestedRead, false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("directory discovery accepts one exact-size IMG/BIN and ignores unrelated files", async () => {
  for (const rawName of ["stock.img", "stock.bin"]) {
    const raw = new File([new Uint8Array(32)], rawName);
    const selectedDirectory = directoryHandle([
      fileHandle(new File(["notes"], "readme.txt")),
      fileHandle(raw),
    ]);
    const normalized = await normalizeSourceDirectory(selectedDirectory, 32);
    assert.equal(normalized.format, "raw");
    assert.equal(normalized.blob, raw);
    assert.equal(normalized.directoryHandle, selectedDirectory);
  }
});

test("directory discovery ignores fixed and legacy generated patch BINs beside one raw source", async () => {
  for (const outputName of [
    "SRWF-KOR-20260814-v0.1.bin",
    "SRWF-KOR-20260814-v0.1.1.bin",
    "SRWF-KOR-20260815-v0.1.2.bin",
    "SRWF-KOR-20260814-v0.1-0123456789abcdef01234567.bin",
    "SRWF-KOR-20260814-v0.1.1-0123456789abcdef01234567.bin",
    "SRWF-KOR-20260815-v0.1.2-0123456789abcdef01234567.bin",
  ]) {
    const source = new File([new Uint8Array(32)], "stock.img");
    const priorOutput = new File([new Uint8Array(32)], outputName);
    const selectedDirectory = directoryHandle([
      fileHandle(priorOutput),
      fileHandle(source),
    ]);
    const normalized = await normalizeSourceDirectory(selectedDirectory, 32);
    assert.equal(normalized.format, "raw");
    assert.equal(normalized.blob, source);
  }
});

test("directory discovery rejects ambiguous full-size raw candidates without a pinned CUE set", async () => {
  const first = new File([new Uint8Array(32)], "first.img");
  const second = new File([new Uint8Array(32)], "second.bin");
  await expectDiscError(
    normalizeSourceDirectory(directoryHandle([fileHandle(first), fileHandle(second)]), 32),
    "SOURCE_SET_AMBIGUOUS",
  );
});

test("directory discovery caps entries and rejects duplicate casefolded file names", async () => {
  const tooMany = Array.from({ length: 65 }, (_, index) => (
    fileHandle(new File([Uint8Array.of(index)], `entry-${index}.txt`))
  ));
  await expectDiscError(
    normalizeSourceDirectory(directoryHandle(tooMany), 32),
    "SOURCE_DIRECTORY_TOO_MANY_ENTRIES",
  );

  const first = fileHandle(new File([new Uint8Array(32)], "Stock.img"));
  const second = fileHandle(new File([new Uint8Array(32)], "stock.IMG"));
  await expectDiscError(
    normalizeSourceDirectory(directoryHandle([first, second]), 32),
    "SOURCE_NAME_DUPLICATE",
  );
});

test("directory discovery rejects cooked ISO/CHD, no match, invalid handles, and read failures", async () => {
  for (const name of ["cooked.iso", "compressed.chd"]) {
    await expectDiscError(
      normalizeSourceDirectory(directoryHandle([fileHandle(new File([new Uint8Array(32)], name))]), 32),
      "SOURCE_FORMAT_UNSUPPORTED",
    );
  }
  await expectDiscError(
    normalizeSourceDirectory(directoryHandle([fileHandle(new File([new Uint8Array(31)], "wrong-size.img"))]), 32),
    "SOURCE_SET_NOT_FOUND",
  );
  await expectDiscError(normalizeSourceDirectory(null, 32), "SOURCE_DIRECTORY_INVALID");
  await expectDiscError(
    normalizeSourceDirectory(directoryHandle([], { readError: new DOMException("denied", "NotAllowedError") }), 32),
    "SOURCE_DIRECTORY_READ_FAILED",
  );
});
