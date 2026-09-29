#!/usr/bin/env python3
"""Synthetic tests for scripts/convert_to_v3.py (shared SRWFKP3 payloads).

Nothing here contains game data. The golden vector is the 4096-byte synthetic image of
docs/PATCH_FORMAT_V3.md appendix A; the "groups" are structurally valid accepted v1 payloads
that declare the real stock size but carry a few dozen invented records (no stock is needed
to build, verify or install them, which is exactly the property under test).
"""

from __future__ import annotations

import base64
import contextlib
import hashlib
import io
import json
import os
from pathlib import Path
import random
import shutil
import struct
import subprocess
import sys
import tempfile
import unittest
from unittest import mock
import zlib

sys.dont_write_bytecode = True
PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from scripts import convert_to_v3 as convert  # noqa: E402
from scripts import verify_repo as verifier  # noqa: E402

GOLDEN_B64 = (
    "U1JXRktQMwAAAAAAAAAQAAAAAAAAAAJJx0Hu6TWAozS65wIgjlwFldjjLrB9VixS1Wyl+G54+KgAAAADAAAABAAAAP4AAAACAAAB"
    "LAAAAMitq4OFFskNLvH7jRbxZlNfI4CDEetpxi/aS79rP2HO5gAAC7gAAAAylUCxYQ0J6hrCRZ63qD58//T94/s3R6XvJJU9OFeH"
    "b95hHDfShPzx+06F6zmPDnbSrs8SMxcoRRQeTTbUeJejm+cAAAACAAABLmKw+0m/1Xixiduhm102LTV8+DIhWOhcVzKwWVI2JVXf"
    "/QAAAAIAAAAFY1Chaj5+GOfEoMPhBhNwj0z7+ddXMR+RwG3iXavgWWWZAAAAAAAAAAB42gFJArb9BQChAsMTAgDHATHYBNUEAasC"
    "2ATzCgMApw/3p7pM4oBizKkZ9U0R8VUuiB5E7gC+x2+333evF3zWCGbcJoDlPWkJtV3xslT6iCrEowPjWzuLazKQcrTaeKrFYYEt"
    "RZk5bNYwlsw2mOdPp/+nT+eeNM6QPtRuOZ1FIYF9xah63LJwkjxriztD4wOj+iiK/FKw9V25CWU94Y4k3ngO1H4Xr3ffh2/HoAbs"
    "Rhj2LFHxFU35GaXCYILkSrgac7MTc8sreyTCYAKkSui9VfGxHfWoBvxGIIZcR+8Xv9cPt95ojiR+oA5l/FYv9x+37we/wG6E3kiu"
    "FHHRDXXZKY3iwGIMuljqs1Pzkyv7WwziQCKMajmVDbHRda1EHpZ4JY1hwaUN2boUkjBS9Cpb+wOjwyOL6Fq0ElCyFGnJ3YUhwX0G"
    "qHYctlDWvxfPpx/nTyT+KE70HrDtFbnJbYXgQqwaeMosc9Mzixu7awKgQuyKWPqtEfFVDelZJI5gPuQOqN93j9d/ly9G3AZgxjyG"
    "6TWd8bFV/ahK5IIgwmQ760szk3M0mnjKpAKgzWWZOU2VMVbsNpjGLIb/R68HX7fvkD7UjjjeZAGhfSWJed2ycNK8Cug6Y4MjQ/sL"
    "q/wSsPJcuulFvQFhxR14LtR+EM50H6dP579nz6YY9kwW8FYt+RlF7QGhxGq42nSyEHOrC3vbI4PixGoIulTysV31iSn9pgDmXCaI"
    "Vj+Xb7ffd6/EfoAuRJ4IbdUxkc01mepMogCiTPqbK/OTM9NrOEcft29aEh8gDw=="
)
GOLDEN_SHA256 = "e5af84b8ae1d97463c7f2ac3e9f419e380664564b7b0652afa470ccd8690e34c"
GOLDEN_IMAGE = 4096
GOLDEN_RECORD_SETS = {
    "a": "0172de0b976da3ac372c01aa1af228f738dcdce3652529c6781b3dcfb11c35ad",
    "b": "e3de0cacfd2f13f26b038827589d0b62eb00defba3ab58b5b1575eff63d80b1b",
    "c": "a634a448bfe9d4950fa9bc0c6fa7362ddd4c313045dd4d0cb47f7778e69b5139",
}
GOLDEN_TARGETS = {
    "a": "1c37d284fcf1fb4e85eb398f0e76d2aecf1233172845141e4d36d47897a39be7",
    "b": "b0fb49bfd578b189dba19b5d362d357cf8322158e85c5732b05952362555dffd",
    "c": "50a16a3e7e18e7c4a0c3e10613708f4cfbf9d757311f91c06de25dabe0596599",
}


def golden_payload() -> bytes:
    return base64.b64decode(GOLDEN_B64)


def golden_stock() -> bytes:
    return bytes((i * 131 + 17) & 0xFF for i in range(GOLDEN_IMAGE))


def golden_records(stock: bytes) -> dict[str, list[convert.Record]]:
    def make(spec: list[tuple[int, int]], salt: int) -> list[convert.Record]:
        out = []
        for offset, length in spec:
            data = bytes(stock[offset + k] ^ (1 + ((k * 37 + offset + salt) % 255)) for k in range(length))
            out.append((offset, length, data))
        return out

    common = make([(5, 3), (9, 1), (300, 200), (3000, 50)], 1)
    a_only = make([(600, 2), (1200, 300)], 2)
    b_only = make([(600, 4), (2000, 1)], 3)
    return {"a": sorted(common + a_only), "b": sorted(common + b_only), "c": sorted(common)}


def apply_records(stock: bytes, records: list[convert.Record]) -> bytes:
    image = bytearray(stock)
    for offset, length, data in records:
        image[offset:offset + length] = data
    return bytes(image)


# --------------------------------------------------------------------------- mutation helpers
def rebuild(payload: bytes, body_fn=None, header_fn=None, keep_body_size: bool = False) -> bytes:
    """A payload whose body/header were changed and whose body was recompressed (zlib stays valid)."""
    header = convert.parse_header(payload)
    header_bytes = bytearray(payload[:header["headerSize"]])
    body = bytearray(convert.inflate_body(payload, header))
    if body_fn is not None:
        body = bytearray(body_fn(body))
    if not keep_body_size:
        struct.pack_into(">Q", header_bytes, 16, len(body))
    if header_fn is not None:
        header_fn(header_bytes)
    compressor = zlib.compressobj(9, 8, 15, 9)
    return bytes(header_bytes) + compressor.compress(bytes(body)) + compressor.flush()


