const ZIP_LOCAL_FILE_HEADER = 0x04034b50;
const ZIP_DATA_DESCRIPTOR = 0x08074b50;
const ZIP_CENTRAL_DIRECTORY_HEADER = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const ZIP_VERSION_20 = 20;
const ZIP_UTF8_AND_DATA_DESCRIPTOR_FLAGS = 0x0808;
const ZIP_STORED = 0;
const ZIP_DOS_TIME_MIDNIGHT = 0;
const ZIP_DOS_DATE_1980_01_01 = 0x0021;
const ZIP_U32_MAX = 0xffff_ffff;
const ZIP_U16_MAX = 0xffff;
const LOCAL_HEADER_FIXED_BYTES = 30;
const DATA_DESCRIPTOR_BYTES = 16;
const CENTRAL_HEADER_FIXED_BYTES = 46;
const END_OF_CENTRAL_DIRECTORY_BYTES = 22;
const SAFE_BIN_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.bin$/;
const SAFE_CUE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.cue$/;

const encoder = new TextEncoder();

export class ZipWriterError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = "ZipWriterError";
    this.code = code;
  }
}

function fail(code, message, options) {
  throw new ZipWriterError(code, message, options);
}

function buildCrc32Table() {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0
        ? (value >>> 1) ^ 0xedb8_8320
        : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
}

const CRC32_TABLE = buildCrc32Table();

function updateCrc32(state, bytes) {
  let value = state >>> 0;
  for (let index = 0; index < bytes.byteLength; index += 1) {
    value = CRC32_TABLE[(value ^ bytes[index]) & 0xff] ^ (value >>> 8);
  }
  return value >>> 0;
}

export function crc32(value) {
  const bytes = byteView(value);
  if (bytes === null) {
    throw new TypeError("CRC-32 input must be an ArrayBuffer or view");
  }
  return (updateCrc32(0xffff_ffff, bytes) ^ 0xffff_ffff) >>> 0;
}

function byteView(value) {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return null;
}

function validateSafeEntryName(name, pattern, label) {
  if (
    typeof name !== "string"
    || !pattern.test(name)
    || name === "."
    || name === ".."
    || /["/\\\0\r\n]/.test(name)
  ) {
    fail("ZIP_ENTRY_NAME_INVALID", `${label} must be a safe flat archive filename`);
  }
  const bytes = encoder.encode(name);
  if (bytes.byteLength === 0 || bytes.byteLength > ZIP_U16_MAX) {
    fail("ZIP_ENTRY_NAME_INVALID", `${label} is too long for a ZIP entry`);
  }
  return bytes;
}

function validateOptions(options) {
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("ZIP options must be an object");
  }
  const keys = Reflect.ownKeys(options);
  const expected = ["imageName", "cueName", "imageSize"];
  if (
    keys.length !== expected.length
    || expected.some((key) => !Object.hasOwn(options, key))
    || keys.some((key) => typeof key !== "string" || !expected.includes(key))
  ) {
    throw new TypeError("ZIP options must contain exactly imageName, cueName, and imageSize");
  }
  if (!Number.isSafeInteger(options.imageSize) || options.imageSize <= 0 || options.imageSize > ZIP_U32_MAX) {
    fail("ZIP_IMAGE_SIZE_INVALID", "ZIP image size must fit a classic non-ZIP64 entry");
  }

  const imageNameBytes = validateSafeEntryName(options.imageName, SAFE_BIN_NAME, "ZIP image name");
  const cueNameBytes = validateSafeEntryName(options.cueName, SAFE_CUE_NAME, "ZIP CUE name");
  const imageStem = options.imageName.slice(0, -4);
  const cueStem = options.cueName.slice(0, -4);
  if (imageStem !== cueStem) {
    fail("ZIP_ENTRY_NAME_MISMATCH", "ZIP image and CUE basenames must match");
  }

  const cueText = buildPatchedImageCue(options.imageName);
  const cueBytes = encoder.encode(cueText);
  const predictedSize = LOCAL_HEADER_FIXED_BYTES + imageNameBytes.byteLength
    + options.imageSize + DATA_DESCRIPTOR_BYTES
    + LOCAL_HEADER_FIXED_BYTES + cueNameBytes.byteLength
    + cueBytes.byteLength + DATA_DESCRIPTOR_BYTES
    + CENTRAL_HEADER_FIXED_BYTES + imageNameBytes.byteLength
    + CENTRAL_HEADER_FIXED_BYTES + cueNameBytes.byteLength
    + END_OF_CENTRAL_DIRECTORY_BYTES;
  if (!Number.isSafeInteger(predictedSize) || predictedSize > ZIP_U32_MAX) {
    fail("ZIP_ARCHIVE_TOO_LARGE", "ZIP output would require unsupported ZIP64 metadata");
  }

  return Object.freeze({
    imageName: options.imageName,
    cueName: options.cueName,
    imageSize: options.imageSize,
    imageNameBytes,
    cueNameBytes,
    cueBytes,
    predictedSize,
  });
}

