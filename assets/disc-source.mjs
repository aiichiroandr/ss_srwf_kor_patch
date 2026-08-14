const MAX_CUE_BYTES = 16 * 1024;
const MAX_DIRECTORY_ENTRIES = 64;

function pinTrack(number, name, size, mode, indexes) {
  return Object.freeze({ number, name, size, mode, indexes: Object.freeze(indexes.map((entry) => Object.freeze(entry))) });
}

/**
 * Every disc layout the patcher accepts, one entry per pinned stock profile.
 * The merged size doubles as the lookup key: each release manifest pins its
 * source profile size, and the two supported dumps have distinct sizes.
 */
export const PINNED_DISC_SETS = Object.freeze([
  Object.freeze({
    gameId: "srwf-f",
    cueName: "Super Robot Taisen F (Japan) (Rev B) (21M).cue",
    mergedName: "Super Robot Taisen F (Japan) (Rev B) (21M).bin",
    sourceLabel: "세가 새턴 일본판 Rev. B",
    tracks: Object.freeze([
      pinTrack(1, "Super Robot Taisen F (Japan) (Rev B) (21M) (Track 1).bin", 238_711_536, "MODE1/2352", [[1, "00:00:00"]]),
      pinTrack(2, "Super Robot Taisen F (Japan) (Rev B) (21M) (Track 2).bin", 335_919_696, "MODE2/2352", [[0, "00:00:00"], [1, "00:03:00"]]),
      pinTrack(3, "Super Robot Taisen F (Japan) (Rev B) (21M) (Track 3).bin", 3_880_800, "AUDIO", [[0, "00:00:00"], [1, "00:02:00"]]),
    ]),
    mergedSize: 578_512_032,
  }),
  Object.freeze({
    gameId: "srwf-final",
    cueName: "Super Robot Taisen F - Kanketsu-hen (Japan) (Rev A) (11M).cue",
    mergedName: "Super Robot Taisen F - Kanketsu-hen (Japan) (Rev A) (11M).bin",
    sourceLabel: "세가 새턴 일본판 Rev. A",
    tracks: Object.freeze([
      pinTrack(1, "Super Robot Taisen F - Kanketsu-hen (Japan) (Rev A) (11M) (Track 1).bin", 180_607_728, "MODE1/2352", [[1, "00:00:00"]]),
      pinTrack(2, "Super Robot Taisen F - Kanketsu-hen (Japan) (Rev A) (11M) (Track 2).bin", 335_919_696, "MODE2/2352", [[0, "00:00:00"], [1, "00:03:00"]]),
      pinTrack(3, "Super Robot Taisen F - Kanketsu-hen (Japan) (Rev A) (11M) (Track 3).bin", 3_880_800, "AUDIO", [[0, "00:00:00"], [1, "00:02:00"]]),
    ]),
    mergedSize: 520_408_224,
  }),
]);

for (const discSet of PINNED_DISC_SETS) {
  const trackTotal = discSet.tracks.reduce((total, track) => total + track.size, 0);
  if (trackTotal !== discSet.mergedSize) {
    throw new Error(`Pinned disc set ${discSet.gameId} track sizes do not sum to its merged size`);
  }
}
if (new Set(PINNED_DISC_SETS.map((discSet) => discSet.mergedSize)).size !== PINNED_DISC_SETS.length) {
  throw new Error("Pinned disc sets must have distinct merged sizes");
}

export function discSetForExpectedSize(expectedSize) {
  return PINNED_DISC_SETS.find((discSet) => discSet.mergedSize === expectedSize) ?? null;
}

// Backwards-compatible aliases for the original single-game exports.
export const SRWF_REV_B_TRACKS = PINNED_DISC_SETS[0].tracks;
export const SRWF_REV_B_CUE_NAME = PINNED_DISC_SETS[0].cueName;
export const SRWF_REV_B_MERGED_SIZE = PINNED_DISC_SETS[0].mergedSize;

