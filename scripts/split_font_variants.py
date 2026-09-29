#!/usr/bin/env python3
"""Redistribute accepted F font-variant releases as one shared base layer plus
one small font layer per variant (docs/LAYERED_RELEASES.md).

The accepted target image of every variant stays byte-identical: the script
only re-encodes the SAME accepted record set into two canonical
``srwf.sparse-byte-delta.v1`` files per variant:

* base  : pinned stock        -> intermediate image (records common to a/b/c)
* font  : intermediate image  -> accepted target     (records unique to one font)

A v1 header pins whole-image SHA-256 values, so the intermediate image hash can
only be computed from the owner's own stock image. That image never enters the
repository; the owner runs this script locally::

    python3 scripts/split_font_variants.py --stock /path/to/stock.img

``--dry-run`` needs no stock image. It parses the accepted payloads, checks the
split and reports projected sizes without writing anything.

Everything is network-free and uses the Python standard library only.
"""

from __future__ import annotations

import argparse
from array import array
from dataclasses import dataclass, field
import hashlib
import json
import os
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import tempfile
from typing import Any, Callable, Iterable
import zlib

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts import verify_repo as V  # noqa: E402  (reuse the public v1 parser)

# Accepted font-variant releases this script may redistribute. Final v0.2 (v2)
# is intentionally absent: layered delivery is defined for v1 only.
LAYERED_GROUPS: dict[str, tuple[str, ...]] = {
    "srwf-f-20260928-v0-5": ("a", "b", "c"),
    "srwf-f-20260915-v0-4": ("a", "b", "c"),
}
DECISION_AUTHORITY = (
    "사용자 2026-09-29 지시: 동일한 승인 결과 이미지를 공통 패치 + 폰트 차이 패치로 재배포. "
    "결과 SHA-256 불변."
)
ZLIB_LEVEL = 9  # fixed for byte-deterministic output
STREAM_CHUNK_BYTES = 4 * 1024 * 1024
RECORD_HEADER = V.RECORD_HEADER_SIZE  # 44
PATCH_HEADER = V.PATCH_HEADER_SIZE  # 100


class SplitError(RuntimeError):
    """A fail-closed refusal. Nothing is installed when this is raised."""


# --------------------------------------------------------------------------
# Record model
# --------------------------------------------------------------------------


@dataclass
class RecordSet:
    """Canonical records addressed inside one uncompressed v1 body."""

    body: bytes
    offsets: array = field(default_factory=lambda: array("Q"))
    lengths: array = field(default_factory=lambda: array("Q"))
    positions: array = field(default_factory=lambda: array("Q"))

    def __len__(self) -> int:
        return len(self.offsets)

    def raw(self, index: int) -> bytes:
        start = self.positions[index]
        return self.body[start:start + RECORD_HEADER + self.lengths[index]]

    def preimage(self, index: int) -> bytes:
        start = self.positions[index]
        return self.body[start + 12:start + RECORD_HEADER]

    def target_bytes(self, index: int, start: int, end: int) -> bytes:
        """Target bytes for absolute range [start, end) inside record ``index``."""
        base = self.positions[index] + RECORD_HEADER - self.offsets[index]
        return self.body[base + start:base + end]

    def target_byte_total(self) -> int:
        return sum(self.lengths)


def index_records(body: bytes, record_count: int) -> RecordSet:
    records = RecordSet(body)
    position = 0
    for _ in range(record_count):
        offset, length = struct.unpack_from(">QI", body, position)
        records.offsets.append(offset)
        records.lengths.append(length)
        records.positions.append(position)
        position += RECORD_HEADER + length
    if position != len(body):
        raise SplitError("record walk does not end at the body end")
    return records


@dataclass
class ParsedPayload:
    descriptor: dict[str, Any]
    records: RecordSet


def parse_payload(data: bytes, context: str) -> ParsedPayload:
    """Structural v1 parse through the same rules verify_repo enforces."""
    try:
        descriptor = V.inspect_srwfp(data)
    except V.SrwfpFormatError as exc:
        raise SplitError(f"{context}: malformed v1 payload: {exc}") from exc
    # inspect_srwfp already enforced the exact zlib/DEFLATE structure and size.
    body = zlib.decompress(data[PATCH_HEADER:])
    if len(body) != descriptor["bodyUncompressedSize"]:
        raise SplitError(f"{context}: body size differs from its header")
    return ParsedPayload(descriptor, index_records(body, int(descriptor["recordCount"])))


# --------------------------------------------------------------------------
# Split and static canonical checks
# --------------------------------------------------------------------------


@dataclass
class Split:
    common: list[int]  # record indexes into variants[0]
    unique: list[list[int]]  # per variant, record indexes into that variant


