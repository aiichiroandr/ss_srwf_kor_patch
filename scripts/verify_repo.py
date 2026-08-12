#!/usr/bin/env python3
"""Fail-closed repository checks for the static SRWF Korean patch site."""

from __future__ import annotations

from datetime import datetime
import hashlib
from html.parser import HTMLParser
import json
import os
from pathlib import Path, PurePosixPath
import re
import struct
import subprocess
import sys
from typing import Any
from urllib.parse import unquote, urlsplit
import zlib


ROOT = Path(__file__).resolve().parents[1]
INDEX_PATH = ROOT / "manifest/releases.json"
HEX64 = re.compile(r"^[0-9a-f]{64}$")
ID_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{0,63}$")
COMMIT_RE = re.compile(r"^(?:[0-9a-f]{40}|[0-9a-f]{64})$")
VERSION_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$")
RFC3339_RE = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$"
)

STOCK_PROFILE = {
    "id": "saturn-jp-stock-track01-mode1-2352-c198a930",
    "size": 578_512_032,
    "sha256": "c198a93007d46161abe769b6f579f01cae89e23737c0a2ff38ec314d43b3adf8",
    "sectorCount": 245_966,
    "sectorSize": 2_352,
    "userDataOffset": 16,
    "userDataSize": 2_048,
    "track": "TRACK 01 MODE1/2352",
}
GAME_DEFINITIONS = {
    "srwf-f": {"label": "슈퍼로봇대전 F"},
    "srwf-final": {"label": "슈퍼로봇대전 F 완결편"},
}
PINNED_STOCK_PROFILES = {
    STOCK_PROFILE["id"]: {"gameId": "srwf-f", **STOCK_PROFILE},
}
PATCH_MAX = 32 * 1024 * 1024
BODY_MAX = 64 * 1024 * 1024
RECORD_MAX = 1_000_000
JS_SAFE_INTEGER_MAX = 9_007_199_254_740_991
PATCH_MAGIC = b"SRWFKP1\0"
PATCH_HEADER_SIZE = 100
RECORD_HEADER_SIZE = 44
JSON_SCHEMA_DRAFT = "https://json-schema.org/draft/2020-12/schema"
HEX64_PATTERN = r"^[0-9a-f]{64}$"
ID_PATTERN = r"^[a-z0-9][a-z0-9._-]{0,63}$"
COMMIT_PATTERN = r"^(?:[0-9a-f]{40}|[0-9a-f]{64})$"
VERSION_PATTERN = r"^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$"
MANIFEST_REFERENCE_PATTERN = r"^releases/[a-z0-9][a-z0-9._-]{0,63}\.json$"
PATCH_REFERENCE_PATTERN = r"^patches/[a-z0-9][a-z0-9._-]{0,63}\.srwfp$"

REQUIRED_FILES = {
    ".gitattributes",
    ".gitignore",
    ".nojekyll",
    "AGENTS.md",
    "NOTICE.md",
    "README.md",
    "index.html",
    "package.json",
    "assets/app.mjs",
    "assets/patch-core.mjs",
    "assets/patch-worker.mjs",
    "assets/release-notes.mjs",
    "assets/sha256.mjs",
    "assets/style.css",
    "docs/PATCH_FORMAT.md",
    "docs/RELEASE_POLICY.md",
    "manifest/releases.json",
    "schemas/acceptance-receipt.schema.json",
    "schemas/patch-descriptor.schema.json",
    "schemas/release.schema.json",
    "schemas/releases.schema.json",
    "scripts/verify_repo.py",
    ".githooks/pre-commit",
    "tests/frontend-contract.test.mjs",
    "tests/patch-core.test.mjs",
    "tests/patch-worker.test.mjs",
    "tests/test_verify_repo.py",
}

FORBIDDEN_SUFFIXES = {
    ".bin", ".img", ".iso", ".rom", ".cue", ".chd", ".ccd", ".sub",
    ".mds", ".mdf", ".nrg", ".gdi", ".cdi", ".pbp", ".rvz", ".wia",
    ".wbfs", ".wad", ".xci", ".nsp", ".cia", ".zip", ".7z", ".rar",
    ".tar", ".tgz", ".sav", ".srm", ".bup", ".bcr", ".bkr", ".mcr",
    ".dsv", ".yss", ".state", ".ips", ".bps", ".xdelta", ".xdelta1",
    ".xdelta2", ".xdelta3", ".vcdiff", ".ppf", ".pem", ".key",
}
FORBIDDEN_DIRS = {
    "build", "dist", "out", "staging", "coverage", "node_modules", ".cache",
    ".parcel-cache", "tmp", "temp", "states", "saves", "mednafen",
}
FORBIDDEN_NAMES = {".DS_Store", "Thumbs.db"}
PUBLIC_ASSET_SUFFIXES = {".png", ".webp", ".ico", ".woff2"}
ALLOWED_BINARY_SUFFIXES = {".srwfp"} | PUBLIC_ASSET_SUFFIXES
PUBLIC_ASSET_MAX = 8 * 1024 * 1024
PUBLIC_ASSET_TOTAL_MAX = 24 * 1024 * 1024
PNG_DIMENSION_MAX = 32_768
# Binary UI assets are publication decisions, not extension-based exceptions.
# Add only a reviewed canonical repository path and its exact lowercase SHA-256.
PUBLIC_ASSET_ALLOWLIST: dict[str, str] = {
    "assets/patch-notes/v1-0-protagonist-names-after.png": "6aa800e2f97e9d572af8de57393d79bfa991463a799e0d9b1ca03a6bc9be728b",
    "assets/patch-notes/v1-0-protagonist-names-before.png": "6f3ee06e5091d36143243b592bbacf0123928fa45fa24b8aa08e9909acd0dd26",
    "assets/patch-notes/v1-0-preview-body-after.png": "ff5bbb34f33376d1444f93248e7aedee378259f75a13c9b2faa7f9ebff41dae9",
    "assets/patch-notes/v1-0-preview-body-before.png": "bc531af867d8ead30a25101b344828295621f31c20d8d6768d8405c5d069195d",
    "assets/patch-notes/v1-0-preview-heading-after.png": "f1fecef1beb5a573672b6aa9a1980c401ebc5a73aa308c27d6eb84d03294c2ec",
    "assets/patch-notes/v1-0-preview-heading-before.png": "5ce50d87b82b2f9d53d3ba10b425dab11597f3213f56b80d79e8516e1d7469fd",
    "assets/patch-notes/v1-0-sortie-names-after.png": "aa4af74111abbb7f8601d938a666c492c55b4610139aa45566c61af8651be77d",
    "assets/patch-notes/v1-0-sortie-names-before.png": "0f2d1ce96f90d5e67af21fa87ab9cc54bf2e5aa4f1c1df67614be027bcc0a36e",
    "assets/patch-notes/v1-1-preview-body-13pt.png": "ff5bbb34f33376d1444f93248e7aedee378259f75a13c9b2faa7f9ebff41dae9",
    "assets/patch-notes/v1-1-preview-body-15pt.png": "0366cb380c5f1f75831775f48901844a769d8de954da726ca7e80f3e982b2dcc",
    "assets/patch-notes/v1-1-ram-disconnect-after.png": "c1ed3d24b63532af079a437e056c486c7fd0a3ff1cc22b8c3104f6b3af14f6d9",
    "assets/patch-notes/v1-1-ram-disconnect-before.png": "a77e308c7401114628cd643f5edd9f116ead6a9ef947125915d49baac32fbd2e",
    "assets/patch-notes/v1-1-ram-parts-after.png": "fc783e6ab9f790f0ac0a9a02a6f5465fe9a8d21db26fbb0ca2d013769a19d260",
    "assets/patch-notes/v1-1-ram-parts-before.png": "454515ba6451ce76ff59de4005d0605388b09c9b1708497668bd1285e251cef2",
    "assets/patch-notes/v1-1-ram-split-after.png": "77f7ab2a704fbb4fce67fcb186a9ac741211f6ccc9d9a96d50782869367a4c81",
    "assets/patch-notes/v1-1-ram-split-before.png": "6708283242c2ce95b6b24776593698c4a702d9f15a7c6a305421d67d49b55045",
    "assets/patch-notes/v1-1-ram-turn-end-after.png": "9fdd3dc824328746e42fbf164652569c44da752ce5376b8aa23f3e4f7fd988a8",
    "assets/patch-notes/v1-1-ram-turn-end-before.png": "60722fb4a8a46377a992e129daa4df1adfffdfd3523a16b6fb038a8abc42c540",
    "assets/patch-notes/v1-1-sortie-count-after.png": "a209089b81d7d6a84a0d1af76cba2fd4dc5c93f64181b14937125af2b60bb2c9",
    "assets/patch-notes/v1-1-sortie-count-before.png": "07d3c97544c5e4a33e91784bce96123468a809fe7226da478c399c802bf00b9d",
}
ACTIVE_WEB_SUFFIXES = {
    ".html", ".htm", ".shtml", ".xhtml", ".xht", ".svg",
    ".xml", ".xsl", ".xslt",
    ".css", ".js", ".mjs",
}
MARKUP_WEB_SUFFIXES = {
    ".html", ".htm", ".shtml", ".xhtml", ".xht", ".svg",
    ".xml", ".xsl", ".xslt",
}
TEST_FIXTURE_SOURCE_SUFFIXES = {".js", ".mjs"}
REQUIRED_CSP_DIRECTIVES = {
    "default-src": ("'self'",),
    "base-uri": ("'none'",),
    "connect-src": ("'self'",),
    "font-src": ("'self'",),
    "form-action": ("'none'",),
    "frame-src": ("'none'",),
    "img-src": ("'self'",),
    "object-src": ("'none'",),
    "script-src": ("'self'",),
    "style-src": ("'self'",),
    "worker-src": ("'self'",),
}
REQUIRED_IGNORE_LINES = {
    "*.bin", "*.img", "*.iso", "*.cue", "*.sav", "*.state", "*.ips",
    "*.bps", "*.xdelta", "*.vcdiff", "*.ppf", "*.pem", "*.key", ".env*",
    "/staging/", "build/", "node_modules/",
}
EXPECTED_PACKAGE_SCRIPTS = {
    "build": (
        "python3 scripts/verify_repo.py && node --test && "
        "PYTHONDONTWRITEBYTECODE=1 python3 -m unittest tests/test_verify_repo.py"
    ),
    "verify": "python3 scripts/verify_repo.py",
    "test": (
        "node --test && PYTHONDONTWRITEBYTECODE=1 "
        "python3 -m unittest tests/test_verify_repo.py && python3 scripts/verify_repo.py"
    ),
}
EXPECTED_PRE_COMMIT_LINES = [
    "#!/bin/sh",
    "set -eu",
    "",
    "repository_root=$(git rev-parse --show-toplevel)",
    'cd "$repository_root"',
    "exec npm test",
]