const RAW_EXTENSION_PATTERN = /\.(?:bin|img|iso)$/i;
const DIRECTORY_RAW_EXTENSION_PATTERN = /\.(?:bin|img)$/i;
const DIRECTORY_UNSUPPORTED_DISC_PATTERN = /\.(?:iso|chd)$/i;
const GENERATED_PATCH_OUTPUT_PATTERN =
  /^SRWF(?:IN)?-KOR-\d{8}-v\d+\.\d+(?:-[a-f0-9]{24})?\.bin$/i;

export class DiscSourceError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = "DiscSourceError";
    this.code = code;
  }
}

function fail(code, message, options) {
  throw new DiscSourceError(code, message, options);
}

function requireExpectedSize(expectedSize) {
  if (!Number.isSafeInteger(expectedSize) || expectedSize <= 0) {
    throw new TypeError("expectedSize must be a positive safe integer");
  }
}

function casefoldName(name) {
  return name.normalize("NFKC").toLocaleLowerCase("en-US");
}

function validateDirectoryHandle(directoryHandle) {
  if (
    directoryHandle === null
    || typeof directoryHandle !== "object"
    || (directoryHandle.kind !== undefined && directoryHandle.kind !== "directory")
    || typeof directoryHandle.entries !== "function"
  ) {
    fail("SOURCE_DIRECTORY_INVALID", "Source directory must be a readable directory handle");
  }
}

/**
 * Enumerate only the directory's direct children. The hard cap bounds both the
 * work performed here and the number of handles retained from an untrusted
 * browser picker result.
 */
async function readDirectFileHandles(directoryHandle) {
  validateDirectoryHandle(directoryHandle);

  const handles = [];
  const casefoldedNames = new Set();
  let entryCount = 0;
  try {
    for await (const entry of directoryHandle.entries()) {
      if (!Array.isArray(entry) || entry.length !== 2) {
        fail("SOURCE_DIRECTORY_INVALID", "Source directory returned an invalid entry");
      }
      const [name, handle] = entry;
      if (
        typeof name !== "string"
        || name.length === 0
        || name.includes("\0")
        || name.includes("/")
        || name.includes("\\")
        || handle === null
        || typeof handle !== "object"
        || handle.name !== name
      ) {
        fail("SOURCE_DIRECTORY_INVALID", "Source directory returned an unsafe entry");
      }

      entryCount += 1;
      if (entryCount > MAX_DIRECTORY_ENTRIES) {
        fail(
          "SOURCE_DIRECTORY_TOO_MANY_ENTRIES",
          `Source directory may contain at most ${MAX_DIRECTORY_ENTRIES} direct entries`,
        );
      }

      // Directory selection is intentionally non-recursive. Unrelated child
      // folders are ignored rather than traversed or treated as source data.
      if (handle.kind === "directory") {
        continue;
      }

      const foldedName = casefoldName(name);
      if (casefoldedNames.has(foldedName)) {
        fail("SOURCE_NAME_DUPLICATE", "Source directory contains duplicate case-insensitive names");
      }
      casefoldedNames.add(foldedName);

      if (handle.kind !== undefined && handle.kind !== "file") {
        fail("SOURCE_DIRECTORY_INVALID", "Source directory contains an unsupported entry type");
      }
      if (typeof handle.getFile !== "function") {
        fail("SOURCE_DIRECTORY_INVALID", "Source directory contains an unreadable file handle");
      }
      handles.push(handle);
    }
  } catch (error) {
    if (error instanceof DiscSourceError) {
      throw error;
    }
    fail("SOURCE_DIRECTORY_READ_FAILED", "Source directory could not be read", { cause: error });
  }
  return handles;
}

async function fileSizeForDirectoryCandidate(handle) {
  try {
    const file = await handle.getFile();
    if (!(file instanceof Blob) || file.name !== handle.name) {
      fail("SOURCE_FILE_INVALID", "A source directory handle returned an unexpected file");
    }
    return file.size;
  } catch (error) {
    if (error instanceof DiscSourceError) {
      throw error;
    }
    fail("SOURCE_FILE_READ_FAILED", "A source directory file could not be read", { cause: error });
  }
}