function acquireWriter(writable) {
  const writer = typeof writable?.getWriter === "function" ? writable.getWriter() : writable;
  if (
    writer === null
    || typeof writer !== "object"
    || typeof writer.write !== "function"
    || typeof writer.close !== "function"
    || typeof writer.abort !== "function"
  ) {
    throw new TypeError("ZIP destination must be an abortable WritableStream or writer");
  }
  return writer;
}

function localHeader(nameBytes) {
  const bytes = new Uint8Array(LOCAL_HEADER_FIXED_BYTES + nameBytes.byteLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, ZIP_LOCAL_FILE_HEADER, true);
  view.setUint16(4, ZIP_VERSION_20, true);
  view.setUint16(6, ZIP_UTF8_AND_DATA_DESCRIPTOR_FLAGS, true);
  view.setUint16(8, ZIP_STORED, true);
  view.setUint16(10, ZIP_DOS_TIME_MIDNIGHT, true);
  view.setUint16(12, ZIP_DOS_DATE_1980_01_01, true);
  view.setUint32(14, 0, true);
  view.setUint32(18, 0, true);
  view.setUint32(22, 0, true);
  view.setUint16(26, nameBytes.byteLength, true);
  view.setUint16(28, 0, true);
  bytes.set(nameBytes, LOCAL_HEADER_FIXED_BYTES);
  return bytes;
}

function dataDescriptor(crc, size) {
  const bytes = new Uint8Array(DATA_DESCRIPTOR_BYTES);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, ZIP_DATA_DESCRIPTOR, true);
  view.setUint32(4, crc, true);
  view.setUint32(8, size, true);
  view.setUint32(12, size, true);
  return bytes;
}

function centralDirectoryHeader(nameBytes, crc, size, localHeaderOffset) {
  const bytes = new Uint8Array(CENTRAL_HEADER_FIXED_BYTES + nameBytes.byteLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, ZIP_CENTRAL_DIRECTORY_HEADER, true);
  view.setUint16(4, ZIP_VERSION_20, true);
  view.setUint16(6, ZIP_VERSION_20, true);
  view.setUint16(8, ZIP_UTF8_AND_DATA_DESCRIPTOR_FLAGS, true);
  view.setUint16(10, ZIP_STORED, true);
  view.setUint16(12, ZIP_DOS_TIME_MIDNIGHT, true);
  view.setUint16(14, ZIP_DOS_DATE_1980_01_01, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, size, true);
  view.setUint32(24, size, true);
  view.setUint16(28, nameBytes.byteLength, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, localHeaderOffset, true);
  bytes.set(nameBytes, CENTRAL_HEADER_FIXED_BYTES);
  return bytes;
}

function endOfCentralDirectory(centralDirectorySize, centralDirectoryOffset) {
  const bytes = new Uint8Array(END_OF_CENTRAL_DIRECTORY_BYTES);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, ZIP_END_OF_CENTRAL_DIRECTORY, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, 2, true);
  view.setUint16(10, 2, true);
  view.setUint32(12, centralDirectorySize, true);
  view.setUint32(16, centralDirectoryOffset, true);
  view.setUint16(20, 0, true);
  return bytes;
}

export function buildPatchedImageCue(imageName) {
  validateSafeEntryName(imageName, SAFE_BIN_NAME, "CUE image name");
  return `FILE "${imageName}" BINARY\r\n`
    + "  TRACK 01 MODE1/2352\r\n"
    + "    INDEX 01 00:00:00\r\n";
}