errors: list[str] = []


def complain(message: str) -> None:
    errors.append(message)


def relative(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_json(path: Path) -> Any | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        complain(f"{relative(path)}: invalid JSON/UTF-8: {exc}")
        return None


def exact_keys(value: Any, keys: set[str], context: str) -> bool:
    if not isinstance(value, dict):
        complain(f"{context}: expected an object")
        return False
    actual = set(value)
    if actual != keys:
        complain(
            f"{context}: keys differ (missing={sorted(keys - actual)}, "
            f"unexpected={sorted(actual - keys)})"
        )
        return False
    return True


def is_hex64(value: Any) -> bool:
    return isinstance(value, str) and HEX64.fullmatch(value) is not None


def is_bounded_string(value: Any, *, maximum: int) -> bool:
    return isinstance(value, str) and bool(value.strip()) and len(value) <= maximum


def is_rfc3339_datetime(value: Any) -> bool:
    if not isinstance(value, str) or RFC3339_RE.fullmatch(value) is None:
        return False
    try:
        parsed = datetime.fromisoformat(value[:-1] + "+00:00" if value.endswith("Z") else value)
    except ValueError:
        return False
    return parsed.tzinfo is not None


def is_safe_relative(value: Any, *, prefix: str, suffix: str) -> bool:
    if not isinstance(value, str) or not value.startswith(prefix) or not value.endswith(suffix):
        return False
    if "\\" in value or "%" in value:
        return False
    parsed = urlsplit(value)
    if parsed.scheme or parsed.netloc or parsed.query or parsed.fragment or value.startswith("/"):
        return False
    raw_parts = value.split("/")
    if not raw_parts or any(part in {"", ".", ".."} for part in raw_parts):
        return False
    try:
        (ROOT / value).resolve().relative_to(ROOT.resolve())
    except ValueError:
        return False
    return True


class SrwfpFormatError(ValueError):
    """Raised when a public sparse patch violates the v1 wire contract."""


class DeflateBitReader:
    """Small RFC 1951 reader used to enforce the RFC 1950 advertised window."""

    def __init__(self, data: bytes) -> None:
        self.data = data
        self.bit_offset = 0

    def read(self, count: int) -> int:
        if self.bit_offset + count > len(self.data) * 8:
            raise SrwfpFormatError("DEFLATE payload is truncated")
        value = 0
        for index in range(count):
            absolute_bit = self.bit_offset + index
            bit = (self.data[absolute_bit >> 3] >> (absolute_bit & 7)) & 1
            value |= bit << index
        self.bit_offset += count
        return value

    def align_to_byte(self) -> None:
        self.bit_offset = (self.bit_offset + 7) & ~7

    def skip_bytes(self, count: int) -> None:
        if self.bit_offset & 7 or self.bit_offset + count * 8 > len(self.data) * 8:
            raise SrwfpFormatError("stored DEFLATE block is truncated")
        self.bit_offset += count * 8

    def consumed_bytes(self) -> int:
        return (self.bit_offset + 7) // 8


def reverse_bits(value: int, length: int) -> int:
    reversed_value = 0
    for index in range(length):
        reversed_value = (reversed_value << 1) | ((value >> index) & 1)
    return reversed_value


def build_huffman(lengths: list[int], label: str) -> tuple[str, int, list[dict[int, int]]]:
    if any(not isinstance(length, int) or length < 0 or length > 15 for length in lengths):
        raise SrwfpFormatError(f"{label} contains an invalid code length")
    maximum_length = max(lengths, default=0)
    counts = [0] * (maximum_length + 1)
    for length in lengths:
        if length:
            counts[length] += 1

    remaining = 1
    for length in range(1, maximum_length + 1):
        remaining = (remaining << 1) - counts[length]
        if remaining < 0:
            raise SrwfpFormatError(f"{label} is oversubscribed")

    next_code = [0] * (maximum_length + 1)
    code = 0
    for length in range(1, maximum_length + 1):
        code = (code + counts[length - 1]) << 1
        next_code[length] = code

    tables: list[dict[int, int]] = [{} for _ in range(maximum_length + 1)]
    for symbol, length in enumerate(lengths):
        if length:
            transmitted_code = reverse_bits(next_code[length], length)
            tables[length][transmitted_code] = symbol
            next_code[length] += 1
    return label, maximum_length, tables


def decode_huffman(
    reader: DeflateBitReader,
    huffman: tuple[str, int, list[dict[int, int]]],
) -> int:
    label, maximum_length, tables = huffman
    code = 0
    for length in range(1, maximum_length + 1):
        code |= reader.read(1) << (length - 1)
        symbol = tables[length].get(code)
        if symbol is not None:
            return symbol
    raise SrwfpFormatError(f"{label} contains an invalid code")


def fixed_huffman_tables() -> tuple[
    tuple[str, int, list[dict[int, int]]],
    tuple[str, int, list[dict[int, int]]],
]:
    literal_lengths = [8] * 144 + [9] * 112 + [7] * 24 + [8] * 8
    return (
        build_huffman(literal_lengths, "fixed literal/length alphabet"),
        build_huffman([5] * 32, "fixed distance alphabet"),
    )


def dynamic_huffman_tables(reader: DeflateBitReader) -> tuple[
    tuple[str, int, list[dict[int, int]]],
    tuple[str, int, list[dict[int, int]]],
]:
    literal_count = reader.read(5) + 257
    distance_count = reader.read(5) + 1
    code_length_count = reader.read(4) + 4
    order = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]
    code_lengths = [0] * 19
    for index in range(code_length_count):
        code_lengths[order[index]] = reader.read(3)

    code_length_huffman = build_huffman(code_lengths, "code-length alphabet")
    total = literal_count + distance_count
    lengths: list[int] = []
    while len(lengths) < total:
        symbol = decode_huffman(reader, code_length_huffman)
        if symbol <= 15:
            lengths.append(symbol)
            continue
        if symbol == 16:
            if not lengths:
                raise SrwfpFormatError("code-length repeat has no predecessor")
            repeated_length = lengths[-1]
            repeat_count = reader.read(2) + 3
        elif symbol == 17:
            repeated_length = 0
            repeat_count = reader.read(3) + 3
        elif symbol == 18:
            repeated_length = 0
            repeat_count = reader.read(7) + 11
        else:
            raise SrwfpFormatError("code-length alphabet contains a reserved symbol")
        if len(lengths) + repeat_count > total:
            raise SrwfpFormatError("code-length repeat exceeds its alphabets")
        lengths.extend([repeated_length] * repeat_count)

    literal_lengths = lengths[:literal_count]
    if literal_lengths[256] == 0:
        raise SrwfpFormatError("literal/length alphabet has no end-of-block symbol")
    return (
        build_huffman(literal_lengths, "dynamic literal/length alphabet"),
        build_huffman(lengths[literal_count:], "dynamic distance alphabet"),
    )


LENGTH_BASES = [
    3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23,
    27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258,
]
LENGTH_EXTRA_BITS = [
    0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2,
    2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
]
DISTANCE_BASES = [
    1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129,
    193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145,
    8193, 12289, 16385, 24577,
]
DISTANCE_EXTRA_BITS = [
    0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6,
    6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
]


def scan_compressed_block(
    reader: DeflateBitReader,
    huffman: tuple[
        tuple[str, int, list[dict[int, int]]],
        tuple[str, int, list[dict[int, int]]],
    ],
    produced_bytes: int,
    advertised_window: int,
) -> int:
    literal_huffman, distance_huffman = huffman
    produced = produced_bytes
    while True:
        symbol = decode_huffman(reader, literal_huffman)
        if symbol <= 255:
            produced += 1
        elif symbol == 256:
            return produced
        elif 257 <= symbol <= 285:
            length_index = symbol - 257
            length = LENGTH_BASES[length_index] + reader.read(LENGTH_EXTRA_BITS[length_index])
            distance_symbol = decode_huffman(reader, distance_huffman)
            if distance_symbol > 29:
                raise SrwfpFormatError("distance alphabet contains a reserved symbol")
            distance = DISTANCE_BASES[distance_symbol] + reader.read(
                DISTANCE_EXTRA_BITS[distance_symbol]
            )
            if distance > produced:
                raise SrwfpFormatError("DEFLATE back-reference precedes the output")
            if distance > advertised_window:
                raise SrwfpFormatError("DEFLATE back-reference exceeds the advertised zlib window")
            produced += length
        else:
            raise SrwfpFormatError("literal/length alphabet contains a reserved symbol")
        if produced > BODY_MAX:
            raise SrwfpFormatError(f"body exceeds the {BODY_MAX}-byte cap")


def inspect_deflate_payload(compressed: bytes, expected_size: int, advertised_window: int) -> None:
    payload = compressed[2:-4]
    reader = DeflateBitReader(payload)
    produced = 0
    while True:
        is_final = reader.read(1) == 1
        block_type = reader.read(2)
        if block_type == 0:
            reader.align_to_byte()
            length = reader.read(16)
            inverted_length = reader.read(16)
            if inverted_length != (~length & 0xFFFF):
                raise SrwfpFormatError("stored DEFLATE block has an invalid length check")
            reader.skip_bytes(length)
            produced += length
        elif block_type == 1:
            produced = scan_compressed_block(
                reader, fixed_huffman_tables(), produced, advertised_window
            )
        elif block_type == 2:
            produced = scan_compressed_block(
                reader, dynamic_huffman_tables(reader), produced, advertised_window
            )
        else:
            raise SrwfpFormatError("DEFLATE block uses the reserved block type")
        if produced > BODY_MAX:
            raise SrwfpFormatError(f"body exceeds the {BODY_MAX}-byte cap")
        if is_final:
            break
    if reader.consumed_bytes() != len(payload):
        raise SrwfpFormatError("zlib stream contains trailing compressed data after the final DEFLATE block")
    if produced != expected_size:
        raise SrwfpFormatError(
            f"decompressed body structure produces {produced} bytes, declared {expected_size}"
        )