function validateHandles(handles) {
  if (!Array.isArray(handles)) {
    throw new TypeError("handles must be an array");
  }
  if (handles.length !== 1 && handles.length !== 4) {
    fail("SOURCE_FILE_COUNT_INVALID", "Select either one raw image or one CUE and its three BIN tracks");
  }
  for (const handle of handles) {
    if (
      handle === null
      || typeof handle !== "object"
      || (handle.kind !== undefined && handle.kind !== "file")
      || typeof handle.name !== "string"
      || typeof handle.getFile !== "function"
    ) {
      fail("SOURCE_HANDLE_INVALID", "Every selected item must be a readable file handle");
    }
  }

  const names = handles.map((handle) => handle.name);
  if (new Set(names).size !== names.length
    || new Set(names.map((name) => name.toLocaleLowerCase("en-US"))).size !== names.length) {
    fail("SOURCE_NAME_DUPLICATE", "Selected file names must be unique");
  }
}

async function readFiles(handles) {
  try {
    const files = await Promise.all(handles.map((handle) => handle.getFile()));
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      if (!(file instanceof Blob) || file.name !== handles[index].name) {
        fail("SOURCE_FILE_INVALID", "A selected handle returned an unexpected file");
      }
    }
    return files;
  } catch (error) {
    if (error instanceof DiscSourceError) {
      throw error;
    }
    fail("SOURCE_FILE_READ_FAILED", "A selected source file could not be read", { cause: error });
  }
}

function parseLine(line, pattern, code, description) {
  const match = pattern.exec(line);
  if (!match) {
    fail(code, `CUE must contain ${description}`);
  }
  return match;
}

/**
 * Parse the exact three-track Redump layout of one pinned disc set.
 * Whitespace indentation and LF/CRLF are presentation details; every command,
 * track mode, index, timestamp, and referenced basename is otherwise pinned.
 */
export function parsePinnedCue(text, discSet) {
  if (typeof text !== "string") {
    throw new TypeError("CUE text must be a string");
  }
  if (!discSet || !Array.isArray(discSet.tracks)) {
    throw new TypeError("discSet must be a pinned disc set");
  }
  if (text.startsWith("﻿") || text.includes("\0") || /\r(?!\n)/.test(text)) {
    fail("CUE_ENCODING_INVALID", "CUE must be plain UTF-8 text with LF or CRLF line endings");
  }

  const lines = text.replaceAll("\r\n", "\n").split("\n");
  if (lines.at(-1) === "") {
    lines.pop();
  }
  if (lines.some((line) => line.trim() === "")) {
    fail("CUE_LAYOUT_INVALID", "CUE must not contain blank or extra lines");
  }

  let position = 0;
  parseLine(
    lines[position++] ?? "",
    /^\s*CATALOG\s+0000000000000\s*$/,
    "CUE_CATALOG_INVALID",
    "the pinned zero catalog",
  );

  const referencedNames = [];
  for (const track of discSet.tracks) {
    const fileMatch = parseLine(
      lines[position++] ?? "",
      /^\s*FILE\s+"([^"\r\n]+)"\s+BINARY\s*$/,
      "CUE_FILE_INVALID",
      `a BINARY FILE line for track ${track.number}`,
    );
    const referencedName = fileMatch[1];
    if (referencedName.includes("/") || referencedName.includes("\\") || referencedName !== track.name) {
      fail("CUE_FILE_MISMATCH", `CUE track ${track.number} must reference the pinned Redump BIN basename`);
    }
    referencedNames.push(referencedName);

    const trackMatch = parseLine(
      lines[position++] ?? "",
      /^\s*TRACK\s+(\d{2})\s+(MODE1\/2352|MODE2\/2352|AUDIO)\s*$/,
      "CUE_TRACK_INVALID",
      `the pinned TRACK ${String(track.number).padStart(2, "0")} mode`,
    );
    if (Number(trackMatch[1]) !== track.number || trackMatch[2] !== track.mode) {
      fail("CUE_TRACK_MISMATCH", `CUE track ${track.number} mode or order is not supported`);
    }

    for (const [indexNumber, timestamp] of track.indexes) {
      const indexMatch = parseLine(
        lines[position++] ?? "",
        /^\s*INDEX\s+(\d{2})\s+(\d{2}:\d{2}:\d{2})\s*$/,
        "CUE_INDEX_INVALID",
        `the pinned INDEX timing for track ${track.number}`,
      );
      if (Number(indexMatch[1]) !== indexNumber || indexMatch[2] !== timestamp) {
        fail("CUE_INDEX_MISMATCH", `CUE track ${track.number} index timing is not supported`);
      }
    }
  }

  if (position !== lines.length) {
    fail("CUE_LAYOUT_INVALID", "CUE contains unsupported trailing commands or tracks");
  }
  return Object.freeze({
    format: "cue-bin",
    referencedNames: Object.freeze(referencedNames),
  });
}