/**
 * Wrap a writable destination in a classic, uncompressed ZIP writer. Patched
 * image bytes are forwarded as they arrive; the complete image is never held
 * in JavaScript memory. ZIP CRC-32 is accumulated alongside the existing
 * patch-core SHA-256 authentication, which remains authoritative for the raw
 * target image.
 */
export function createPatchedImageZipWriter(writable, options) {
  // Validate every option before acquiring or writing to the destination. This
  // matters for showSaveFilePicker handles, whose existing contents may already
  // be sensitive to opening a writable stream.
  const normalized = validateOptions(options);
  const writer = acquireWriter(writable);
  let state = "open";
  let headerWritten = false;
  let archiveOffset = 0;
  let imageBytesWritten = 0;
  let imageCrcState = 0xffff_ffff;

  const releaseLock = () => {
    if (typeof writer.releaseLock === "function") {
      writer.releaseLock();
    }
  };

  const writeArchiveBytes = async (bytes) => {
    if (archiveOffset + bytes.byteLength > ZIP_U32_MAX) {
      fail("ZIP_ARCHIVE_TOO_LARGE", "ZIP output exceeded the classic ZIP size limit");
    }
    await writer.write(bytes);
    archiveOffset += bytes.byteLength;
  };

  const ensureImageHeader = async () => {
    if (!headerWritten) {
      await writeArchiveBytes(localHeader(normalized.imageNameBytes));
      headerWritten = true;
    }
  };

  return Object.freeze({
    async write(value) {
      if (state !== "open") {
        fail("ZIP_WRITER_CLOSED", "ZIP writer is not open");
      }
      const bytes = byteView(value);
      if (bytes === null) {
        throw new TypeError("ZIP image chunks must be ArrayBuffers or views");
      }
      if (imageBytesWritten + bytes.byteLength > normalized.imageSize) {
        fail("ZIP_IMAGE_SIZE_MISMATCH", "ZIP image stream exceeded its declared size");
      }
      await ensureImageHeader();
      if (bytes.byteLength === 0) {
        return;
      }
      imageCrcState = updateCrc32(imageCrcState, bytes);
      // Forward the caller's view without copying it. patch-core already owns
      // each emitted chunk and waits for this write before reusing anything.
      await writeArchiveBytes(bytes);
      imageBytesWritten += bytes.byteLength;
    },

    async close() {
      if (state !== "open") {
        fail("ZIP_WRITER_CLOSED", "ZIP writer is not open");
      }
      state = "closing";
      try {
        await ensureImageHeader();
        if (imageBytesWritten !== normalized.imageSize) {
          fail(
            "ZIP_IMAGE_SIZE_MISMATCH",
            `ZIP image stream produced ${imageBytesWritten} bytes, expected ${normalized.imageSize}`,
          );
        }

        const imageCrc = (imageCrcState ^ 0xffff_ffff) >>> 0;
        await writeArchiveBytes(dataDescriptor(imageCrc, imageBytesWritten));

        const cueLocalHeaderOffset = archiveOffset;
        await writeArchiveBytes(localHeader(normalized.cueNameBytes));
        await writeArchiveBytes(normalized.cueBytes);
        const cueCrc = crc32(normalized.cueBytes);
        await writeArchiveBytes(dataDescriptor(cueCrc, normalized.cueBytes.byteLength));

        const centralDirectoryOffset = archiveOffset;
        await writeArchiveBytes(centralDirectoryHeader(
          normalized.imageNameBytes,
          imageCrc,
          imageBytesWritten,
          0,
        ));
        await writeArchiveBytes(centralDirectoryHeader(
          normalized.cueNameBytes,
          cueCrc,
          normalized.cueBytes.byteLength,
          cueLocalHeaderOffset,
        ));
        const centralDirectorySize = archiveOffset - centralDirectoryOffset;
        await writeArchiveBytes(endOfCentralDirectory(
          centralDirectorySize,
          centralDirectoryOffset,
        ));

        if (archiveOffset !== normalized.predictedSize) {
          fail("ZIP_INTERNAL_SIZE_MISMATCH", "ZIP writer produced an unexpected archive size");
        }
        await writer.close();
        state = "closed";
        releaseLock();
      } catch (error) {
        state = "failed";
        throw error;
      }
    },

    async abort(reason) {
      if (state === "closed" || state === "aborted") {
        return;
      }
      state = "aborted";
      try {
        await writer.abort(reason);
      } finally {
        releaseLock();
      }
    },
  });
}