def golden_negative_cases() -> list[tuple[str, bytes, str]]:
    """(name, mutated payload, spec error code). Shared with tests/test_verify_repo.py."""
    payload = golden_payload()
    header = convert.parse_header(payload)
    header_size = header["headerSize"]
    body0 = convert.inflate_body(payload, header)

    def mutated(fn) -> bytes:
        data = bytearray(payload)
        fn(data)
        return bytes(data)

    def put(offset: int, fmt: str, value: int):
        return lambda data: struct.pack_into(fmt, data, offset, value)

    variant0 = 72 + 40 * 2  # first variant entry (two canaries)
    gap_column = b"".join(convert.leb128(x) for x in [5, 0, 300 - 10 - 1, 3000 - 500 - 1])
    assert body0.startswith(gap_column)
    common_index = len(gap_column) + len(b"".join(convert.leb128(x - 1) for x in (3, 1, 200, 50)))
    assert body0[common_index:common_index + 2] == convert.leb128(600)

    def set_a_first_offset(offset: int):
        return lambda body: bytes(body[:common_index]) + convert.leb128(offset) + bytes(body[common_index + 2:])

    def canary(index: int, field: int, value: int):
        return lambda header_bytes: struct.pack_into(">I", header_bytes, 72 + 40 * index + field, value)

    body_size = header["bodySize"]
    return [
        ("bad magic", mutated(lambda d: d.__setitem__(7, 1)), "BAD_MAGIC"),
        ("shorter than the fixed header", payload[:71], "TRUNCATED_HEADER"),
        ("truncated right after the header", payload[:header_size + 3], "TRUNCATED_HEADER"),
        ("one variant", mutated(put(56, ">I", 1)), "BAD_VARIANT_COUNT"),
        ("four variants", mutated(put(56, ">I", 4)), "BAD_VARIANT_COUNT"),
        ("zero canaries", mutated(put(68, ">I", 0)), "BAD_CANARY_TABLE"),
        ("nine canaries", mutated(put(68, ">I", 9)), "BAD_CANARY_TABLE"),
        ("imageSize 0", mutated(put(8, ">Q", 0)), "BAD_SIZE"),
        ("imageSize above the cap", mutated(put(8, ">Q", convert.MAX_IMAGE_BYTES + 1)), "BAD_SIZE"),
        ("body above the cap", mutated(put(16, ">Q", convert.MAX_BODY_BYTES + 1)), "BODY_TOO_LARGE"),
        ("commonRecordCount 0", mutated(put(60, ">I", 0)), "BAD_RECORD_COUNT"),
        ("commonRecordCount above the cap", mutated(put(60, ">I", 2_000_001)), "TOO_MANY_RECORDS"),
        ("more canaries than common records", mutated(put(60, ">I", 1)), "BAD_CANARY_TABLE"),
        ("variant ids not ascending", mutated(lambda d: (d.__setitem__(variant0, 0x62), d.__setitem__(variant0 + 41, 0x61))), "BAD_VARIANT_ID"),
        ("variant id d", mutated(put(variant0 + 82, "B", 0x64)), "BAD_VARIANT_ID"),
        ("duplicate variant target", mutated(lambda d: d.__setitem__(slice(variant0 + 42, variant0 + 74), bytes(d[variant0 + 1:variant0 + 33]))), "VARIANT_TARGET_NOT_DISTINCT"),
        ("variant target equals source", mutated(lambda d: d.__setitem__(slice(variant0 + 1, variant0 + 33), bytes(d[24:56]))), "VARIANT_TARGET_NOT_DISTINCT"),
        ("variant records above 65,536", mutated(put(variant0 + 33, ">I", 65_537)), "TOO_MANY_RECORDS"),
        ("variant records above its data bytes", mutated(put(variant0 + 33, ">I", 303)), "RECORD_BYTES_MISMATCH"),
        ("changed bytes above 64 MiB", mutated(put(variant0 + 37, ">I", 64 * 1024 * 1024)), "CHANGED_BYTES_TOO_LARGE"),
        ("body smaller than its data", mutated(put(16, ">Q", 40)), "BODY_SIZE_MISMATCH"),
        ("declared body one byte larger", mutated(put(16, ">Q", body_size + 1)), "BODY_SIZE_MISMATCH"),
        ("declared body one byte smaller", mutated(put(16, ">Q", body_size - 1)), "BODY_SIZE_MISMATCH"),
        ("zlib window 4 KiB (CMF 0x68)", mutated(lambda d: d.__setitem__(header_size, 0x68)), "BAD_ZLIB_BODY"),
        ("zlib preset dictionary flag", mutated(lambda d: d.__setitem__(header_size + 1, d[header_size + 1] | 0x20)), "BAD_ZLIB_BODY"),
        ("bytes after the zlib stream", payload + b"\0\0\0\0", "BAD_ZLIB_BODY"),
        ("truncated zlib stream", payload[:-5], "BAD_ZLIB_BODY"),
        ("bit flip inside the zlib stream", mutated(lambda d: d.__setitem__(header_size + 20, d[header_size + 20] ^ 0x55)), "BAD_ZLIB_BODY"),
        ("non-canonical varint 0x80 0x00", rebuild(payload, lambda b: b"\x80\x00" + bytes(b[1:])), "NON_CANONICAL_VARINT"),
        ("six-byte varint", rebuild(payload, lambda b: b"\x85\x80\x80\x80\x80\x01" + bytes(b[1:])), "VARINT_TOO_LONG"),
        ("varint above its range", rebuild(payload, lambda b: b"\xff\xff\xff\xff\x0f" + bytes(b[1:])), "VARINT_OUT_OF_RANGE"),
        ("extra byte after the index area", rebuild(payload, lambda b: bytes(b) + b"\x00"), "TRAILING_INDEX_DATA"),
        ("record lengths differ from dataBytes", rebuild(payload, lambda b: bytes(b[:len(gap_column)]) + b"\x03" + bytes(b[len(gap_column) + 1:])), "RECORD_BYTES_MISMATCH"),
        ("record beyond the image", rebuild(payload, lambda b: bytes(b[:len(gap_column) - 2]) + convert.leb128(4000) + bytes(b[len(gap_column):])), "RECORD_OUT_OF_RANGE"),
        ("variant record abuts a common record", rebuild(payload, set_a_first_offset(500)), "NON_MAXIMAL_RECORDS"),
        ("variant record overlaps a common record", rebuild(payload, set_a_first_offset(499)), "OVERLAPPING_RECORD"),
        ("variant record inside a common record", rebuild(payload, set_a_first_offset(400)), "OVERLAPPING_RECORD"),
        ("canary offset is not a common record", rebuild(payload, header_fn=canary(0, 0, 301), keep_body_size=True), "CANARY_NOT_COMMON_RECORD"),
        ("canary length differs from the common record", rebuild(payload, header_fn=canary(1, 4, 51), keep_body_size=True), "CANARY_NOT_COMMON_RECORD"),
        ("canary length 0", rebuild(payload, header_fn=canary(1, 4, 0), keep_body_size=True), "BAD_CANARY_TABLE"),
        ("canary length 15", rebuild(payload, header_fn=canary(1, 4, 15), keep_body_size=True), "BAD_CANARY_TABLE"),
        ("canary length 4097", rebuild(payload, header_fn=canary(1, 4, 4097), keep_body_size=True), "BAD_CANARY_TABLE"),
        ("canaries not ascending", rebuild(payload, header_fn=lambda h: (struct.pack_into(">I", h, 72, 3000), struct.pack_into(">I", h, 72 + 40, 300)), keep_body_size=True), "BAD_CANARY_TABLE"),
        ("canary beyond the image", rebuild(payload, header_fn=canary(1, 0, 4090), keep_body_size=True), "BAD_CANARY_TABLE"),
    ]


# --------------------------------------------------------------------------- synthetic group
STOCK = verifier.STOCK_PROFILE
GROUP = "srwf-f-20261001-v0-9"
OLD_DECISION = "synthetic earlier acceptance"
OLD_ACCEPTED_AT = "2026-10-01T09:00:00+09:00"


def fake_preimage(offset: int, length: int) -> bytes:
    return hashlib.sha256(b"stock/%d/%d" % (offset, length)).digest()


def build_v1_payload(records: list[convert.Record], source_sha256: bytes, target_sha256: bytes) -> bytes:
    body = b"".join(
        struct.pack(">QI", offset, length) + fake_preimage(offset, length) + data
        for offset, length, data in records
    )
    header = bytearray(convert.V1_HEADER_SIZE)
    header[:8] = convert.V1_MAGIC
    struct.pack_into(">IQQQ", header, 8, len(records), STOCK["size"], STOCK["size"], len(body))
    header[36:68] = source_sha256
    header[68:100] = target_sha256
    return bytes(header) + zlib.compress(body, 9)