/** Backwards-compatible wrapper pinned to the SRWF Rev B layout. */
export function parseSrwfRevBCue(text) {
  return parsePinnedCue(text, PINNED_DISC_SETS[0]);
}

async function normalizeRaw(handles, files, expectedSize) {
  const [handle] = handles;
  const [file] = files;
  if (!RAW_EXTENSION_PATTERN.test(file.name)) {
    fail("SOURCE_FORMAT_UNSUPPORTED", "A single source must be a raw BIN, IMG, or raw-sector ISO file");
  }
  if (file.size !== expectedSize) {
    fail("SOURCE_SIZE_MISMATCH", "Raw image size does not match the selected release");
  }
  return Object.freeze({
    blob: file,
    handles: Object.freeze([handle]),
    anchorHandle: handle,
    displayName: file.name,
    format: "raw",
    fileCount: 1,
  });
}

async function normalizeCueBin(handles, files, expectedSize) {
  const discSet = discSetForExpectedSize(expectedSize);
  if (!discSet) {
    fail("SOURCE_PROFILE_UNSUPPORTED", "This CUE/BIN layout does not match the selected release profile");
  }

  const entries = handles.map((handle, index) => ({ handle, file: files[index] }));
  const cueEntries = entries.filter(({ file }) => file.name.toLowerCase().endsWith(".cue"));
  const binEntries = entries.filter(({ file }) => file.name.toLowerCase().endsWith(".bin"));
  if (cueEntries.length !== 1 || binEntries.length !== 3) {
    fail("SOURCE_SET_INVALID", "Select exactly one CUE and three BIN files");
  }
  const cueEntry = cueEntries[0];
  if (cueEntry.file.name !== discSet.cueName) {
    fail("CUE_NAME_MISMATCH", "CUE basename is not the pinned Redump name for this release");
  }
  if (cueEntry.file.size <= 0 || cueEntry.file.size > MAX_CUE_BYTES) {
    fail("CUE_SIZE_INVALID", "CUE text is empty or exceeds the safety limit");
  }

  let cueText;
  try {
    const cueBytes = new Uint8Array(await cueEntry.file.arrayBuffer());
    if (cueBytes.byteLength !== cueEntry.file.size) {
      fail("CUE_SIZE_INVALID", "CUE returned a byte length different from its declared size");
    }
    cueText = new TextDecoder("utf-8", { fatal: true }).decode(cueBytes);
  } catch (error) {
    if (error instanceof DiscSourceError) {
      throw error;
    }
    fail("CUE_ENCODING_INVALID", "CUE is not valid UTF-8 text", { cause: error });
  }
  const parsedCue = parsePinnedCue(cueText, discSet);

  const entriesByName = new Map(binEntries.map((entry) => [entry.file.name, entry]));
  const orderedEntries = parsedCue.referencedNames.map((name) => entriesByName.get(name));
  if (orderedEntries.some((entry) => entry === undefined)) {
    fail("CUE_REFERENCE_MISSING", "A BIN referenced by the CUE was not selected");
  }
  for (let index = 0; index < discSet.tracks.length; index += 1) {
    if (orderedEntries[index].file.size !== discSet.tracks[index].size) {
      fail("TRACK_SIZE_MISMATCH", `BIN track ${index + 1} size does not match the pinned Redump dump`);
    }
  }

  const trackFiles = orderedEntries.map((entry) => entry.file);
  // A Blob built from Blob/File parts is the browser-native, immutable virtual
  // concatenation. Construction does not call arrayBuffer()/stream() on the
  // 520-579 MB inputs; the existing patch worker consumes this Blob once and
  // writes the patched result directly to its output handle.
  const mergedBlob = typeof File === "function"
    ? new File(trackFiles, discSet.mergedName, { type: "application/octet-stream" })
    : new Blob(trackFiles, { type: "application/octet-stream" });
  if (mergedBlob.size !== expectedSize) {
    fail("SOURCE_SIZE_MISMATCH", "Merged CUE/BIN source size does not match the selected release");
  }

  return Object.freeze({
    blob: mergedBlob,
    handles: Object.freeze([...handles]),
    anchorHandle: cueEntry.handle,
    displayName: cueEntry.file.name,
    format: "cue-bin",
    fileCount: 4,
    cueFile: cueEntry.file,
    trackFiles: Object.freeze(trackFiles),
  });
}