def inspect_srwfp(data: bytes) -> dict[str, int | str]:
    """Parse an SRWFP v1 payload with the public browser safety limits."""
    patch_size = len(data)
    if patch_size < PATCH_HEADER_SIZE + 1:
        raise SrwfpFormatError("patch is shorter than its header and zlib body")
    if patch_size > PATCH_MAX:
        raise SrwfpFormatError(f"patch exceeds the {PATCH_MAX}-byte cap")
    if data[:8] != PATCH_MAGIC:
        raise SrwfpFormatError("patch magic is not SRWFKP1\\0")

    record_count, source_size, target_size, body_size = struct.unpack_from(">IQQQ", data, 8)
    source_sha256 = data[36:68].hex()
    target_sha256 = data[68:100].hex()

    if source_size > JS_SAFE_INTEGER_MAX or target_size > JS_SAFE_INTEGER_MAX:
        raise SrwfpFormatError("source or target size exceeds JavaScript's safe integer range")
    if source_size != target_size:
        raise SrwfpFormatError("v1 only supports equal-length replacement")
    if body_size > BODY_MAX:
        raise SrwfpFormatError(f"body exceeds the {BODY_MAX}-byte cap")
    if record_count > RECORD_MAX:
        raise SrwfpFormatError(f"record count exceeds the {RECORD_MAX}-record cap")
    if record_count > body_size // (RECORD_HEADER_SIZE + 1):
        raise SrwfpFormatError("declared body is too small for its non-empty records")

    compressed = data[PATCH_HEADER_SIZE:]
    if len(compressed) < 6:
        raise SrwfpFormatError("body is too short to be an RFC 1950 zlib stream")
    compression_method = compressed[0] & 0x0F
    compression_info = compressed[0] >> 4
    header_check = (compressed[0] << 8) | compressed[1]
    if compression_method != 8:
        raise SrwfpFormatError("zlib stream does not use the DEFLATE compression method")
    if compression_info > 7:
        raise SrwfpFormatError("zlib stream advertises an invalid window size")
    if header_check % 31 != 0:
        raise SrwfpFormatError("zlib stream has an invalid FCHECK header")
    if compressed[1] & 0x20:
        raise SrwfpFormatError("preset-dictionary zlib streams are not supported")
    advertised_window = 1 << (compression_info + 8)
    inspect_deflate_payload(compressed, body_size, advertised_window)
    try:
        decompressor = zlib.decompressobj(zlib.MAX_WBITS)
        body = decompressor.decompress(compressed, min(body_size, BODY_MAX) + 1)
    except zlib.error as exc:
        raise SrwfpFormatError(f"body is not a valid RFC 1950 zlib stream: {exc}") from exc
    if decompressor.unconsumed_tail:
        raise SrwfpFormatError("decompressed body exceeds its declared size or safety cap")
    if not decompressor.eof:
        raise SrwfpFormatError("zlib stream is truncated or did not terminate")
    if decompressor.unused_data:
        raise SrwfpFormatError("zlib stream has trailing compressed data")
    if len(body) != body_size:
        raise SrwfpFormatError(
            f"decompressed body is {len(body)} bytes, declared {body_size}"
        )

    position = 0
    previous_offset = -1
    previous_end = -1
    for index in range(record_count):
        if position + RECORD_HEADER_SIZE > len(body):
            raise SrwfpFormatError(f"record {index} header is truncated")
        offset, length = struct.unpack_from(">QI", body, position)
        position += RECORD_HEADER_SIZE
        if offset > JS_SAFE_INTEGER_MAX:
            raise SrwfpFormatError(f"record {index} offset exceeds the safe integer range")
        if length == 0:
            raise SrwfpFormatError(f"record {index} has zero length")
        if position + length > len(body):
            raise SrwfpFormatError(f"record {index} target bytes are truncated")
        if index and offset < previous_offset:
            raise SrwfpFormatError(f"record {index} is not sorted by offset")
        if index and offset < previous_end:
            raise SrwfpFormatError(f"record {index} overlaps its predecessor")
        if index and offset == previous_end:
            raise SrwfpFormatError(
                f"record {index} is adjacent and must be merged with its predecessor"
            )
        if offset > source_size or length > source_size - offset:
            raise SrwfpFormatError(f"record {index} exceeds source/target bounds")
        position += length
        previous_offset = offset
        previous_end = offset + length

    if position != len(body):
        raise SrwfpFormatError(f"body has {len(body) - position} trailing bytes")

    return {
        "patchSize": patch_size,
        "patchSha256": hashlib.sha256(data).hexdigest(),
        "sourceSize": source_size,
        "sourceSha256": source_sha256,
        "targetSize": target_size,
        "targetSha256": target_sha256,
        "recordCount": record_count,
        "bodyUncompressedSize": body_size,
    }


def require_srwfp_descriptor(
    path: Path,
    *,
    source: dict[str, Any],
    target: dict[str, Any],
    patch: dict[str, Any],
    context: str,
) -> None:
    expected = {
        "patchSize": patch.get("size"),
        "patchSha256": patch.get("sha256"),
        "sourceSize": source.get("size"),
        "sourceSha256": source.get("sha256"),
        "targetSize": target.get("size"),
        "targetSha256": target.get("sha256"),
        "recordCount": patch.get("recordCount"),
        "bodyUncompressedSize": patch.get("bodyUncompressedSize"),
    }
    try:
        with path.open("rb") as handle:
            data = handle.read(PATCH_MAX + 1)
        actual = inspect_srwfp(data)
    except (OSError, SrwfpFormatError) as exc:
        complain(f"{context}: malformed .srwfp payload: {exc}")
        return
    for key, expected_value in expected.items():
        if actual[key] != expected_value:
            complain(
                f"{context}: patch descriptor {key} is {actual[key]!r}, "
                f"manifest requires {expected_value!r}"
            )


