const MAX_CUE_BYTES = 16 * 1024;
const MAX_DIRECTORY_ENTRIES = 64;

function pinTrack(number, name, size, mode, indexes) {
  return Object.freeze({
    number,
    name,
    size,
    mode,
    indexes: Object.freeze(indexes.map((entry) => Object.freeze(entry))),
  });
}

function pinCueRepresentation(baseName, track3Transform = null) {
  return Object.freeze({
    cueName: `${baseName}.cue`,
    mergedName: `${baseName}.bin`,
    trackNames: Object.freeze([1, 2, 3].map(
      (number) => `${baseName} (Track ${number}).bin`,
    )),
    track3Transform,
  });
}

function cueRepresentationsForDiscSet(discSet) {
  return [
    Object.freeze({
      cueName: discSet.cueName,
      mergedName: discSet.mergedName,
      trackNames: Object.freeze(discSet.tracks.map((track) => track.name)),
      track3Transform: null,
    }),
    ...(discSet.cueRepresentations ?? []),
  ];
}

const F_REV_B_PROFILE_ID = "saturn-jp-stock-track01-mode1-2352-c198a930";
const FINAL_REV_A_11M_PROFILE_ID = "saturn-jp-stock-track01-mode1-2352-ff7192ab";
const FINAL_10M_TRACK3_TRANSFORM = Object.freeze({
  leadingZeroBytes: 20,
  trimEndBytes: 20,
});

/**
 * Every accepted canonical source profile. Alternate CUE/BIN representations
 * may be normalized to that profile without adding another public release.
 */
export const PINNED_DISC_SETS = Object.freeze([
  Object.freeze({
    gameId: "srwf-f",
    profileId: F_REV_B_PROFILE_ID,
    cueName: "Super Robot Taisen F (Japan) (Rev B) (21M).cue",
    mergedName: "Super Robot Taisen F (Japan) (Rev B) (21M).bin",
    sourceLabel: "세가 새턴 일본판 Rev. B",
    tracks: Object.freeze([
      pinTrack(1, "Super Robot Taisen F (Japan) (Rev B) (21M) (Track 1).bin", 238_711_536, "MODE1/2352", [[1, "00:00:00"]]),
      pinTrack(2, "Super Robot Taisen F (Japan) (Rev B) (21M) (Track 2).bin", 335_919_696, "MODE2/2352", [[0, "00:00:00"], [1, "00:03:00"]]),
      pinTrack(3, "Super Robot Taisen F (Japan) (Rev B) (21M) (Track 3).bin", 3_880_800, "AUDIO", [[0, "00:00:00"], [1, "00:02:00"]]),
    ]),
    cueRepresentations: Object.freeze([]),
    mergedSize: 578_512_032,
  }),
  Object.freeze({
    gameId: "srwf-final",
    profileId: FINAL_REV_A_11M_PROFILE_ID,
    cueName: "Super Robot Taisen F - Kanketsu-hen (Japan) (Rev A) (11M).cue",
    mergedName: "Super Robot Taisen F - Kanketsu-hen (Japan) (Rev A) (11M).bin",
    sourceLabel: "세가 새턴 일본판 Rev. A",
    tracks: Object.freeze([
      pinTrack(1, "Super Robot Taisen F - Kanketsu-hen (Japan) (Rev A) (11M) (Track 1).bin", 180_607_728, "MODE1/2352", [[1, "00:00:00"]]),
      pinTrack(2, "Super Robot Taisen F - Kanketsu-hen (Japan) (Rev A) (11M) (Track 2).bin", 335_919_696, "MODE2/2352", [[0, "00:00:00"], [1, "00:03:00"]]),
      pinTrack(3, "Super Robot Taisen F - Kanketsu-hen (Japan) (Rev A) (11M) (Track 3).bin", 3_880_800, "AUDIO", [[0, "00:00:00"], [1, "00:02:00"]]),
    ]),
    cueRepresentations: Object.freeze([
      pinCueRepresentation(
        "Super Robot Taisen F - Kanketsu-hen (Japan) (Rev A) (10M)",
        FINAL_10M_TRACK3_TRANSFORM,
      ),
      pinCueRepresentation(
        "Super Robot Taisen F Kanketsuhen (Japan) (Rev A) (10M)",
        FINAL_10M_TRACK3_TRANSFORM,
      ),
    ]),
    mergedSize: 520_408_224,
  }),
]);