def split_records(variants: list[RecordSet]) -> Split:
    """Exact (offset, length, preimage, targetBytes) intersection of all variants."""
    if len(variants) < 2:
        raise SplitError("a layered split needs at least two variants")
    cursors = [0] * len(variants)
    common: list[int] = []
    unique: list[list[int]] = [[] for _ in variants]
    while True:
        heads = [
            records.offsets[cursor] if cursor < len(records) else None
            for records, cursor in zip(variants, cursors)
        ]
        live = [offset for offset in heads if offset is not None]
        if not live:
            break
        minimum = min(live)
        at_minimum = [index for index, offset in enumerate(heads) if offset == minimum]
        if len(at_minimum) == len(variants):
            first = variants[0].raw(cursors[0])
            if all(variants[v].raw(cursors[v]) == first for v in range(1, len(variants))):
                common.append(cursors[0])
                for v in range(len(variants)):
                    cursors[v] += 1
                continue
        for v in at_minimum:
            unique[v].append(cursors[v])
            cursors[v] += 1
    return Split(common, unique)


def spans_of(records: RecordSet, indexes: Iterable[int]) -> list[tuple[int, int]]:
    return [(records.offsets[i], records.offsets[i] + records.lengths[i]) for i in indexes]


def check_canonical_layer(spans: list[tuple[int, int]], image_size: int, label: str) -> None:
    """docs/PATCH_FORMAT.md 정규형: non-empty, sorted, disjoint, non-adjacent, in range."""
    if not spans:
        raise SplitError(f"{label}: a public layer needs at least one record")
    if len(spans) > V.RECORD_MAX:
        raise SplitError(f"{label}: exceeds the {V.RECORD_MAX}-record cap")
    previous_end = -1
    for index, (start, end) in enumerate(spans):
        if end <= start:
            raise SplitError(f"{label}: record {index} is empty")
        if end > image_size:
            raise SplitError(f"{label}: record {index} exceeds the image")
        if index and start < previous_end:
            raise SplitError(f"{label}: record {index} overlaps its predecessor")
        if index and start == previous_end:
            raise SplitError(f"{label}: record {index} abuts its predecessor (not maximal)")
        previous_end = end


def check_layers_disjoint(
    base: list[tuple[int, int]], font: list[tuple[int, int]], label: str
) -> None:
    """No font record may overlap OR abut a base record (fail closed)."""
    from bisect import bisect_right

    starts = [start for start, _ in base]
    for start, end in font:
        position = bisect_right(starts, start) - 1
        for neighbour in (position, position + 1):
            if 0 <= neighbour < len(base):
                other_start, other_end = base[neighbour]
                if start <= other_end and other_start <= end:
                    kind = "overlaps" if start < other_end and other_start < end else "abuts"
                    raise SplitError(
                        f"{label}: font record [{start},{end}) {kind} base record "
                        f"[{other_start},{other_end})"
                    )


