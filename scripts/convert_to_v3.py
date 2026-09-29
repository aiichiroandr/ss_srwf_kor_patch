#!/usr/bin/env python3
"""Re-encode accepted v1 font-variant payloads as shared SRWFKP3 payloads.

`docs/PATCH_FORMAT_V3.md` is the normative format; `docs/V3_REDISTRIBUTION.md`
describes what this tool superseded and how to reproduce/verify it. Python 3.10+,
standard library only, no network.

The conversion needs NO stock image. Every input is a record list that already
exists in an accepted v1 payload (each file is first checked against its
receipt, its manifest and the pinned history in `verify_repo.V3_SUPERSEDED`),
and the only stock-derived metadata that v3 keeps (the canary span hashes) is
copied from v1 per-record preimages. What the owner still runs with their own
stock is `verify-stock`.

Subcommands
    encode        build the shared payloads into --out-dir (outside the repository)
    verify        strict independent decode of the payloads of the converted
                  repository plus every stock-free equivalence check
    verify-stock  apply each variant to the owner's own stock image, streaming, and
                  compare the source and every variant's target SHA-256
    install       write payload, re-issued receipts, manifests and index hashes,
                  delete the superseded v1 payloads; atomic, rollback on failure
    pins          print the superseded-history table from the v1 state

Exit status: 0 success (or already converted), 1 a check failed, 2 refusal
(partial state, missing input, bad usage).
"""

from __future__ import annotations

import argparse
import bisect
import collections
import contextlib
import hashlib
import json
import operator
import os
from pathlib import Path
import re
import struct
import subprocess
import sys
import tempfile
from array import array
from typing import Any, Callable, Iterable, Iterator
import zlib

try:  # imported as scripts.convert_to_v3 (tests) or run as a script from scripts/
    from . import verify_repo
except ImportError:  # pragma: no cover - exercised by running the file directly
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import verify_repo  # type: ignore[no-redef]


MAGIC = b"SRWFKP3\0"
V1_MAGIC = b"SRWFKP1\0"
FORMAT = "srwf.sparse-byte-delta.v3"
V1_FORMAT = "srwf.sparse-byte-delta.v1"

# --- format constants (docs/PATCH_FORMAT_V3.md section 2; a unit test pins them to verify_repo) ---
MAX_FILE_BYTES = 48 * 1024 * 1024
MAX_BODY_BYTES = 96 * 1024 * 1024
MAX_IMAGE_BYTES = 783_216_000
MAX_COMMON_RECORDS = 2_000_000
MAX_VARIANT_RECORDS = 65_536
MAX_MERGED_RECORDS = 2_000_000
MAX_CHANGED_BYTES = 64 * 1024 * 1024
MAX_CANARIES = 8
MIN_CANARY_BYTES = 16
MAX_CANARY_BYTES = 4096
MAX_GAP_VARINT_BYTES = 5
MAX_LEN_VARINT_BYTES = 4
MAX_LEN_CODE = 67_108_863
FIXED_HEADER = 72
CANARY_ENTRY = 40
VARIANT_ENTRY = 41
MIN_ZLIB_BYTES = 8
WINDOW = 1024 * 1024
# The compressor is not part of the format (a different zlib build gives a different, equally
# valid payload hash). The generator freezes these settings so the same input gives the same bytes.
ZLIB_LEVEL = 9
ZLIB_MEMLEVEL = 9
ZLIB_WBITS = 15

V1_HEADER_SIZE = 100
V1_RECORD_HEADER = 44
V1_PATCH_MAX = 80 * 1024 * 1024
VARIANT_IDS = "abc"
GROUP_ROW_RE = re.compile(r"^(?P<group>srwf-(?:f|final)-\d{8}-v\d+(?:-\d+)+)-(?P<variant>[abc])$")
_xor = operator.xor

EXIT_OK = 0
EXIT_FAILED = 1
EXIT_REFUSED = 2


class V3Error(ValueError):
    """Strict-decoder failure with the code of docs/PATCH_FORMAT_V3.md section 12."""

    def __init__(self, code: str, message: str = "") -> None:
        super().__init__(f"{code}: {message}" if message else code)
        self.code = code


class ConvertError(RuntimeError):
    """A check of the conversion failed (exit status 1)."""


class RefusalError(RuntimeError):
    """The tool refuses to act (partial state, missing input, exit status 2)."""


def fail(code: str, message: str = "") -> None:
    raise V3Error(code, message)


def sha256_hex(data: bytes | bytearray | memoryview) -> str:
    return hashlib.sha256(data).hexdigest()


def dump_json(value: Any) -> bytes:
    """The exact serialisation of every receipt and manifest already in the repository."""
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def load_ordered(raw: bytes) -> "collections.OrderedDict[str, Any]":
    return json.loads(raw.decode("utf-8"), object_pairs_hook=collections.OrderedDict)


def group_of(release_id: str) -> tuple[str, str]:
    match = GROUP_ROW_RE.fullmatch(release_id)
    if match is None:
        raise RefusalError(f"{release_id}: not an -a/-b/-c font variant release id")
    return match.group("group"), match.group("variant")


# ======================================================================================
# encoder
# ======================================================================================
def leb128(value: int) -> bytes:
    if value < 0:
        raise ConvertError("negative varint")
    out = bytearray()
    while True:
        low = value & 0x7F
        value >>= 7
        if value:
            out.append(low | 0x80)
        else:
            out.append(low)
            return bytes(out)


Record = tuple[int, int, bytes]  # offset, length, target bytes


class V1Payload:
    """A fully and strictly parsed accepted v1 payload (any deviation raises ConvertError)."""

    def __init__(self, raw: bytes, label: str) -> None:
        if len(raw) < V1_HEADER_SIZE + 1 or raw[:8] != V1_MAGIC:
            raise ConvertError(f"{label}: not an SRWFKP1 payload")
        count, source_size, target_size, body_size = struct.unpack_from(">IQQQ", raw, 8)
        if source_size != target_size:
            raise ConvertError(f"{label}: v1 source and target sizes differ")
        decompressor = zlib.decompressobj(zlib.MAX_WBITS)
        body = decompressor.decompress(raw[V1_HEADER_SIZE:], body_size + 1)
        if not decompressor.eof or decompressor.unused_data or len(body) != body_size:
            raise ConvertError(f"{label}: v1 zlib body is not one exact stream of the declared size")
        self.label = label
        self.file_size = len(raw)
        self.file_sha256 = sha256_hex(raw)
        self.image_size = source_size
        self.source_sha256 = bytes(raw[36:68])
        self.target_sha256 = bytes(raw[68:100])
        self.records: list[Record] = []
        self._body = body
        self._offsets = array("Q")
        self._preimage_at = array("Q")
        position = 0
        previous_end = -1
        for _ in range(count):
            if position + V1_RECORD_HEADER > len(body):
                raise ConvertError(f"{label}: truncated v1 record header")
            offset, length = struct.unpack_from(">QI", body, position)
            if length == 0:
                raise ConvertError(f"{label}: zero-length v1 record")
            if offset <= previous_end:
                # v3 needs a gap >= 1 inside one variant. Accepted v1 payloads are maximal-run
                # canonical, so this never triggers for them.
                raise ConvertError(f"{label}: v1 records overlap or abut at {offset}")
            if offset + length > source_size:
                raise ConvertError(f"{label}: v1 record exceeds the image")
            end = position + V1_RECORD_HEADER + length
            if end > len(body):
                raise ConvertError(f"{label}: truncated v1 record bytes")
            self.records.append((offset, length, bytes(body[position + V1_RECORD_HEADER:end])))
            self._offsets.append(offset)
            self._preimage_at.append(position + 12)
            position = end
            previous_end = offset + length
        if position != len(body):
            raise ConvertError(f"{label}: trailing v1 body bytes")

    def preimage(self, offset: int) -> bytes:
        index = bisect.bisect_left(self._offsets, offset)
        if index >= len(self._offsets) or self._offsets[index] != offset:
            raise ConvertError(f"{self.label}: no v1 record at offset {offset}")
        start = self._preimage_at[index]
        return bytes(self._body[start:start + 32])


def encode_set(records: list[Record]) -> tuple[bytes, bytes, bytes]:
    """records: sorted [(offset, length, bytes)] -> (gap column, length column, data)."""
    gaps = bytearray()
    lengths = bytearray()
    data = bytearray()
    previous_end: int | None = None
    for offset, length, target_bytes in records:
        if len(target_bytes) != length or length < 1:
            raise ConvertError(f"record at {offset} has an inconsistent length")
        if previous_end is None:
            gap = offset
        else:
            gap = offset - previous_end - 1
            if gap < 0:
                raise ConvertError(f"records overlap or abut at {offset}")
        gaps += leb128(gap)
        lengths += leb128(length - 1)
        data += target_bytes
        previous_end = offset + length
    return bytes(gaps), bytes(lengths), bytes(data)