class SyntheticGroup:
    """An accepted font group in the v1 state, small enough to build in milliseconds."""

    def __init__(self, variants: str = "abc", seed: int = 7, group: str = GROUP, common_count: int = 60) -> None:
        self.group = group
        self.variants = variants
        rng = random.Random(seed)
        offset = 1000
        self.common: list[convert.Record] = []
        self.unique: dict[str, list[convert.Record]] = {variant: [] for variant in variants}
        for index in range(common_count):
            length = rng.choice([1, 1, 2, 3, 5, 8, 15, 16, 17, 40, 120, 300])
            self.common.append((offset, length, rng.randbytes(length)))
            end = offset + length
            if index % 7 == 3:
                for position, variant in enumerate(variants):
                    if position == 2 and index % 14 == 3:
                        continue  # the third variant has nothing here
                    size = rng.choice([2, 4, 20])
                    self.unique[variant].append((end + 50, size, rng.randbytes(size)))
                offset = end + 50 + 20 + 1 + rng.randint(1, 30)
            else:
                offset = end + rng.randint(1, 300)
        for size in (4096, 4097):  # both sides of the canary length window
            self.common.append((offset, size, rng.randbytes(size)))
            offset += size + 10
        self.source_sha256 = bytes.fromhex(STOCK["sha256"])
        self.targets = {variant: hashlib.sha256(b"target-" + variant.encode()).digest() for variant in variants}
        self.records = {variant: sorted(self.common + self.unique[variant]) for variant in variants}
        self.v1 = {
            variant: build_v1_payload(self.records[variant], self.source_sha256, self.targets[variant])
            for variant in variants
        }
        self.release_ids = {variant: f"{group}-{variant}" for variant in variants}
        self.files: dict[str, bytes] = {}
        self.pins: dict[str, dict[str, str]] = {}
        self._build_documents()

    def _build_documents(self) -> None:
        dump = convert.dump_json
        rows = []
        for variant in self.variants:
            rid = self.release_ids[variant]
            patch_hash = hashlib.sha256(self.v1[variant]).hexdigest()
            body_size = len(zlib.decompress(self.v1[variant][convert.V1_HEADER_SIZE:]))
            receipt = {
                "schema": "srwf-kor.acceptance-receipt.v1",
                "releaseId": rid,
                "state": "ACCEPTED",
                "acceptedAt": OLD_ACCEPTED_AT,
                "stockProfileId": STOCK["id"],
                "sourceSha256": STOCK["sha256"],
                "targetSha256": self.targets[variant].hex(),
                "patchSha256": patch_hash,
                "v5Commit": "33" * 20,
                "gates": {
                    "staticStructure": "PASS",
                    "runtimeConsumption": "PASS",
                    "visualLayout": "PASS",
                    "longPlayProgression": "NOT_CLAIMED",
                },
                "decisionAuthority": OLD_DECISION,
            }
            receipt_raw = dump(receipt)
            manifest = {
                "schema": "srwf-kor.public-release.v1",
                "id": rid,
                "state": "ACCEPTED",
                "version": "v0.9",
                "title": f"Synthetic font release ({variant})",
                "publishedAt": "2026-10-01T09:05:00+09:00",
                "source": {"profileId": STOCK["id"], "size": STOCK["size"], "sha256": STOCK["sha256"]},
                "target": {
                    "filename": f"SRWF-KOR-20261001-v0.9-{variant}.bin",
                    "cueFilename": f"SRWF-KOR-20261001-v0.9-{variant}.cue",
                    "size": STOCK["size"],
                    "sha256": self.targets[variant].hex(),
                },
                "patch": {
                    "format": "srwf.sparse-byte-delta.v1",
                    "size": len(self.v1[variant]),
                    "sha256": patch_hash,
                    "recordCount": len(self.records[variant]),
                    "bodyUncompressedSize": body_size,
                    "url": f"patches/{rid}.srwfp",
                },
                "provenance": {
                    "v5Commit": "33" * 20,
                    "buildReceiptSha256": "44" * 32,
                    "acceptanceReceiptSha256": hashlib.sha256(receipt_raw).hexdigest(),
                },
            }
            manifest_raw = dump(manifest)
            self.files[f"patches/{rid}.srwfp"] = self.v1[variant]
            self.files[f"receipts/{rid}.acceptance.json"] = receipt_raw
            self.files[f"releases/{rid}.json"] = manifest_raw
            rows.append({
                "gameId": "srwf-f", "id": rid, "state": "ACCEPTED", "label": "2026.10.01 · v0.9",
                "manifest": f"releases/{rid}.json", "manifestSha256": hashlib.sha256(manifest_raw).hexdigest(),
            })
            self.pins[rid] = {
                "acceptedAt": OLD_ACCEPTED_AT,
                "receiptSha256": hashlib.sha256(receipt_raw).hexdigest(),
                "patchSha256": patch_hash,
                "recordSetSha256": convert.record_set_sha256(self.records[variant]),
                "targetSha256": self.targets[variant].hex(),
                "longPlayProgression": "NOT_CLAIMED",
                "decisionAuthority": OLD_DECISION,
            }
        index = {
            "$schema": "../schemas/releases.schema.json",
            "schema": "srwf-kor.public-release-index.v2",
            "project": {"id": "srwf-kor-v5", "status": "HAS_ACCEPTED_RELEASE"},
            "games": [
                {"id": "srwf-f", "label": "슈퍼로봇대전 F", "status": "HAS_ACCEPTED_RELEASE",
                 "defaultReleaseId": self.release_ids[self.variants[0]]},
                {"id": "srwf-final", "label": "슈퍼로봇대전 F 완결편", "status": "NO_ACCEPTED_RELEASE",
                 "defaultReleaseId": None},
            ],
            "stock_profiles": [{"gameId": "srwf-f", **STOCK, "label": "Synthetic stock"}],
            "releases": rows,
        }
        self.files["manifest/releases.json"] = dump(index)

    def write(self, root: Path) -> None:
        shutil.copytree(PROJECT_ROOT / "schemas", root / "schemas", dirs_exist_ok=True)
        for name, data in self.files.items():
            path = root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)

    def history(self):
        """Make verify_repo's pinned superseded history describe this synthetic group."""
        return mock.patch.dict(verifier.V3_SUPERSEDED, self.pins, clear=True)


def tree_digest(root: Path) -> dict[str, str]:
    return {
        path.relative_to(root).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted(root.rglob("*")) if path.is_file()
    }


@contextlib.contextmanager
def scrubbed_git_environment():
    """Git exports GIT_DIR / GIT_INDEX_FILE to hooks. The pre-commit hook runs these tests, and a
    synthetic repository must never see (or touch) the real repository's index."""
    clean = {key: value for key, value in os.environ.items() if not key.startswith("GIT_")}
    with mock.patch.dict(os.environ, clean, clear=True):
        yield


def run_cli(*argv: str) -> tuple[int, str, str]:
    out, err = io.StringIO(), io.StringIO()
    with scrubbed_git_environment(), contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        code = convert.main(list(argv))
    return code, out.getvalue(), err.getvalue()


def validation_errors(root: Path) -> list[str]:
    with convert.verifier_root(root):
        verifier.validate_index([path for path in root.rglob("*") if path.is_file()])
        return list(verifier.errors)


class FormatConstantTests(unittest.TestCase):
    def test_constants_equal_the_verifier_and_the_spec_numbers(self) -> None:
        pairs = {
            "MAX_FILE_BYTES": "V3_PATCH_MAX",
            "MAX_BODY_BYTES": "V3_BODY_MAX",
            "MAX_IMAGE_BYTES": "V3_IMAGE_MAX",
            "MAX_COMMON_RECORDS": "V3_COMMON_RECORD_MAX",
            "MAX_VARIANT_RECORDS": "V3_VARIANT_RECORD_MAX",
            "MAX_MERGED_RECORDS": "V3_MERGED_RECORD_MAX",
            "MAX_CHANGED_BYTES": "V3_CHANGED_BYTES_MAX",
            "MAX_CANARIES": "V3_CANARY_COUNT_MAX",
            "MIN_CANARY_BYTES": "V3_CANARY_LENGTH_MIN",
            "MAX_CANARY_BYTES": "V3_CANARY_LENGTH_MAX",
            "MAX_GAP_VARINT_BYTES": "V3_GAP_VARINT_MAX_BYTES",
            "MAX_LEN_VARINT_BYTES": "V3_LEN_VARINT_MAX_BYTES",
            "MAX_LEN_CODE": "V3_LEN_CODE_MAX",
            "FIXED_HEADER": "V3_FIXED_HEADER_SIZE",
            "CANARY_ENTRY": "V3_CANARY_ENTRY_SIZE",
            "VARIANT_ENTRY": "V3_VARIANT_ENTRY_SIZE",
            "MIN_ZLIB_BYTES": "V3_MIN_ZLIB_BYTES",
        }
        for mine, theirs in pairs.items():
            self.assertEqual(getattr(convert, mine), getattr(verifier, theirs), mine)
        self.assertEqual(convert.MAGIC, verifier.PATCH_V3_MAGIC)
        self.assertEqual(convert.FORMAT, verifier.PATCH_FORMAT_V3)
        self.assertEqual(convert.MAX_FILE_BYTES, 48 * 1024 * 1024)
        self.assertEqual(convert.MAX_BODY_BYTES, 96 * 1024 * 1024)
        self.assertEqual(verifier.V3_PATCH_MIN, 202)
        self.assertEqual(verifier.SRWFP_TOTAL_MAX, 192 * 1024 * 1024)
        self.assertEqual((convert.ZLIB_LEVEL, convert.ZLIB_MEMLEVEL, convert.ZLIB_WBITS), (9, 9, 15))

    def test_decision_authority_texts_fit_the_receipt_schema(self) -> None:
        self.assertLessEqual(len(verifier.V3_REDISTRIBUTION_DECISION_AUTHORITY), 160)
        for entry in verifier.V3_SUPERSEDED.values():
            self.assertLessEqual(len(entry["decisionAuthority"]), 160)
        self.assertEqual(
            sorted(convert.pinned_groups()),
            ["srwf-f-20260915-v0-4", "srwf-f-20260928-v0-5"],
        )
        self.assertTrue(all(variants == ["a", "b", "c"] for variants in convert.pinned_groups().values()))