def check_union_capture_budget(
    base: list[tuple[int, int]], font: list[tuple[int, int]], image_size: int, label: str
) -> int:
    """The browser download path captures the union of both layers' windows."""
    chunk = V.DOWNLOAD_CAPTURE_CHUNK_BYTES
    merged = sorted(base + font)
    captured = 0
    window: list[int] | None = None
    for start, end in merged:
        window_start = start // chunk * chunk
        window_end = min(image_size, (end + chunk - 1) // chunk * chunk)
        if window is not None and window_start <= window[1]:
            window[1] = max(window[1], window_end)
            continue
        if window is not None:
            captured += window[1] - window[0]
        window = [window_start, window_end]
    if window is not None:
        captured += window[1] - window[0]
    if captured > V.MAX_DOWNLOAD_CAPTURE_BYTES:
        raise SplitError(f"{label}: union download capture needs {captured} bytes")
    return captured


# --------------------------------------------------------------------------
# Encoding
# --------------------------------------------------------------------------


def build_body(records: RecordSet, indexes: list[int]) -> bytes:
    return b"".join(records.raw(index) for index in indexes)


def encode_header(record_count: int, image_size: int, body_size: int,
                  source_sha256: str, target_sha256: str) -> bytes:
    header = bytearray(PATCH_HEADER)
    header[:8] = V.PATCH_MAGIC
    struct.pack_into(">IQQQ", header, 8, record_count, image_size, image_size, body_size)
    header[36:68] = bytes.fromhex(source_sha256)
    header[68:100] = bytes.fromhex(target_sha256)
    return bytes(header)


@dataclass
class LayerDraft:
    role: str
    records: RecordSet
    indexes: list[int]
    body: bytes
    compressed: bytes

    @property
    def record_count(self) -> int:
        return len(self.indexes)

    def payload(self, image_size: int, source_sha256: str, target_sha256: str) -> bytes:
        data = encode_header(
            self.record_count, image_size, len(self.body), source_sha256, target_sha256
        ) + self.compressed
        if len(data) > V.PATCH_MAX:
            raise SplitError(f"{self.role} layer exceeds the {V.PATCH_MAX}-byte cap")
        return data


def draft_layer(role: str, records: RecordSet, indexes: list[int]) -> LayerDraft:
    body = build_body(records, indexes)
    if len(body) > V.BODY_MAX:
        raise SplitError(f"{role} layer body exceeds the {V.BODY_MAX}-byte cap")
    return LayerDraft(role, records, indexes, body, zlib.compress(body, ZLIB_LEVEL))


# --------------------------------------------------------------------------
# Streaming application (never holds or writes a whole image)
# --------------------------------------------------------------------------


def any_equal_byte(left: bytes | memoryview, right: bytes | memoryview) -> bool:
    difference = int.from_bytes(left, "big") ^ int.from_bytes(right, "big")
    return b"\0" in difference.to_bytes(len(left), "big")


class LayerStream:
    """Apply one layer's records to its source stream with the browser's checks:
    every record preimage, every byte a real change, all records consumed."""

    def __init__(self, label: str, records: RecordSet, indexes: list[int] | None = None) -> None:
        self.label = label
        self.records = records
        self.indexes = indexes if indexes is not None else range(len(records))
        self.cursor = 0
        self.span_hasher: Any = None

    def touches(self, chunk_start: int, chunk_end: int) -> bool:
        if self.cursor >= len(self.indexes):
            return False
        return self.records.offsets[self.indexes[self.cursor]] < chunk_end

    def apply(self, chunk_start: int, source: memoryview, out: bytearray) -> None:
        chunk_end = chunk_start + len(source)
        records = self.records
        while self.cursor < len(self.indexes):
            index = self.indexes[self.cursor]
            offset = records.offsets[index]
            end = offset + records.lengths[index]
            if offset >= chunk_end:
                return
            start = max(offset, chunk_start)
            stop = min(end, chunk_end)
            original = source[start - chunk_start:stop - chunk_start]
            replacement = records.target_bytes(index, start, stop)
            if any_equal_byte(original, replacement):
                raise SplitError(f"{self.label}: record at {offset} carries an unchanged byte")
            if self.span_hasher is None:
                self.span_hasher = hashlib.sha256()
            self.span_hasher.update(original)
            out[start - chunk_start:stop - chunk_start] = replacement
            if stop != end:
                return
            if self.span_hasher.digest() != records.preimage(index):
                raise SplitError(f"{self.label}: preimage mismatch at offset {offset}")
            self.span_hasher = None
            self.cursor += 1

    def finish(self) -> None:
        if self.cursor != len(self.indexes) or self.span_hasher is not None:
            raise SplitError(f"{self.label}: not every record was applied")


@dataclass
class ChainResult:
    source_sha256: str
    intermediate_sha256: str
    target_sha256: list[str]


def stream_layers(
    read_chunks: Iterable[bytes],
    image_size: int,
    base: LayerStream,
    fonts: list[LayerStream],
    progress: Callable[[int], None] | None = None,
) -> ChainResult:
    """One pass: stock -> base -> intermediate -> each font -> target."""
    source_hasher = hashlib.sha256()
    intermediate_hasher = hashlib.sha256()
    target_hashers = [hashlib.sha256() for _ in fonts]
    position = 0
    for chunk in read_chunks:
        if not chunk:
            continue
        chunk_end = position + len(chunk)
        if chunk_end > image_size:
            raise SplitError("stock image is larger than its pinned size")
        source_hasher.update(chunk)
        if base.touches(position, chunk_end):
            intermediate = bytearray(chunk)
            base.apply(position, memoryview(chunk), intermediate)
        else:
            intermediate = chunk
        intermediate_view = memoryview(intermediate)
        intermediate_hasher.update(intermediate_view)
        for font, hasher in zip(fonts, target_hashers):
            if font.touches(position, chunk_end):
                target = bytearray(intermediate)
                # The font preimage is checked against the computed intermediate
                # bytes, never against the stock directly.
                font.apply(position, intermediate_view, target)
                hasher.update(target)
            else:
                hasher.update(intermediate_view)
        position = chunk_end
        if progress is not None:
            progress(position)
    if position != image_size:
        raise SplitError(f"stock image is {position} bytes, expected {image_size}")
    base.finish()
    for font in fonts:
        font.finish()
    return ChainResult(
        source_hasher.hexdigest(),
        intermediate_hasher.hexdigest(),
        [hasher.hexdigest() for hasher in target_hashers],
    )


def file_chunks(path: Path) -> Iterable[bytes]:
    with path.open("rb") as handle:
        while True:
            chunk = handle.read(STREAM_CHUNK_BYTES)
            if not chunk:
                return
            yield chunk


# --------------------------------------------------------------------------
# Repository evidence
# --------------------------------------------------------------------------


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_json_bytes(path: Path) -> tuple[bytes, Any]:
    data = path.read_bytes()
    return data, json.loads(data.decode("utf-8"))


def dump_json(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


@dataclass
class Variant:
    release_id: str
    revision: str
    row: dict[str, Any]
    manifest_bytes: bytes
    manifest: dict[str, Any]
    receipt_bytes: bytes
    receipt: dict[str, Any]
    payload_path: Path
    parsed: ParsedPayload | None = None


def load_index(root: Path) -> tuple[bytes, dict[str, Any]]:
    data, index = read_json_bytes(root / "manifest/releases.json")
    if not isinstance(index, dict) or not isinstance(index.get("releases"), list):
        raise SplitError("manifest/releases.json is not a release index")
    return data, index


def group_state(root: Path, index: dict[str, Any], group_id: str) -> str:
    """'single', 'layered', or raise on a mixed/partial state."""
    states = set()
    for revision in LAYERED_GROUPS[group_id]:
        manifest_path = root / f"releases/{group_id}-{revision}.json"
        if not manifest_path.is_file():
            raise SplitError(f"{manifest_path.relative_to(root)} is missing")
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        states.add("layered" if "patchLayers" in manifest else "single")
    if len(states) != 1:
        raise SplitError(f"{group_id}: variants are partly layered; restore the repository first")
    state = states.pop()
    if state == "single":
        leftovers = [V.layered_base_patch_reference(group_id)] + [
            V.layered_font_patch_reference(f"{group_id}-{revision}")
            for revision in LAYERED_GROUPS[group_id]
        ]
        present = [ref for ref in leftovers if (root / ref).exists()]
        if present:
            raise SplitError(
                f"{group_id}: layered payloads already exist without layered manifests "
                f"({', '.join(present)}); restore the repository first"
            )
    return state


def load_variants(root: Path, index: dict[str, Any], group_id: str) -> list[Variant]:
    rows = {row.get("id"): row for row in index["releases"] if isinstance(row, dict)}
    variants: list[Variant] = []
    for revision in LAYERED_GROUPS[group_id]:
        release_id = f"{group_id}-{revision}"
        row = rows.get(release_id)
        if row is None or row.get("state") != "ACCEPTED":
            raise SplitError(f"{release_id}: no ACCEPTED index row")
        if V.font_release_identity(row) != (group_id, revision):
            raise SplitError(f"{release_id}: not a font variant of {group_id}")
        manifest_bytes, manifest = read_json_bytes(root / row["manifest"])
        if sha256_bytes(manifest_bytes) != row.get("manifestSha256"):
            raise SplitError(f"{release_id}: manifest SHA-256 differs from the index row")
        patch = manifest.get("patch")
        if not isinstance(patch, dict) or patch.get("format") != V.PATCH_FORMAT_V1:
            raise SplitError(f"{release_id}: only single-payload v1 releases can be split")
        if patch.get("url") != f"patches/{release_id}.srwfp":
            raise SplitError(f"{release_id}: payload URL is not canonical")
        receipt_path = root / f"receipts/{release_id}.acceptance.json"
        receipt_bytes, receipt = read_json_bytes(receipt_path)
        provenance = manifest.get("provenance", {})
        if sha256_bytes(receipt_bytes) != provenance.get("acceptanceReceiptSha256"):
            raise SplitError(f"{release_id}: acceptance receipt hash differs from the manifest")
        if (
            receipt.get("state") != "ACCEPTED"
            or receipt.get("releaseId") != release_id
            or receipt.get("patchSha256") != patch.get("sha256")
            or receipt.get("targetSha256") != manifest["target"]["sha256"]
            or receipt.get("sourceSha256") != manifest["source"]["sha256"]
        ):
            raise SplitError(f"{release_id}: receipt does not pin this payload/target/source")
        variants.append(Variant(
            release_id, revision, row, manifest_bytes, manifest, receipt_bytes, receipt,
            root / patch["url"],
        ))

    sources = {json.dumps(v.manifest["source"], sort_keys=True) for v in variants}
    if len(sources) != 1:
        raise SplitError(f"{group_id}: variants do not share one stock profile")
    profile = V.PINNED_STOCK_PROFILES.get(variants[0].manifest["source"].get("profileId"))
    source = variants[0].manifest["source"]
    if (
        profile is None
        or source.get("size") != profile["size"]
        or source.get("sha256") != profile["sha256"]
    ):
        raise SplitError(f"{group_id}: source is not a pinned stock profile")
    for variant in variants:
        if variant.manifest["target"]["size"] != profile["size"]:
            raise SplitError(f"{variant.release_id}: target is not stock-sized (v1 only)")
    return variants


def parse_variant_payloads(variants: list[Variant]) -> None:
    for variant in variants:
        patch = variant.manifest["patch"]
        data = variant.payload_path.read_bytes()
        if len(data) != patch["size"] or sha256_bytes(data) != patch["sha256"]:
            raise SplitError(f"{variant.release_id}: payload size/SHA-256 differs from its manifest")
        parsed = parse_payload(data, variant.release_id)
        expected = {
            "patchSize": patch["size"],
            "patchSha256": patch["sha256"],
            "sourceSize": variant.manifest["source"]["size"],
            "sourceSha256": variant.manifest["source"]["sha256"],
            "targetSize": variant.manifest["target"]["size"],
            "targetSha256": variant.manifest["target"]["sha256"],
            "recordCount": patch["recordCount"],
            "bodyUncompressedSize": patch["bodyUncompressedSize"],
        }
        if parsed.descriptor != expected:
            raise SplitError(f"{variant.release_id}: payload header differs from its manifest")
        variant.parsed = parsed


# --------------------------------------------------------------------------
# Group planning
# --------------------------------------------------------------------------


@dataclass
class GroupPlan:
    group_id: str
    variants: list[Variant]
    split: Split
    image_size: int
    base: LayerDraft
    fonts: list[LayerDraft]
    captured: list[int]
    intermediate_sha256: str | None = None
    base_payload: bytes | None = None
    font_payloads: list[bytes] | None = None


def plan_group(group_id: str, variants: list[Variant]) -> GroupPlan:
    record_sets = [variant.parsed.records for variant in variants]  # type: ignore[union-attr]
    image_size = variants[0].manifest["source"]["size"]
    split = split_records(record_sets)
    base_spans = spans_of(record_sets[0], split.common)
    check_canonical_layer(base_spans, image_size, f"{group_id} base")
    captured = []
    for variant, records, unique in zip(variants, record_sets, split.unique):
        font_spans = spans_of(records, unique)
        check_canonical_layer(font_spans, image_size, f"{variant.release_id} font")
        check_layers_disjoint(base_spans, font_spans, variant.release_id)
        captured.append(check_union_capture_budget(base_spans, font_spans, image_size, variant.release_id))
        if len(split.common) + len(unique) != len(records):
            raise SplitError(f"{variant.release_id}: split does not partition the accepted records")
    base = draft_layer("base", record_sets[0], split.common)
    fonts = [
        draft_layer("font", records, unique)
        for records, unique in zip(record_sets, split.unique)
    ]
    return GroupPlan(group_id, variants, split, image_size, base, fonts, captured)


def describe_plan(plan: GroupPlan) -> list[str]:
    before = sum(variant.manifest["patch"]["size"] for variant in plan.variants)
    after = len(plan.base.compressed) + PATCH_HEADER + sum(
        len(font.compressed) + PATCH_HEADER for font in plan.fonts
    )
    record_sets = [variant.parsed.records for variant in plan.variants]  # type: ignore[union-attr]
    lines = [
        f"== {plan.group_id}",
        f"   common records (base): {len(plan.split.common):,}  "
        f"target bytes {sum(plan.base.records.lengths[i] for i in plan.base.indexes):,}  "
        f"body {len(plan.base.body):,}  file {len(plan.base.compressed) + PATCH_HEADER:,}",
    ]
    for variant, font, records, captured in zip(plan.variants, plan.fonts, record_sets, plan.captured):
        offsets = [records.offsets[i] for i in font.indexes]
        ends = [records.offsets[i] + records.lengths[i] for i in font.indexes]
        lines.append(
            f"   {variant.revision}: unique records {font.record_count:,}  "
            f"target bytes {sum(records.lengths[i] for i in font.indexes):,}  "
            f"offsets {min(offsets):,}..{max(ends):,}  body {len(font.body):,}  "
            f"file {len(font.compressed) + PATCH_HEADER:,}  "
            f"(was {variant.manifest['patch']['size']:,}; union capture {captured:,})"
        )
    lines.append(
        "   overlap/abutment between layers: none; per-layer canonical form: PASS"
    )
    lines.append(
        f"   bytes before {before:,} -> after {after:,} "
        f"(saves {before - after:,}, {100 * (before - after) / before:.1f}%)"
    )
    return lines


# --------------------------------------------------------------------------
# Output documents
# --------------------------------------------------------------------------


def layer_entry(role: str, url: str, payload: bytes, draft: LayerDraft) -> dict[str, Any]:
    return {
        "role": role,
        "format": V.PATCH_FORMAT_V1,
        "url": url,
        "size": len(payload),
        "sha256": sha256_bytes(payload),
        "recordCount": draft.record_count,
        "bodyUncompressedSize": len(draft.body),
    }


def layered_receipt(variant: Variant, intermediate: str, base_sha: str, font_sha: str) -> dict[str, Any]:
    old = variant.receipt
    receipt: dict[str, Any] = {}
    for key, value in old.items():
        if key == "patchSha256":
            receipt["intermediateSha256"] = intermediate
            receipt["basePatchSha256"] = base_sha
            receipt["fontPatchSha256"] = font_sha
        elif key == "decisionAuthority":
            receipt[key] = DECISION_AUTHORITY
        else:
            receipt[key] = value
    receipt["supersedes"] = {
        "receiptSha256": sha256_bytes(variant.receipt_bytes),
        "patchSha256": old["patchSha256"],
        "decisionAuthority": old["decisionAuthority"],
    }
    return receipt


def layered_manifest(variant: Variant, layers: list[dict[str, Any]], intermediate: str,
                     receipt_sha: str) -> dict[str, Any]:
    manifest: dict[str, Any] = {}
    for key, value in variant.manifest.items():
        if key == "patch":
            manifest["patchLayers"] = layers
            manifest["intermediate"] = {
                "size": variant.manifest["source"]["size"],
                "sha256": intermediate,
            }
        elif key == "provenance":
            manifest[key] = {**value, "acceptanceReceiptSha256": receipt_sha}
        else:
            manifest[key] = value
    return manifest


# --------------------------------------------------------------------------
# Re-verification of written files
# --------------------------------------------------------------------------


def reverify_group(plan: GroupPlan, files: dict[str, bytes], stock: Path,
                   progress: Callable[[int], None] | None) -> None:
    base_ref = V.layered_base_patch_reference(plan.group_id)
    base = parse_payload(files[base_ref], base_ref)
    stock_sha = plan.variants[0].manifest["source"]["sha256"]
    if (base.descriptor["sourceSha256"], base.descriptor["targetSha256"]) != (
        stock_sha, plan.intermediate_sha256,
    ):
        raise SplitError(f"{base_ref}: header does not chain stock -> intermediate")
    fonts = []
    for variant in plan.variants:
        ref = V.layered_font_patch_reference(variant.release_id)
        font = parse_payload(files[ref], ref)
        if (font.descriptor["sourceSha256"], font.descriptor["targetSha256"]) != (
            plan.intermediate_sha256, variant.manifest["target"]["sha256"],
        ):
            raise SplitError(f"{ref}: header does not chain intermediate -> accepted target")
        check_layers_disjoint(
            spans_of(base.records, range(len(base.records))),
            spans_of(font.records, range(len(font.records))),
            ref,
        )
        fonts.append(font)
    result = stream_layers(
        file_chunks(stock),
        plan.image_size,
        LayerStream(f"{base_ref} (re-parsed)", base.records),
        [LayerStream(f"{variant.release_id} font (re-parsed)", font.records)
         for variant, font in zip(plan.variants, fonts)],
        progress,
    )
    if result.source_sha256 != stock_sha:
        raise SplitError("stock SHA-256 changed between passes")
    if result.intermediate_sha256 != plan.intermediate_sha256:
        raise SplitError("re-parsed base layer produced a different intermediate image")
    for variant, actual in zip(plan.variants, result.target_sha256):
        if actual != variant.manifest["target"]["sha256"]:
            raise SplitError(f"{variant.release_id}: layered result differs from the accepted target")


def browser_engine_check(stock: Path, base_path: Path, font_path: Path,
                         target_sha: str) -> dict[str, Any]:
    helper = PROJECT_ROOT / "tests/helpers/verify-layered-patch.mjs"
    completed = subprocess.run(
        ["node", "--max-old-space-size=1024", str(helper), str(stock), str(base_path),
         str(font_path), target_sha],
        capture_output=True, text=True, check=False,
    )
    if completed.returncode != 0:
        raise SplitError(f"browser engine check failed: {completed.stderr.strip()[-2000:]}")
    return json.loads(completed.stdout.strip().splitlines()[-1])


# --------------------------------------------------------------------------
# Driver
# --------------------------------------------------------------------------


def log(message: str) -> None:
    print(message, flush=True)


def progress_printer(label: str, total: int) -> Callable[[int], None]:
    step = max(total // 10, 1)
    marks = {"next": step}

    def report(position: int) -> None:
        if position >= marks["next"] or position == total:
            log(f"   {label}: {100 * position // total}%")
            marks["next"] = position + step

    return report


def run(root: Path, groups: list[str], stock: Path | None, *, dry_run: bool,
        browser_check: bool = True, verify_repository: bool = True) -> int:
    for group_id in groups:
        if group_id not in LAYERED_GROUPS:
            raise SplitError(f"{group_id}: not a known font-variant group")
    _, index = load_index(root)

    pending: list[str] = []
    for group_id in groups:
        state = group_state(root, index, group_id)
        if state == "layered":
            log(f"== {group_id}: already layered; nothing to do")
        else:
            pending.append(group_id)
    if not pending:
        log("nothing to do: every requested group is already layered")
        return 0
    if not dry_run and stock is None:
        raise SplitError("--stock is required unless --dry-run is given")

    plans: list[GroupPlan] = []
    for group_id in pending:
        log(f"== {group_id}: parsing accepted payloads (structural v1 checks)")
        variants = load_variants(root, index, group_id)
        parse_variant_payloads(variants)
        plan = plan_group(group_id, variants)
        for line in describe_plan(plan):
            log(line)
        plans.append(plan)

    if dry_run:
        total_before = sum(v.manifest["patch"]["size"] for p in plans for v in p.variants)
        total_after = sum(
            len(p.base.compressed) + PATCH_HEADER
            + sum(len(f.compressed) + PATCH_HEADER for f in p.fonts)
            for p in plans
        )
        log(f"DRY RUN total: {total_before:,} -> {total_after:,} bytes; nothing written")
        return 0

    assert stock is not None
    stock_profiles = {plan.variants[0].manifest["source"]["sha256"] for plan in plans}
    for plan in plans:
        source = plan.variants[0].manifest["source"]
        if stock.stat().st_size != source["size"]:
            raise SplitError(f"stock image is {stock.stat().st_size} bytes, expected {source['size']}")
    if len(stock_profiles) != 1:
        raise SplitError("requested groups need different stock images; run them separately")

    # Pass 1: intermediate hash + full in-memory layered check.
    for plan in plans:
        log(f"== {plan.group_id}: pass 1 (stock -> base -> intermediate -> fonts)")
        records = [variant.parsed.records for variant in plan.variants]  # type: ignore[union-attr]
        result = stream_layers(
            file_chunks(stock),
            plan.image_size,
            LayerStream(f"{plan.group_id} base", records[0], plan.split.common),
            [LayerStream(f"{variant.release_id} font", rs, unique)
             for variant, rs, unique in zip(plan.variants, records, plan.split.unique)],
            progress_printer("pass 1", plan.image_size),
        )
        source_sha = plan.variants[0].manifest["source"]["sha256"]
        if result.source_sha256 != source_sha:
            raise SplitError("stock SHA-256 does not match the pinned stock profile")
        if result.intermediate_sha256 in {source_sha} | {
            v.manifest["target"]["sha256"] for v in plan.variants
        }:
            raise SplitError("intermediate image is not distinct from stock/targets")
        for variant, actual in zip(plan.variants, result.target_sha256):
            if actual != variant.manifest["target"]["sha256"]:
                raise SplitError(f"{variant.release_id}: split result differs from the accepted target")
        plan.intermediate_sha256 = result.intermediate_sha256
        plan.base_payload = plan.base.payload(plan.image_size, source_sha, result.intermediate_sha256)
        plan.font_payloads = [
            font.payload(plan.image_size, result.intermediate_sha256, variant.manifest["target"]["sha256"])
            for variant, font in zip(plan.variants, plan.fonts)
        ]
        log(f"   intermediate SHA-256 {result.intermediate_sha256}")

    # Stage every output outside the repository, then re-verify from disk.
    outputs, removed, manifest_rows = render_outputs(plans)
    staging = Path(tempfile.mkdtemp(prefix="srwf-font-split-"))
    try:
        for ref, data in outputs.items():
            path = staging / ref
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        staged = {ref: (staging / ref).read_bytes() for ref in outputs}
        if staged != outputs:
            raise SplitError("staged files differ from the generated bytes")

        for plan in plans:
            log(f"== {plan.group_id}: pass 2 (re-parse written files and re-apply)")
            reverify_group(plan, staged, stock, progress_printer("pass 2", plan.image_size))
            if browser_check:
                for variant in plan.variants:
                    report = browser_engine_check(
                        stock,
                        staging / V.layered_base_patch_reference(plan.group_id),
                        staging / V.layered_font_patch_reference(variant.release_id),
                        variant.manifest["target"]["sha256"],
                    )
                    log(f"   browser engine {variant.revision}: {json.dumps(report)}")
    finally:
        shutil.rmtree(staging, ignore_errors=True)

    install_outputs(root, outputs, removed, manifest_rows, verify_repository=verify_repository)

    for plan in plans:
        log(f"== {plan.group_id}: installed")
        log(f"   intermediate {plan.intermediate_sha256}")
        base_ref = V.layered_base_patch_reference(plan.group_id)
        log(f"   {base_ref}  {len(plan.base_payload):,} B  {sha256_bytes(plan.base_payload)}")
        for variant, payload in zip(plan.variants, plan.font_payloads or []):
            log(
                f"   {V.layered_font_patch_reference(variant.release_id)}  {len(payload):,} B  "
                f"{sha256_bytes(payload)}  -> target {variant.manifest['target']['sha256']} (unchanged)"
            )
        for variant in plan.variants:
            log(f"   removed {variant.manifest['patch']['url']} ({variant.manifest['patch']['size']:,} B)")
    log("DONE. Next: python3 scripts/verify_repo.py && npm test, review `git status`, then commit.")
    return 0


def render_outputs(
    plans: list[GroupPlan],
) -> tuple[dict[str, bytes], list[str], dict[str, tuple[str, str]]]:
    """Every file the redistribution writes, the payloads it removes, and the
    index manifestSha256 replacements. Requires pass 1 (intermediate hash)."""
    outputs: dict[str, bytes] = {}
    removed: list[str] = []
    manifest_rows: dict[str, tuple[str, str]] = {}
    for plan in plans:
        if plan.base_payload is None or plan.font_payloads is None or plan.intermediate_sha256 is None:
            raise SplitError(f"{plan.group_id}: pass 1 has not produced the layer payloads")
        base_ref = V.layered_base_patch_reference(plan.group_id)
        outputs[base_ref] = plan.base_payload
        base_entry = layer_entry("base", base_ref, plan.base_payload, plan.base)
        for variant, font, payload in zip(plan.variants, plan.fonts, plan.font_payloads):
            font_ref = V.layered_font_patch_reference(variant.release_id)
            outputs[font_ref] = payload
            receipt = dump_json(layered_receipt(
                variant, plan.intermediate_sha256, base_entry["sha256"], sha256_bytes(payload),
            ))
            outputs[f"receipts/{variant.release_id}.acceptance.json"] = receipt
            manifest = dump_json(layered_manifest(
                variant,
                [base_entry, layer_entry("font", font_ref, payload, font)],
                plan.intermediate_sha256,
                sha256_bytes(receipt),
            ))
            outputs[variant.row["manifest"]] = manifest
            manifest_rows[variant.release_id] = (variant.row["manifestSha256"], sha256_bytes(manifest))
            removed.append(variant.manifest["patch"]["url"])
    return outputs, removed, manifest_rows


def install_outputs(
    root: Path,
    outputs: dict[str, bytes],
    removed: list[str],
    manifest_rows: dict[str, tuple[str, str]],
    *,
    verify_repository: bool,
) -> None:
    """Write outputs, update index hashes, remove superseded payloads; restore
    the previous state if anything (including verify_repo) fails."""
    index_path = root / "manifest/releases.json"
    index_text = index_path.read_text(encoding="utf-8")
    for release_id, (old_sha, new_sha) in manifest_rows.items():
        needle = f'"manifestSha256": "{old_sha}"'
        if index_text.count(needle) != 1:
            raise SplitError(f"{release_id}: index row hash is not uniquely replaceable")
        index_text = index_text.replace(needle, f'"manifestSha256": "{new_sha}"')
    originals = {ref: (root / ref).read_bytes() for ref in outputs if (root / ref).exists()}
    originals["manifest/releases.json"] = index_path.read_bytes()
    backup = Path(tempfile.mkdtemp(prefix="srwf-font-split-backup-"))
    try:
        for ref in removed:
            destination = backup / ref
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(root / ref), str(destination))
        try:
            for ref, data in outputs.items():
                (root / ref).parent.mkdir(parents=True, exist_ok=True)
                (root / ref).write_bytes(data)
            index_path.write_text(index_text, encoding="utf-8")
            if verify_repository:
                log("== repository verification (verify_repo.validate_index; takes minutes)")
                verify_installed(root)
        except BaseException:
            for ref in outputs:
                if ref not in originals and (root / ref).exists():
                    (root / ref).unlink()
            for ref, data in originals.items():
                (root / ref).write_bytes(data)
            for ref in removed:
                if (backup / ref).exists():
                    shutil.move(str(backup / ref), str(root / ref))
            raise
    finally:
        shutil.rmtree(backup, ignore_errors=True)


def verify_installed(root: Path) -> None:
    original_root, original_index = V.ROOT, V.INDEX_PATH
    V.ROOT, V.INDEX_PATH = root, root / "manifest/releases.json"
    V.errors.clear()
    try:
        V.validate_index(V.repository_files())
        if V.errors:
            raise SplitError("repository verification failed:\n  " + "\n  ".join(V.errors))
    finally:
        V.errors.clear()
        V.ROOT, V.INDEX_PATH = original_root, original_index


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--stock", type=Path, help="your own pinned stock image (never committed)")
    parser.add_argument("--group", action="append", choices=sorted(LAYERED_GROUPS),
                        help="font-variant group to split (default: all)")
    parser.add_argument("--dry-run", action="store_true",
                        help="parse and report projected sizes without a stock image; writes nothing")
    parser.add_argument("--skip-browser-engine-check", action="store_true",
                        help="skip the extra node run of the browser layered engine")
    parser.add_argument("--repo", type=Path, default=PROJECT_ROOT, help=argparse.SUPPRESS)
    args = parser.parse_args(argv)
    groups = args.group or list(LAYERED_GROUPS)
    try:
        return run(
            args.repo.resolve(), groups, args.stock, dry_run=args.dry_run,
            browser_check=not args.skip_browser_engine_check,
        )
    except SplitError as exc:
        print(f"REFUSED: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