def pack_header(
    image_size: int,
    body_size: int,
    source_sha256: bytes,
    common_count: int,
    common_data: int,
    canaries: list[tuple[int, int, bytes]],
    variants: list[tuple[str, bytes, int, int]],
) -> bytes:
    header = bytearray(MAGIC)
    header += struct.pack(">QQ", image_size, body_size)
    header += source_sha256
    header += struct.pack(">IIII", len(variants), common_count, common_data, len(canaries))
    for offset, length, digest in canaries:
        header += struct.pack(">II", offset, length) + digest
    for variant_id, target_sha256, count, data_bytes in variants:
        header += variant_id.encode("ascii") + target_sha256 + struct.pack(">II", count, data_bytes)
    return bytes(header)


def partition(
    variant_records: dict[str, list[Record]],
) -> tuple[list[Record], dict[str, list[Record]]]:
    """common = the (offset, length, bytes) triples present in EVERY variant; the rest stay per variant."""
    ids = sorted(variant_records)
    sets = {variant: set(variant_records[variant]) for variant in ids}
    common = set.intersection(*sets.values())
    return sorted(common), {variant: sorted(sets[variant] - common) for variant in ids}


def eligible_canary_records(common: list[Record]) -> list[Record]:
    return [record for record in common if MIN_CANARY_BYTES <= record[1] <= MAX_CANARY_BYTES]


