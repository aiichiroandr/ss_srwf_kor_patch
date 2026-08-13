const MAX_CUE_BYTES = 16 * 1024;

export const SRWF_REV_B_TRACKS = Object.freeze([
  Object.freeze({
    number: 1,
    name: "Super Robot Taisen F (Japan) (Rev B) (21M) (Track 1).bin",
    size: 238_711_536,
    mode: "MODE1/2352",
    indexes: Object.freeze([[1, "00:00:00"]]),
  }),
  Object.freeze({
    number: 2,
    name: "Super Robot Taisen F (Japan) (Rev B) (21M) (Track 2).bin",
    size: 335_919_696,
    mode: "MODE2/2352",
    indexes: Object.freeze([[0, "00:00:00"], [1, "00:03:00"]]),
  }),
  Object.freeze({
    number: 3,
    name: "Super Robot Taisen F (Japan) (Rev B) (21M) (Track 3).bin",
    size: 3_880_800,
    mode: "AUDIO",
    indexes: Object.freeze([[0, "00:00:00"], [1, "00:02:00"]]),
  }),
]);

export const SRWF_REV_B_CUE_NAME =
  "Super Robot Taisen F (Japan) (Rev B) (21M).cue";

export const SRWF_REV_B_MERGED_SIZE = SRWF_REV_B_TRACKS.reduce(
  (total, track) => total + track.size,
  0,
);

const RAW_EXTENSION_PATTERN = /\.(?:bin|img|iso)$/i;

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
 * Parse the exact three-track Redump layout supported by the accepted patch.
 * Whitespace indentation and LF/CRLF are presentation details; every command,
 * track mode, index, timestamp, and referenced basename is otherwise pinned.
 */
export function parseSrwfRevBCue(text) {
  if (typeof text !== "string") {
    throw new TypeError("CUE text must be a string");
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
  for (const track of SRWF_REV_B_TRACKS) {
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
  if (expectedSize !== SRWF_REV_B_MERGED_SIZE) {
    fail("SOURCE_PROFILE_UNSUPPORTED", "This CUE/BIN layout does not match the selected release profile");
  }

  const entries = handles.map((handle, index) => ({ handle, file: files[index] }));
  const cueEntries = entries.filter(({ file }) => file.name.toLowerCase().endsWith(".cue"));
  const binEntries = entries.filter(({ file }) => file.name.toLowerCase().endsWith(".bin"));
  if (cueEntries.length !== 1 || binEntries.length !== 3) {
    fail("SOURCE_SET_INVALID", "Select exactly one CUE and three BIN files");
  }
  const cueEntry = cueEntries[0];
  if (cueEntry.file.name !== SRWF_REV_B_CUE_NAME) {
    fail("CUE_NAME_MISMATCH", "CUE basename is not the pinned Rev B Redump name");
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
  const parsedCue = parseSrwfRevBCue(cueText);

  const entriesByName = new Map(binEntries.map((entry) => [entry.file.name, entry]));
  const orderedEntries = parsedCue.referencedNames.map((name) => entriesByName.get(name));
  if (orderedEntries.some((entry) => entry === undefined)) {
    fail("CUE_REFERENCE_MISSING", "A BIN referenced by the CUE was not selected");
  }
  for (let index = 0; index < SRWF_REV_B_TRACKS.length; index += 1) {
    if (orderedEntries[index].file.size !== SRWF_REV_B_TRACKS[index].size) {
      fail("TRACK_SIZE_MISMATCH", `BIN track ${index + 1} size does not match the pinned Rev B dump`);
    }
  }

  const trackFiles = orderedEntries.map((entry) => entry.file);
  // A Blob built from Blob/File parts is the browser-native, immutable virtual
  // concatenation. Construction does not call arrayBuffer()/stream() on the
  // 579 MB inputs; the existing patch worker consumes this Blob once and writes
  // the patched result directly to its output handle.
  const mergedName = "Super Robot Taisen F (Japan) (Rev B) (21M).bin";
  const mergedBlob = typeof File === "function"
    ? new File(trackFiles, mergedName, { type: "application/octet-stream" })
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

/** Normalize a raw image or the exact Rev B Redump CUE + three BIN files. */
export async function normalizeSelectedSource(handles, expectedSize) {
  requireExpectedSize(expectedSize);
  validateHandles(handles);
  const files = await readFiles(handles);
  return handles.length === 1
    ? normalizeRaw(handles, files, expectedSize)
    : normalizeCueBin(handles, files, expectedSize);
}