/** Normalize a raw image or the exact pinned Redump CUE + three BIN files. */
export async function normalizeSelectedSource(handles, expectedSize) {
  requireExpectedSize(expectedSize);
  validateHandles(handles);
  const files = await readFiles(handles);
  return handles.length === 1
    ? normalizeRaw(handles, files, expectedSize)
    : normalizeCueBin(handles, files, expectedSize);
}

/**
 * Discover one supported source representation among the direct children of a
 * user-selected folder. This never descends into subdirectories and never
 * reads an entire disc image while deciding which handles to normalize.
 */
export async function normalizeSourceDirectory(directoryHandle, expectedSize) {
  requireExpectedSize(expectedSize);
  const handles = await readDirectFileHandles(directoryHandle);
  const handlesByName = new Map(handles.map((handle) => [handle.name, handle]));
  const discSet = discSetForExpectedSize(expectedSize);
  const pinnedNames = discSet
    ? [discSet.cueName, ...discSet.tracks.map((track) => track.name)]
    : [];
  const cueBinHandles = pinnedNames.map((name) => handlesByName.get(name));
  const hasCompleteCueBinSet = pinnedNames.length > 0
    && cueBinHandles.every((handle) => handle !== undefined);

  // A completed run intentionally leaves its fixed-name BIN beside the user's
  // source. Legacy random-suffix outputs are ignored too. Do not turn either
  // generated naming form into a second source candidate on the next visit.
  const possibleRawHandles = handles.filter((handle) => (
    DIRECTORY_RAW_EXTENSION_PATTERN.test(handle.name)
    && !GENERATED_PATCH_OUTPUT_PATTERN.test(handle.name)
  ));
  const matchingRawHandles = [];
  for (const handle of possibleRawHandles) {
    if (await fileSizeForDirectoryCandidate(handle) === expectedSize) {
      matchingRawHandles.push(handle);
    }
  }

  if (!hasCompleteCueBinSet && matchingRawHandles.length > 1) {
    fail(
      "SOURCE_SET_AMBIGUOUS",
      "Source directory contains more than one supported disc representation",
    );
  }

  let normalized;
  if (hasCompleteCueBinSet) {
    normalized = await normalizeSelectedSource(cueBinHandles, expectedSize);
  } else if (matchingRawHandles.length === 1) {
    normalized = await normalizeSelectedSource(matchingRawHandles, expectedSize);
  } else {
    const hasUnsupportedDisc = handles.some((handle) => DIRECTORY_UNSUPPORTED_DISC_PATTERN.test(handle.name));
    if (hasUnsupportedDisc && possibleRawHandles.length === 0) {
      fail(
        "SOURCE_FORMAT_UNSUPPORTED",
        "Cooked ISO and CHD sources are not supported; select a raw IMG/BIN or the pinned CUE/BIN set",
      );
    }
    fail(
      "SOURCE_SET_NOT_FOUND",
      "Source directory does not contain the pinned CUE/BIN set or one exact-size raw IMG/BIN",
    );
  }

  return Object.freeze({
    ...normalized,
    directoryHandle,
  });
}