def canary_positions(eligible_count: int) -> list[int]:
    """Spec section 8: C = min(8, |E|); canary i = E[floor(i * |E| / C)]."""
    count = min(MAX_CANARIES, eligible_count)
    return [(index * eligible_count) // count for index in range(count)]


def select_canaries(
    common: list[Record], v1_by_id: dict[str, V1Payload]
) -> list[tuple[int, int, bytes]]:
    eligible = eligible_canary_records(common)
    if not eligible:
        raise ConvertError("no common record of 16..4096 bytes to use as a canary")
    out: list[tuple[int, int, bytes]] = []
    for position in canary_positions(len(eligible)):
        offset, length, _ = eligible[position]
        hashes = {payload.preimage(offset) for payload in v1_by_id.values()}
        if len(hashes) != 1:
            raise ConvertError(f"v1 preimage differs between variants at common record {offset}")
        out.append((offset, length, hashes.pop()))
    return out


def build_header_and_body(
    image_size: int,
    source_sha256: bytes,
    variants: dict[str, tuple[bytes, list[Record]]],
    canaries: list[tuple[int, int, bytes]],
    *,
    common: list[Record] | None = None,
    unique: dict[str, list[Record]] | None = None,
) -> tuple[bytes, bytes, dict[str, Any]]:
    """Canonical header and uncompressed body (no compression, so it is cheap to re-derive)."""
    ids = sorted(variants)
    if common is None or unique is None:
        common, unique = partition({variant: variants[variant][1] for variant in ids})
    if not common:
        raise ConvertError("no common records: a shared payload would not help")
    encoded = [encode_set(common)] + [encode_set(unique[variant]) for variant in ids]
    counts = [len(common)] + [len(unique[variant]) for variant in ids]
    body = b"".join(gap + length for gap, length, _ in encoded) + b"".join(d for _, _, d in encoded)
    header = pack_header(
        image_size,
        len(body),
        source_sha256,
        counts[0],
        len(encoded[0][2]),
        canaries,
        [
            (variant, variants[variant][0], counts[position + 1], len(encoded[position + 1][2]))
            for position, variant in enumerate(ids)
        ],
    )
    if len(body) > MAX_BODY_BYTES:
        raise ConvertError("body exceeds the v3 cap")
    for position, variant in enumerate(ids):
        if counts[0] + counts[position + 1] > MAX_MERGED_RECORDS or counts[position + 1] > MAX_VARIANT_RECORDS:
            raise ConvertError("record count exceeds the v3 caps")
        if len(encoded[0][2]) + len(encoded[position + 1][2]) > MAX_CHANGED_BYTES:
            raise ConvertError("changed bytes exceed the v3 cap")
    info = {
        "bodyUncompressedSize": len(body),
        "commonRecordCount": counts[0],
        "sections": {
            name: {
                "records": counts[position],
                "gapBytes": len(encoded[position][0]),
                "lenBytes": len(encoded[position][1]),
                "dataBytes": len(encoded[position][2]),
            }
            for position, name in enumerate(["common", *ids])
        },
        "variants": {
            variant: {
                "recordCount": counts[0] + counts[position + 1],
                "uniqueRecordCount": counts[position + 1],
                "targetSha256": variants[variant][0].hex(),
            }
            for position, variant in enumerate(ids)
        },
    }
    return header, body, info


def compress_body(body: bytes, level: int = ZLIB_LEVEL) -> bytes:
    compressor = zlib.compressobj(level, zlib.DEFLATED, ZLIB_WBITS, ZLIB_MEMLEVEL, zlib.Z_DEFAULT_STRATEGY)
    return compressor.compress(body) + compressor.flush()


def encode_group(
    image_size: int,
    source_sha256: bytes,
    variants: dict[str, tuple[bytes, list[Record]]],
    canaries: list[tuple[int, int, bytes]],
    level: int = ZLIB_LEVEL,
) -> tuple[bytes, dict[str, Any]]:
    header, body, info = build_header_and_body(image_size, source_sha256, variants, canaries)
    compressed = compress_body(body, level)
    payload = header + compressed
    if len(payload) > MAX_FILE_BYTES:
        raise ConvertError("payload exceeds the v3 file cap")
    info.update({
        "payloadBytes": len(payload),
        "payloadSha256": sha256_hex(payload),
        "headerBytes": len(header),
        "zlibBytes": len(compressed),
        "canaryCount": len(canaries),
    })
    return payload, info


# ======================================================================================
# independent strict decoder (re-implements the spec text; shares no code with the encoder)
# ======================================================================================
def parse_header(data: bytes) -> dict[str, Any]:
    """Everything decidable before inflating. All arithmetic is bounded first."""
    if len(data) > MAX_FILE_BYTES:
        fail("PATCH_TOO_LARGE")
    if len(data) < FIXED_HEADER:
        fail("TRUNCATED_HEADER")
    if data[:8] != MAGIC:
        fail("BAD_MAGIC")
    image_size, body_size = struct.unpack_from(">QQ", data, 8)
    source_sha = bytes(data[24:56])
    variant_count, common_count, common_data, canary_count = struct.unpack_from(">IIII", data, 56)
    if not 1 <= image_size <= MAX_IMAGE_BYTES:
        fail("BAD_SIZE", "imageSize")
    if body_size > MAX_BODY_BYTES:
        fail("BODY_TOO_LARGE")
    if variant_count not in (2, 3):
        fail("BAD_VARIANT_COUNT")
    if not 1 <= canary_count <= MAX_CANARIES:
        fail("BAD_CANARY_TABLE", "canaryCount")
    header_size = FIXED_HEADER + CANARY_ENTRY * canary_count + VARIANT_ENTRY * variant_count
    if len(data) < header_size + MIN_ZLIB_BYTES:
        fail("TRUNCATED_HEADER")
    if common_count < 1:
        fail("BAD_RECORD_COUNT", "commonRecordCount")
    if common_count > MAX_COMMON_RECORDS:
        fail("TOO_MANY_RECORDS")
    if canary_count > common_count:
        fail("BAD_CANARY_TABLE", "more canaries than common records")

    canaries = []
    position = FIXED_HEADER
    previous_end = 0
    for _ in range(canary_count):
        offset, length = struct.unpack_from(">II", data, position)
        digest = bytes(data[position + 8:position + 40])
        if not MIN_CANARY_BYTES <= length <= MAX_CANARY_BYTES or offset < previous_end or offset + length > image_size:
            fail("BAD_CANARY_TABLE", f"canary at {offset}")
        canaries.append((offset, length, digest))
        previous_end = offset + length
        position += CANARY_ENTRY

    variants = []
    previous_id = 0
    for _ in range(variant_count):
        variant_id = data[position]
        if not 0x61 <= variant_id <= 0x63 or variant_id <= previous_id:
            fail("BAD_VARIANT_ID")
        previous_id = variant_id
        count, data_bytes = struct.unpack_from(">II", data, position + 33)
        variants.append({
            "id": chr(variant_id), "target": bytes(data[position + 1:position + 33]),
            "count": count, "data": data_bytes,
        })
        position += VARIANT_ENTRY
    targets = [variant["target"] for variant in variants]
    if len(set(targets)) != len(targets) or source_sha in targets:
        fail("VARIANT_TARGET_NOT_DISTINCT")

    sets = [{"id": None, "count": common_count, "data": common_data}] + variants
    total_records = 0
    total_data = 0
    for section in sets:
        if section["id"] is not None and section["count"] > MAX_VARIANT_RECORDS:
            fail("TOO_MANY_RECORDS")
        if section["count"] > section["data"]:
            fail("RECORD_BYTES_MISMATCH", "fewer data bytes than records")
        total_records += section["count"]
        total_data += section["data"]
    for variant in variants:
        if common_count + variant["count"] > MAX_MERGED_RECORDS:
            fail("TOO_MANY_RECORDS")
        if common_data + variant["data"] > MAX_CHANGED_BYTES:
            fail("CHANGED_BYTES_TOO_LARGE")
    if body_size < total_data:
        fail("BODY_SIZE_MISMATCH")
    index_bytes = body_size - total_data
    if index_bytes < 2 * total_records or index_bytes > (MAX_GAP_VARINT_BYTES + MAX_LEN_VARINT_BYTES) * total_records:
        fail("INDEX_SIZE_INVALID")
    return {
        "imageSize": image_size, "bodySize": body_size, "sourceSha256": source_sha,
        "canaries": canaries, "sets": sets, "variants": variants,
        "headerSize": header_size, "indexBytes": index_bytes,
        "commonCount": common_count, "commonData": common_data,
    }


def inflate_body(data: bytes, header: dict[str, Any]) -> bytes:
    stream = memoryview(data)[header["headerSize"]:]
    if stream[0] != 0x78 or (stream[0] * 256 + stream[1]) % 31 != 0 or stream[1] & 0x20:
        fail("BAD_ZLIB_BODY", "zlib header")
    decompressor = zlib.decompressobj(zlib.MAX_WBITS)
    try:
        body = decompressor.decompress(stream, header["bodySize"] + 1)
    except zlib.error as exc:
        fail("BAD_ZLIB_BODY", str(exc))
    if len(body) > header["bodySize"]:
        fail("BODY_SIZE_MISMATCH", "inflated output exceeds the declared size")
    if not decompressor.eof or decompressor.unused_data or decompressor.unconsumed_tail:
        fail("BAD_ZLIB_BODY", "not exactly one complete zlib stream")
    if len(body) != header["bodySize"]:
        fail("BODY_SIZE_MISMATCH", "inflated output is shorter than the declared size")
    if bytes(stream[-4:]) != struct.pack(">I", zlib.adler32(body)):
        fail("BAD_ZLIB_BODY", "Adler-32 is not the last 4 bytes")
    return body


def read_varint(buffer: bytes, position: int, end: int, max_bytes: int, max_value: int) -> tuple[int, int]:
    """Canonical unsigned LEB128, bounded in bytes and value."""
    value = 0
    multiplier = 1
    used = 0
    while True:
        if position >= end:
            fail("TRUNCATED_VARINT")
        byte = buffer[position]
        position += 1
        used += 1
        if used > max_bytes:
            fail("VARINT_TOO_LONG")
        value += (byte & 0x7F) * multiplier
        if not byte & 0x80:
            if used > 1 and byte == 0:
                fail("NON_CANONICAL_VARINT")
            break
        multiplier *= 128
    if value > max_value:
        fail("VARINT_OUT_OF_RANGE")
    return value, position


class Decoded:
    def __init__(self, header: dict[str, Any], body: bytes, sets: list[dict[str, Any]]) -> None:
        self.header = header
        self.body = body
        self.sets = sets  # [{"id","count","offs","lens","data0"}], common first

    def variant_ids(self) -> list[str]:
        return [section["id"] for section in self.sets[1:]]

    def _section(self, variant_id: str) -> dict[str, Any]:
        for section in self.sets[1:]:
            if section["id"] == variant_id:
                return section
        fail("VARIANT_NOT_IN_PAYLOAD", str(variant_id))
        raise AssertionError  # pragma: no cover

    def variant_target(self, variant_id: str) -> bytes:
        for variant in self.header["variants"]:
            if variant["id"] == variant_id:
                return variant["target"]
        fail("VARIANT_NOT_IN_PAYLOAD", str(variant_id))
        raise AssertionError  # pragma: no cover

    def merged_plan(self, variant_id: str) -> Iterator[tuple[int, int, int]]:
        """Merged records of one variant in offset order: (offset, length, body position of its data)."""
        common, own = self.sets[0], self._section(variant_id)
        common_offsets, common_lengths = common["offs"], common["lens"]
        own_offsets, own_lengths = own["offs"], own["lens"]
        common_position, own_position = common["data0"], own["data0"]
        i = j = 0
        nc, nv = len(common_offsets), len(own_offsets)
        while i < nc or j < nv:
            if j >= nv or (i < nc and common_offsets[i] < own_offsets[j]):
                yield common_offsets[i], common_lengths[i], common_position
                common_position += common_lengths[i]
                i += 1
            else:
                yield own_offsets[j], own_lengths[j], own_position
                own_position += own_lengths[j]
                j += 1

    def variant_records(self, variant_id: str) -> Iterator[Record]:
        body = self.body
        for offset, length, position in self.merged_plan(variant_id):
            yield offset, length, bytes(body[position:position + length])

    def variant_record_set_sha256(self, variant_id: str) -> str:
        digest = hashlib.sha256()
        view = memoryview(self.body)
        for offset, length, position in self.merged_plan(variant_id):
            digest.update(struct.pack(">QI", offset, length))
            digest.update(view[position:position + length])
        return digest.hexdigest()

    def unique_records(self, variant_id: str) -> list[Record]:
        section = self._section(variant_id)
        out: list[Record] = []
        position = section["data0"]
        for offset, length in zip(section["offs"], section["lens"]):
            out.append((offset, length, bytes(self.body[position:position + length])))
            position += length
        return out

    def common_records(self) -> list[Record]:
        section = self.sets[0]
        out: list[Record] = []
        position = section["data0"]
        for offset, length in zip(section["offs"], section["lens"]):
            out.append((offset, length, bytes(self.body[position:position + length])))
            position += length
        return out


def decode(data: bytes, descriptor: dict[str, Any] | None = None) -> Decoded:
    """Full parse-time validation of the payload (docs/PATCH_FORMAT_V3.md section 10, steps 1-7)."""
    header = parse_header(data)
    if descriptor is not None:
        expected = {
            "patchSize": len(data), "patchSha256": sha256_hex(data),
            "sourceSize": header["imageSize"], "targetSize": header["imageSize"],
            "sourceSha256": header["sourceSha256"].hex(),
            "bodyUncompressedSize": header["bodySize"], "commonRecordCount": header["commonCount"],
        }
        for key, actual in expected.items():
            if key in descriptor and descriptor[key] != actual:
                fail("DESCRIPTOR_MISMATCH", key)
    body = inflate_body(data, header)
    index_end = header["indexBytes"]
    image_size = header["imageSize"]
    cursor = 0
    parsed: list[dict[str, Any]] = []
    for section in header["sets"]:
        count = section["count"]
        gaps = [0] * count
        for k in range(count):
            gaps[k], cursor = read_varint(body, cursor, index_end, MAX_GAP_VARINT_BYTES, image_size - 1)
        offsets, lengths = [0] * count, [0] * count
        total_length = 0
        previous_end: int | None = None
        for k in range(count):
            code, cursor = read_varint(
                body, cursor, index_end, MAX_LEN_VARINT_BYTES, min(image_size - 1, MAX_LEN_CODE)
            )
            length = code + 1
            offset = gaps[k] if previous_end is None else previous_end + 1 + gaps[k]
            if offset + length > image_size:
                fail("RECORD_OUT_OF_RANGE")
            offsets[k], lengths[k] = offset, length
            previous_end = offset + length
            total_length += length
        if total_length != section["data"]:
            fail("RECORD_BYTES_MISMATCH", "sum of lengths != dataBytes")
        parsed.append({"id": section["id"], "count": count, "offs": offsets, "lens": lengths})
    if cursor != index_end:
        fail("TRAILING_INDEX_DATA")
    data_position = index_end
    for section in parsed:
        section["data0"] = data_position
        data_position += sum(section["lens"])
    if data_position != len(body):
        fail("BODY_SIZE_MISMATCH", "data area does not end at the body end")

    common = parsed[0]
    common_position = 0
    for offset, length, _ in header["canaries"]:
        while common_position < common["count"] and common["offs"][common_position] < offset:
            common_position += 1
        if (
            common_position >= common["count"]
            or common["offs"][common_position] != offset
            or common["lens"][common_position] != length
        ):
            fail("CANARY_NOT_COMMON_RECORD", f"offset {offset}")

    for variant in parsed[1:]:
        i = j = 0
        co, vo, cl, vl = common["offs"], variant["offs"], common["lens"], variant["lens"]
        nc, nv = len(co), len(vo)
        previous_end = None
        while i < nc or j < nv:
            if j >= nv or (i < nc and co[i] < vo[j]):
                offset, length = co[i], cl[i]
                i += 1
            else:
                offset, length = vo[j], vl[j]
                j += 1
            if previous_end is not None:
                if offset < previous_end:
                    fail("OVERLAPPING_RECORD")
                if offset == previous_end:
                    fail("NON_MAXIMAL_RECORDS")
            previous_end = offset + length
    return Decoded(header, body, parsed)


def select_variant(
    decoded: Decoded, variant: str | None, target_sha256_hex: str, record_count: int | None = None
) -> dict[str, Any]:
    """Variant-level pins (spec section 10 step 8); repeated on every apply."""
    if variant is None:
        fail("VARIANT_REQUIRED")
    entry = next((v for v in decoded.header["variants"] if v["id"] == variant), None)
    if entry is None:
        fail("VARIANT_NOT_IN_PAYLOAD", str(variant))
    assert entry is not None
    if entry["target"].hex() != target_sha256_hex:
        fail("VARIANT_TARGET_MISMATCH", str(variant))
    if record_count is not None and record_count != decoded.header["commonCount"] + entry["count"]:
        fail("DESCRIPTOR_MISMATCH", "recordCount")
    return entry


def record_set_sha256(records: Iterable[Record]) -> str:
    """SHA-256 over [offset u64 BE][length u32 BE][targetBytes] of every merged record."""
    digest = hashlib.sha256()
    for offset, length, target_bytes in records:
        digest.update(struct.pack(">QI", offset, length))
        digest.update(target_bytes)
    return digest.hexdigest()


# ======================================================================================
# stock-free equivalence proof
# ======================================================================================
def check_decoded_canonical(payload: bytes, decoded: Decoded) -> None:
    """The decoded sets must re-encode to exactly the inflated body and header (canonical partition)."""
    header = decoded.header
    ids = decoded.variant_ids()
    common = decoded.common_records()
    unique = {variant: decoded.unique_records(variant) for variant in ids}
    shared = set.intersection(*(set(records) for records in unique.values()))
    if shared:
        raise ConvertError(f"{len(shared)} record(s) sit in every variant section and belong to `common`")
    variants = {variant: (decoded.variant_target(variant), []) for variant in ids}
    rebuilt_header, rebuilt_body, _ = build_header_and_body(
        header["imageSize"], header["sourceSha256"], variants, header["canaries"],
        common=common, unique=unique,
    )
    if rebuilt_header != payload[:header["headerSize"]]:
        raise ConvertError("canonical re-encode of the header differs from the payload header")
    if rebuilt_body != decoded.body:
        raise ConvertError("canonical re-encode of the body differs from the inflated body")
    eligible = eligible_canary_records(common)
    expected = [(eligible[p][0], eligible[p][1]) for p in canary_positions(len(eligible))]
    actual = [(offset, length) for offset, length, _ in header["canaries"]]
    if actual != expected:
        raise ConvertError("canaries do not follow the generator selection rule")


def verify_payload(
    payload: bytes,
    *,
    receipts: dict[str, dict[str, Any]],
    v1: dict[str, V1Payload] | None,
    expected_record_sets: dict[str, str] | None = None,
    log: Callable[[str], None] = lambda message: None,
) -> dict[str, Any]:
    """Stock-free proof that the payload is the accepted result, for every variant.

    receipts: variant id -> receipt (its sourceSha256 and targetSha256 are the accepted hashes).
    v1: the accepted originals, when available; then the full (offset, length, bytes) tuple lists,
        the per-record canary preimages and the file hashes are compared record by record.
    expected_record_sets: variant id -> accepted recordSetSha256 (pins or supersedes block).
    """
    decoded = decode(payload)
    header = decoded.header
    ids = decoded.variant_ids()
    if set(ids) != set(receipts):
        raise ConvertError(f"payload variants {ids} differ from the accepted receipts {sorted(receipts)}")
    check_decoded_canonical(payload, decoded)
    log(f"  strict decode, merge check and canonical re-encode of variants {''.join(ids)}: ok")
    report: dict[str, Any] = {"variants": {}}
    for variant in ids:
        receipt = receipts[variant]
        entry = next(v for v in header["variants"] if v["id"] == variant)
        if header["sourceSha256"].hex() != receipt["sourceSha256"]:
            raise ConvertError(f"variant {variant}: header sourceSha256 differs from the receipt")
        if entry["target"].hex() != receipt["targetSha256"]:
            raise ConvertError(f"variant {variant}: header targetSha256 differs from the receipt")
        merged_count = header["commonCount"] + entry["count"]
        fingerprint = decoded.variant_record_set_sha256(variant)
        result: dict[str, Any] = {"recordCount": merged_count, "recordSetSha256": fingerprint}
        if expected_record_sets is not None and expected_record_sets.get(variant) != fingerprint:
            raise ConvertError(
                f"variant {variant}: recordSetSha256 {fingerprint} differs from the accepted "
                f"{expected_record_sets.get(variant)}"
            )
        if v1 is not None:
            original = v1[variant]
            if original.source_sha256.hex() != receipt["sourceSha256"] or original.target_sha256.hex() != receipt["targetSha256"]:
                raise ConvertError(f"variant {variant}: v1 header hashes differ from the receipt")
            if original.image_size != header["imageSize"]:
                raise ConvertError(f"variant {variant}: v1 image size differs")
            if merged_count != len(original.records):
                raise ConvertError(f"variant {variant}: record count differs from the accepted v1 payload")
            position = 0
            for got, want in zip(decoded.variant_records(variant), original.records):
                if got != want:
                    raise ConvertError(f"variant {variant}: record {position} differs from the accepted v1 payload")
                position += 1
            if record_set_sha256(original.records) != fingerprint:
                raise ConvertError(f"variant {variant}: recordSetSha256 differs from the v1 payload's")
            by_offset = {offset: length for offset, length, _ in original.records}
            for offset, length, digest in header["canaries"]:
                if by_offset.get(offset) != length or original.preimage(offset) != digest:
                    raise ConvertError(f"variant {variant}: canary at {offset} is not the v1 preimage")
            result["v1TuplesEqual"] = True
        select_variant(decoded, variant, receipt["targetSha256"], merged_count)
        report["variants"][variant] = result
        log(
            f"  variant {variant}: {merged_count:,} records, recordSetSha256 {fingerprint[:16]}..."
            + (", tuples equal to the accepted v1 payload" if v1 is not None else "")
        )
    report["payloadSha256"] = sha256_hex(payload)
    return report


# ======================================================================================
# owner stock run (streaming, several variants in one pass)
# ======================================================================================
def apply_variants_stream(
    decoded: Decoded,
    variant_ids: list[str],
    chunks: Iterable[bytes],
    expected_targets: dict[str, str] | None = None,
    window: int = WINDOW,
    sink: dict[str, Callable[[bytes], None]] | None = None,
) -> dict[str, Any]:
    """Reference of the spec's apply algorithm for several variants in one pass over the stock.

    Nothing is written anywhere unless a sink asks for it. Raises V3Error with the spec's codes:
    SOURCE_SIZE_MISMATCH, SOURCE_CANARY_MISMATCH (early), NON_DIFFERING_BYTE, SOURCE_HASH_MISMATCH,
    INTERNAL_RECORD_STATE, TARGET_HASH_MISMATCH, VARIANT_* pins.
    """
    header = decoded.header
    entries = {
        variant: select_variant(
            decoded, variant,
            (expected_targets or {}).get(variant) or decoded.variant_target(variant).hex(),
        )
        for variant in variant_ids
    }
    image_size = header["imageSize"]
    source_hash = hashlib.sha256()
    out_hash = {variant: hashlib.sha256() for variant in variant_ids}
    canaries = [[offset, length, digest, hashlib.sha256()] for offset, length, digest in header["canaries"]]
    plans = {variant: decoded.merged_plan(variant) for variant in variant_ids}
    current = {variant: next(plans[variant], None) for variant in variant_ids}
    applied = {variant: 0 for variant in variant_ids}
    body = decoded.body
    pending = bytearray()
    position = 0

    def flush(final: bool = False) -> None:
        nonlocal pending, position
        while len(pending) >= window or (final and pending):
            take = window if len(pending) >= window else len(pending)
            pristine = bytes(pending[:take])
            del pending[:take]
            start, end = position, position + take
            source_hash.update(pristine)
            for canary in canaries:  # [offset, length, digest, hasher | None once checked]
                if canary[3] is None:
                    continue
                canary_end = canary[0] + canary[1]
                low, high = max(canary[0], start), min(canary_end, end)
                if low < high:
                    canary[3].update(pristine[low - start:high - start])
                if canary_end <= end:  # span complete: fail fast on the first wrong canary
                    if canary[3].digest() != canary[2]:
                        fail("SOURCE_CANARY_MISMATCH", f"offset {canary[0]}")
                    canary[3] = None
            for variant in variant_ids:
                patched = bytearray(pristine)
                record = current[variant]
                while record is not None and record[0] < end:
                    r_offset, r_length, r_position = record
                    low, high = max(r_offset, start), min(r_offset + r_length, end)
                    a, b = low - start, high - start
                    segment = body[r_position + (low - r_offset):r_position + (high - r_offset)]
                    if 0 in bytes(map(_xor, pristine[a:b], segment)):
                        fail("NON_DIFFERING_BYTE", f"variant {variant} offset {low}")
                    patched[a:b] = segment
                    if r_offset + r_length <= end:
                        record = next(plans[variant], None)
                        current[variant] = record
                        applied[variant] += 1
                    else:
                        break
                out_hash[variant].update(patched)
                if sink and variant in sink:
                    sink[variant](bytes(patched))
            position = end

    for chunk in chunks:
        if position + len(pending) + len(chunk) > image_size:
            fail("SOURCE_SIZE_MISMATCH", "source is longer than imageSize")
        pending += chunk
        flush()
    flush(final=True)
    if position != image_size:
        fail("SOURCE_SIZE_MISMATCH", f"source is {position} bytes, expected {image_size}")
    if source_hash.digest() != header["sourceSha256"]:
        fail("SOURCE_HASH_MISMATCH")
    results: dict[str, Any] = {}
    for variant in variant_ids:
        entry = entries[variant]
        if current[variant] is not None or applied[variant] != header["commonCount"] + entry["count"]:
            fail("INTERNAL_RECORD_STATE", f"variant {variant}: not every record was applied")
        if out_hash[variant].digest() != entry["target"]:
            fail("TARGET_HASH_MISMATCH", f"variant {variant}")
        results[variant] = {"records": applied[variant], "targetSha256": out_hash[variant].hexdigest()}
    return {"ok": True, "bytes": position, "sourceSha256": source_hash.hexdigest(), "variants": results}


def file_chunks(path: str | os.PathLike[str], size: int = 1 << 20) -> Iterator[bytes]:
    with open(path, "rb") as handle:
        while True:
            chunk = handle.read(size)
            if not chunk:
                return
            yield chunk


def verify_stock_payload(
    payload: bytes,
    stock_path: str | os.PathLike[str],
    expected_targets: dict[str, str],
    *,
    window: int = WINDOW,
    log: Callable[[str], None] = lambda message: None,
) -> dict[str, Any]:
    """Apply every variant of the payload to the owner's stock and compare accepted hashes."""
    decoded = decode(payload)
    ids = decoded.variant_ids()
    if set(ids) != set(expected_targets):
        raise ConvertError(f"payload variants {ids} differ from the expected variants {sorted(expected_targets)}")
    try:
        result = apply_variants_stream(decoded, ids, file_chunks(stock_path), expected_targets, window)
    except V3Error as exc:
        raise ConvertError(f"stock run rejected by the strict applier: {exc}") from exc
    for variant in ids:
        log(f"  variant {variant}: target {result['variants'][variant]['targetSha256']} (accepted)")
    return result


# ======================================================================================
# repository view: releases, receipts, manifests, the v1 originals
# ======================================================================================
class GroupRow:
    def __init__(self, root: Path, row: dict[str, Any]) -> None:
        self.row = row
        self.release_id: str = row["id"]
        self.variant = group_of(self.release_id)[1]
        self.manifest_path = root / "releases" / f"{self.release_id}.json"
        self.receipt_path = root / "receipts" / f"{self.release_id}.acceptance.json"
        self.manifest_raw = self.manifest_path.read_bytes()
        self.receipt_raw = self.receipt_path.read_bytes()
        self.manifest = load_ordered(self.manifest_raw)
        self.receipt = load_ordered(self.receipt_raw)

    @property
    def patch_format(self) -> Any:
        patch = self.manifest.get("patch")
        return patch.get("format") if isinstance(patch, dict) else None

    @property
    def is_v3_receipt(self) -> bool:
        return any(key in self.receipt for key in verify_repo.V3_RECEIPT_EXTRA_KEYS)


def load_index(root: Path) -> tuple[str, dict[str, Any]]:
    path = root / "manifest" / "releases.json"
    text = path.read_text(encoding="utf-8")
    return text, json.loads(text)


def pinned_groups() -> dict[str, list[str]]:
    """group id -> sorted variant letters, from the pinned superseded history."""
    groups: dict[str, list[str]] = {}
    for release_id in verify_repo.V3_SUPERSEDED:
        group, variant = group_of(release_id)
        groups.setdefault(group, []).append(variant)
    return {group: sorted(variants) for group, variants in sorted(groups.items())}


def resolve_groups(root: Path, requested: list[str] | None) -> list[str]:
    known = pinned_groups()
    if requested:
        for group in requested:
            if group not in known:
                raise RefusalError(f"{group}: not a group in the pinned redistribution history {sorted(known)}")
        return list(dict.fromkeys(requested))
    _, index = load_index(root)
    present = {row["id"] for row in index.get("releases", []) if isinstance(row, dict)}
    return [
        group for group, variants in known.items()
        if any(f"{group}-{variant}" in present for variant in variants)
    ]


def load_group_rows(root: Path, group: str) -> dict[str, GroupRow]:
    _, index = load_index(root)
    rows = {row["id"]: row for row in index.get("releases", []) if isinstance(row, dict)}
    out: dict[str, GroupRow] = {}
    for variant in pinned_groups()[group]:
        release_id = f"{group}-{variant}"
        if release_id not in rows:
            raise RefusalError(f"refusing partial state: {release_id} is not in manifest/releases.json")
        for label, path in (
            ("manifest", root / "releases" / f"{release_id}.json"),
            ("receipt", root / "receipts" / f"{release_id}.acceptance.json"),
        ):
            if not path.is_file():
                raise RefusalError(f"refusing partial state: the {label} of {release_id} is missing")
        out[variant] = GroupRow(root, rows[release_id])
    return out


def classify_group(root: Path, group: str, rows: dict[str, GroupRow]) -> str:
    """'v1' (convertible), 'v3' (already converted). Anything else raises RefusalError."""
    v3_url = f"patches/{group}.v3.srwfp"
    v1_paths = {variant: root / "patches" / f"{row.release_id}.srwfp" for variant, row in rows.items()}
    v3_path = root / v3_url
    formats = {row.patch_format for row in rows.values()}
    receipt_forms = {row.is_v3_receipt for row in rows.values()}
    if formats == {V1_FORMAT} and receipt_forms == {False}:
        missing = [path.name for path in v1_paths.values() if not path.is_file()]
        if missing:
            raise RefusalError(f"refusing partial state: v1 payload(s) missing for {group}: {missing}")
        if v3_path.exists():
            raise RefusalError(f"refusing partial state: {v3_url} already exists beside the v1 rows")
        for row in rows.values():
            patch = row.manifest.get("patch", {})
            if patch.get("url") != f"patches/{row.release_id}.srwfp":
                raise RefusalError(f"refusing partial state: {row.release_id} does not point at its own v1 payload")
        return "v1"
    if formats == {FORMAT} and receipt_forms == {True}:
        leftovers = [path.name for path in v1_paths.values() if path.exists()]
        if leftovers:
            raise RefusalError(f"refusing partial state: superseded v1 payload(s) still present: {leftovers}")
        if not v3_path.is_file():
            raise RefusalError(f"refusing partial state: {v3_url} is missing")
        for row in rows.values():
            if row.manifest["patch"].get("url") != v3_url:
                raise RefusalError(f"refusing partial state: {row.release_id} does not point at {v3_url}")
        return "v3"
    raise RefusalError(
        f"refusing partial state for {group}: formats={sorted(map(str, formats))}, "
        f"v3-style receipts={sorted(receipt_forms)}"
    )


def check_v1_pins(root: Path, group: str, rows: dict[str, GroupRow], index_text: str) -> dict[str, V1Payload]:
    """Pre-state proof: file, receipt, manifest and index agree with each other and with the pinned history."""
    pins = verify_repo.V3_SUPERSEDED
    parsed: dict[str, V1Payload] = {}
    for variant, row in rows.items():
        release_id = row.release_id
        pin = pins[release_id]
        raw = (root / "patches" / f"{release_id}.srwfp").read_bytes()
        patch_hash = sha256_hex(raw)
        patch = row.manifest["patch"]
        checks = [
            (patch_hash == row.receipt.get("patchSha256"), "payload SHA-256 differs from its receipt"),
            (patch_hash == patch.get("sha256"), "payload SHA-256 differs from its manifest"),
            (patch_hash == pin["patchSha256"], "payload SHA-256 differs from the pinned history"),
            (len(raw) == patch.get("size"), "payload size differs from its manifest"),
            (sha256_hex(row.receipt_raw) == row.manifest["provenance"].get("acceptanceReceiptSha256"),
             "receipt file SHA-256 differs from the manifest provenance"),
            (sha256_hex(row.receipt_raw) == pin["receiptSha256"], "receipt file SHA-256 differs from the pinned history"),
            (row.receipt.get("acceptedAt") == pin["acceptedAt"], "acceptedAt differs from the pinned history"),
            (row.receipt.get("targetSha256") == pin["targetSha256"], "targetSha256 differs from the pinned history"),
            (row.receipt.get("decisionAuthority") == pin["decisionAuthority"], "decisionAuthority differs from the pinned history"),
            (row.manifest["target"].get("sha256") == row.receipt.get("targetSha256"), "manifest and receipt target hashes differ"),
            (f'"manifestSha256": "{sha256_hex(row.manifest_raw)}"' in index_text
             and row.row.get("manifestSha256") == sha256_hex(row.manifest_raw), "manifest SHA-256 differs from the index row"),
            (dump_json(row.receipt) == row.receipt_raw, "receipt is not in the canonical serialisation"),
            (dump_json(row.manifest) == row.manifest_raw, "manifest is not in the canonical serialisation"),
        ]
        for ok, message in checks:
            if not ok:
                raise ConvertError(f"{release_id}: {message}")
        parsed[variant] = V1Payload(raw, release_id)
        if parsed[variant].file_sha256 != patch_hash:
            raise ConvertError(f"{release_id}: internal hash mismatch")
        if len(parsed[variant].records) != patch.get("recordCount"):
            raise ConvertError(f"{release_id}: v1 record count differs from its manifest")
    return parsed


class V1Source:
    """Where the accepted v1 originals come from: the working tree, a directory, or a git revision."""

    def __init__(self, root: Path, directory: Path | None = None, git_rev: str | None = None) -> None:
        if git_rev is not None and (not git_rev or git_rev.startswith("-")):
            raise RefusalError(f"not a usable git revision: {git_rev!r}")
        self.root, self.directory, self.git_rev = root, directory, git_rev

    def describe(self) -> str:
        if self.git_rev:
            return f"git {self.git_rev}"
        return str(self.directory or self.root / "patches")

    def read(self, release_id: str) -> bytes | None:
        name = f"{release_id}.srwfp"
        if self.git_rev:
            result = subprocess.run(
                ["git", "cat-file", "blob", f"{self.git_rev}:patches/{name}"],
                cwd=self.root, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            )
            if result.returncode != 0:
                raise RefusalError(
                    f"cannot read patches/{name} at git revision {self.git_rev}: "
                    f"{result.stderr.decode('utf-8', 'replace').strip()}"
                )
            return result.stdout
        path = (self.directory or self.root / "patches") / name
        return path.read_bytes() if path.is_file() else None


# ======================================================================================
# re-issued receipts / manifests / index
# ======================================================================================
def reissue_receipt(
    row: GroupRow, *, payload_sha256: str, record_set: str
) -> "collections.OrderedDict[str, Any]":
    """The original evidence fields stay in place; only patchSha256 and decisionAuthority change."""
    new: "collections.OrderedDict[str, Any]" = collections.OrderedDict()
    for key, value in row.receipt.items():
        if key == "patchSha256":
            value = payload_sha256
        elif key == "decisionAuthority":
            value = verify_repo.V3_REDISTRIBUTION_DECISION_AUTHORITY
        new[key] = value
    new["patchFormat"] = FORMAT
    new["variantId"] = row.variant
    new["supersedes"] = collections.OrderedDict([
        ("receiptSha256", sha256_hex(row.receipt_raw)),
        ("patchSha256", row.receipt["patchSha256"]),
        ("recordSetSha256", record_set),
        ("decisionAuthority", row.receipt["decisionAuthority"]),
    ])
    return new


def reissue_manifest(
    row: GroupRow, *, group: str, info: dict[str, Any], receipt_sha256: str
) -> "collections.OrderedDict[str, Any]":
    new: "collections.OrderedDict[str, Any]" = collections.OrderedDict()
    for key, value in row.manifest.items():
        if key == "patch":
            variant_info = info["variants"][row.variant]
            if variant_info["recordCount"] != value["recordCount"]:
                raise ConvertError(f"{row.release_id}: merged record count differs from the accepted recordCount")
            value = collections.OrderedDict([
                ("format", FORMAT),
                ("url", f"patches/{group}.v3.srwfp"),
                ("size", info["payloadBytes"]),
                ("sha256", info["payloadSha256"]),
                ("recordCount", variant_info["recordCount"]),
                ("bodyUncompressedSize", info["bodyUncompressedSize"]),
                ("variant", row.variant),
                ("commonRecordCount", info["commonRecordCount"]),
            ])
        elif key == "provenance":
            value = collections.OrderedDict(value)
            value["acceptanceReceiptSha256"] = receipt_sha256
        new[key] = value
    return new


class Plan:
    """Everything one group's conversion will write, computed and verified in memory."""

    def __init__(self, group: str) -> None:
        self.group = group
        self.payload_path = Path("patches") / f"{group}.v3.srwfp"
        self.writes: dict[Path, bytes] = {}
        self.deletes: list[Path] = []
        self.index_replacements: list[tuple[str, str]] = []
        self.info: dict[str, Any] = {}
        self.lines: list[str] = []


def build_payload(
    root: Path, group: str, rows: dict[str, GroupRow], index_text: str,
    source: V1Source, log: Callable[[str], None],
) -> tuple[bytes, dict[str, Any], dict[str, Any]]:
    """Encode the group from the accepted v1 payloads and prove it equivalent without the stock."""
    log(f"{group}: reading the accepted v1 payloads from {source.describe()}")
    if source.git_rev or source.directory:
        v1 = read_v1_originals(source, rows)
    else:
        v1 = check_v1_pins(root, group, rows, index_text)
    ids = sorted(rows)
    receipts = {variant: rows[variant].receipt for variant in ids}
    first = v1[ids[0]]
    if len({payload.image_size for payload in v1.values()}) != 1 or len({payload.source_sha256 for payload in v1.values()}) != 1:
        raise ConvertError(f"{group}: variants disagree on image size or source SHA-256")
    targets = [v1[variant].target_sha256 for variant in ids]
    if len(set(targets)) != len(targets) or first.source_sha256 in targets:
        raise ConvertError(f"{group}: variant target hashes must be pairwise distinct and differ from the source")
    if not 1 <= first.image_size <= MAX_IMAGE_BYTES:
        raise ConvertError(f"{group}: image size is outside the v3 range")
    common, _unique = partition({variant: v1[variant].records for variant in ids})
    canaries = select_canaries(common, v1)
    variants = {variant: (v1[variant].target_sha256, v1[variant].records) for variant in ids}
    log(f"{group}: encoding one shared payload for variants {''.join(ids)}")
    payload, info = encode_group(first.image_size, first.source_sha256, variants, canaries)
    log(f"{group}: verifying the payload without the stock image")
    pins = verify_repo.V3_SUPERSEDED
    report = verify_payload(
        payload, receipts=receipts, v1=v1,
        expected_record_sets={variant: pins[f"{group}-{variant}"]["recordSetSha256"] for variant in ids},
        log=log,
    )
    info.update({
        "sourceSha256": first.source_sha256.hex(),
        "imageSize": first.image_size,
        "v1": {v: {"size": v1[v].file_size, "sha256": v1[v].file_sha256, "records": len(v1[v].records)} for v in ids},
        "recordSetSha256": {v: report["variants"][v]["recordSetSha256"] for v in ids},
    })
    return payload, info, report


def plan_group(
    root: Path, group: str, rows: dict[str, GroupRow], index_text: str,
    source: V1Source, log: Callable[[str], None],
) -> Plan:
    plan = Plan(group)
    payload, info, report = build_payload(root, group, rows, index_text, source, log)
    plan.info = info
    plan.writes[plan.payload_path] = payload
    for variant in sorted(rows):
        row = rows[variant]
        receipt = reissue_receipt(
            row, payload_sha256=info["payloadSha256"], record_set=report["variants"][variant]["recordSetSha256"]
        )
        receipt_raw = dump_json(receipt)
        manifest = reissue_manifest(row, group=group, info=info, receipt_sha256=sha256_hex(receipt_raw))
        manifest_raw = dump_json(manifest)
        plan.writes[Path("receipts") / f"{row.release_id}.acceptance.json"] = receipt_raw
        plan.writes[Path("releases") / f"{row.release_id}.json"] = manifest_raw
        plan.index_replacements.append((sha256_hex(row.manifest_raw), sha256_hex(manifest_raw)))
        plan.deletes.append(Path("patches") / f"{row.release_id}.srwfp")
        plan.lines.append(
            f"  {row.release_id}: receipt {sha256_hex(receipt_raw)[:12]}, manifest {sha256_hex(manifest_raw)[:12]}"
        )
    return plan


def read_v1_originals(source: V1Source, rows: dict[str, GroupRow]) -> dict[str, V1Payload]:
    """v1 originals from a directory or a git revision, pinned by the history table."""
    pins = verify_repo.V3_SUPERSEDED
    out: dict[str, V1Payload] = {}
    for variant, row in rows.items():
        raw = source.read(row.release_id)
        if raw is None:
            raise RefusalError(f"the v1 payload of {row.release_id} is not available in {source.describe()}")
        if sha256_hex(raw) != pins[row.release_id]["patchSha256"]:
            raise ConvertError(f"{row.release_id}: v1 payload from {source.describe()} differs from the pinned history")
        out[variant] = V1Payload(raw, row.release_id)
    return out


@contextlib.contextmanager
def verifier_root(root: Path):
    original = (verify_repo.ROOT, verify_repo.INDEX_PATH, list(verify_repo.errors))
    verify_repo.ROOT = root
    verify_repo.INDEX_PATH = root / "manifest" / "releases.json"
    verify_repo.errors.clear()
    try:
        yield
    finally:
        verify_repo.ROOT, verify_repo.INDEX_PATH = original[0], original[1]
        verify_repo.errors[:] = original[2]


def atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(handle, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    except BaseException:
        with contextlib.suppress(OSError):
            os.unlink(temporary)
        raise


def validate_tree(root: Path, removed: list[Path]) -> list[str]:
    """Run the repository's index validation with the superseded payloads treated as deleted."""
    with verifier_root(root):
        files = [path for path in verify_repo.repository_files() if path not in {root / r for r in removed}]
        verify_repo.validate_index(files)
        return list(verify_repo.errors)


def apply_plans(root: Path, plans: list[Plan], index_text: str, log: Callable[[str], None]) -> None:
    writes: dict[Path, bytes] = {}
    deletes: list[Path] = []
    new_index = index_text
    for plan in plans:
        writes.update({root / path: data for path, data in plan.writes.items()})
        deletes.extend(root / path for path in plan.deletes)
        for old, new in plan.index_replacements:
            needle = f'"manifestSha256": "{old}"'
            if new_index.count(needle) != 1:
                raise ConvertError(f"index row for manifest {old[:12]} is not unique")
            new_index = new_index.replace(needle, f'"manifestSha256": "{new}"')
    writes[root / "manifest" / "releases.json"] = new_index.encode("utf-8")
    for path in deletes:
        if not os.access(path.parent, os.W_OK):
            raise RefusalError(f"cannot delete {path}: the directory is not writable")

    backups: dict[Path, bytes | None] = {}
    try:
        for path, data in writes.items():
            backups[path] = path.read_bytes() if path.exists() else None
            atomic_write(path, data)
        errors = validate_tree(root, [path.relative_to(root) for path in deletes])
        if errors:
            raise ConvertError(
                "verify_repo.validate_index rejected the converted tree:\n  - " + "\n  - ".join(errors[:20])
            )
    except BaseException:
        for path, original in backups.items():
            if original is None:
                with contextlib.suppress(OSError):
                    os.unlink(path)
            else:
                atomic_write(path, original)
        log("rolled back: the repository is exactly as before")
        raise
    for path in deletes:
        os.unlink(path)


# ======================================================================================
# commands
# ======================================================================================
def say(message: str) -> None:
    print(message, flush=True)


def cmd_pins(args: argparse.Namespace) -> int:
    root = Path(args.root).resolve()
    source = V1Source(root, Path(args.v1_dir).resolve() if args.v1_dir else None)
    out: dict[str, Any] = {}
    matches = True
    for group in resolve_groups(root, args.group):
        rows = load_group_rows(root, group)
        for variant, row in rows.items():
            raw = source.read(row.release_id)
            if raw is None:
                raise RefusalError(f"the v1 payload of {row.release_id} is not available in {source.describe()}")
            payload = V1Payload(raw, row.release_id)
            receipt = row.receipt
            if row.is_v3_receipt:
                raise RefusalError(f"{row.release_id} is already converted; run pins on a checkout of the anchor commit")
            entry = {
                "acceptedAt": receipt["acceptedAt"],
                "receiptSha256": sha256_hex(row.receipt_raw),
                "patchSha256": payload.file_sha256,
                "recordSetSha256": record_set_sha256(payload.records),
                "targetSha256": receipt["targetSha256"],
                "longPlayProgression": receipt["gates"]["longPlayProgression"],
                "decisionAuthority": receipt["decisionAuthority"],
            }
            out[row.release_id] = entry
            matches &= verify_repo.V3_SUPERSEDED.get(row.release_id) == entry
    print(json.dumps(out, ensure_ascii=False, indent=2))
    say(f"# matches verify_repo.V3_SUPERSEDED: {'yes' if matches else 'NO'}")
    return EXIT_OK if matches else EXIT_FAILED


def cmd_encode(args: argparse.Namespace) -> int:
    root = Path(args.root).resolve()
    out_dir = Path(args.out_dir).resolve()
    if root == out_dir or root in out_dir.parents:
        raise RefusalError("--out-dir must be outside the repository (the verifier forbids unindexed .srwfp files)")
    source = V1Source(root, Path(args.v1_dir).resolve() if args.v1_dir else None, args.v1_git_rev)
    out_dir.mkdir(parents=True, exist_ok=True)
    index_text, _ = load_index(root)
    for group in resolve_groups(root, args.group):
        rows = load_group_rows(root, group)
        if not (source.git_rev or source.directory) and classify_group(root, group, rows) == "v3":
            raise RefusalError(
                f"{group} is already converted; pass --v1-git-rev {verify_repo.V3_SUPERSEDED_ANCHOR_COMMIT} "
                "to re-encode it from the accepted v1 payloads"
            )
        payload, info, _ = build_payload(root, group, rows, index_text, source, say)
        target = out_dir / f"{group}.v3.srwfp"
        target.write_bytes(payload)
        (out_dir / f"{group}.v3.srwfp.json").write_text(
            json.dumps(info, indent=1, sort_keys=True) + "\n", encoding="utf-8"
        )
        say(f"{group}: wrote {target} ({info['payloadBytes']:,} bytes, sha256 {info['payloadSha256']})")
    return EXIT_OK


def receipts_of(rows: dict[str, GroupRow]) -> dict[str, dict[str, Any]]:
    return {variant: row.receipt for variant, row in rows.items()}


def verify_converted_group(
    root: Path, group: str, rows: dict[str, GroupRow], source: V1Source | None, reproduce: bool,
    log: Callable[[str], None],
) -> None:
    """Checks of a converted (v3) group: payload, receipts, manifests, pins, optional v1 originals."""
    pins = verify_repo.V3_SUPERSEDED
    payload = (root / "patches" / f"{group}.v3.srwfp").read_bytes()
    payload_hash = sha256_hex(payload)
    for variant, row in rows.items():
        patch = row.manifest["patch"]
        supersedes = row.receipt.get("supersedes", {})
        pin = pins[row.release_id]
        for ok, message in (
            (row.receipt.get("patchSha256") == payload_hash, "receipt patchSha256 differs from the payload"),
            (patch.get("sha256") == payload_hash and patch.get("size") == len(payload), "manifest patch differs from the payload"),
            (sha256_hex(row.receipt_raw) == row.manifest["provenance"].get("acceptanceReceiptSha256"), "receipt hash differs from the manifest provenance"),
            (supersedes.get("receiptSha256") == pin["receiptSha256"] and supersedes.get("patchSha256") == pin["patchSha256"]
             and supersedes.get("recordSetSha256") == pin["recordSetSha256"] and supersedes.get("decisionAuthority") == pin["decisionAuthority"],
             "supersedes differs from the pinned history"),
            (row.receipt.get("acceptedAt") == pin["acceptedAt"] and row.receipt.get("targetSha256") == pin["targetSha256"], "original evidence fields changed"),
            (row.receipt.get("decisionAuthority") == verify_repo.V3_REDISTRIBUTION_DECISION_AUTHORITY, "decisionAuthority is not the pinned redistribution text"),
        ):
            if not ok:
                raise ConvertError(f"{row.release_id}: {message}")
    v1 = None
    if source is not None:
        v1 = read_v1_originals(source, rows)
        log(f"{group}: comparing with the accepted v1 payloads from {source.describe()}")
    else:
        log(f"{group}: v1 originals not supplied; relying on the pinned recordSetSha256 fingerprints")
    report = verify_payload(
        payload, receipts=receipts_of(rows), v1=v1,
        expected_record_sets={variant: pins[f"{group}-{variant}"]["recordSetSha256"] for variant in rows},
        log=log,
    )
    for variant, row in rows.items():
        if report["variants"][variant]["recordCount"] != row.manifest["patch"]["recordCount"]:
            raise ConvertError(f"{row.release_id}: manifest recordCount differs from the payload")
    if reproduce:
        if v1 is None:
            raise RefusalError("--reproduce needs the v1 originals (--v1-git-rev or --v1-dir)")
        ids = sorted(rows)
        common, _ = partition({variant: v1[variant].records for variant in ids})
        again, _ = encode_group(
            v1[ids[0]].image_size, v1[ids[0]].source_sha256,
            {variant: (v1[variant].target_sha256, v1[variant].records) for variant in ids},
            select_canaries(common, v1),
        )
        if again != payload:
            raise ConvertError(
                f"{group}: re-encoding gives {sha256_hex(again)}, the committed payload is {payload_hash} "
                f"(zlib {zlib.ZLIB_RUNTIME_VERSION}; another zlib build produces different, equally valid bytes)"
            )
        log(f"{group}: byte-identical re-encode (zlib {zlib.ZLIB_RUNTIME_VERSION})")
    log(f"{group}: verified, payload sha256 {payload_hash}")


def cmd_verify(args: argparse.Namespace) -> int:
    root = Path(args.root).resolve()
    source = None
    if args.v1_git_rev or args.v1_dir:
        source = V1Source(root, Path(args.v1_dir).resolve() if args.v1_dir else None, args.v1_git_rev)
    index_text, _ = load_index(root)
    for group in resolve_groups(root, args.group):
        rows = load_group_rows(root, group)
        state = classify_group(root, group, rows)
        if state == "v1":
            # Nothing to decode yet: encode in memory and run the whole stock-free proof on the result.
            _, info, _ = build_payload(root, group, rows, index_text, source or V1Source(root), say)
            say(
                f"{group}: still v1 (pre-conversion); the payload that install would write "
                f"({info['payloadBytes']:,} bytes, sha256 {info['payloadSha256']}) is verified equivalent"
            )
            continue
        verify_converted_group(root, group, rows, source, args.reproduce, say)
    return EXIT_OK


def cmd_verify_stock(args: argparse.Namespace) -> int:
    root = Path(args.root).resolve()
    stock = Path(args.stock)
    if not stock.is_file():
        raise RefusalError(f"stock image not found: {stock}")
    for group in resolve_groups(root, args.group):
        rows = load_group_rows(root, group)
        if classify_group(root, group, rows) != "v3":
            raise RefusalError(f"{group} is not converted yet; run install first")
        payload = (root / "patches" / f"{group}.v3.srwfp").read_bytes()
        say(f"{group}: applying every variant to {stock} (streaming, one pass)")
        expected = {variant: row.receipt["targetSha256"] for variant, row in rows.items()}
        verify_stock_payload(payload, stock, expected, window=args.window, log=say)
        say(f"{group}: source SHA-256 and all {len(rows)} target SHA-256 match the accepted receipts")
    return EXIT_OK


def cmd_install(args: argparse.Namespace) -> int:
    root = Path(args.root).resolve()
    source = V1Source(root)  # install always converts what is in the working tree
    index_text, _ = load_index(root)
    groups = resolve_groups(root, args.group)
    if not groups:
        raise RefusalError("no group of the pinned redistribution history is in manifest/releases.json")
    states: dict[str, str] = {}
    all_rows: dict[str, dict[str, GroupRow]] = {}
    for group in groups:  # classify everything first: refuse before touching any file
        all_rows[group] = load_group_rows(root, group)
        states[group] = classify_group(root, group, all_rows[group])
    for group in resolve_groups(root, None):
        if group not in groups and classify_group(root, group, load_group_rows(root, group)) == "v1":
            raise RefusalError(
                f"{group} would stay v1 and verify_repo forbids v1 -a/-b/-c rows, so the converted tree could "
                "not validate; convert every pinned group in one run (omit --group)"
            )
    plans: list[Plan] = []
    for group in groups:
        if states[group] == "v3":
            say(f"{group}: already converted; checking it")
            verify_converted_group(root, group, all_rows[group], None, False, say)
            continue
        plans.append(plan_group(root, group, all_rows[group], index_text, source, say))
    if not plans:
        say("already converted: nothing to do")
        return EXIT_OK
    for plan in plans:
        say(f"{plan.group}: plan")
        say(f"  write  {plan.payload_path} ({len(plan.writes[plan.payload_path]):,} bytes)")
        for line in plan.lines:
            say(line)
        for path in plan.deletes:
            say(f"  delete {path}")
    if args.dry_run:
        say("dry run: nothing written")
        return EXIT_OK
    apply_plans(root, plans, index_text, say)
    say("installed: payload(s), receipts, manifests and index hashes written; superseded v1 payloads deleted")
    say("next: python3 scripts/verify_repo.py, then the owner's `verify-stock` run before any push")
    return EXIT_OK


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = parser.add_subparsers(dest="command", required=True)

    def common(p: argparse.ArgumentParser, *, v1: bool = True) -> None:
        p.add_argument("--root", default=str(verify_repo.ROOT), help="repository root (default: this repository)")
        p.add_argument("--group", action="append", help="group id such as srwf-f-20260928-v0-5 (default: every pinned group present)")
        if v1:
            p.add_argument("--v1-dir", help="directory holding the accepted v1 payloads instead of patches/")
            p.add_argument(
                "--v1-git-rev",
                help=f"read the accepted v1 payloads from this git revision (anchor: {verify_repo.V3_SUPERSEDED_ANCHOR_COMMIT})",
            )

    encode = sub.add_parser("encode", help="build the shared payload(s) into --out-dir")
    common(encode)
    encode.add_argument("--out-dir", required=True)
    encode.set_defaults(func=cmd_encode)

    verify = sub.add_parser("verify", help="strict decode and stock-free equivalence checks")
    common(verify)
    verify.add_argument("--reproduce", action="store_true", help="also re-encode and compare bytes (needs the same zlib build)")
    verify.set_defaults(func=cmd_verify)

    stock = sub.add_parser("verify-stock", help="owner run: apply each variant to your own stock image")
    common(stock, v1=False)
    stock.add_argument("--stock", required=True, help="the exact stock image (TRACK 01 MODE1/2352 .bin)")
    stock.add_argument("--window", type=int, default=WINDOW, help=argparse.SUPPRESS)
    stock.set_defaults(func=cmd_verify_stock)

    install = sub.add_parser(
        "install",
        help="convert every pinned group in one atomic, idempotent run (a subset is refused while "
             "another group would stay v1)",
    )
    common(install, v1=False)
    install.add_argument("--dry-run", action="store_true")
    install.set_defaults(func=cmd_install)

    pins = sub.add_parser("pins", help="print the superseded-history table from the (unconverted) v1 state")
    common(pins, v1=False)
    pins.add_argument("--v1-dir", help="directory holding the accepted v1 payloads instead of patches/")
    pins.set_defaults(func=cmd_pins)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return args.func(args)
    except RefusalError as exc:
        print(f"refused: {exc}", file=sys.stderr)
        return EXIT_REFUSED
    except (ConvertError, V3Error) as exc:
        print(f"FAILED: {exc}", file=sys.stderr)
        return EXIT_FAILED


if __name__ == "__main__":
    sys.exit(main())