for (const discSet of PINNED_DISC_SETS) {
  const trackTotal = discSet.tracks.reduce((total, track) => total + track.size, 0);
  if (trackTotal !== discSet.mergedSize) {
    throw new Error(`Pinned disc set ${discSet.gameId} track sizes do not sum to its merged size`);
  }
  for (const representation of cueRepresentationsForDiscSet(discSet)) {
    if (representation.trackNames.length !== discSet.tracks.length) {
      throw new Error(`Pinned disc set ${discSet.gameId} CUE representation has the wrong track count`);
    }
    const transform = representation.track3Transform;
    if (transform !== null && (
      !Number.isSafeInteger(transform.leadingZeroBytes)
      || transform.leadingZeroBytes <= 0
      || transform.leadingZeroBytes !== transform.trimEndBytes
      || transform.trimEndBytes >= discSet.tracks[2].size
    )) {
      throw new Error(`Pinned disc set ${discSet.gameId} has an invalid Track 3 transform`);
    }
  }
}
if (new Set(PINNED_DISC_SETS.map((discSet) => discSet.profileId)).size !== PINNED_DISC_SETS.length) {
  throw new Error("Pinned disc sets must have distinct profile ids");
}

export function discSetForExpectedSize(expectedSize, profileId) {
  if (profileId !== undefined && (typeof profileId !== "string" || profileId.length === 0)) {
    throw new TypeError("profileId must be a non-empty string when supplied");
  }
  const sizeMatches = PINNED_DISC_SETS.filter(
    (discSet) => discSet.mergedSize === expectedSize,
  );
  if (profileId !== undefined) {
    return sizeMatches.find((discSet) => discSet.profileId === profileId) ?? null;
  }
  return sizeMatches.length === 1 ? sizeMatches[0] : null;
}

// Backwards-compatible aliases for callers and tests written for the original
// single-game F Rev. B release.
export const SRWF_REV_B_TRACKS = PINNED_DISC_SETS[0].tracks;
export const SRWF_REV_B_CUE_NAME = PINNED_DISC_SETS[0].cueName;
export const SRWF_REV_B_MERGED_SIZE = PINNED_DISC_SETS[0].mergedSize;