class GoldenVectorTests(unittest.TestCase):
    def test_golden_payload_decodes_and_fingerprints_match_the_spec(self) -> None:
        payload = golden_payload()
        self.assertEqual((len(payload), hashlib.sha256(payload).hexdigest()), (871, GOLDEN_SHA256))
        decoded = convert.decode(payload)
        self.assertEqual(decoded.header["headerSize"], 275)
        self.assertEqual(decoded.header["bodySize"], 585)
        self.assertEqual(decoded.header["indexBytes"], 24)
        self.assertEqual(decoded.variant_ids(), ["a", "b", "c"])
        stock = golden_stock()
        for variant, expected in golden_records(stock).items():
            self.assertEqual(list(decoded.variant_records(variant)), expected)
            self.assertEqual(decoded.variant_record_set_sha256(variant), GOLDEN_RECORD_SETS[variant])
            self.assertEqual(convert.record_set_sha256(expected), GOLDEN_RECORD_SETS[variant])
            self.assertEqual(decoded.variant_target(variant).hex(), GOLDEN_TARGETS[variant])
            self.assertEqual(hashlib.sha256(apply_records(stock, expected)).hexdigest(), GOLDEN_TARGETS[variant])

    def test_encoder_reproduces_the_golden_header_and_body(self) -> None:
        stock = golden_stock()
        records = golden_records(stock)
        common = [r for r in records["c"] if convert.MIN_CANARY_BYTES <= r[1] <= convert.MAX_CANARY_BYTES]
        canaries = [(o, l, hashlib.sha256(stock[o:o + l]).digest()) for o, l, _ in common]
        variants = {v: (bytes.fromhex(GOLDEN_TARGETS[v]), records[v]) for v in "abc"}
        payload, info = convert.encode_group(GOLDEN_IMAGE, hashlib.sha256(stock).digest(), variants, canaries)
        golden = golden_payload()
        self.assertEqual(payload[:275], golden[:275])
        self.assertEqual(
            convert.inflate_body(payload, convert.parse_header(payload)),
            convert.inflate_body(golden, convert.parse_header(golden)),
        )
        self.assertEqual(info["headerBytes"], 275)
        self.assertEqual(info["bodyUncompressedSize"], 585)
        again, _ = convert.encode_group(GOLDEN_IMAGE, hashlib.sha256(stock).digest(), variants, canaries)
        self.assertEqual(again, payload, "the encoder is deterministic")
        if zlib.ZLIB_RUNTIME_VERSION.startswith("1.3"):
            self.assertEqual(hashlib.sha256(payload).hexdigest(), GOLDEN_SHA256)

    def test_negative_cases_report_the_spec_code(self) -> None:
        cases = golden_negative_cases()
        self.assertGreaterEqual(len(cases), 40)
        for name, data, code in cases:
            with self.subTest(name=name):
                with self.assertRaises(convert.V3Error) as raised:
                    convert.decode(data)
                self.assertEqual(raised.exception.code, code)

    def test_descriptor_and_variant_pins(self) -> None:
        payload = golden_payload()
        good = {
            "patchSize": len(payload), "patchSha256": GOLDEN_SHA256, "sourceSize": GOLDEN_IMAGE,
            "sourceSha256": hashlib.sha256(golden_stock()).hexdigest(), "targetSize": GOLDEN_IMAGE,
            "bodyUncompressedSize": 585, "commonRecordCount": 4,
        }
        decoded = convert.decode(payload, good)
        for key, bad in (("patchSize", 1), ("patchSha256", "0" * 64), ("sourceSize", 1), ("sourceSha256", "0" * 64),
                         ("targetSize", 1), ("bodyUncompressedSize", 1), ("commonRecordCount", 3)):
            with self.subTest(key=key), self.assertRaises(convert.V3Error) as raised:
                convert.decode(payload, {**good, key: bad})
            self.assertEqual(raised.exception.code, "DESCRIPTOR_MISMATCH")
        for args, code in (
            ((None, "0" * 64), "VARIANT_REQUIRED"),
            (("d", "0" * 64), "VARIANT_NOT_IN_PAYLOAD"),
            (("a", GOLDEN_TARGETS["b"]), "VARIANT_TARGET_MISMATCH"),
            (("a", GOLDEN_TARGETS["a"], 7), "DESCRIPTOR_MISMATCH"),
        ):
            with self.subTest(code=code), self.assertRaises(convert.V3Error) as raised:
                convert.select_variant(decoded, *args)
            self.assertEqual(raised.exception.code, code)
        convert.select_variant(decoded, "a", GOLDEN_TARGETS["a"], 6)
        convert.select_variant(decoded, "c", GOLDEN_TARGETS["c"], 4)