def repository_files() -> list[Path]:
    """Return tracked, staged, and non-ignored working-tree files."""
    try:
        result = subprocess.run(
            ["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
            cwd=ROOT,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        names = [name for name in result.stdout.decode("utf-8").split("\0") if name]
        return sorted(
            (
                ROOT / name
                for name in names
                if (ROOT / name).is_file() or (ROOT / name).is_symlink()
            ),
            key=relative,
        )
    except (OSError, subprocess.CalledProcessError, UnicodeError):
        found: list[Path] = []
        for base, directories, filenames in os.walk(ROOT):
            directories[:] = [name for name in directories if name != ".git"]
            found.extend(Path(base) / name for name in filenames)
        return sorted(found, key=relative)


def validate_required_files(files: list[Path]) -> None:
    present = {relative(path) for path in files}
    for name in sorted(REQUIRED_FILES - present):
        complain(f"required file is missing: {name}")


def validate_forbidden_artifacts(files: list[Path]) -> None:
    for path in files:
        name = relative(path)
        pure = PurePosixPath(name)
        lower_name = pure.name.lower()
        lower_suffixes = {suffix.lower() for suffix in pure.suffixes}
        if path.is_symlink():
            complain(f"tracked or unignored symbolic link is forbidden: {name}")
            continue
        if pure.name in FORBIDDEN_NAMES:
            complain(f"forbidden generated file: {name}")
        if lower_name.startswith(".env"):
            complain(f"forbidden environment/secret file: {name}")
        if any(part.lower() in FORBIDDEN_DIRS for part in pure.parts[:-1]):
            complain(f"forbidden generated/cache directory content: {name}")
        if lower_name.endswith(".tar.gz") or any(suffix in FORBIDDEN_SUFFIXES for suffix in lower_suffixes):
            complain(f"forbidden ROM/archive/save/patch artifact: {name}")
        if re.search(r"\.(?:state\d+|ss\d+|mc.)$", lower_name):
            complain(f"forbidden emulator save state: {name}")
        if path.suffix.lower() not in ALLOWED_BINARY_SUFFIXES:
            try:
                with path.open("rb") as handle:
                    if b"\0" in handle.read(8192):
                        complain(f"unexpected binary/proprietary-looking file: {name}")
            except OSError as exc:
                complain(f"cannot inspect repository file {name}: {exc}")

    ignore_path = ROOT / ".gitignore"
    if ignore_path.is_file():
        lines = {
            line.strip() for line in ignore_path.read_text(encoding="utf-8").splitlines()
            if line.strip() and not line.lstrip().startswith("#")
        }
        for pattern in sorted(REQUIRED_IGNORE_LINES - lines):
            complain(f".gitignore is missing safety pattern: {pattern}")


class PublicAssetFormatError(ValueError):
    """Raised when a same-origin binary asset is only disguised by its suffix."""


def validate_png_asset(data: bytes) -> None:
    if len(data) < 57 or data[:8] != b"\x89PNG\r\n\x1a\n":
        raise PublicAssetFormatError("PNG signature or minimum structure is missing")
    position = 8
    chunk_index = 0
    saw_ihdr = False
    saw_idat = False
    saw_iend = False
    while position < len(data):
        if position + 12 > len(data):
            raise PublicAssetFormatError("PNG chunk header is truncated")
        length = struct.unpack_from(">I", data, position)[0]
        chunk_type = data[position + 4:position + 8]
        chunk_end = position + 12 + length
        if chunk_end > len(data):
            raise PublicAssetFormatError("PNG chunk exceeds the file length")
        if len(chunk_type) != 4 or any(
            not (65 <= byte <= 90 or 97 <= byte <= 122) for byte in chunk_type
        ):
            raise PublicAssetFormatError("PNG chunk type is invalid")
        payload = data[position + 8:position + 8 + length]
        expected_crc = struct.unpack_from(">I", data, position + 8 + length)[0]
        if zlib.crc32(chunk_type + payload) & 0xFFFFFFFF != expected_crc:
            raise PublicAssetFormatError("PNG chunk CRC does not match")
        if chunk_index == 0 and chunk_type != b"IHDR":
            raise PublicAssetFormatError("PNG IHDR must be the first chunk")
        if chunk_type == b"IHDR":
            if saw_ihdr or length != 13:
                raise PublicAssetFormatError("PNG must contain one 13-byte IHDR")
            width, height = struct.unpack_from(">II", payload)
            if not (1 <= width <= PNG_DIMENSION_MAX and 1 <= height <= PNG_DIMENSION_MAX):
                raise PublicAssetFormatError("PNG dimensions are outside the public asset limit")
            saw_ihdr = True
        elif chunk_type == b"IDAT":
            saw_idat = True
        elif chunk_type == b"IEND":
            if length != 0 or saw_iend or chunk_end != len(data):
                raise PublicAssetFormatError("PNG IEND must be empty and final")
            saw_iend = True
        position = chunk_end
        chunk_index += 1
    if not (saw_ihdr and saw_idat and saw_iend):
        raise PublicAssetFormatError("PNG is missing IHDR, IDAT, or IEND")


def validate_webp_asset(data: bytes) -> None:
    if len(data) < 20 or data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        raise PublicAssetFormatError("WebP RIFF/WEBP signature or minimum structure is missing")
    declared_size = struct.unpack_from("<I", data, 4)[0]
    if declared_size != len(data) - 8:
        raise PublicAssetFormatError("WebP RIFF length does not match the file")
    position = 12
    saw_image_chunk = False
    while position < len(data):
        if position + 8 > len(data):
            raise PublicAssetFormatError("WebP chunk header is truncated")
        chunk_type = data[position:position + 4]
        length = struct.unpack_from("<I", data, position + 4)[0]
        payload_end = position + 8 + length
        padded_end = payload_end + (length & 1)
        if padded_end > len(data):
            raise PublicAssetFormatError("WebP chunk exceeds the RIFF length")
        if chunk_type in {b"VP8 ", b"VP8L", b"VP8X"}:
            minimum = {b"VP8 ": 10, b"VP8L": 5, b"VP8X": 10}[chunk_type]
            if length < minimum:
                raise PublicAssetFormatError("WebP image header chunk is too short")
            saw_image_chunk = True
        position = padded_end
    if position != len(data) or not saw_image_chunk:
        raise PublicAssetFormatError("WebP has no structurally bounded image chunk")


def validate_ico_asset(data: bytes) -> None:
    if len(data) < 22:
        raise PublicAssetFormatError("ICO directory is too short")
    reserved, image_type, count = struct.unpack_from("<HHH", data, 0)
    if reserved != 0 or image_type != 1 or not 1 <= count <= 256:
        raise PublicAssetFormatError("ICO directory header is invalid")
    directory_end = 6 + count * 16
    if directory_end > len(data):
        raise PublicAssetFormatError("ICO directory entries are truncated")
    ranges: list[tuple[int, int]] = []
    for index in range(count):
        entry = 6 + index * 16
        image_size, image_offset = struct.unpack_from("<II", data, entry + 8)
        image_end = image_offset + image_size
        if image_size == 0 or image_offset < directory_end or image_end > len(data):
            raise PublicAssetFormatError("ICO image range is invalid")
        image = data[image_offset:image_end]
        if image.startswith(b"\x89PNG\r\n\x1a\n"):
            validate_png_asset(image)
        elif len(image) < 40 or struct.unpack_from("<I", image, 0)[0] not in {40, 52, 56, 108, 124}:
            raise PublicAssetFormatError("ICO image is neither a bounded PNG nor DIB")
        ranges.append((image_offset, image_end))
    ranges.sort()
    if any(current[0] < previous[1] for previous, current in zip(ranges, ranges[1:])):
        raise PublicAssetFormatError("ICO image ranges overlap")


def validate_woff2_asset(data: bytes) -> None:
    if len(data) < 49 or data[:4] != b"wOF2":
        raise PublicAssetFormatError("WOFF2 signature or minimum structure is missing")
    declared_length = struct.unpack_from(">I", data, 8)[0]
    table_count, reserved = struct.unpack_from(">HH", data, 12)
    total_sfnt_size, compressed_size = struct.unpack_from(">II", data, 16)
    metadata_offset, metadata_length, metadata_original_length = struct.unpack_from(">III", data, 28)
    private_offset, private_length = struct.unpack_from(">II", data, 40)
    if declared_length != len(data) or reserved != 0:
        raise PublicAssetFormatError("WOFF2 declared length or reserved field is invalid")
    if not 1 <= table_count <= 4095 or total_sfnt_size < 12:
        raise PublicAssetFormatError("WOFF2 table count or SFNT size is invalid")
    if compressed_size == 0 or compressed_size > len(data) - 48:
        raise PublicAssetFormatError("WOFF2 compressed data size is invalid")
    if metadata_offset == 0:
        if metadata_length != 0 or metadata_original_length != 0:
            raise PublicAssetFormatError("WOFF2 metadata lengths require an offset")
    elif (
        metadata_offset < 48
        or metadata_length == 0
        or metadata_original_length == 0
        or metadata_offset + metadata_length > len(data)
    ):
        raise PublicAssetFormatError("WOFF2 metadata range is invalid")
    if private_offset == 0:
        if private_length != 0:
            raise PublicAssetFormatError("WOFF2 private length requires an offset")
    elif private_offset < 48 or private_length == 0 or private_offset + private_length > len(data):
        raise PublicAssetFormatError("WOFF2 private-data range is invalid")


PUBLIC_ASSET_VALIDATORS = {
    ".png": validate_png_asset,
    ".webp": validate_webp_asset,
    ".ico": validate_ico_asset,
    ".woff2": validate_woff2_asset,
}


def is_canonical_public_asset_path(value: Any) -> bool:
    if not isinstance(value, str) or not value or "\\" in value or "%" in value:
        return False
    pure = PurePosixPath(value)
    raw_parts = value.split("/")
    return (
        not pure.is_absolute()
        and all(part not in {"", ".", ".."} for part in raw_parts)
        and pure.as_posix() == value
        and pure.suffix in PUBLIC_ASSET_SUFFIXES
    )


def validate_public_binary_assets(files: list[Path]) -> None:
    public_files = {
        relative(path): path
        for path in files
        if path.suffix.lower() in PUBLIC_ASSET_SUFFIXES and not path.is_symlink()
    }
    for name, digest in PUBLIC_ASSET_ALLOWLIST.items():
        if not is_canonical_public_asset_path(name):
            complain(f"public binary asset allowlist path is not canonical: {name!r}")
        if not is_hex64(digest):
            complain(f"public binary asset allowlist SHA-256 is invalid: {name}")
        if name not in public_files:
            complain(f"allowlisted public binary asset is missing: {name}")

    total_size = 0
    for name, path in public_files.items():
        suffix = path.suffix.lower()
        try:
            size = path.stat().st_size
        except OSError as exc:
            complain(f"cannot inspect public binary asset {name}: {exc}")
            continue
        total_size += size
        expected_sha256 = PUBLIC_ASSET_ALLOWLIST.get(name)
        if expected_sha256 is None:
            complain(f"public binary asset is not explicitly path+SHA allowlisted: {name}")
        if size > PUBLIC_ASSET_MAX:
            complain(f"public binary asset exceeds the {PUBLIC_ASSET_MAX}-byte cap: {name}")
            continue
        if expected_sha256 is None:
            continue
        if not is_hex64(expected_sha256):
            # The allowlist contract error above is authoritative; do not treat an
            # invalid expected digest as an approval.
            continue
        try:
            data = path.read_bytes()
        except OSError as exc:
            complain(f"cannot inspect public binary asset {name}: {exc}")
            continue
        actual_sha256 = hashlib.sha256(data).hexdigest()
        if actual_sha256 != expected_sha256:
            complain(
                f"public binary asset SHA-256 does not match its explicit allowlist entry: {name}"
            )
        try:
            PUBLIC_ASSET_VALIDATORS[suffix](data)
        except PublicAssetFormatError as exc:
            complain(f"malformed or disguised {suffix} public asset {name}: {exc}")
    if total_size > PUBLIC_ASSET_TOTAL_MAX:
        complain(
            f"same-origin binary assets total {total_size} bytes, exceeding "
            f"the {PUBLIC_ASSET_TOTAL_MAX}-byte repository cap"
        )


def schema_object_properties(
    value: Any,
    required: set[str],
    context: str,
    *,
    allowed_metadata: set[str] | None = None,
) -> dict[str, Any]:
    if not isinstance(value, dict):
        complain(f"{context}: must be an object schema")
        return {}
    if value.get("type") != "object" or value.get("additionalProperties") is not False:
        complain(f"{context}: must be a closed object schema")
    expected_schema_keys = {
        "type", "additionalProperties", "required", "properties"
    } | (allowed_metadata or set())
    if set(value) != expected_schema_keys:
        complain(f"{context}: schema keywords are out of sync")
    declared_required = value.get("required")
    if (
        not isinstance(declared_required, list)
        or any(not isinstance(key, str) for key in declared_required)
        or set(declared_required) != required
    ):
        complain(f"{context}: required keys are out of sync")
    properties = value.get("properties")
    if not isinstance(properties, dict) or set(properties) != required:
        complain(f"{context}: property keys are out of sync")
        return {}
    return properties


def expect_schema_fragment(actual: Any, expected: Any, context: str) -> None:
    if actual != expected:
        complain(f"{context}: schema contract is out of sync")


def validate_schema_documents() -> None:
    schema_paths = [
        ROOT / "schemas/releases.schema.json",
        ROOT / "schemas/release.schema.json",
        ROOT / "schemas/patch-descriptor.schema.json",
        ROOT / "schemas/acceptance-receipt.schema.json",
    ]
    documents: dict[str, dict[str, Any]] = {}
    for path in schema_paths:
        document = load_json(path)
        if not isinstance(document, dict):
            continue
        documents[path.name] = document
        if document.get("$schema") != JSON_SCHEMA_DRAFT:
            complain(f"{relative(path)}: must declare JSON Schema draft 2020-12")
        if document.get("type") != "object" or document.get("additionalProperties") is not False:
            complain(f"{relative(path)}: root must be a closed object schema")

    index_schema = documents.get("releases.schema.json", {})
    expect_schema_fragment(
        index_schema.get("$id"),
        "urn:srwf-kor:schema:public-release-index:v2",
        "schemas/releases.schema.json $id",
    )
    index_keys = {"$schema", "schema", "project", "games", "stock_profiles", "releases"}
    index_props = schema_object_properties(
        index_schema,
        index_keys,
        "schemas/releases.schema.json root",
        allowed_metadata={"$schema", "$id", "title", "allOf"},
    )
    expect_schema_fragment(
        index_props.get("$schema"),
        {"const": "../schemas/releases.schema.json"},
        "schemas/releases.schema.json $schema property",
    )
    expect_schema_fragment(
        index_props.get("schema"),
        {"const": "srwf-kor.public-release-index.v2"},
        "schemas/releases.schema.json schema property",
    )
    project = index_props.get("project")
    project_props = schema_object_properties(project, {"id", "status"}, "release-index project")
    expect_schema_fragment(project_props.get("id"), {"const": "srwf-kor-v5"}, "release-index project id")
    expect_schema_fragment(
        project_props.get("status"),
        {"enum": ["NO_ACCEPTED_RELEASE", "HAS_ACCEPTED_RELEASE"]},
        "release-index project status",
    )

    games = index_props.get("games")
    if not isinstance(games, dict):
        complain("release-index games: array schema is missing")
        game_schema: Any = None
    else:
        if set(games) != {"type", "minItems", "maxItems", "uniqueItems", "items"}:
            complain("release-index games: array schema keys are out of sync")
        expect_schema_fragment(games.get("type"), "array", "release-index games type")
        expect_schema_fragment(games.get("minItems"), 2, "release-index games minimum")
        expect_schema_fragment(games.get("maxItems"), 2, "release-index games maximum")
        expect_schema_fragment(games.get("uniqueItems"), True, "release-index games uniqueness")
        game_schema = games.get("items")
    game_props = schema_object_properties(
        game_schema,
        {"id", "label", "status", "defaultReleaseId"},
        "release-index game",
        allowed_metadata={"allOf"},
    )
    for key, expected in {
        "id": {"enum": list(GAME_DEFINITIONS)},
        "label": {"type": "string", "minLength": 1, "maxLength": 160, "pattern": r"\S"},
        "status": {"enum": ["NO_ACCEPTED_RELEASE", "HAS_ACCEPTED_RELEASE"]},
        "defaultReleaseId": {"type": ["string", "null"], "pattern": ID_PATTERN},
    }.items():
        expect_schema_fragment(game_props.get(key), expected, f"release-index game {key}")
    expected_game_status_rules = [
        {
            "if": {
                "properties": {"status": {"const": "NO_ACCEPTED_RELEASE"}},
                "required": ["status"],
            },
            "then": {"properties": {"defaultReleaseId": {"type": "null"}}},
        },
        {
            "if": {
                "properties": {"status": {"const": "HAS_ACCEPTED_RELEASE"}},
                "required": ["status"],
            },
            "then": {
                "properties": {
                    "defaultReleaseId": {"type": "string", "pattern": ID_PATTERN}
                }
            },
        },
    ]
    expect_schema_fragment(
        game_schema.get("allOf") if isinstance(game_schema, dict) else None,
        expected_game_status_rules,
        "release-index game status rules",
    )

    stock_profiles = index_props.get("stock_profiles")
    if not isinstance(stock_profiles, dict):
        complain("release-index stock_profiles: array schema is missing")
        profile_schema: Any = None
    else:
        if set(stock_profiles) != {"type", "minItems", "maxItems", "uniqueItems", "items"}:
            complain("release-index stock_profiles: array schema keys are out of sync")
        expect_schema_fragment(stock_profiles.get("type"), "array", "release-index stock_profiles type")
        expect_schema_fragment(stock_profiles.get("minItems"), 1, "release-index stock_profiles minimum")
        expect_schema_fragment(stock_profiles.get("maxItems"), 16, "release-index stock_profiles maximum")
        expect_schema_fragment(stock_profiles.get("uniqueItems"), True, "release-index stock_profiles uniqueness")
        profile_schema = stock_profiles.get("items")
    profile_keys = set(STOCK_PROFILE) | {"gameId", "label"}
    profile_props = schema_object_properties(profile_schema, profile_keys, "release-index stock profile")
    expect_schema_fragment(
        profile_props.get("gameId"),
        {"const": "srwf-f"},
        "release-index stock profile gameId",
    )
    for key, expected in STOCK_PROFILE.items():
        expect_schema_fragment(
            profile_props.get(key),
            {"const": expected},
            f"release-index stock profile {key}",
        )
    expect_schema_fragment(
        profile_props.get("label"),
        {"type": "string", "minLength": 1, "maxLength": 160, "pattern": r"\S"},
        "release-index stock profile label",
    )

    releases_array = index_props.get("releases")
    if not isinstance(releases_array, dict):
        complain("release-index releases: array schema is missing")
        row_schema: Any = None
    else:
        if set(releases_array) != {"type", "uniqueItems", "items"}:
            complain("release-index releases: array schema keys are out of sync")
        expect_schema_fragment(releases_array.get("type"), "array", "release-index releases type")
        expect_schema_fragment(releases_array.get("uniqueItems"), True, "release-index releases uniqueness")
        row_schema = releases_array.get("items")
    row_keys = {"gameId", "id", "state", "label", "manifest", "manifestSha256"}
    row_props = schema_object_properties(row_schema, row_keys, "release-index row")
    for key, expected in {
        "gameId": {"enum": list(GAME_DEFINITIONS)},
        "id": {"type": "string", "pattern": ID_PATTERN},
        "state": {"const": "ACCEPTED"},
        "label": {"type": "string", "minLength": 1, "maxLength": 160, "pattern": r"\S"},
        "manifest": {"type": "string", "pattern": MANIFEST_REFERENCE_PATTERN},
        "manifestSha256": {"type": "string", "pattern": HEX64_PATTERN},
    }.items():
        expect_schema_fragment(row_props.get(key), expected, f"release-index row {key}")
    expected_status_rules = [
        {
            "if": {
                "properties": {
                    "project": {
                        "properties": {"status": {"const": "NO_ACCEPTED_RELEASE"}},
                        "required": ["status"],
                    }
                }
            },
            "then": {"properties": {"releases": {"maxItems": 0}}},
        },
        {
            "if": {
                "properties": {
                    "project": {
                        "properties": {"status": {"const": "HAS_ACCEPTED_RELEASE"}},
                        "required": ["status"],
                    }
                }
            },
            "then": {"properties": {"releases": {"minItems": 1}}},
        },
    ]
    expect_schema_fragment(index_schema.get("allOf"), expected_status_rules, "release-index status rules")

    release_schema = documents.get("release.schema.json", {})
    expect_schema_fragment(
        release_schema.get("$id"),
        "urn:srwf-kor:schema:public-release:v1",
        "schemas/release.schema.json $id",
    )
    release_keys = {
        "schema", "id", "state", "version", "title", "publishedAt",
        "source", "target", "patch", "provenance",
    }
    release_props = schema_object_properties(
        release_schema,
        release_keys,
        "schemas/release.schema.json root",
        allowed_metadata={"$schema", "$id", "title"},
    )
    for key, expected in {
        "schema": {"const": "srwf-kor.public-release.v1"},
        "id": {"type": "string", "pattern": ID_PATTERN},
        "state": {"const": "ACCEPTED"},
        "version": {"type": "string", "pattern": VERSION_PATTERN},
        "title": {"type": "string", "minLength": 1, "maxLength": 160, "pattern": r"\S"},
        "publishedAt": {"type": "string", "format": "date-time"},
    }.items():
        expect_schema_fragment(release_props.get(key), expected, f"public release {key}")

    source_props = schema_object_properties(
        release_props.get("source"), {"profileId", "size", "sha256"}, "public release source"
    )
    for key, expected in {
        "profileId": {"const": STOCK_PROFILE["id"]},
        "size": {"const": STOCK_PROFILE["size"]},
        "sha256": {"const": STOCK_PROFILE["sha256"]},
    }.items():
        expect_schema_fragment(source_props.get(key), expected, f"public release source {key}")

    target_props = schema_object_properties(
        release_props.get("target"), {"filename", "cueFilename", "size", "sha256"}, "public release target"
    )
    for key, expected in {
        "filename": {"type": "string", "pattern": r"^[A-Za-z0-9][A-Za-z0-9._-]*\.img$"},
        "cueFilename": {"type": "string", "pattern": r"^[A-Za-z0-9][A-Za-z0-9._-]*\.cue$"},
        "size": {"const": STOCK_PROFILE["size"]},
        "sha256": {"type": "string", "pattern": HEX64_PATTERN},
    }.items():
        expect_schema_fragment(target_props.get(key), expected, f"public release target {key}")

    patch_props = schema_object_properties(
        release_props.get("patch"),
        {"format", "url", "size", "sha256", "recordCount", "bodyUncompressedSize"},
        "public release patch",
    )
    for key, expected in {
        "format": {"const": "srwf.sparse-byte-delta.v1"},
        "url": {"type": "string", "pattern": PATCH_REFERENCE_PATTERN},
        "size": {"type": "integer", "minimum": 101, "maximum": PATCH_MAX},
        "sha256": {"type": "string", "pattern": HEX64_PATTERN},
        "recordCount": {"type": "integer", "minimum": 1, "maximum": RECORD_MAX},
        "bodyUncompressedSize": {"type": "integer", "minimum": 45, "maximum": BODY_MAX},
    }.items():
        expect_schema_fragment(patch_props.get(key), expected, f"public release patch {key}")

    provenance_props = schema_object_properties(
        release_props.get("provenance"),
        {"v5Commit", "buildReceiptSha256", "acceptanceReceiptSha256"},
        "public release provenance",
    )
    for key, expected in {
        "v5Commit": {"type": "string", "pattern": COMMIT_PATTERN},
        "buildReceiptSha256": {"type": "string", "pattern": HEX64_PATTERN},
        "acceptanceReceiptSha256": {"type": "string", "pattern": HEX64_PATTERN},
    }.items():
        expect_schema_fragment(provenance_props.get(key), expected, f"public release provenance {key}")

    descriptor_schema = documents.get("patch-descriptor.schema.json", {})
    expect_schema_fragment(
        descriptor_schema.get("$id"),
        "urn:srwf-kor:schema:patch-descriptor:v1",
        "schemas/patch-descriptor.schema.json $id",
    )
    descriptor_keys = {
        "patchSize", "patchSha256", "sourceSize", "sourceSha256", "targetSize",
        "targetSha256", "recordCount", "bodyUncompressedSize",
    }
    descriptor_props = schema_object_properties(
        descriptor_schema,
        descriptor_keys,
        "schemas/patch-descriptor.schema.json root",
        allowed_metadata={"$schema", "$id", "title"},
    )
    for key, expected in {
        "patchSize": {"type": "integer", "minimum": 101, "maximum": PATCH_MAX},
        "patchSha256": {"type": "string", "pattern": HEX64_PATTERN},
        "sourceSize": {"type": "integer", "minimum": 1, "maximum": JS_SAFE_INTEGER_MAX},
        "sourceSha256": {"type": "string", "pattern": HEX64_PATTERN},
        "targetSize": {"type": "integer", "minimum": 1, "maximum": JS_SAFE_INTEGER_MAX},
        "targetSha256": {"type": "string", "pattern": HEX64_PATTERN},
        "recordCount": {"type": "integer", "minimum": 0, "maximum": RECORD_MAX},
        "bodyUncompressedSize": {"type": "integer", "minimum": 0, "maximum": BODY_MAX},
    }.items():
        expect_schema_fragment(descriptor_props.get(key), expected, f"patch descriptor {key}")

    receipt_schema = documents.get("acceptance-receipt.schema.json", {})
    expect_schema_fragment(
        receipt_schema.get("$id"),
        "urn:srwf-kor:schema:acceptance-receipt:v1",
        "schemas/acceptance-receipt.schema.json $id",
    )
    receipt_keys = {
        "schema", "releaseId", "state", "acceptedAt", "stockProfileId",
        "sourceSha256", "targetSha256", "patchSha256", "v5Commit", "gates",
        "decisionAuthority",
    }
    receipt_props = schema_object_properties(
        receipt_schema,
        receipt_keys,
        "schemas/acceptance-receipt.schema.json root",
        allowed_metadata={"$schema", "$id", "title"},
    )
    for key, expected in {
        "schema": {"const": "srwf-kor.acceptance-receipt.v1"},
        "releaseId": {"type": "string", "pattern": ID_PATTERN},
        "state": {"const": "ACCEPTED"},
        "acceptedAt": {"type": "string", "format": "date-time"},
        "stockProfileId": {"const": STOCK_PROFILE["id"]},
        "sourceSha256": {"const": STOCK_PROFILE["sha256"]},
        "targetSha256": {"type": "string", "pattern": HEX64_PATTERN},
        "patchSha256": {"type": "string", "pattern": HEX64_PATTERN},
        "v5Commit": {"type": "string", "pattern": COMMIT_PATTERN},
        "decisionAuthority": {
            "type": "string", "minLength": 1, "maxLength": 160, "pattern": r"\S"
        },
    }.items():
        expect_schema_fragment(receipt_props.get(key), expected, f"acceptance receipt {key}")
    gate_keys = {"staticStructure", "runtimeConsumption", "visualLayout", "longPlayProgression"}
    gate_props = schema_object_properties(receipt_props.get("gates"), gate_keys, "acceptance receipt gates")
    for key in gate_keys:
        expect_schema_fragment(gate_props.get(key), {"const": "PASS"}, f"acceptance receipt gate {key}")

    core_path = ROOT / "assets/patch-core.mjs"
    if core_path.is_file():
        core_text = core_path.read_text(encoding="utf-8")
        if re.search(r"maxRecordCount:\s*1_?000_?000\b", core_text) is None:
            complain("assets/patch-core.mjs: maxRecordCount must match the 1,000,000 public hard cap")


def validate_acceptance_receipt(
    receipt: Any,
    *,
    release_id: str,
    source: Any,
    target: Any,
    patch: Any,
    provenance: Any,
) -> None:
    context = f"release {release_id} acceptance receipt"
    required = {
        "schema", "releaseId", "state", "acceptedAt", "stockProfileId",
        "sourceSha256", "targetSha256", "patchSha256", "v5Commit", "gates",
        "decisionAuthority",
    }
    if not exact_keys(receipt, required, context):
        return
    assert isinstance(receipt, dict)
    if receipt.get("schema") != "srwf-kor.acceptance-receipt.v1":
        complain(f"{context}: schema id mismatch")
    if receipt.get("releaseId") != release_id or receipt.get("state") != "ACCEPTED":
        complain(f"{context}: release identity/state is not explicit ACCEPTED")
    if not is_rfc3339_datetime(receipt.get("acceptedAt")):
        complain(f"{context}: acceptedAt must be an RFC 3339 date-time")
    source_profile_id = source.get("profileId") if isinstance(source, dict) else None
    source_sha256 = source.get("sha256") if isinstance(source, dict) else None
    if receipt.get("stockProfileId") != source_profile_id:
        complain(f"{context}: stockProfileId does not match the release source")
    if receipt.get("sourceSha256") != source_sha256:
        complain(f"{context}: sourceSha256 does not match the release source")
    if not is_hex64(receipt.get("targetSha256")):
        complain(f"{context}: targetSha256 is invalid")
    if not is_hex64(receipt.get("patchSha256")):
        complain(f"{context}: patchSha256 is invalid")
    if not isinstance(receipt.get("v5Commit"), str) or COMMIT_RE.fullmatch(receipt["v5Commit"]) is None:
        complain(f"{context}: v5Commit is invalid")
    if not is_bounded_string(receipt.get("decisionAuthority"), maximum=160):
        complain(f"{context}: decisionAuthority must be 1-160 non-blank characters")

    expected_gates = {
        "staticStructure": "PASS",
        "runtimeConsumption": "PASS",
        "visualLayout": "PASS",
        "longPlayProgression": "PASS",
    }
    if receipt.get("gates") != expected_gates:
        complain(f"{context}: all four exact acceptance gates must PASS")

    source_hash = source.get("sha256") if isinstance(source, dict) else None
    target_hash = target.get("sha256") if isinstance(target, dict) else None
    patch_hash = patch.get("sha256") if isinstance(patch, dict) else None
    v5_commit = provenance.get("v5Commit") if isinstance(provenance, dict) else None
    if receipt.get("sourceSha256") != source_hash:
        complain(f"{context}: source hash does not match release manifest")
    if receipt.get("targetSha256") != target_hash:
        complain(f"{context}: target hash does not match release manifest")
    if receipt.get("patchSha256") != patch_hash:
        complain(f"{context}: patch hash does not match release manifest")
    if receipt.get("v5Commit") != v5_commit:
        complain(f"{context}: V5 commit does not match release manifest")


def validate_release_manifest(
    row: dict[str, Any],
    stock_profiles_by_id: dict[str, dict[str, Any]] | None = None,
) -> tuple[str | None, str | None, str | None]:
    release_id = row.get("id")
    game_id = row.get("gameId")
    if stock_profiles_by_id is None:
        stock_profiles_by_id = {
            profile_id: {**profile, "label": "pinned stock"}
            for profile_id, profile in PINNED_STOCK_PROFILES.items()
        }
    manifest_ref = row.get("manifest")
    if not isinstance(release_id, str) or ID_RE.fullmatch(release_id) is None:
        complain("release index row: invalid id")
        return None, None, None
    if row.get("state") != "ACCEPTED":
        complain(f"release {release_id}: public index state must be ACCEPTED")
    expected_manifest = f"releases/{release_id}.json"
    if manifest_ref != expected_manifest or not is_safe_relative(manifest_ref, prefix="releases/", suffix=".json"):
        complain(f"release {release_id}: manifest must be {expected_manifest}")
        return None, None, None
    manifest_path = ROOT / manifest_ref
    if not manifest_path.is_file():
        complain(f"release {release_id}: manifest file is missing")
        return manifest_ref, None, None
    if not is_hex64(row.get("manifestSha256")) or sha256_file(manifest_path) != row.get("manifestSha256"):
        complain(f"release {release_id}: manifestSha256 does not match the file")
    manifest = load_json(manifest_path)
    required = {"schema", "id", "state", "version", "title", "publishedAt", "source", "target", "patch", "provenance"}
    if not exact_keys(manifest, required, f"release {release_id} manifest"):
        return manifest_ref, None, None
    assert isinstance(manifest, dict)
    if manifest.get("schema") != "srwf-kor.public-release.v1" or manifest.get("id") != release_id or manifest.get("state") != "ACCEPTED":
        complain(f"release {release_id}: schema/id/state is not an exact accepted release")
    if not isinstance(manifest.get("version"), str) or VERSION_RE.fullmatch(manifest["version"]) is None:
        complain(f"release {release_id}: version does not match the public schema")
    if not is_bounded_string(manifest.get("title"), maximum=160):
        complain(f"release {release_id}: title must be 1-160 non-blank characters")
    if not is_rfc3339_datetime(manifest.get("publishedAt")):
        complain(f"release {release_id}: publishedAt must be an RFC 3339 date-time")

    source = manifest.get("source")
    if exact_keys(source, {"profileId", "size", "sha256"}, f"release {release_id} source"):
        assert isinstance(source, dict)
        profile = stock_profiles_by_id.get(source.get("profileId"))
        if profile is None:
            complain(f"release {release_id}: source profile is not pinned in the public index")
        else:
            if profile.get("gameId") != game_id:
                complain(f"release {release_id}: source profile belongs to a different game")
            expected_source = {
                "profileId": profile.get("id"),
                "size": profile.get("size"),
                "sha256": profile.get("sha256"),
            }
            if source != expected_source:
                complain(f"release {release_id}: source is not the exact indexed stock profile")

    target = manifest.get("target")
    if exact_keys(target, {"filename", "cueFilename", "size", "sha256"}, f"release {release_id} target"):
        assert isinstance(target, dict)
        if not isinstance(target.get("filename"), str) or re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*\.img", target["filename"]) is None:
            complain(f"release {release_id}: target filename must be a safe .img basename")
        if not isinstance(target.get("cueFilename"), str) or re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*\.cue", target["cueFilename"]) is None:
            complain(f"release {release_id}: CUE filename must be a safe basename")
        source_profile = (
            stock_profiles_by_id.get(source.get("profileId"))
            if isinstance(source, dict)
            else None
        )
        if (
            source_profile is None
            or target.get("size") != source_profile.get("size")
            or not is_hex64(target.get("sha256"))
        ):
            complain(f"release {release_id}: target size/hash is invalid")

    patch = manifest.get("patch")
    patch_ref: str | None = None
    if exact_keys(patch, {"format", "url", "size", "sha256", "recordCount", "bodyUncompressedSize"}, f"release {release_id} patch"):
        assert isinstance(patch, dict)
        patch_ref = patch.get("url") if isinstance(patch.get("url"), str) else None
        if patch.get("format") != "srwf.sparse-byte-delta.v1":
            complain(f"release {release_id}: unsupported patch format")
        expected_patch = f"patches/{release_id}.srwfp"
        if patch_ref != expected_patch or not is_safe_relative(patch_ref, prefix="patches/", suffix=".srwfp"):
            complain(f"release {release_id}: patch URL must be {expected_patch}")
        for key, minimum, maximum in (
            ("size", 101, PATCH_MAX),
            ("recordCount", 1, RECORD_MAX),
            ("bodyUncompressedSize", 45, BODY_MAX),
        ):
            value = patch.get(key)
            if isinstance(value, bool) or not isinstance(value, int) or not minimum <= value <= maximum:
                complain(f"release {release_id}: patch {key} is outside its hard limits")
        if not is_hex64(patch.get("sha256")):
            complain(f"release {release_id}: patch SHA-256 is invalid")
        if patch_ref and is_safe_relative(patch_ref, prefix="patches/", suffix=".srwfp"):
            patch_path = ROOT / patch_ref
            if not patch_path.is_file():
                complain(f"release {release_id}: .srwfp payload is missing")
            elif isinstance(source, dict) and isinstance(target, dict):
                require_srwfp_descriptor(
                    patch_path,
                    source=source,
                    target=target,
                    patch=patch,
                    context=f"release {release_id}",
                )

    provenance = manifest.get("provenance")
    receipt_ref = f"receipts/{release_id}.acceptance.json"
    if exact_keys(provenance, {"v5Commit", "buildReceiptSha256", "acceptanceReceiptSha256"}, f"release {release_id} provenance"):
        assert isinstance(provenance, dict)
        if not isinstance(provenance.get("v5Commit"), str) or COMMIT_RE.fullmatch(provenance["v5Commit"]) is None:
            complain(f"release {release_id}: V5 commit is invalid")
        for key in ("buildReceiptSha256", "acceptanceReceiptSha256"):
            if not is_hex64(provenance.get(key)):
                complain(f"release {release_id}: {key} is invalid")
        receipt_path = ROOT / receipt_ref
        if not receipt_path.is_file():
            complain(f"release {release_id}: explicit ACCEPTED receipt is missing")
        elif sha256_file(receipt_path) != provenance.get("acceptanceReceiptSha256"):
            complain(f"release {release_id}: acceptance receipt hash mismatch")
        else:
            receipt = load_json(receipt_path)
            validate_acceptance_receipt(
                receipt,
                release_id=release_id,
                source=source,
                target=target,
                patch=patch,
                provenance=provenance,
            )
    return manifest_ref, patch_ref, receipt_ref


def validate_index(files: list[Path]) -> None:
    index = load_json(INDEX_PATH)
    required = {"$schema", "schema", "project", "games", "stock_profiles", "releases"}
    if not exact_keys(index, required, "manifest/releases.json"):
        return
    assert isinstance(index, dict)
    if index.get("$schema") != "../schemas/releases.schema.json":
        complain("manifest/releases.json: $schema must reference the local releases schema")
    else:
        schema_path = (INDEX_PATH.parent / index["$schema"]).resolve()
        if schema_path != (ROOT / "schemas/releases.schema.json").resolve() or not schema_path.is_file():
            complain("manifest/releases.json: $schema path does not resolve to the checked-in schema")
    if index.get("schema") != "srwf-kor.public-release-index.v2":
        complain("manifest/releases.json: schema id mismatch")
    if index.get("project") not in (
        {"id": "srwf-kor-v5", "status": "NO_ACCEPTED_RELEASE"},
        {"id": "srwf-kor-v5", "status": "HAS_ACCEPTED_RELEASE"},
    ):
        complain("manifest/releases.json: project id/status is invalid")

    games = index.get("games")
    games_by_id: dict[str, dict[str, Any]] = {}
    if not isinstance(games, list) or len(games) != len(GAME_DEFINITIONS):
        complain("manifest/releases.json: exactly the two supported games are required")
    else:
        expected_game_order = list(GAME_DEFINITIONS)
        actual_game_order: list[Any] = []
        for position, game in enumerate(games):
            if not exact_keys(
                game,
                {"id", "label", "status", "defaultReleaseId"},
                f"game index row {position}",
            ):
                continue
            assert isinstance(game, dict)
            game_id = game.get("id")
            actual_game_order.append(game_id)
            if game_id not in GAME_DEFINITIONS:
                complain(f"game index row {position}: unsupported game id")
                continue
            if game_id in games_by_id:
                complain(f"game index row {position}: duplicate game id")
                continue
            games_by_id[game_id] = game
            if game.get("label") != GAME_DEFINITIONS[game_id]["label"]:
                complain(f"game index row {position}: label is not the pinned public label")
            status = game.get("status")
            default_release_id = game.get("defaultReleaseId")
            if status not in {"NO_ACCEPTED_RELEASE", "HAS_ACCEPTED_RELEASE"}:
                complain(f"game index row {position}: status is invalid")
            if status == "NO_ACCEPTED_RELEASE" and default_release_id is not None:
                complain(f"game index row {position}: unavailable game must have a null default")
            if (
                status == "HAS_ACCEPTED_RELEASE"
                and (
                    not isinstance(default_release_id, str)
                    or ID_RE.fullmatch(default_release_id) is None
                )
            ):
                complain(f"game index row {position}: available game requires a valid default release id")
        if actual_game_order != expected_game_order:
            complain("manifest/releases.json: game order must be srwf-f then srwf-final")

    profiles = index.get("stock_profiles")
    stock_profiles_by_id: dict[str, dict[str, Any]] = {}
    if not isinstance(profiles, list) or not 1 <= len(profiles) <= 16:
        complain("manifest/releases.json: stock_profiles must contain 1-16 pinned profiles")
    else:
        profile_keys = {
            "gameId", "id", "label", "size", "sha256", "sectorCount", "sectorSize",
            "userDataOffset", "userDataSize", "track",
        }
        for position, profile in enumerate(profiles):
            if not exact_keys(profile, profile_keys, f"stock profile row {position}"):
                continue
            assert isinstance(profile, dict)
            profile_id = profile.get("id")
            if profile_id in stock_profiles_by_id:
                complain(f"stock profile row {position}: duplicate profile id")
                continue
            pinned = PINNED_STOCK_PROFILES.get(profile_id)
            if pinned is None:
                complain(f"stock profile row {position}: profile is not explicitly pinned")
                continue
            stock_profiles_by_id[profile_id] = profile
            if profile.get("gameId") not in games_by_id:
                complain(f"stock profile row {position}: gameId is unknown")
            for key, expected in pinned.items():
                if profile.get(key) != expected:
                    complain(f"stock profile row {position}: {key} is not exact")
            if not is_bounded_string(profile.get("label"), maximum=160):
                complain(f"stock profile row {position}: label must be 1-160 non-blank characters")

    releases = index.get("releases")
    if not isinstance(releases, list):
        complain("manifest/releases.json: releases must be an array")
        return
    status = index.get("project", {}).get("status") if isinstance(index.get("project"), dict) else None
    if status == "NO_ACCEPTED_RELEASE" and releases:
        complain("NO_ACCEPTED_RELEASE requires an empty releases array")
    if status == "HAS_ACCEPTED_RELEASE" and not releases:
        complain("HAS_ACCEPTED_RELEASE requires at least one ACCEPTED release")
    expected_project_status = (
        "HAS_ACCEPTED_RELEASE"
        if any(game.get("status") == "HAS_ACCEPTED_RELEASE" for game in games_by_id.values())
        else "NO_ACCEPTED_RELEASE"
    )
    if status != expected_project_status:
        complain("manifest/releases.json: project status does not match per-game availability")

    referenced_manifests: set[str] = set()
    referenced_patches: set[str] = set()
    referenced_receipts: set[str] = set()
    ids: set[str] = set()
    release_ids_by_game: dict[str, set[str]] = {game_id: set() for game_id in games_by_id}
    for position, row in enumerate(releases):
        if not exact_keys(row, {"gameId", "id", "state", "label", "manifest", "manifestSha256"}, f"release index row {position}"):
            continue
        assert isinstance(row, dict)
        game_id = row.get("gameId")
        if game_id not in games_by_id:
            complain(f"release index row {position}: gameId is unknown")
        elif games_by_id[game_id].get("status") != "HAS_ACCEPTED_RELEASE":
            complain(f"release index row {position}: unavailable game cannot publish a release")
        if row.get("state") != "ACCEPTED":
            complain(f"release index row {position}: state must be ACCEPTED")
        if not is_bounded_string(row.get("label"), maximum=160):
            complain(f"release index row {position}: label must be 1-160 non-blank characters")
        if row.get("id") in ids:
            complain(f"release index row {position}: duplicate id")
        if isinstance(row.get("id"), str):
            ids.add(row["id"])
            if game_id in release_ids_by_game:
                release_ids_by_game[game_id].add(row["id"])
        manifest_ref, patch_ref, receipt_ref = validate_release_manifest(row, stock_profiles_by_id)
        if manifest_ref:
            referenced_manifests.add(manifest_ref)
        if patch_ref:
            referenced_patches.add(patch_ref)
        if receipt_ref:
            referenced_receipts.add(receipt_ref)

    for game_id, game in games_by_id.items():
        game_release_ids = release_ids_by_game.get(game_id, set())
        if game.get("status") == "NO_ACCEPTED_RELEASE":
            if game_release_ids:
                complain(f"game {game_id}: NO_ACCEPTED_RELEASE requires no release rows")
            if game.get("defaultReleaseId") is not None:
                complain(f"game {game_id}: NO_ACCEPTED_RELEASE requires a null default")
        else:
            if not game_release_ids:
                complain(f"game {game_id}: HAS_ACCEPTED_RELEASE requires at least one release row")
            if game.get("defaultReleaseId") not in game_release_ids:
                complain(f"game {game_id}: defaultReleaseId must reference its own accepted release")

    present = {relative(path) for path in files}
    actual_manifests = {
        name
        for name in present
        if len(PurePosixPath(name).parts) > 1
        and PurePosixPath(name).parts[0].lower() == "releases"
        and PurePosixPath(name).suffix.lower() == ".json"
    }
    actual_patches = {
        name for name in present if PurePosixPath(name).suffix.lower() == ".srwfp"
    }
    actual_receipts = {
        name
        for name in present
        if len(PurePosixPath(name).parts) > 1
        and PurePosixPath(name).parts[0].lower() == "receipts"
        and PurePosixPath(name).suffix.lower() == ".json"
    }
    for name in sorted(actual_manifests - referenced_manifests):
        complain(f"unindexed candidate release manifest is forbidden: {name}")
    for name in sorted(actual_patches - referenced_patches):
        complain(f"unaccepted or unindexed .srwfp payload is forbidden: {name}")
    for name in sorted(actual_receipts - referenced_receipts):
        complain(f"unindexed acceptance receipt is forbidden: {name}")


class ActiveMarkupInspector(HTMLParser):
    """Collect effective CSP metadata and browser-loadable local references."""

    REFERENCE_ATTRIBUTES = {
        "action", "archive", "background", "cite", "data", "formaction",
        "href", "manifest", "poster", "src", "xlink:href",
    }

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.in_head = False
        self.head_count = 0
        self.seen_body = False
        self.inert_depth = 0
        self.style_depth = 0
        self.csp_metas: list[tuple[bool, str]] = []
        self.invalid_csp_meta = False
        self.references: list[str] = []
        self.css_fragments: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        if tag == "head":
            self.in_head = self.head_count == 0 and not self.seen_body
            self.head_count += 1
        elif tag == "body":
            self.seen_body = True
            self.in_head = False
        if tag in {"template", "noscript"}:
            self.inert_depth += 1
        if tag == "style":
            self.style_depth += 1

        lowered = [(name.lower(), value) for name, value in attrs]
        if tag == "meta":
            equiv_values = [value for name, value in lowered if name == "http-equiv"]
            content_values = [value for name, value in lowered if name == "content"]
            identifies_csp = any(
                isinstance(value, str)
                and value.strip().lower() == "content-security-policy"
                for value in equiv_values
            )
            if identifies_csp:
                if (
                    len(equiv_values) != 1
                    or len(content_values) != 1
                    or not isinstance(content_values[0], str)
                    or self.inert_depth != 0
                ):
                    self.invalid_csp_meta = True
                else:
                    self.csp_metas.append((self.in_head, content_values[0]))

            identifies_refresh = any(
                isinstance(value, str) and value.strip().lower() == "refresh"
                for value in equiv_values
            )
            if identifies_refresh:
                for content in content_values:
                    if not isinstance(content, str):
                        continue
                    match = re.search(r"(?is)(?:^|;)\s*url\s*=\s*([^;]+)", content)
                    if match:
                        self.references.append(match.group(1).strip(" \t\r\n'\""))

        for name, value in lowered:
            if not isinstance(value, str):
                continue
            if name in self.REFERENCE_ATTRIBUTES:
                self.references.append(value)
            elif name == "srcset":
                self.references.extend(
                    candidate.strip().split()[0]
                    for candidate in value.split(",")
                    if candidate.strip()
                )
            elif name == "ping":
                self.references.extend(value.split())
            elif name == "style":
                self.css_fragments.append(value)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag == "style" and self.style_depth:
            self.style_depth -= 1
        if tag in {"template", "noscript"} and self.inert_depth:
            self.inert_depth -= 1
        if tag == "head":
            self.in_head = False

    def handle_data(self, data: str) -> None:
        if self.style_depth:
            self.css_fragments.append(data)


CSS_URL_REFERENCE_RE = re.compile(
    r"(?is)\burl\(\s*(?:\"([^\"]*)\"|'([^']*)'|([^\s\)]+))\s*\)"
)
CSS_IMPORT_REFERENCE_RE = re.compile(
    r"(?is)@import\s+(?:\"([^\"]*)\"|'([^']*)')"
)
CSS_ESCAPE_RE = re.compile(
    r"(?is)\\(?:([0-9a-f]{1,6})(?:\r\n|[\x20\t\r\n\f])?|"
    r"(\r\n|[\r\n\f])|(.))"
)


def decode_css_escapes(value: str) -> str:
    def replace(match: re.Match[str]) -> str:
        if match.group(1) is not None:
            codepoint = int(match.group(1), 16)
            if codepoint == 0 or codepoint > 0x10FFFF or 0xD800 <= codepoint <= 0xDFFF:
                return "\N{REPLACEMENT CHARACTER}"
            return chr(codepoint)
        if match.group(2) is not None:
            return ""
        return match.group(3) or ""

    return CSS_ESCAPE_RE.sub(replace, value)


def css_references(text: str) -> list[str]:
    without_comments = re.sub(r"(?s)/\*.*?\*/", "", text)
    references: list[str] = []
    for pattern in (CSS_URL_REFERENCE_RE, CSS_IMPORT_REFERENCE_RE):
        for match in pattern.finditer(without_comments):
            reference = next((group for group in match.groups() if group is not None), "")
            if reference:
                references.append(decode_css_escapes(reference))
    return references


def resolve_site_reference(path: Path, reference: str) -> tuple[str, PurePosixPath | None]:
    value = reference.strip()
    if not value or value.startswith("#"):
        return "ignored", None
    parsed = urlsplit(value)
    if parsed.scheme or parsed.netloc:
        return "non-local", None
    decoded_path = unquote(parsed.path).replace("\\", "/")
    if not decoded_path:
        return "ignored", None

    source_parent = PurePosixPath(relative(path)).parent
    parts = [] if decoded_path.startswith("/") else list(source_parent.parts)
    escaped = False
    for part in decoded_path.split("/"):
        if part in {"", "."}:
            continue
        if part == "..":
            if parts:
                parts.pop()
            else:
                escaped = True
            continue
        parts.append(part)
    if escaped:
        return "escape", None
    return "local", PurePosixPath(*parts)


def validate_active_reference(path: Path, reference: str, context: str) -> None:
    status, target = resolve_site_reference(path, reference)
    if status == "non-local":
        complain(f"{relative(path)}: non-local {context} is forbidden: {reference}")
    elif status == "escape":
        complain(f"{relative(path)}: {context} escapes the repository: {reference}")
    elif target is not None and target.parts and target.parts[0] == "tests":
        complain(
            f"{relative(path)}: deployable source cannot reference excluded test source: {reference}"
        )


def parse_csp_directives(content: str) -> dict[str, tuple[str, ...]] | None:
    directives: dict[str, tuple[str, ...]] = {}
    for raw_directive in content.split(";"):
        tokens = raw_directive.split()
        if not tokens:
            continue
        name = tokens[0].lower()
        if name in directives:
            return None
        directives[name] = tuple(tokens[1:])
    return directives


def validate_index_csp(index_text: str) -> None:
    inspector = ActiveMarkupInspector()
    try:
        inspector.feed(index_text)
        inspector.close()
    except Exception as exc:  # HTMLParser can surface malformed character references.
        complain(f"index.html: cannot structurally parse Content-Security-Policy metadata: {exc}")
        return
    if (
        inspector.invalid_csp_meta
        or len(inspector.csp_metas) != 1
        or not inspector.csp_metas[0][0]
        or parse_csp_directives(inspector.csp_metas[0][1]) != REQUIRED_CSP_DIRECTIVES
    ):
        complain("index.html: exact restrictive Content-Security-Policy meta is missing or invalid")


def validate_static_site(files: list[Path]) -> None:
    try:
        index_text = (ROOT / "index.html").read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        complain(f"index.html: cannot read UTF-8 document for CSP validation: {exc}")
    else:
        validate_index_csp(index_text)

    site_files = []
    for path in files:
        name = relative(path)
        parts = PurePosixPath(name).parts
        suffix = path.suffix.lower()
        excluded_test_fixture = (
            bool(parts)
            and parts[0] == "tests"
            and suffix in TEST_FIXTURE_SOURCE_SUFFIXES
        )
        if suffix in ACTIVE_WEB_SUFFIXES and not path.is_symlink() and not excluded_test_fixture:
            site_files.append(path)
    external_url = re.compile(r"(?i)(?:https?:|wss?:)?//[^\s'\"`<>()]+")
    network_write = re.compile(
        r"(?i)\b(?:method\s*:\s*['\"`](?:POST|PUT|PATCH|DELETE)|"
        r"sendBeacon\s*\(|XMLHttpRequest\s*\(|WebSocket\s*\(|EventSource\s*\()"
    )
    import_specifier = re.compile(
        r"(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)['\"]([^'\"]+)['\"]"
    )
    for path in site_files:
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeError) as exc:
            complain(f"{relative(path)}: deployable site file is not UTF-8: {exc}")
            continue
        if external_url.search(text):
            complain(f"{relative(path)}: external/CDN URL is forbidden")
        if network_write.search(text):
            complain(f"{relative(path)}: upload or network-write API is forbidden")

        suffix = path.suffix.lower()
        if suffix in MARKUP_WEB_SUFFIXES:
            inspector = ActiveMarkupInspector()
            try:
                inspector.feed(text)
                inspector.close()
            except Exception as exc:
                complain(f"{relative(path)}: active markup cannot be parsed: {exc}")
            else:
                for reference in inspector.references:
                    validate_active_reference(path, reference, "markup reference")
                for fragment in inspector.css_fragments:
                    for reference in css_references(fragment):
                        validate_active_reference(path, reference, "CSS reference")
        elif suffix == ".css":
            for reference in css_references(text):
                validate_active_reference(path, reference, "CSS reference")
        elif suffix in {".js", ".mjs"}:
            for specifier in import_specifier.findall(text):
                if not specifier.startswith(("./", "../")):
                    complain(f"{relative(path)}: non-local module import is forbidden: {specifier}")
                    continue
                validate_active_reference(path, specifier, "module import")

    package = load_json(ROOT / "package.json")
    if isinstance(package, dict):
        if package.get("private") is not True:
            complain("package.json: package must remain private")
        for key in ("dependencies", "devDependencies", "peerDependencies", "optionalDependencies"):
            if package.get(key):
                complain(f"package.json: {key} would break the dependency-free static site")
        if package.get("scripts") != EXPECTED_PACKAGE_SCRIPTS:
            complain("package.json: scripts must be the exact dependency-free, network-free local commands")


def validate_pre_commit_hook() -> None:
    hook_path = ROOT / ".githooks/pre-commit"
    if not hook_path.is_file() or hook_path.is_symlink():
        return
    try:
        lines = hook_path.read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeError) as exc:
        complain(f".githooks/pre-commit: cannot read network-free hook contract: {exc}")
        return
    if lines != EXPECTED_PRE_COMMIT_LINES:
        complain(".githooks/pre-commit: must run only the complete local npm test suite")
    try:
        if hook_path.stat().st_mode & 0o111 == 0:
            complain(".githooks/pre-commit: hook must remain executable")
    except OSError as exc:
        complain(f".githooks/pre-commit: cannot inspect executable mode: {exc}")


def main() -> int:
    errors.clear()
    files = repository_files()
    validate_required_files(files)
    validate_forbidden_artifacts(files)
    validate_public_binary_assets(files)
    validate_schema_documents()
    validate_index(files)
    validate_static_site(files)
    validate_pre_commit_hook()

    if errors:
        print(f"repository verification failed ({len(errors)} error(s)):", file=sys.stderr)
        for message in errors:
            print(f"  - {message}", file=sys.stderr)
        return 1
    print(f"repository verification passed: {len(files)} files; release policy is fail-closed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