const RAW_EXTENSION_PATTERN = /\.(?:bin|img|iso)$/i;
const DIRECTORY_RAW_EXTENSION_PATTERN = /\.(?:bin|img)$/i;
const DIRECTORY_UNSUPPORTED_DISC_PATTERN = /\.(?:iso|chd)$/i;
const GENERATED_PATCH_OUTPUT_PATTERN =
  /^SRWF(?:IN)?-KOR-\d{8}-v\d+(?:\.\d+)+(?:-[a-f0-9]{24})?\.bin$/i;

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
  if (text.startsWith("\ufeff") || text.includes("\0") || /\r(?!\n)/.test(text)) {
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
    if (referencedName.includes("/") || referencedName.includes("\\")) {
      fail("CUE_FILE_MISMATCH", `CUE track ${track.number} must reference a safe pinned BIN basename`);
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
  const representation = cueRepresentationsForDiscSet(discSet).find(
    (candidate) => candidate.trackNames.every(
      (name, index) => name === referencedNames[index],
    ),
  );
  if (!representation) {
    fail("CUE_FILE_MISMATCH", "CUE must reference one complete pinned BIN basename set");
  }
  return Object.freeze({
    format: "cue-bin",
    cueName: representation.cueName,
    mergedName: representation.mergedName,
    referencedNames: Object.freeze(referencedNames),
    track3Transform: representation.track3Transform,
  });
}

/** Backwards-compatible parser pinned to the original F Rev. B layout. */
export function parseSrwfRevBCue(text) {
  return parsePinnedCue(text, PINNED_DISC_SETS[0]);
}

async function normalizeRaw(handles, files, expectedSize, profileId) {
  const [handle] = handles;
  const [file] = files;
  if (!RAW_EXTENSION_PATTERN.test(file.name)) {
    fail("SOURCE_FORMAT_UNSUPPORTED", "A single source must be a raw BIN, IMG, or raw-sector ISO file");
  }
  if (file.size !== expectedSize) {
    fail("SOURCE_SIZE_MISMATCH", "Raw image size does not match the selected release");
  }
  const discSet = discSetForExpectedSize(expectedSize, profileId);
  const knownShiftedRawName = discSet && cueRepresentationsForDiscSet(discSet).some(
    (representation) => representation.track3Transform !== null
      && representation.mergedName === file.name,
  );
  // A same-size renamed raw file cannot be distinguished without hashing it;
  // leave that path as identity so the downstream canonical source hash still
  // rejects raw 10M bytes. Never apply the filename-selected shift to raw data.
  if (knownShiftedRawName) {
    fail(
      "SOURCE_PROFILE_UNSUPPORTED",
      "The Final 10M pressing is supported only as its CUE and three BIN tracks",
    );
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

function mergedCueBinParts(trackFiles, track3Transform) {
  if (track3Transform === null) {
    return trackFiles;
  }
  const track3 = trackFiles[2];
  return [
    trackFiles[0],
    trackFiles[1],
    new Uint8Array(track3Transform.leadingZeroBytes),
    track3.slice(0, track3.size - track3Transform.trimEndBytes),
  ];
}

async function verifyTrack3TransformPreimage(track3, track3Transform) {
  if (track3Transform === null) {
    return;
  }
  // The patch worker authenticates every retained byte through the canonical
  // ff7192 source hash. Check the only discarded bytes here so the transform
  // cannot hide a modified 10M tail behind that downstream hash.
  let trimmedTail;
  try {
    trimmedTail = new Uint8Array(
      await track3.slice(track3.size - track3Transform.trimEndBytes).arrayBuffer(),
    );
  } catch (error) {
    fail("SOURCE_FILE_READ_FAILED", "The Final 10M Track 3 tail could not be read", { cause: error });
  }
  if (
    trimmedTail.byteLength !== track3Transform.trimEndBytes
    || trimmedTail.some((byte) => byte !== 0)
  ) {
    fail(
      "SOURCE_PROFILE_UNSUPPORTED",
      "The Final 10M Track 3 does not have the exact reversible zero tail",
    );
  }
}

async function normalizeCueBin(handles, files, expectedSize, profileId) {
  const discSet = discSetForExpectedSize(expectedSize, profileId);
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
  if (cueEntry.file.name !== parsedCue.cueName) {
    fail("CUE_NAME_MISMATCH", "CUE basename does not match its pinned BIN basename set");
  }

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
  await verifyTrack3TransformPreimage(trackFiles[2], parsedCue.track3Transform);
  // Blob parts provide an immutable virtual concatenation without calling
  // arrayBuffer()/stream() on the 520-579 MB track inputs. The Final 10M audio
  // track differs from the accepted 11M source only by a reversible 20-byte
  // shift, so normalize it with one bounded zero part and one Blob slice.
  const mergedParts = mergedCueBinParts(trackFiles, parsedCue.track3Transform);
  const mergedBlob = typeof File === "function"
    ? new File(mergedParts, discSet.mergedName, { type: "application/octet-stream" })
    : new Blob(mergedParts, { type: "application/octet-stream" });
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

/** Normalize a raw image or an exact pinned Redump CUE + three BIN files. */
export async function normalizeSelectedSource(handles, expectedSize, profileId) {
  requireExpectedSize(expectedSize);
  if (profileId !== undefined && !discSetForExpectedSize(expectedSize, profileId)) {
    fail("SOURCE_PROFILE_UNSUPPORTED", "Source profile id and size do not match a pinned disc set");
  }
  validateHandles(handles);
  const files = await readFiles(handles);
  return handles.length === 1
    ? normalizeRaw(handles, files, expectedSize, profileId)
    : normalizeCueBin(handles, files, expectedSize, profileId);
}

/**
 * Discover one supported source representation among the direct children of a
 * user-selected folder. This never descends into subdirectories and never
 * reads an entire disc image while deciding which handles to normalize.
 */
export async function normalizeSourceDirectory(directoryHandle, expectedSize, profileId) {
  requireExpectedSize(expectedSize);
  if (profileId !== undefined && !discSetForExpectedSize(expectedSize, profileId)) {
    fail("SOURCE_PROFILE_UNSUPPORTED", "Source profile id and size do not match a pinned disc set");
  }
  const handles = await readDirectFileHandles(directoryHandle);
  const handlesByName = new Map(handles.map((handle) => [handle.name, handle]));
  const discSet = discSetForExpectedSize(expectedSize, profileId);
  const completeCueBinSets = discSet
    ? cueRepresentationsForDiscSet(discSet)
      .map((representation) => [
        representation.cueName,
        ...representation.trackNames,
      ].map((name) => handlesByName.get(name)))
      .filter((candidate) => candidate.every((handle) => handle !== undefined))
    : [];
  if (completeCueBinSets.length > 1) {
    fail(
      "SOURCE_SET_AMBIGUOUS",
      "Source directory contains more than one supported CUE/BIN representation",
    );
  }
  const cueBinHandles = completeCueBinSets[0] ?? [];
  const hasCompleteCueBinSet = cueBinHandles.length > 0;

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
    normalized = await normalizeSelectedSource(cueBinHandles, expectedSize, profileId);
  } else if (matchingRawHandles.length === 1) {
    normalized = await normalizeSelectedSource(matchingRawHandles, expectedSize, profileId);
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