class StockRunTests(unittest.TestCase):
    """The owner's `verify-stock` on the tiny synthetic image (all chunk/window shapes)."""

    def setUp(self) -> None:
        self.payload = golden_payload()
        self.decoded = convert.decode(self.payload)
        self.stock = golden_stock()
        self.records = golden_records(self.stock)

    def chunks(self, data: bytes, size: int):
        return (data[i:i + size] for i in range(0, len(data), size))

    def expect(self, code: str, stock: bytes, *, variants=("a", "b", "c"), chunk=97, window=256) -> None:
        with self.assertRaises(convert.V3Error) as raised:
            convert.apply_variants_stream(self.decoded, list(variants), self.chunks(stock, chunk), window=window)
        self.assertEqual(raised.exception.code, code)

    def test_every_variant_reproduces_its_accepted_image_in_all_shapes(self) -> None:
        for chunk in (1, 3, 7, 64, 4095, 4096, 10 ** 6):
            for window in (1, 5, 64, 1000, 1 << 20):
                sinks = {v: bytearray() for v in "abc"}
                result = convert.apply_variants_stream(
                    self.decoded, ["a", "b", "c"], self.chunks(self.stock, chunk), window=window,
                    sink={v: sinks[v].extend for v in "abc"},
                )
                for variant in "abc":
                    self.assertEqual(bytes(sinks[variant]), apply_records(self.stock, self.records[variant]))
                    self.assertEqual(result["variants"][variant]["targetSha256"], GOLDEN_TARGETS[variant])
                self.assertEqual(result["sourceSha256"], hashlib.sha256(self.stock).hexdigest())

    def test_verify_stock_payload_reads_a_file_and_pins_the_accepted_targets(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            stock_path = Path(directory) / "stock.bin"
            stock_path.write_bytes(self.stock)
            result = convert.verify_stock_payload(self.payload, stock_path, dict(GOLDEN_TARGETS), window=300)
            self.assertEqual(sorted(result["variants"]), ["a", "b", "c"])
            wrong = dict(GOLDEN_TARGETS, b=GOLDEN_TARGETS["a"])
            with self.assertRaises(convert.ConvertError) as raised:
                convert.verify_stock_payload(self.payload, stock_path, wrong)
            self.assertIn("VARIANT_TARGET_MISMATCH", str(raised.exception))
            with self.assertRaises(convert.ConvertError):
                convert.verify_stock_payload(self.payload, stock_path, {"a": GOLDEN_TARGETS["a"]})

    def test_wrong_stock_is_rejected_with_the_right_code(self) -> None:
        in_canary = bytearray(self.stock)
        in_canary[301] ^= 0xFF
        self.expect("SOURCE_CANARY_MISMATCH", bytes(in_canary))
        consumed: list[int] = []

        def counting():
            for i in range(0, GOLDEN_IMAGE, 97):
                consumed.append(i)
                yield bytes(in_canary)[i:i + 97]

        with self.assertRaises(convert.V3Error):
            convert.apply_variants_stream(self.decoded, ["a"], counting(), window=256)
        self.assertLess(consumed[-1], GOLDEN_IMAGE - 700, "a wrong canary stops the run early")
        outside = bytearray(self.stock)
        outside[3500] ^= 0xFF
        self.expect("SOURCE_HASH_MISMATCH", bytes(outside))
        same = bytearray(self.stock)
        same[600] = next(r for r in self.records["a"] if r[0] == 600)[2][0]
        self.expect("NON_DIFFERING_BYTE", bytes(same), variants=("a",))
        self.expect("SOURCE_SIZE_MISMATCH", self.stock[:-1])
        self.expect("SOURCE_SIZE_MISMATCH", self.stock + b"\0")

    def test_corrupted_target_byte_only_breaks_the_variant_that_owns_it(self) -> None:
        def flip_last_data_byte(body: bytearray) -> bytes:
            body = bytearray(body)
            body[-1] ^= 0x01  # the last data byte is variant b's record (variant c has none)
            return bytes(body)

        corrupted = convert.decode(rebuild(self.payload, flip_last_data_byte))
        with self.assertRaises(convert.V3Error) as raised:
            convert.apply_variants_stream(corrupted, ["b"], self.chunks(self.stock, 97), window=256)
        self.assertEqual(raised.exception.code, "TARGET_HASH_MISMATCH")
        result = convert.apply_variants_stream(corrupted, ["a", "c"], self.chunks(self.stock, 97), window=256)
        self.assertTrue(result["ok"])


class EncodeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.group = SyntheticGroup()

    def encode(self, group: SyntheticGroup | None = None) -> tuple[bytes, dict]:
        group = group or self.group
        v1 = {v: convert.V1Payload(group.v1[v], v) for v in group.variants}
        common, _ = convert.partition({v: v1[v].records for v in v1})
        canaries = convert.select_canaries(common, v1)
        return convert.encode_group(
            v1["a"].image_size, v1["a"].source_sha256,
            {v: (v1[v].target_sha256, v1[v].records) for v in v1}, canaries,
        )

    def test_round_trip_is_record_for_record_and_deterministic(self) -> None:
        payload, info = self.encode()
        again, _ = self.encode()
        self.assertEqual(payload, again)
        decoded = convert.decode(payload)
        for variant in "abc":
            self.assertEqual(list(decoded.variant_records(variant)), self.group.records[variant])
            self.assertEqual(
                decoded.variant_record_set_sha256(variant), self.group.pins[self.group.release_ids[variant]]["recordSetSha256"]
            )
        self.assertEqual(info["commonRecordCount"], len(decoded.common_records()))
        # the canonical partition holds: nothing sits in every variant section
        sections = [set(decoded.unique_records(v)) for v in "abc"]
        self.assertFalse(set.intersection(*sections))

    def test_canaries_follow_the_generator_rule(self) -> None:
        payload, _ = self.encode()
        decoded = convert.decode(payload)
        eligible = [r for r in decoded.common_records() if 16 <= r[1] <= 4096]
        self.assertGreater(len(eligible), 8)
        self.assertTrue(any(r[1] == 4096 for r in eligible))
        self.assertFalse(any(r[1] == 4097 for r in eligible))
        expected = [eligible[(i * len(eligible)) // 8][:2] for i in range(8)]
        self.assertEqual([c[:2] for c in decoded.header["canaries"]], expected)
        for offset, length, digest in decoded.header["canaries"]:
            self.assertEqual(digest, fake_preimage(offset, length))

    def test_two_variant_group_and_variant_only_records(self) -> None:
        group = SyntheticGroup(variants="ab", seed=11)
        payload, _ = self.encode(group)
        decoded = convert.decode(payload)
        self.assertEqual(decoded.variant_ids(), ["a", "b"])
        for variant in "ab":
            self.assertEqual(list(decoded.variant_records(variant)), group.records[variant])

    def test_verify_payload_proves_equivalence_without_a_stock(self) -> None:
        payload, _ = self.encode()
        receipts = {v: json.loads(self.group.files[f"receipts/{self.group.release_ids[v]}.acceptance.json"]) for v in "abc"}
        v1 = {v: convert.V1Payload(self.group.v1[v], v) for v in "abc"}
        expected = {v: self.group.pins[self.group.release_ids[v]]["recordSetSha256"] for v in "abc"}
        report = convert.verify_payload(payload, receipts=receipts, v1=v1, expected_record_sets=expected)
        self.assertTrue(all(report["variants"][v]["v1TuplesEqual"] for v in "abc"))
        # without the v1 originals only the pinned fingerprints remain
        convert.verify_payload(payload, receipts=receipts, v1=None, expected_record_sets=expected)

    def test_verify_payload_rejects_tampering(self) -> None:
        payload, _ = self.encode()
        receipts = {v: json.loads(self.group.files[f"receipts/{self.group.release_ids[v]}.acceptance.json"]) for v in "abc"}
        expected = {v: self.group.pins[self.group.release_ids[v]]["recordSetSha256"] for v in "abc"}

        def flip_first_data_byte(body: bytearray) -> bytes:
            body = bytearray(body)
            header = convert.parse_header(payload)
            body[header["indexBytes"]] ^= 0x01
            return bytes(body)

        with self.assertRaises(convert.ConvertError):
            convert.verify_payload(
                rebuild(payload, flip_first_data_byte), receipts=receipts, v1=None, expected_record_sets=expected
            )
        wrong_receipts = json.loads(json.dumps(receipts))
        wrong_receipts["b"]["targetSha256"] = "00" * 32
        with self.assertRaises(convert.ConvertError):
            convert.verify_payload(payload, receipts=wrong_receipts, v1=None, expected_record_sets=expected)
        with self.assertRaises(convert.ConvertError):
            convert.verify_payload(payload, receipts={"a": receipts["a"], "b": receipts["b"]}, v1=None)
        wrong_source = json.loads(json.dumps(receipts))
        wrong_source["a"]["sourceSha256"] = "00" * 32
        with self.assertRaises(convert.ConvertError):
            convert.verify_payload(payload, receipts=wrong_source, v1=None)

    def test_non_canonical_partitions_and_canary_rules_are_detected(self) -> None:
        payload, _ = self.encode()
        decoded = convert.decode(payload)
        header = decoded.header
        common = decoded.common_records()
        unique = {v: decoded.unique_records(v) for v in "abc"}
        targets = {v: (decoded.variant_target(v), []) for v in "abc"}
        # a record that every variant has but that was left in the variant sections
        moved = common[0]
        smaller_common = common[1:]
        hdr, body, _ = convert.build_header_and_body(
            header["imageSize"], header["sourceSha256"], targets, header["canaries"],
            common=smaller_common, unique={v: sorted(unique[v] + [moved]) for v in "abc"},
        )
        rebuilt = hdr + convert.compress_body(body)
        with self.assertRaises(convert.ConvertError) as raised:
            convert.check_decoded_canonical(rebuilt, convert.decode(rebuilt))
        self.assertIn("belong to `common`", str(raised.exception))
        # canaries that are common records but not the ones the rule picks
        eligible = [r for r in common if 16 <= r[1] <= 4096]
        wrong = [(o, l, fake_preimage(o, l)) for o, l, _ in eligible[:8]]
        hdr, body, _ = convert.build_header_and_body(
            header["imageSize"], header["sourceSha256"], targets, wrong, common=common, unique=unique,
        )
        rebuilt = hdr + convert.compress_body(body)
        with self.assertRaises(convert.ConvertError) as raised:
            convert.check_decoded_canonical(rebuilt, convert.decode(rebuilt))
        self.assertIn("selection rule", str(raised.exception))

    def test_v1_inputs_that_cannot_become_v3_are_refused(self) -> None:
        with self.assertRaises(convert.ConvertError):
            convert.V1Payload(self.group.v1["a"][:-3], "truncated")
        with self.assertRaises(convert.ConvertError):
            convert.V1Payload(b"SRWFKP2\0" + self.group.v1["a"][8:], "wrong magic")
        # two records of one variant that touch cannot be represented (gap >= 1)
        abutting = [(100, 4, b"\x01" * 4), (104, 4, b"\x02" * 4)]
        with self.assertRaises(convert.ConvertError) as raised:
            convert.V1Payload(build_v1_payload(abutting, self.group.source_sha256, b"\x09" * 32), "abut")
        self.assertIn("overlap or abut", str(raised.exception))

    def test_encoder_refuses_variants_that_share_nothing_or_have_no_canary(self) -> None:
        only_short = [(10, 4, b"abcd")]
        only_short_b = [(10, 4, b"abcd"), (20, 2, b"xy")]
        v1a = convert.V1Payload(build_v1_payload(only_short, self.group.source_sha256, b"\x01" * 32), "a")
        v1b = convert.V1Payload(build_v1_payload(only_short_b, self.group.source_sha256, b"\x02" * 32), "b")
        common, _ = convert.partition({"a": v1a.records, "b": v1b.records})
        with self.assertRaises(convert.ConvertError) as raised:
            convert.select_canaries(common, {"a": v1a, "b": v1b})
        self.assertIn("canary", str(raised.exception))
        with self.assertRaises(convert.ConvertError):
            convert.build_header_and_body(4096, b"\0" * 32, {"a": (b"\1" * 32, [(1, 1, b"a")]), "b": (b"\2" * 32, [(3, 1, b"b")])}, [])


class InstallTests(unittest.TestCase):
    def setUp(self) -> None:
        self.group = SyntheticGroup()
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.root = Path(self._tmp.name).resolve() / "repo"
        self.root.mkdir()
        self.group.write(self.root)
        history = self.group.history()
        history.start()
        self.addCleanup(history.stop)

    def install(self, *extra: str, root: Path | None = None) -> tuple[int, str, str]:
        return run_cli("install", "--root", str(root or self.root), "--group", GROUP, *extra)

    def test_dry_run_plans_and_changes_nothing(self) -> None:
        before = tree_digest(self.root)
        code, out, err = self.install("--dry-run")
        self.assertEqual((code, err), (0, ""))
        self.assertIn("dry run: nothing written", out)
        self.assertIn(f"write  patches/{GROUP}.v3.srwfp", out)
        self.assertEqual(tree_digest(self.root), before)

    def test_pre_conversion_state_violates_the_policy_and_install_fixes_it(self) -> None:
        errors = validation_errors(self.root)
        self.assertTrue(any("may not use a v1 payload" in e for e in errors), errors)
        code, out, err = self.install()
        self.assertEqual((code, err), (0, ""), out)
        self.assertEqual(validation_errors(self.root), [])
        names = sorted(p.name for p in (self.root / "patches").iterdir())
        self.assertEqual(names, [f"{GROUP}.v3.srwfp"])
        leftovers = [p for p in self.root.rglob("*") if p.name.endswith(".tmp")]
        self.assertEqual(leftovers, [])

    def test_installed_documents_keep_the_original_evidence(self) -> None:
        self.assertEqual(self.install()[0], 0)
        payload = (self.root / f"patches/{GROUP}.v3.srwfp").read_bytes()
        payload_hash = hashlib.sha256(payload).hexdigest()
        for variant in "abc":
            rid = self.group.release_ids[variant]
            old_receipt = json.loads(self.group.files[f"receipts/{rid}.acceptance.json"])
            old_manifest = json.loads(self.group.files[f"releases/{rid}.json"])
            raw_receipt = (self.root / f"receipts/{rid}.acceptance.json").read_bytes()
            receipt = json.loads(raw_receipt)
            manifest = json.loads((self.root / f"releases/{rid}.json").read_text(encoding="utf-8"))
            for key, value in old_receipt.items():
                if key not in {"patchSha256", "decisionAuthority"}:
                    self.assertEqual(receipt[key], value, key)
            self.assertEqual(receipt["patchSha256"], payload_hash)
            self.assertEqual(receipt["decisionAuthority"], verifier.V3_REDISTRIBUTION_DECISION_AUTHORITY)
            self.assertEqual(receipt["patchFormat"], verifier.PATCH_FORMAT_V3)
            self.assertEqual(receipt["variantId"], variant)
            self.assertEqual(list(receipt["supersedes"]), list(verifier.V3_SUPERSEDES_KEYS))
            self.assertEqual(receipt["supersedes"]["receiptSha256"], hashlib.sha256(self.group.files[f"receipts/{rid}.acceptance.json"]).hexdigest())
            self.assertEqual(receipt["supersedes"]["patchSha256"], old_receipt["patchSha256"])
            self.assertEqual(receipt["supersedes"]["decisionAuthority"], OLD_DECISION)
            for key in ("schema", "id", "state", "version", "title", "publishedAt", "source", "target"):
                self.assertEqual(manifest[key], old_manifest[key], key)
            self.assertEqual(manifest["patch"]["recordCount"], old_manifest["patch"]["recordCount"])
            self.assertEqual(manifest["patch"]["url"], f"patches/{GROUP}.v3.srwfp")
            self.assertEqual(list(manifest["patch"]), [
                "format", "url", "size", "sha256", "recordCount", "bodyUncompressedSize", "variant", "commonRecordCount",
            ])
            self.assertEqual(manifest["provenance"]["acceptanceReceiptSha256"], hashlib.sha256(raw_receipt).hexdigest())
            self.assertEqual(manifest["provenance"]["buildReceiptSha256"], old_manifest["provenance"]["buildReceiptSha256"])
        index_before = json.loads(self.group.files["manifest/releases.json"])
        index_after = json.loads((self.root / "manifest/releases.json").read_text(encoding="utf-8"))
        for old_row, new_row in zip(index_before["releases"], index_after["releases"]):
            self.assertEqual({k: v for k, v in old_row.items() if k != "manifestSha256"}, {k: v for k, v in new_row.items() if k != "manifestSha256"})
            self.assertNotEqual(old_row["manifestSha256"], new_row["manifestSha256"])
        before_lines = self.group.files["manifest/releases.json"].decode("utf-8").splitlines()
        after_lines = (self.root / "manifest/releases.json").read_text(encoding="utf-8").splitlines()
        self.assertEqual(len(before_lines), len(after_lines))
        changed = [(b, a) for b, a in zip(before_lines, after_lines) if b != a]
        self.assertEqual(len(changed), 3, "only the manifestSha256 lines change")
        self.assertTrue(all('"manifestSha256"' in b and '"manifestSha256"' in a for b, a in changed))

    def test_install_is_idempotent_and_reports_already_converted(self) -> None:
        self.assertEqual(self.install()[0], 0)
        first = tree_digest(self.root)
        code, out, err = self.install()
        self.assertEqual((code, err), (0, ""))
        self.assertIn("already converted", out)
        self.assertEqual(tree_digest(self.root), first)
        code, out, err = self.install("--dry-run")
        self.assertEqual((code, err), (0, ""))
        self.assertEqual(tree_digest(self.root), first)

    def test_install_bytes_are_deterministic(self) -> None:
        other = Path(self._tmp.name).resolve() / "second"
        other.mkdir()
        self.group.write(other)
        self.assertEqual(self.install()[0], 0)
        self.assertEqual(self.install(root=other)[0], 0)
        self.assertEqual(tree_digest(self.root), tree_digest(other))

    def test_partial_states_are_refused_without_touching_anything(self) -> None:
        rid_b = self.group.release_ids["b"]

        def missing_v1(root: Path) -> None:
            (root / f"patches/{rid_b}.srwfp").unlink()

        def stray_v3(root: Path) -> None:
            (root / f"patches/{GROUP}.v3.srwfp").write_bytes(b"stray")

        def missing_receipt(root: Path) -> None:
            (root / f"receipts/{rid_b}.acceptance.json").unlink()

        def missing_row(root: Path) -> None:
            index = json.loads((root / "manifest/releases.json").read_text(encoding="utf-8"))
            index["releases"] = [row for row in index["releases"] if row["id"] != rid_b]
            (root / "manifest/releases.json").write_bytes(convert.dump_json(index))

        def mixed_formats(root: Path) -> None:
            manifest = json.loads((root / f"releases/{rid_b}.json").read_text(encoding="utf-8"))
            manifest["patch"]["format"] = "srwf.sparse-byte-delta.v3"
            (root / f"releases/{rid_b}.json").write_bytes(convert.dump_json(manifest))

        def v3_receipt_on_v1_row(root: Path) -> None:
            receipt = json.loads((root / f"receipts/{rid_b}.acceptance.json").read_text(encoding="utf-8"))
            receipt["patchFormat"] = "srwf.sparse-byte-delta.v3"
            (root / f"receipts/{rid_b}.acceptance.json").write_bytes(convert.dump_json(receipt))

        for number, (name, mutate) in enumerate({
            "a v1 payload is missing": missing_v1, "a v3 file already sits beside the v1 rows": stray_v3,
            "a receipt is missing": missing_receipt, "an index row is missing": missing_row,
            "rows disagree on the format": mixed_formats, "a v3 receipt on a v1 row": v3_receipt_on_v1_row,
        }.items()):
            with self.subTest(name=name):
                root = Path(self._tmp.name).resolve() / f"partial-{number}"
                root.mkdir()
                self.group.write(root)
                mutate(root)
                before = tree_digest(root)
                code, out, err = self.install(root=root)
                self.assertEqual(code, 2, (out, err))
                self.assertIn("refused", err)
                self.assertEqual(tree_digest(root), before)

    def test_converted_state_with_a_leftover_v1_payload_is_refused(self) -> None:
        self.assertEqual(self.install()[0], 0)
        (self.root / f"patches/{self.group.release_ids['a']}.srwfp").write_bytes(self.group.v1["a"])
        before = tree_digest(self.root)
        code, _, err = self.install()
        self.assertEqual(code, 2)
        self.assertIn("still present", err)
        self.assertEqual(tree_digest(self.root), before)

    def test_history_pin_mismatches_stop_the_conversion(self) -> None:
        rid = self.group.release_ids["c"]
        tampered = {k: dict(v) for k, v in self.group.pins.items()}
        for field, value in (
            ("patchSha256", "00" * 32), ("receiptSha256", "00" * 32), ("acceptedAt", "2020-01-01T00:00:00Z"),
            ("targetSha256", "00" * 32), ("decisionAuthority", "someone rewrote history"),
        ):
            with self.subTest(field=field):
                bad = {k: dict(v) for k, v in tampered.items()}
                bad[rid][field] = value
                with mock.patch.dict(verifier.V3_SUPERSEDED, bad, clear=True):
                    before = tree_digest(self.root)
                    code, _, err = self.install()
                self.assertEqual(code, 1, err)
                self.assertEqual(tree_digest(self.root), before)
        bad = {k: dict(v) for k, v in tampered.items()}
        bad[rid]["recordSetSha256"] = "00" * 32
        with mock.patch.dict(verifier.V3_SUPERSEDED, bad, clear=True):
            code, _, err = self.install()
        self.assertEqual(code, 1)
        self.assertIn("recordSetSha256", err)

    def test_v1_payload_that_disagrees_with_its_receipt_is_rejected(self) -> None:
        rid = self.group.release_ids["a"]
        (self.root / f"patches/{rid}.srwfp").write_bytes(self.group.v1["b"])
        before = tree_digest(self.root)
        code, _, err = self.install()
        self.assertEqual(code, 1)
        self.assertIn("SHA-256", err)
        self.assertEqual(tree_digest(self.root), before)

    def test_validation_failure_rolls_the_tree_back_exactly(self) -> None:
        before = tree_digest(self.root)

        def reject(releases) -> None:
            verifier.complain("synthetic validator rejection")

        with mock.patch.object(verifier, "validate_v3_groups", reject):
            code, out, err = self.install()
        self.assertEqual(code, 1)
        self.assertIn("synthetic validator rejection", err)
        self.assertIn("rolled back", out)
        self.assertEqual(tree_digest(self.root), before)
        self.assertEqual([p for p in self.root.rglob("*") if p.name.endswith(".tmp")], [])
        # and a clean second attempt still works
        self.assertEqual(self.install()[0], 0)
        self.assertEqual(validation_errors(self.root), [])

    def test_write_failure_rolls_back_too(self) -> None:
        before = tree_digest(self.root)
        real = convert.atomic_write
        calls = {"count": 0}

        def flaky(path: Path, data: bytes) -> None:
            calls["count"] += 1
            if calls["count"] == 4:
                raise OSError("disk full")
            real(path, data)

        with mock.patch.object(convert, "atomic_write", flaky):
            with self.assertRaises(OSError):
                self.install()
        self.assertEqual(tree_digest(self.root), before)

    def test_unknown_group_is_refused_and_encode_stays_outside_the_repository(self) -> None:
        code, _, err = run_cli("install", "--root", str(self.root), "--group", "srwf-f-20990101-v9-9")
        self.assertEqual(code, 2)
        self.assertIn("not a group", err)
        code, _, err = run_cli("encode", "--root", str(self.root), "--out-dir", str(self.root / "patches"))
        self.assertEqual(code, 2)
        self.assertIn("outside the repository", err)

    def test_encode_writes_the_payload_outside_the_repository(self) -> None:
        out_dir = Path(self._tmp.name).resolve() / "encoded"
        code, out, err = run_cli("encode", "--root", str(self.root), "--group", GROUP, "--out-dir", str(out_dir))
        self.assertEqual((code, err), (0, ""), out)
        payload = (out_dir / f"{GROUP}.v3.srwfp").read_bytes()
        info = json.loads((out_dir / f"{GROUP}.v3.srwfp.json").read_text(encoding="utf-8"))
        self.assertEqual(info["payloadSha256"], hashlib.sha256(payload).hexdigest())
        self.assertEqual(info["v1"]["a"]["records"], len(self.group.records["a"]))
        self.assertTrue((self.root / "patches" / f"{self.group.release_ids['a']}.srwfp").exists())
        convert.decode(payload)

    def test_verify_after_install_and_pins_before(self) -> None:
        code, out, err = run_cli("pins", "--root", str(self.root), "--group", GROUP)
        self.assertEqual((code, err), (0, ""), out)
        self.assertIn("matches verify_repo.V3_SUPERSEDED: yes", out)
        parsed = json.loads(out[:out.rindex("# matches")])
        self.assertEqual(parsed, self.group.pins)
        with mock.patch.dict(verifier.V3_SUPERSEDED, {k: dict(v, patchSha256="00" * 32) for k, v in self.group.pins.items()}, clear=True):
            self.assertEqual(run_cli("pins", "--root", str(self.root), "--group", GROUP)[0], 1)
        code, out, err = run_cli("verify", "--root", str(self.root), "--group", GROUP)
        self.assertEqual((code, err), (0, ""), out)
        self.assertIn("still v1 (pre-conversion)", out)
        self.assertIn("tuples equal to the accepted v1 payload", out)
        self.assertEqual(self.install()[0], 0)
        code, out, err = run_cli("verify", "--root", str(self.root), "--group", GROUP)
        self.assertEqual((code, err), (0, ""), out)
        self.assertIn("v1 originals not supplied", out)
        self.assertIn("verified, payload sha256", out)
        # with the v1 originals in a directory the record-by-record comparison runs too
        v1_dir = Path(self._tmp.name).resolve() / "v1-originals"
        v1_dir.mkdir()
        for variant in "abc":
            (v1_dir / f"{self.group.release_ids[variant]}.srwfp").write_bytes(self.group.v1[variant])
        code, out, err = run_cli("verify", "--root", str(self.root), "--group", GROUP, "--v1-dir", str(v1_dir), "--reproduce")
        self.assertEqual((code, err), (0, ""), out)
        self.assertIn("tuples equal to the accepted v1 payload", out)
        self.assertIn("byte-identical re-encode", out)

    def test_verify_detects_a_tampered_converted_tree(self) -> None:
        self.assertEqual(self.install()[0], 0)
        payload_path = self.root / f"patches/{GROUP}.v3.srwfp"
        original = payload_path.read_bytes()
        flipped = bytearray(original)
        flipped[-9] ^= 0x01
        payload_path.write_bytes(bytes(flipped))
        code, _, err = run_cli("verify", "--root", str(self.root), "--group", GROUP)
        self.assertEqual(code, 1)
        payload_path.write_bytes(original)
        receipt_path = self.root / f"receipts/{self.group.release_ids['a']}.acceptance.json"
        receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
        receipt["decisionAuthority"] = "edited"
        receipt_path.write_bytes(convert.dump_json(receipt))
        code, _, err = run_cli("verify", "--root", str(self.root), "--group", GROUP)
        self.assertEqual(code, 1)

    def test_verify_stock_command_reports_a_missing_or_unconverted_input(self) -> None:
        code, _, err = run_cli("verify-stock", "--root", str(self.root), "--group", GROUP, "--stock", str(self.root / "nope.bin"))
        self.assertEqual(code, 2)
        stock = Path(self._tmp.name) / "stock.bin"
        stock.write_bytes(b"x")
        code, _, err = run_cli("verify-stock", "--root", str(self.root), "--group", GROUP, "--stock", str(stock))
        self.assertEqual(code, 2)
        self.assertIn("not converted yet", err)
        self.assertEqual(self.install()[0], 0)
        code, _, err = run_cli("verify-stock", "--root", str(self.root), "--group", GROUP, "--stock", str(stock))
        self.assertEqual(code, 1)  # a one-byte file is not the stock image
        self.assertIn("SOURCE_SIZE_MISMATCH", err)


class TwoGroupInstallTests(unittest.TestCase):
    """Both real groups (F v0.4 and v0.5) convert in one atomic operation."""

    OTHER = "srwf-f-20261003-v1-0"

    def setUp(self) -> None:
        self.first = SyntheticGroup(seed=7)
        self.second = SyntheticGroup(variants="ab", seed=9, group=self.OTHER)
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.pins = {**self.first.pins, **self.second.pins}

    def make_root(self, name: str) -> Path:
        root = Path(self._tmp.name).resolve() / name
        root.mkdir()
        self.first.write(root)
        for path, data in self.second.files.items():
            if path != "manifest/releases.json":
                (root / path).parent.mkdir(parents=True, exist_ok=True)
                (root / path).write_bytes(data)
        index = json.loads(self.first.files["manifest/releases.json"])
        index["releases"] += json.loads(self.second.files["manifest/releases.json"])["releases"]
        (root / "manifest/releases.json").write_bytes(convert.dump_json(index))
        return root

    def test_all_groups_together_or_a_subset_stepwise(self) -> None:
        root = self.make_root("all")
        with mock.patch.dict(verifier.V3_SUPERSEDED, self.pins, clear=True):
            code, out, err = run_cli("install", "--root", str(root))
            self.assertEqual((code, err), (0, ""), out)
            self.assertEqual(sorted(p.name for p in (root / "patches").iterdir()),
                             sorted([f"{GROUP}.v3.srwfp", f"{self.OTHER}.v3.srwfp"]))
            self.assertEqual(validation_errors(root), [])

        # the policy forbids any remaining v1 -a/-b/-c row, so converting a subset is refused up front
        subset = self.make_root("subset")
        before = tree_digest(subset)
        with mock.patch.dict(verifier.V3_SUPERSEDED, self.pins, clear=True):
            code, _, err = run_cli("install", "--root", str(subset), "--group", GROUP)
        self.assertEqual(code, 2, err)
        self.assertIn("would stay v1", err)
        self.assertEqual(tree_digest(subset), before)
        # once everything is converted, naming a group is just an "already converted" check
        with mock.patch.dict(verifier.V3_SUPERSEDED, self.pins, clear=True):
            code, out, err = run_cli("install", "--root", str(root), "--group", GROUP)
        self.assertEqual((code, err), (0, ""), out)
        self.assertIn(f"{GROUP}: already converted", out)

    def test_a_problem_in_one_group_leaves_both_untouched(self) -> None:
        root = self.make_root("broken")
        bad = {k: dict(v) for k, v in self.pins.items()}
        bad[f"{self.OTHER}-b"]["patchSha256"] = "00" * 32
        before = tree_digest(root)
        with mock.patch.dict(verifier.V3_SUPERSEDED, bad, clear=True):
            code, _, err = run_cli("install", "--root", str(root))
        self.assertEqual(code, 1, err)
        self.assertEqual(tree_digest(root), before)
        # a partial state in the second group is also refused before the first is touched
        (root / f"patches/{self.OTHER}-b.srwfp").unlink()
        before = tree_digest(root)
        with mock.patch.dict(verifier.V3_SUPERSEDED, self.pins, clear=True):
            code, _, err = run_cli("install", "--root", str(root))
        self.assertEqual(code, 2, err)
        self.assertEqual(tree_digest(root), before)


@unittest.skipUnless(shutil.which("git"), "git is not available")
class GitSourceTests(unittest.TestCase):
    def test_v1_originals_can_be_read_from_a_git_revision(self) -> None:
        group = SyntheticGroup(variants="ab", seed=5)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve() / "repo"
            root.mkdir()
            group.write(root)
            env = {key: value for key, value in os.environ.items() if not key.startswith("GIT_")}
            env.update(GIT_AUTHOR_NAME="t", GIT_AUTHOR_EMAIL="t@example.invalid",
                       GIT_COMMITTER_NAME="t", GIT_COMMITTER_EMAIL="t@example.invalid")

            def git(*args: str) -> str:
                return subprocess.run(["git", *args], cwd=root, env=env, check=True,
                                      stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout.decode().strip()

            git("init", "-q")
            git("add", "-A")
            git("commit", "-q", "-m", "v1 state")
            revision = git("rev-parse", "HEAD")
            with group.history():
                self.assertEqual(run_cli("install", "--root", str(root), "--group", GROUP)[0], 0)
                code, out, err = run_cli(
                    "verify", "--root", str(root), "--group", GROUP, "--v1-git-rev", revision, "--reproduce"
                )
                self.assertEqual((code, err), (0, ""), out)
                self.assertIn(f"git {revision}", out)
                self.assertIn("byte-identical re-encode", out)
                out_dir = Path(directory).resolve() / "again"
                code, out, err = run_cli(
                    "encode", "--root", str(root), "--group", GROUP, "--v1-git-rev", revision, "--out-dir", str(out_dir)
                )
                self.assertEqual((code, err), (0, ""), out)
                self.assertEqual(
                    (out_dir / f"{GROUP}.v3.srwfp").read_bytes(), (root / f"patches/{GROUP}.v3.srwfp").read_bytes()
                )
                code, _, err = run_cli("encode", "--root", str(root), "--group", GROUP, "--out-dir", str(out_dir))
                self.assertEqual(code, 2)
                self.assertIn("already converted", err)
                code, _, err = run_cli("verify", "--root", str(root), "--group", GROUP, "--v1-git-rev", "no-such-revision")
                self.assertEqual(code, 2)


class RealRepositoryTests(unittest.TestCase):
    """The real accepted payloads: a full dry run before the conversion (about 75 s for both groups),
    strict verification after it (about 15 s)."""

    def snapshot(self) -> tuple[dict[str, tuple[int, int]], bytes]:
        patches = {p.name: (p.stat().st_size, p.stat().st_mtime_ns) for p in sorted((PROJECT_ROOT / "patches").iterdir())}
        return patches, (PROJECT_ROOT / "manifest/releases.json").read_bytes()

    def test_real_groups_convert_in_a_dry_run_or_verify_when_installed(self) -> None:
        states = {
            group: convert.classify_group(PROJECT_ROOT, group, convert.load_group_rows(PROJECT_ROOT, group))
            for group in convert.pinned_groups()
        }
        self.assertEqual(len(set(states.values())), 1, f"the groups must be converted together: {states}")
        before = self.snapshot()
        if set(states.values()) == {"v1"}:
            code, out, err = run_cli("install", "--dry-run", "--root", str(PROJECT_ROOT))
            self.assertEqual((code, err), (0, ""), out)
            self.assertEqual(out.count("tuples equal to the accepted v1 payload"), 6)
            self.assertIn("dry run: nothing written", out)
            for group in convert.pinned_groups():
                self.assertIn(f"write  patches/{group}.v3.srwfp", out)
        else:
            code, out, err = run_cli("verify", "--root", str(PROJECT_ROOT))
            self.assertEqual((code, err), (0, ""), out)
            self.assertEqual(out.count("verified, payload sha256"), 2)
            code, out, err = run_cli("install", "--dry-run", "--root", str(PROJECT_ROOT))
            self.assertEqual((code, err), (0, ""), out)
            self.assertIn("already converted: nothing to do", out)
        self.assertEqual(self.snapshot(), before)


if __name__ == "__main__":
    unittest.main()
