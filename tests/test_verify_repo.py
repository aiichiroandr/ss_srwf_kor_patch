#!/usr/bin/env python3
"""Synthetic regression tests for dependency-free release promotion checks."""

from __future__ import annotations

import hashlib
import json
import random
from pathlib import Path
import shutil
import struct
import sys
import tempfile
from typing import Any
import unittest
from unittest.mock import patch as mock_patch
import zlib
from contextlib import contextmanager

sys.dont_write_bytecode = True
PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from scripts import verify_repo as verifier  # noqa: E402


@contextmanager
def verifier_root(root: Path):
    original_root = verifier.ROOT
    original_index = verifier.INDEX_PATH
    verifier.ROOT = root
    verifier.INDEX_PATH = root / "manifest/releases.json"
    verifier.errors.clear()
    try:
        yield
    finally:
        verifier.ROOT = original_root
        verifier.INDEX_PATH = original_index
        verifier.errors.clear()


@contextmanager
def public_asset_allowlist(entries: dict[str, str]):
    original = verifier.PUBLIC_ASSET_ALLOWLIST
    verifier.PUBLIC_ASSET_ALLOWLIST = entries
    try:
        yield
    finally:
        verifier.PUBLIC_ASSET_ALLOWLIST = original


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def copy_schema_files(root: Path) -> None:
    shutil.copytree(PROJECT_ROOT / "schemas", root / "schemas")
    (root / "assets").mkdir()
    shutil.copy2(PROJECT_ROOT / "assets/patch-core.mjs", root / "assets/patch-core.mjs")


def copy_public_release_tree(root: Path) -> None:
    for directory in ("schemas", "manifest", "releases", "receipts", "patches"):
        shutil.copytree(PROJECT_ROOT / directory, root / directory)


def png_chunk(chunk_type: bytes, payload: bytes) -> bytes:
    return (
        struct.pack(">I", len(payload))
        + chunk_type
        + payload
        + struct.pack(">I", zlib.crc32(chunk_type + payload) & 0xFFFFFFFF)
    )


def minimal_png() -> bytes:
    ihdr = struct.pack(">IIBBBBB", 1, 1, 8, 6, 0, 0, 0)
    scanline = b"\x00\x00\x00\x00\x00"
    return (
        b"\x89PNG\r\n\x1a\n"
        + png_chunk(b"IHDR", ihdr)
        + png_chunk(b"IDAT", zlib.compress(scanline))
        + png_chunk(b"IEND", b"")
    )


def exact_csp_meta() -> str:
    policy = "; ".join(
        f"{name} {' '.join(values)}"
        for name, values in verifier.REQUIRED_CSP_DIRECTIVES.items()
    )
    return (
        "<html><head><meta http-equiv=\"Content-Security-Policy\" "
        f"content=\"{policy}\"></head><body></body></html>"
    )


def make_patch(
    source: bytes,
    edits: list[tuple[int, bytes]],
    *,
    declared_body_size: int | None = None,
) -> tuple[bytes, bytes, int]:
    target = bytearray(source)
    body_parts: list[bytes] = []
    for offset, replacement in edits:
        target[offset:offset + len(replacement)] = replacement
        preimage = hashlib.sha256(source[offset:offset + len(replacement)]).digest()
        body_parts.append(struct.pack(">QI", offset, len(replacement)))
        body_parts.append(preimage)
        body_parts.append(replacement)
    body = b"".join(body_parts)

    header = bytearray(verifier.PATCH_HEADER_SIZE)
    header[:8] = verifier.PATCH_MAGIC
    struct.pack_into(
        ">IQQQ",
        header,
        8,
        len(edits),
        len(source),
        len(target),
        len(body) if declared_body_size is None else declared_body_size,
    )
    header[36:68] = hashlib.sha256(source).digest()
    header[68:100] = hashlib.sha256(target).digest()
    return bytes(header) + zlib.compress(body), bytes(target), len(body)


def make_structural_patch(source_size: int, edits: list[tuple[int, bytes]]) -> bytes:
    """Build a wire-valid patch without allocating a source-sized fixture."""
    body = b"".join(
        struct.pack(">QI", offset, len(replacement))
        + bytes(32)
        + replacement
        for offset, replacement in edits
    )
    header = bytearray(verifier.PATCH_HEADER_SIZE)
    header[:8] = verifier.PATCH_MAGIC
    struct.pack_into(
        ">IQQQ",
        header,
        8,
        len(edits),
        source_size,
        source_size,
        len(body),
    )
    header[36:68] = bytes.fromhex("11" * 32)
    header[68:100] = bytes.fromhex("22" * 32)
    return bytes(header) + zlib.compress(body)


class SrwfpInspectionTests(unittest.TestCase):
    def setUp(self) -> None:
        verifier.errors.clear()
        self.source = bytes(range(64))
        self.patch, self.target, self.body_size = make_patch(
            self.source,
            [(2, b"\xf0\xf1"), (20, b"\xe0\xe1\xe2")],
        )

    def tearDown(self) -> None:
        verifier.errors.clear()

    def test_bit_reader_matches_individual_bits_and_bounds(self) -> None:
        data = bytes(range(256))
        rng = random.Random(93)
        reader = verifier.DeflateBitReader(data)
        for _ in range(150):
            count = min(rng.choice([0, 1, 2, 3, 7, 8, 9, 13, 16]), len(data) * 8 - reader.bit_offset)
            start = reader.bit_offset
            expected = sum(((data[(start + i) >> 3] >> ((start + i) & 7)) & 1) << i for i in range(count))
            self.assertEqual(reader.peek(count), expected)
            self.assertEqual(reader.bit_offset, start)
            self.assertEqual(reader.read(count), expected)
        reader.bit_offset = len(data) * 8 - 1
        self.assertEqual(reader.read(1), 1)
        self.assertEqual(reader.read(0), 0)
        with self.assertRaises(verifier.SrwfpFormatError):
            reader.read(1)

    def test_fast_huffman_matches_bitwise_decoder_on_valid_and_damaged_streams(self) -> None:
        rng = random.Random(93)
        def outcome(stream, size, window):
            try:
                verifier.inspect_deflate_payload(stream, size, window)
                return True
            except verifier.SrwfpFormatError:
                return False
        for index in range(32):
            raw = bytes(rng.randrange(256) for _ in range(rng.randrange(1, 2048)))
            if index % 2:
                raw = raw[:32] * 64 + raw
            strategy = [zlib.Z_DEFAULT_STRATEGY, zlib.Z_FIXED, zlib.Z_HUFFMAN_ONLY, zlib.Z_RLE][index % 4]
            compressor = zlib.compressobj(index % 10, zlib.DEFLATED, zlib.MAX_WBITS, 8, strategy)
            stream = compressor.compress(raw) + compressor.flush()
            variants = [stream, stream[:-1], stream + b"\x00", stream[:max(6, len(stream) // 2)]]
            for _ in range(4):
                damaged = bytearray(stream)
                damaged[rng.randrange(2, len(stream) - 4)] ^= 1 << rng.randrange(8)
                variants.append(bytes(damaged))
            for variant in variants:
                for window in [256, 32768]:
                    fast = outcome(variant, len(raw), window)
                    with mock_patch.object(verifier, "FAST_HUFFMAN_BITS", 0):
                        slow = outcome(variant, len(raw), window)
                    self.assertEqual(fast, slow, (index, window, len(variant)))

    def test_valid_patch_descriptor_is_exact(self) -> None:
        descriptor = verifier.inspect_srwfp(self.patch)
        self.assertEqual(descriptor["patchSize"], len(self.patch))
        self.assertEqual(descriptor["patchSha256"], hashlib.sha256(self.patch).hexdigest())
        self.assertEqual(descriptor["sourceSize"], len(self.source))
        self.assertEqual(descriptor["sourceSha256"], hashlib.sha256(self.source).hexdigest())
        self.assertEqual(descriptor["targetSize"], len(self.target))
        self.assertEqual(descriptor["targetSha256"], hashlib.sha256(self.target).hexdigest())
        self.assertEqual(descriptor["recordCount"], 2)
        self.assertEqual(descriptor["bodyUncompressedSize"], self.body_size)

    def test_descriptor_cache_rechecks_changed_bytes_limits_and_return_values(self) -> None:
        verifier._PATCH_DESCRIPTOR_CACHE.clear()
        with mock_patch.object(verifier, "inspect_srwfp", wraps=verifier.inspect_srwfp) as inspect:
            first = verifier.inspect_srwfp_cached(self.patch)
            first["targetSha256"] = "00" * 32
            second = verifier.inspect_srwfp_cached(bytes(self.patch))
            self.assertEqual(second["targetSha256"], hashlib.sha256(self.target).hexdigest())
            self.assertEqual(inspect.call_count, 1)
            changed = bytearray(self.patch)
            changed[0] ^= 1
            with self.assertRaises(verifier.SrwfpFormatError):
                verifier.inspect_srwfp_cached(bytes(changed))
            with mock_patch.object(verifier, "PATCH_MAX", len(self.patch) - 1):
                with self.assertRaises(verifier.SrwfpFormatError):
                    verifier.inspect_srwfp_cached(self.patch)
            self.assertEqual(inspect.call_count, 3)
        verifier._PATCH_DESCRIPTOR_CACHE.clear()

    def test_malformed_wire_shapes_fail_closed(self) -> None:
        bad_magic = bytearray(self.patch)
        bad_magic[0] ^= 0xff
        with self.assertRaisesRegex(verifier.SrwfpFormatError, "magic"):
            verifier.inspect_srwfp(bytes(bad_magic))

        with self.assertRaisesRegex(verifier.SrwfpFormatError, "trailing compressed"):
            verifier.inspect_srwfp(self.patch + b"\x00")

        adjacent, _, _ = make_patch(self.source, [(2, b"\xf0\xf1"), (4, b"\xe0")])
        with self.assertRaisesRegex(verifier.SrwfpFormatError, "adjacent"):
            verifier.inspect_srwfp(adjacent)

        wrong_size, _, _ = make_patch(
            self.source,
            [(2, b"\xf0\xf1")],
            declared_body_size=999,
        )
        with self.assertRaisesRegex(verifier.SrwfpFormatError, "decompressed body"):
            verifier.inspect_srwfp(wrong_size)

    def test_back_reference_cannot_exceed_advertised_zlib_window(self) -> None:
        block = b"".join(hashlib.sha256(index.to_bytes(2, "big")).digest() for index in range(32))
        source = bytes(len(block) * 2)
        patch, _, _ = make_patch(source, [(0, block + block)])
        forged = bytearray(patch)
        compressed_offset = verifier.PATCH_HEADER_SIZE
        forged[compressed_offset] = 0x08  # DEFLATE with an advertised 256-byte window.
        flags = forged[compressed_offset + 1] & 0xC0
        flags += (-(forged[compressed_offset] << 8 | flags)) % 31
        forged[compressed_offset + 1] = flags

        with self.assertRaisesRegex(verifier.SrwfpFormatError, "advertised zlib window"):
            verifier.inspect_srwfp(bytes(forged))

    def test_sparse_download_capture_windows_merge_before_budgeting(self) -> None:
        chunk = verifier.DOWNLOAD_CAPTURE_CHUNK_BYTES
        edits = [(index * 2, b"\xff") for index in range(33)]
        patch = make_structural_patch(chunk, edits)

        descriptor = verifier.inspect_srwfp(patch)
        self.assertEqual(descriptor["recordCount"], len(edits))

    def test_sparse_download_capture_budget_accepts_boundary_and_rejects_excess(self) -> None:
        chunk = verifier.DOWNLOAD_CAPTURE_CHUNK_BYTES
        maximum_windows = verifier.MAX_DOWNLOAD_CAPTURE_BYTES // chunk

        exact_offsets = [index * 2 * chunk for index in range(maximum_windows)]
        exact_patch = make_structural_patch(
            exact_offsets[-1] + chunk,
            [(offset, b"\xff") for offset in exact_offsets],
        )
        descriptor = verifier.inspect_srwfp(exact_patch)
        self.assertEqual(descriptor["recordCount"], maximum_windows)

        excess_offsets = [index * 2 * chunk for index in range(maximum_windows + 1)]
        excess_patch = make_structural_patch(
            excess_offsets[-1] + chunk,
            [(offset, b"\xff") for offset in excess_offsets],
        )
        with self.assertRaisesRegex(
            verifier.SrwfpFormatError,
            rf"sparse download requires more than {verifier.MAX_DOWNLOAD_CAPTURE_BYTES}",
        ):
            verifier.inspect_srwfp(excess_patch)

    def test_manifest_descriptor_mismatch_is_reported(self) -> None:
        source = {
            "size": len(self.source),
            "sha256": hashlib.sha256(self.source).hexdigest(),
        }
        target = {
            "size": len(self.target),
            "sha256": hashlib.sha256(self.target).hexdigest(),
        }
        patch = {
            "size": len(self.patch),
            "sha256": hashlib.sha256(self.patch).hexdigest(),
            "recordCount": 3,
            "bodyUncompressedSize": self.body_size,
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "synthetic.srwfp"
            path.write_bytes(self.patch)
            verifier.require_srwfp_descriptor(
                path,
                source=source,
                target=target,
                patch=patch,
                context="synthetic release",
            )
        self.assertTrue(any("recordCount" in error for error in verifier.errors))


class AcceptanceReceiptTests(unittest.TestCase):
    def setUp(self) -> None:
        verifier.errors.clear()
        self.release_id = "v5-r999"
        self.source = {
            "profileId": verifier.STOCK_PROFILE["id"],
            "size": verifier.STOCK_PROFILE["size"],
            "sha256": verifier.STOCK_PROFILE["sha256"],
        }
        self.target = {"sha256": "11" * 32}
        self.patch = {"sha256": "22" * 32}
        self.provenance = {"v5Commit": "33" * 20}
        self.receipt = {
            "schema": "srwf-kor.acceptance-receipt.v1",
            "releaseId": self.release_id,
            "state": "ACCEPTED",
            "acceptedAt": "2026-08-09T12:34:56Z",
            "stockProfileId": verifier.STOCK_PROFILE["id"],
            "sourceSha256": verifier.STOCK_PROFILE["sha256"],
            "targetSha256": self.target["sha256"],
            "patchSha256": self.patch["sha256"],
            "v5Commit": self.provenance["v5Commit"],
            "gates": {
                "staticStructure": "PASS",
                "runtimeConsumption": "PASS",
                "visualLayout": "PASS",
                "longPlayProgression": "PASS",
            },
            "decisionAuthority": "synthetic test authority",
        }

    def tearDown(self) -> None:
        verifier.errors.clear()

    def validate(self, receipt: dict[str, object]) -> None:
        verifier.validate_acceptance_receipt(
            receipt,
            release_id=self.release_id,
            source=self.source,
            target=self.target,
            patch=self.patch,
            provenance=self.provenance,
        )

    def test_complete_receipt_passes(self) -> None:
        self.validate(self.receipt)
        self.assertEqual(verifier.errors, [])

    def test_trial_receipt_may_explicitly_not_claim_long_play(self) -> None:
        trial = dict(self.receipt)
        trial["gates"] = {
            **self.receipt["gates"],
            "longPlayProgression": "NOT_CLAIMED",
        }
        self.validate(trial)
        self.assertEqual(verifier.errors, [])

    def test_final_stock_profile_receipt_passes(self) -> None:
        final_profile = verifier.STOCK_PROFILES_BY_GAME["srwf-final"]
        self.source = {
            "profileId": final_profile["id"],
            "size": final_profile["size"],
            "sha256": final_profile["sha256"],
        }
        final_receipt = {
            **self.receipt,
            "stockProfileId": final_profile["id"],
            "sourceSha256": final_profile["sha256"],
            "gates": {
                **self.receipt["gates"],
                "longPlayProgression": "NOT_CLAIMED",
            },
        }
        self.validate(final_receipt)
        self.assertEqual(verifier.errors, [])

    def test_missing_schema_field_and_failed_gate_are_rejected(self) -> None:
        missing = dict(self.receipt)
        missing.pop("acceptedAt")
        self.validate(missing)
        self.assertTrue(any("missing" in error and "acceptedAt" in error for error in verifier.errors))

        verifier.errors.clear()
        failed = dict(self.receipt)
        failed["gates"] = {**self.receipt["gates"], "visualLayout": "FAIL"}
        self.validate(failed)
        self.assertTrue(any("static/runtime/visual gates must PASS" in error for error in verifier.errors))

        verifier.errors.clear()
        false_long_play = dict(self.receipt)
        false_long_play["gates"] = {
            **self.receipt["gates"],
            "longPlayProgression": "FAIL",
        }
        self.validate(false_long_play)
        self.assertTrue(any("longPlayProgression must be PASS or NOT_CLAIMED" in error for error in verifier.errors))

    def test_commit_id_must_be_full_sha1_or_sha256(self) -> None:
        for length in (40, 64):
            verifier.errors.clear()
            receipt = {**self.receipt, "v5Commit": "3" * length}
            provenance = {"v5Commit": receipt["v5Commit"]}
            verifier.validate_acceptance_receipt(
                receipt,
                release_id=self.release_id,
                source=self.source,
                target=self.target,
                patch=self.patch,
                provenance=provenance,
            )
            self.assertEqual(verifier.errors, [])

        verifier.errors.clear()
        receipt = {**self.receipt, "v5Commit": "3" * 41}
        verifier.validate_acceptance_receipt(
            receipt,
            release_id=self.release_id,
            source=self.source,
            target=self.target,
            patch=self.patch,
            provenance={"v5Commit": receipt["v5Commit"]},
        )
        self.assertTrue(any("v5Commit is invalid" in error for error in verifier.errors))


class RepositoryPolicyTests(unittest.TestCase):
    def test_schema_contract_detects_nested_weakening(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            copy_schema_files(root)
            schema_path = root / "schemas/release.schema.json"
            schema = json.loads(schema_path.read_text(encoding="utf-8"))
            schema["properties"]["target"]["additionalProperties"] = True
            schema["properties"]["target"]["properties"]["filename"]["pattern"] = ".*"
            schema["properties"]["provenance"]["properties"]["v5Commit"]["pattern"] = ".*"
            write_json(schema_path, schema)

            with verifier_root(root):
                verifier.validate_schema_documents()
                self.assertTrue(any("out of sync" in error for error in verifier.errors))

    def test_case_variant_orphan_artifacts_are_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            shutil.copytree(PROJECT_ROOT / "schemas", root / "schemas")
            (root / "manifest").mkdir()
            shutil.copy2(PROJECT_ROOT / "manifest/releases.json", root / "manifest/releases.json")
            for name in (
                "patches/unaccepted.SRWFP",
                "releases/candidate.JSON",
                "receipts/candidate.JSON",
            ):
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(b"candidate")

            with verifier_root(root):
                files = [path for path in root.rglob("*") if path.is_file()]
                verifier.validate_index(files)
                joined = "\n".join(verifier.errors)
                self.assertIn("unaccepted or unindexed .srwfp", joined)
                self.assertIn("unindexed candidate release manifest", joined)
                self.assertIn("unindexed acceptance receipt", joined)

    def test_withdrawn_v01_artifacts_are_byte_immutable_and_unindexed(self) -> None:
        verifier.errors.clear()
        files = verifier.repository_files()
        verifier.validate_withdrawn_release_artifacts(files)
        self.assertEqual(verifier.errors, [])

        index = json.loads((PROJECT_ROOT / "manifest/releases.json").read_text(encoding="utf-8"))
        withdrawn_id = "srwf-f-20260814-v0-1"
        self.assertNotIn(withdrawn_id, {row["id"] for row in index["releases"]})
        self.assertNotIn(
            withdrawn_id,
            {game["defaultReleaseId"] for game in index["games"]},
        )
        for name, expected_sha256 in verifier.WITHDRAWN_RELEASE_ARTIFACT_ALLOWLIST.items():
            self.assertEqual(
                hashlib.sha256((PROJECT_ROOT / name).read_bytes()).hexdigest(),
                expected_sha256,
            )

    def test_withdrawn_v01_artifact_tampering_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            for name in verifier.WITHDRAWN_RELEASE_ARTIFACT_ALLOWLIST:
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(b"tampered")

            with verifier_root(root):
                files = [path for path in root.rglob("*") if path.is_file()]
                verifier.validate_withdrawn_release_artifacts(files)
                self.assertEqual(
                    sum("withdrawn historical artifact hash mismatch" in error for error in verifier.errors),
                    len(verifier.WITHDRAWN_RELEASE_ARTIFACT_ALLOWLIST),
                )

    def test_symbolic_links_are_forbidden(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            shutil.copy2(PROJECT_ROOT / ".gitignore", root / ".gitignore")
            target = root / "ordinary.txt"
            target.write_text("ordinary", encoding="utf-8")
            link = root / "linked.txt"
            link.symlink_to(target.name)
            with verifier_root(root):
                verifier.validate_forbidden_artifacts([root / ".gitignore", link])
                self.assertTrue(any("symbolic link is forbidden" in error for error in verifier.errors))

    def test_binary_asset_suffixes_require_real_bounded_containers(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            assets = root / "assets"
            assets.mkdir()
            valid_png = assets / "valid.png"
            valid_png.write_bytes(minimal_png())
            disguised = []
            for suffix in sorted(verifier.PUBLIC_ASSET_SUFFIXES):
                path = assets / f"disguised{suffix}"
                path.write_bytes(b"renamed proprietary bytes")
                disguised.append(path)
            allowlist = {
                path.relative_to(root).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
                for path in [valid_png, *disguised]
            }
            with verifier_root(root), public_asset_allowlist(allowlist):
                verifier.validate_public_binary_assets([valid_png, *disguised])
                joined = "\n".join(verifier.errors)
                self.assertNotIn("valid.png", joined)
                for path in disguised:
                    self.assertIn(path.name, joined)

    def test_binary_asset_requires_exact_path_and_sha_approval(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            path = root / "assets/approved.png"
            path.parent.mkdir()
            path.write_bytes(minimal_png())
            digest = hashlib.sha256(path.read_bytes()).hexdigest()

            with verifier_root(root), public_asset_allowlist({}):
                verifier.validate_public_binary_assets([path])
                self.assertTrue(any("not explicitly path+SHA allowlisted" in error for error in verifier.errors))

            with verifier_root(root), public_asset_allowlist({"assets/approved.png": "0" * 64}):
                verifier.validate_public_binary_assets([path])
                self.assertTrue(any("SHA-256 does not match" in error for error in verifier.errors))

            with verifier_root(root), public_asset_allowlist({"assets/approved.png": digest}):
                verifier.validate_public_binary_assets([path])
                self.assertEqual(verifier.errors, [])

    def test_binary_asset_size_cap_is_enforced_before_parsing(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            oversized = root / "assets/oversized.png"
            oversized.parent.mkdir()
            with oversized.open("wb") as handle:
                handle.truncate(verifier.PUBLIC_ASSET_MAX + 1)
            digest = hashlib.sha256(oversized.read_bytes()).hexdigest()
            with verifier_root(root), public_asset_allowlist({"assets/oversized.png": digest}):
                verifier.validate_public_binary_assets([oversized])
                self.assertTrue(any("byte cap" in error for error in verifier.errors))

    def test_binary_asset_aggregate_cap_is_enforced(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            assets = root / "assets"
            assets.mkdir()
            paths = [assets / "one.png", assets / "two.png"]
            for path in paths:
                path.write_bytes(minimal_png())
            allowlist = {
                path.relative_to(root).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
                for path in paths
            }
            original_cap = verifier.PUBLIC_ASSET_TOTAL_MAX
            with verifier_root(root), public_asset_allowlist(allowlist):
                try:
                    verifier.PUBLIC_ASSET_TOTAL_MAX = sum(path.stat().st_size for path in paths) - 1
                    verifier.validate_public_binary_assets(paths)
                    self.assertTrue(any("repository cap" in error for error in verifier.errors))
                finally:
                    verifier.PUBLIC_ASSET_TOTAL_MAX = original_cap

    def test_all_non_test_web_sources_are_scanned(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            (root / "index.html").write_text(exact_csp_meta(), encoding="utf-8")
            write_json(root / "package.json", {
                "private": True,
                "scripts": verifier.EXPECTED_PACKAGE_SCRIPTS,
            })
            sources = {
                "hidden.html": '<img src="//remote.example/image.png">',
                "hidden.htm": '<script src="//remote.example/code.js"></script>',
                "hidden.shtml": '<script src="//remote.example/code.js"></script>',
                "hidden.xhtml": '<script src="//remote.example/code.js"></script>',
                "hidden.svg": '<svg><image href="//remote.example/image.png"/></svg>',
                "hidden.css": '@import url("//remote.example/style.css");',
                "hidden.js": 'new WebSocket("./socket");',
                "hidden.mjs": 'fetch("./collect", { method: `POST` });',
                "loader.mjs": 'import "./tests/fixture.mjs";',
                "loader.html": '<script src="./tests/fixture.mjs"></script>',
                "loader.css": '@import "./\\74 ests/fixture.css";',
                "tests/fixture.mjs": 'fetch("//ignored.example", { method: "POST" });',
            }
            paths = []
            for name, source in sources.items():
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(source, encoding="utf-8")
                paths.append(path)
            with verifier_root(root):
                verifier.validate_static_site([root / "index.html", root / "package.json", *paths])
                joined = "\n".join(verifier.errors)
                for name in (
                    "hidden.html", "hidden.htm", "hidden.shtml", "hidden.xhtml", "hidden.svg",
                    "hidden.css", "hidden.js", "hidden.mjs",
                ):
                    self.assertIn(name, joined)
                self.assertIn("loader.mjs", joined)
                self.assertIn("loader.html", joined)
                self.assertIn("loader.css", joined)
                self.assertIn("excluded test source", joined)
                self.assertNotIn("tests/fixture.mjs: external/CDN", joined)
                self.assertNotIn("tests/fixture.mjs: upload or network-write", joined)

    def test_csp_requires_one_effective_structured_meta(self) -> None:
        comment_only = f"<html><head><!-- {exact_csp_meta()} --></head><body></body></html>"
        weak_meta_with_policy_comment = (
            "<html><head>"
            "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src *\">"
            f"<!-- {exact_csp_meta()} -->"
            "</head><body></body></html>"
        )
        meta_after_body = f"<html><head></head><body></body>{exact_csp_meta()}</html>"
        for document in (comment_only, weak_meta_with_policy_comment, meta_after_body):
            verifier.errors.clear()
            verifier.validate_index_csp(document)
            self.assertTrue(any("Content-Security-Policy meta" in error for error in verifier.errors))

        verifier.errors.clear()
        verifier.validate_index_csp(exact_csp_meta())
        self.assertEqual(verifier.errors, [])

    def test_relative_references_reject_traversal_and_encoding(self) -> None:
        self.assertTrue(
            verifier.is_safe_relative(
                "releases/v5-r001.json", prefix="releases/", suffix=".json"
            )
        )
        for value in (
            "releases/a/../v5-r001.json",
            "releases//v5-r001.json",
            "releases/%2e%2e/v5-r001.json",
        ):
            self.assertFalse(verifier.is_safe_relative(value, prefix="releases/", suffix=".json"))

    def test_hook_contract_is_exact_and_network_free(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            hook = root / ".githooks/pre-commit"
            hook.parent.mkdir()
            hook.write_text("\n".join(verifier.EXPECTED_PRE_COMMIT_LINES) + "\n", encoding="utf-8")
            hook.chmod(0o755)
            with verifier_root(root):
                verifier.validate_pre_commit_hook()
                self.assertEqual(verifier.errors, [])
                hook.write_text(hook.read_text(encoding="utf-8") + "curl https://example.invalid\n")
                verifier.validate_pre_commit_hook()
                self.assertTrue(any("complete local npm test suite" in error for error in verifier.errors))

    def test_complete_synthetic_accepted_release_is_cross_checked(self) -> None:
        release_id = "v5-r999"
        target_hash = "11" * 32
        commit = "33" * 20
        body = struct.pack(">QI", 0, 1) + hashlib.sha256(b"\x00").digest() + b"\xff"
        header = bytearray(verifier.PATCH_HEADER_SIZE)
        header[:8] = verifier.PATCH_MAGIC
        struct.pack_into(
            ">IQQQ",
            header,
            8,
            1,
            verifier.STOCK_PROFILE["size"],
            verifier.STOCK_PROFILE["size"],
            len(body),
        )
        header[36:68] = bytes.fromhex(verifier.STOCK_PROFILE["sha256"])
        header[68:100] = bytes.fromhex(target_hash)
        payload = bytes(header) + zlib.compress(body)

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            shutil.copytree(PROJECT_ROOT / "schemas", root / "schemas")
            patch_path = root / f"patches/{release_id}.srwfp"
            patch_path.parent.mkdir()
            patch_path.write_bytes(payload)
            patch_hash = hashlib.sha256(payload).hexdigest()
            receipt = {
                "schema": "srwf-kor.acceptance-receipt.v1",
                "releaseId": release_id,
                "state": "ACCEPTED",
                "acceptedAt": "2026-08-09T12:34:56Z",
                "stockProfileId": verifier.STOCK_PROFILE["id"],
                "sourceSha256": verifier.STOCK_PROFILE["sha256"],
                "targetSha256": target_hash,
                "patchSha256": patch_hash,
                "v5Commit": commit,
                "gates": {
                    "staticStructure": "PASS",
                    "runtimeConsumption": "PASS",
                    "visualLayout": "PASS",
                    "longPlayProgression": "PASS",
                },
                "decisionAuthority": "synthetic test authority",
            }
            receipt_path = root / f"receipts/{release_id}.acceptance.json"
            write_json(receipt_path, receipt)
            release = {
                "schema": "srwf-kor.public-release.v1",
                "id": release_id,
                "state": "ACCEPTED",
                "version": "r999",
                "title": "Synthetic accepted release",
                "publishedAt": "2026-08-09T12:35:00Z",
                "source": {
                    "profileId": verifier.STOCK_PROFILE["id"],
                    "size": verifier.STOCK_PROFILE["size"],
                    "sha256": verifier.STOCK_PROFILE["sha256"],
                },
                "target": {
                    "filename": "SRWF-KOR-r999.bin",
                    "cueFilename": "SRWF-KOR-r999.cue",
                    "size": verifier.STOCK_PROFILE["size"],
                    "sha256": target_hash,
                },
                "patch": {
                    "format": "srwf.sparse-byte-delta.v1",
                    "url": f"patches/{release_id}.srwfp",
                    "size": len(payload),
                    "sha256": patch_hash,
                    "recordCount": 1,
                    "bodyUncompressedSize": len(body),
                },
                "provenance": {
                    "v5Commit": commit,
                    "buildReceiptSha256": "44" * 32,
                    "acceptanceReceiptSha256": hashlib.sha256(receipt_path.read_bytes()).hexdigest(),
                },
            }
            release_path = root / f"releases/{release_id}.json"
            write_json(release_path, release)
            index = {
                "$schema": "../schemas/releases.schema.json",
                "schema": "srwf-kor.public-release-index.v2",
                "project": {"id": "srwf-kor-v5", "status": "HAS_ACCEPTED_RELEASE"},
                "games": [
                    {
                        "id": "srwf-f",
                        "label": "슈퍼로봇대전 F",
                        "status": "HAS_ACCEPTED_RELEASE",
                        "defaultReleaseId": release_id,
                    },
                    {
                        "id": "srwf-final",
                        "label": "슈퍼로봇대전 F 완결편",
                        "status": "NO_ACCEPTED_RELEASE",
                        "defaultReleaseId": None,
                    },
                ],
                "stock_profiles": [{
                    "gameId": "srwf-f",
                    **verifier.STOCK_PROFILE,
                    "label": "Synthetic stock",
                }],
                "releases": [{
                    "gameId": "srwf-f",
                    "id": release_id,
                    "state": "ACCEPTED",
                    "label": "Synthetic accepted release",
                    "manifest": f"releases/{release_id}.json",
                    "manifestSha256": hashlib.sha256(release_path.read_bytes()).hexdigest(),
                }],
            }
            write_json(root / "manifest/releases.json", index)

            with verifier_root(root):
                files = [path for path in root.rglob("*") if path.is_file()]
                verifier.validate_index(files)
                self.assertEqual(verifier.errors, [])

    def test_per_game_default_and_availability_fail_closed(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            copy_public_release_tree(root)
            index_path = root / "manifest/releases.json"
            index = json.loads(index_path.read_text(encoding="utf-8"))
            final_game = next(game for game in index["games"] if game["id"] == "srwf-final")
            final_game["status"] = "HAS_ACCEPTED_RELEASE"
            final_game["defaultReleaseId"] = index["releases"][0]["id"]
            index["releases"] = [
                row for row in index["releases"]
                if row["gameId"] != "srwf-final"
            ]
            write_json(index_path, index)

            with verifier_root(root):
                files = [path for path in root.rglob("*") if path.is_file()]
                verifier.validate_index(files)
                joined = "\n".join(verifier.errors)
                self.assertIn("game srwf-final: HAS_ACCEPTED_RELEASE requires at least one release row", joined)
                self.assertIn("defaultReleaseId must reference its own accepted release", joined)

    def test_cross_game_release_and_profile_bindings_fail_closed(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            copy_public_release_tree(root)
            index_path = root / "manifest/releases.json"
            index = json.loads(index_path.read_text(encoding="utf-8"))
            index["games"][0]["status"] = "NO_ACCEPTED_RELEASE"
            index["games"][0]["defaultReleaseId"] = None
            index["games"][1]["status"] = "HAS_ACCEPTED_RELEASE"
            index["games"][1]["defaultReleaseId"] = index["releases"][0]["id"]
            for row in index["releases"]:
                row["gameId"] = "srwf-final"
            write_json(index_path, index)

            with verifier_root(root):
                files = [path for path in root.rglob("*") if path.is_file()]
                verifier.validate_index(files)
                joined = "\n".join(verifier.errors)
                self.assertIn("source profile belongs to a different game", joined)

    def test_duplicate_game_or_unpinned_stock_profile_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            copy_public_release_tree(root)
            index_path = root / "manifest/releases.json"
            index = json.loads(index_path.read_text(encoding="utf-8"))
            index["games"][1]["id"] = "srwf-f"
            index["stock_profiles"][0]["sha256"] = "00" * 32
            write_json(index_path, index)

            with verifier_root(root):
                files = [path for path in root.rglob("*") if path.is_file()]
                verifier.validate_index(files)
                joined = "\n".join(verifier.errors)
                self.assertIn("duplicate game id", joined)
                self.assertIn("sha256 is not exact", joined)

    def test_font_release_groups_fail_closed_before_publication(self) -> None:
        def row(release_id: str, label: str = "2026.09.09 · v0.4", game_id: str = "srwf-f") -> dict[str, str]:
            return {"gameId": game_id, "id": release_id, "label": label}

        cases = {
            "mixes a legacy id": [row("srwf-f-20260909-v0-4"), row("srwf-f-20260909-v0-4-a")],
            "must share one label": [
                row("srwf-f-20260909-v0-4-a"),
                row("srwf-f-20260909-v0-4-b", "2026.09.09 · v0.4 (설치 비권장)"),
            ],
        }
        for message, rows in cases.items():
            with self.subTest(message=message):
                verifier.errors.clear()
                verifier.validate_font_release_groups(rows)
                self.assertIn(message, "\n".join(verifier.errors))

        verifier.errors.clear()
        verifier.validate_font_release_groups([
            row("srwf-f-20260909-v0-4-a"),
            row("srwf-f-20260909-v0-4-b"),
            row("srwf-f-20260909-v0-4-1-a", "2026.09.09 · v0.4.1"),
            row("srwf-final-20260909-v0-4-a", game_id="srwf-f"),
            row("srwf-final-20260909-v0-1-a", "2026.09.09 · v0.1", "srwf-final"),
        ])
        verifier.validate_font_release_groups(
            json.loads((PROJECT_ROOT / "manifest/releases.json").read_text(encoding="utf-8"))["releases"]
        )
        self.assertEqual(verifier.errors, [])
        verifier.errors.clear()


def v2_replace(offset: int, replacement: bytes, preimage: bytes = bytes(32)) -> bytes:
    return b"\x01" + struct.pack(">QI", offset, len(replacement)) + preimage + replacement


def v2_copy(offset: int, length: int, source_offset: int, digest: bytes = bytes(32)) -> bytes:
    return b"\x02" + struct.pack(">QIQ", offset, length, source_offset) + digest


def v2_literal(offset: int, data: bytes) -> bytes:
    return b"\x03" + struct.pack(">QI", offset, len(data)) + data


def make_v2_patch(
    source_size: int,
    target_size: int,
    records: list[bytes],
    *,
    counts: list[int] | None = None,
    sums: list[int] | None = None,
    body_size: int | None = None,
    magic: bytes = verifier.PATCH_V2_MAGIC,
    body_extra: bytes = b"",
    compressed: bytes | None = None,
    source_sha256: bytes = b"\x11" * 32,
    target_sha256: bytes = b"\x22" * 32,
) -> bytes:
    """Build a wire-level SRWFKP2 payload without any source-sized fixture."""
    body = b"".join(records) + body_extra
    if counts is None:
        counts = [sum(1 for record in records if record[0] == kind) for kind in (1, 2, 3)]
    if sums is None:
        sums = [
            sum(struct.unpack_from(">I", record, 9)[0] for record in records if record[0] == kind)
            for kind in (2, 3)
        ]
    header = bytearray(verifier.PATCH_V2_HEADER_SIZE)
    header[:8] = magic
    struct.pack_into(
        ">IQQQ",
        header,
        8,
        sum(counts),
        source_size,
        target_size,
        len(body) if body_size is None else body_size,
    )
    header[36:68] = source_sha256
    header[68:100] = target_sha256
    struct.pack_into(">IIIQQ", header, 100, *counts, *sums)
    return bytes(header) + (zlib.compress(body, 9) if compressed is None else compressed)


class SrwfpV2InspectionTests(unittest.TestCase):
    """Structural v2 rules; the same shapes as scratchpad v2neg.py and the JS tests."""

    SOURCE = 8192
    TARGET = 9192

    def setUp(self) -> None:
        verifier.errors.clear()
        self.good = [
            v2_replace(100, b"\xaa" * 64),
            v2_replace(6144, b"\xbb" * 1000),
            v2_copy(7144, 2048, 6144),
        ]
        self.good_literal = [
            v2_replace(100, b"\xaa" * 64),
            v2_replace(6144, b"\xbb" * 1000),
            v2_copy(7144, 1856, 6144),
            v2_literal(9000, bytes(range(192))),
        ]

    def tearDown(self) -> None:
        verifier.errors.clear()

    def patch(self, records: list[bytes] | None = None, **options: Any) -> bytes:
        source_size = options.pop("source_size", self.SOURCE)
        target_size = options.pop("target_size", self.TARGET)
        return make_v2_patch(
            source_size, target_size, self.good if records is None else records, **options
        )

    def test_valid_v2_descriptors_are_exact(self) -> None:
        for records, copy_bytes, literal_bytes in (
            (self.good, 2048, 0),
            (self.good_literal, 1856, 192),
        ):
            payload = self.patch(records)
            descriptor = verifier.inspect_srwfp_v2(payload)
            self.assertEqual(descriptor["patchSize"], len(payload))
            self.assertEqual(descriptor["patchSha256"], hashlib.sha256(payload).hexdigest())
            self.assertEqual(descriptor["sourceSize"], self.SOURCE)
            self.assertEqual(descriptor["targetSize"], self.TARGET)
            self.assertEqual(descriptor["sourceSha256"], "11" * 32)
            self.assertEqual(descriptor["targetSha256"], "22" * 32)
            self.assertEqual(descriptor["recordCount"], len(records))
            self.assertEqual(descriptor["bodyUncompressedSize"], len(b"".join(records)))
            self.assertEqual(descriptor["format"], verifier.PATCH_FORMAT_V2)
            self.assertEqual(descriptor["copyBytes"], copy_bytes)
            self.assertEqual(descriptor["literalBytes"], literal_bytes)
            self.assertEqual(verifier.inspect_srwfp_v2_cached(payload), descriptor)

    def test_v1_and_v2_inspectors_never_cross(self) -> None:
        with self.assertRaisesRegex(verifier.SrwfpFormatError, "magic is not SRWFKP1"):
            verifier.inspect_srwfp(self.patch())
        v1_payload, _, _ = make_patch(bytes(range(64)), [(2, b"\xf0\xf1")])
        with self.assertRaisesRegex(verifier.SrwfpFormatError, "magic is not SRWFKP2"):
            verifier.inspect_srwfp_v2(v1_payload + bytes(40))

    def test_structural_negative_cases_fail_closed(self) -> None:
        good = self.good
        body = b"".join(good)
        unknown = b"\x04" + good[0][1:]
        empty = b"\x01" + struct.pack(">QI", 50, 0) + bytes(32)
        unsafe = bytearray(self.patch())
        struct.pack_into(">Q", unsafe, 112, 2**60)
        unsummed = bytearray(self.patch())
        struct.pack_into(">I", unsummed, 8, len(good) + 1)
        cases = {
            "magic is not SRWFKP2": self.patch(magic=verifier.PATCH_MAGIC),
            "shorter than its v2 header": self.patch()[:120],
            "safe integer": bytes(unsafe),
            "non-empty source": self.patch(source_size=0),
            "larger than the source": self.patch(target_size=self.SOURCE),
            "growth exceeds": self.patch(target_size=self.SOURCE + verifier.V2_GROWTH_MAX + 1),
            "body exceeds": self.patch(body_size=verifier.BODY_MAX + 1),
            "COPY record count exceeds": self.patch(counts=[2, 65_537, 0]),
            "do not sum": bytes(unsummed),
            "LITERAL bytes exceed": self.patch(sums=[2048, 1001]),
            "too small for its declared records": self.patch(body_size=46 * 2 + 53 - 1),
            "record kinds do not match": self.patch(counts=[1, 1, 1], sums=[2048, 0]),
            "byte totals": self.patch(sums=[2047, 0]),
            "decompressed body": self.patch(body_size=len(body) - 1),
            "trailing bytes": self.patch(body_extra=b"\x00"),
            "unknown kind": self.patch([unknown, *good[1:]]),
            "zero length": self.patch([empty, *good]),
            "duplicates": self.patch([good[0], v2_replace(100, b"\xaa" * 10), *good[1:]]),
            "not sorted": self.patch([good[1], good[0], good[2]]),
            "overlaps": self.patch([good[0], v2_replace(120, b"\xaa" * 10), *good[1:]]),
            "exceeds the target bounds": self.patch([*good[:2], v2_copy(7144, 2049, 6143)]),
            "REPLACE extends beyond the source": self.patch(
                [*good[:2], v2_replace(8100, b"\xcc" * 100)]
            ),
            "LITERAL bytes inside the source": self.patch(
                [good[0], v2_literal(6144, b"\xbb" * 1000), good[2]]
            ),
            "COPY source range is outside": self.patch([*good[:2], v2_copy(7144, 2048, 6145)]),
            "identity COPY": self.patch(
                [good[0], v2_copy(6144, 64, 6144), v2_replace(6208, b"\xbb" * 936), good[2]]
            ),
            "shorter than 64": self.patch(
                [*good[:2], v2_copy(7144, 63, 6144), v2_copy(7207, 1985, 6207)]
            ),
            "extension gap": self.patch([*good[:2], v2_copy(7144, 2000, 6144)]),
        }
        for message, payload in cases.items():
            with self.subTest(message=message):
                with self.assertRaisesRegex(verifier.SrwfpFormatError, message):
                    verifier.inspect_srwfp_v2(payload)

        with self.assertRaises(verifier.SrwfpFormatError):
            verifier.inspect_srwfp_v2(self.patch(compressed=b"\x78\x9c" + bytes(10)))
        with self.assertRaisesRegex(verifier.SrwfpFormatError, "extension gap"):
            verifier.inspect_srwfp_v2(self.patch([
                *self.good_literal[:3], v2_literal(9001, bytes(191)),
            ]))

    def test_merge_rules_follow_record_kinds(self) -> None:
        merged_messages = {
            "replace": [v2_replace(100, b"\xaa" * 32), v2_replace(132, b"\xaa" * 32), *self.good[1:]],
            "literal": [
                *self.good_literal[:3],
                v2_literal(9000, bytes(100)),
                v2_literal(9100, bytes(92)),
            ],
            "copy": [*self.good[:2], v2_copy(7144, 1024, 6144), v2_copy(8168, 1024, 7168)],
        }
        for kind, records in merged_messages.items():
            with self.subTest(kind=kind):
                with self.assertRaisesRegex(verifier.SrwfpFormatError, "must be merged"):
                    verifier.inspect_srwfp_v2(self.patch(records))
        # Target-adjacent COPY records whose sources are not contiguous are canonical.
        split = [*self.good[:2], v2_copy(7144, 1024, 6144), v2_copy(8168, 1024, 0)]
        self.assertEqual(verifier.inspect_srwfp_v2(self.patch(split))["copyCount"], 2)

    def test_capture_budget_counts_only_carried_bytes(self) -> None:
        chunk = verifier.DOWNLOAD_CAPTURE_CHUNK_BYTES
        maximum_windows = verifier.MAX_DOWNLOAD_CAPTURE_BYTES // chunk

        def budget_patch(windows: int) -> bytes:
            source_size = windows * 2 * chunk
            records = [v2_replace(index * 2 * chunk, b"\xff") for index in range(windows)]
            # A multi-MiB COPY is never captured.
            records.append(v2_copy(source_size, 8 * chunk, 1))
            return make_v2_patch(source_size, source_size + 8 * chunk, records)

        descriptor = verifier.inspect_srwfp_v2(budget_patch(maximum_windows))
        self.assertEqual(descriptor["capturedBytes"], verifier.MAX_DOWNLOAD_CAPTURE_BYTES)
        with self.assertRaisesRegex(
            verifier.SrwfpFormatError,
            rf"sparse download requires more than {verifier.MAX_DOWNLOAD_CAPTURE_BYTES}",
        ):
            verifier.inspect_srwfp_v2(budget_patch(maximum_windows + 1))

    def test_frozen_final_g541_geometry_is_a_valid_v2_shape(self) -> None:
        stock = verifier.STOCK_PROFILES_BY_GAME["srwf-final"]
        target_size = 521_680_656
        copy_target, copy_length, copy_source = 517_799_856, 3_880_800, 516_527_424
        self.assertEqual(target_size % verifier.CD_SECTOR_BYTES, 0)
        self.assertEqual(copy_source + copy_length, stock["size"])
        self.assertEqual(copy_target + copy_length, target_size)
        self.assertEqual(((48 * 60 + 55) * 75 + 28) * verifier.CD_SECTOR_BYTES, copy_target)
        self.assertTrue(verifier.is_v2_growth_target_size(target_size, stock))
        payload = make_v2_patch(
            stock["size"],
            target_size,
            [v2_replace(16 * 2352 + 16 + 80, b"\xff"), v2_copy(copy_target, copy_length, copy_source)],
            source_sha256=bytes.fromhex(stock["sha256"]),
        )
        descriptor = verifier.inspect_srwfp_v2(payload)
        self.assertEqual((descriptor["copyCount"], descriptor["literalCount"]), (1, 0))
        self.assertEqual(descriptor["sourceSha256"], stock["sha256"])

    def test_growth_target_size_rule(self) -> None:
        stock = verifier.STOCK_PROFILES_BY_GAME["srwf-final"]
        size = stock["size"]
        self.assertTrue(verifier.is_v2_growth_target_size(size + 2352, stock))
        self.assertTrue(verifier.is_v2_growth_target_size(size + 28_532 * 2352, stock))
        for invalid in (
            size,
            size - 2352,
            size + 1,
            size + 28_534 * 2352,
            verifier.V2_TARGET_SIZE_MAX + 2352,
            True,
            None,
            float(size + 2352),
        ):
            with self.subTest(size=invalid):
                self.assertFalse(verifier.is_v2_growth_target_size(invalid, stock))
        self.assertFalse(verifier.is_v2_growth_target_size(size + 2352, None))


class SyntheticV2ReleaseTests(unittest.TestCase):
    release_id = "v5-r998"

    def build_tree(
        self,
        root: Path,
        payload: bytes,
        *,
        target_size: int,
        patch_format: str = "srwf.sparse-byte-delta.v2",
        manifest_patch: dict[str, Any] | None = None,
    ) -> None:
        release_id = self.release_id
        target_hash = "11" * 32
        commit = "33" * 20
        shutil.copytree(PROJECT_ROOT / "schemas", root / "schemas")
        patch_path = root / f"patches/{release_id}.srwfp"
        patch_path.parent.mkdir()
        patch_path.write_bytes(payload)
        patch_hash = hashlib.sha256(payload).hexdigest()
        receipt = {
            "schema": "srwf-kor.acceptance-receipt.v1",
            "releaseId": release_id,
            "state": "ACCEPTED",
            "acceptedAt": "2026-09-21T12:34:56Z",
            "stockProfileId": verifier.STOCK_PROFILE["id"],
            "sourceSha256": verifier.STOCK_PROFILE["sha256"],
            "targetSha256": target_hash,
            "patchSha256": patch_hash,
            "v5Commit": commit,
            "gates": {
                "staticStructure": "PASS",
                "runtimeConsumption": "PASS",
                "visualLayout": "PASS",
                "longPlayProgression": "NOT_CLAIMED",
            },
            "decisionAuthority": "synthetic test authority",
        }
        receipt_path = root / f"receipts/{release_id}.acceptance.json"
        write_json(receipt_path, receipt)
        release = {
            "schema": "srwf-kor.public-release.v1",
            "id": release_id,
            "state": "ACCEPTED",
            "version": "v0.1",
            "title": "Synthetic accepted growth release",
            "publishedAt": "2026-09-21T12:35:00Z",
            "source": {
                "profileId": verifier.STOCK_PROFILE["id"],
                "size": verifier.STOCK_PROFILE["size"],
                "sha256": verifier.STOCK_PROFILE["sha256"],
            },
            "target": {
                "filename": "SRWF-KOR-r998.bin",
                "cueFilename": "SRWF-KOR-r998.cue",
                "size": target_size,
                "sha256": target_hash,
            },
            "patch": {
                "format": patch_format,
                "url": f"patches/{release_id}.srwfp",
                "size": len(payload),
                "sha256": patch_hash,
                "recordCount": verifier.inspect_srwfp_v2(payload)["recordCount"]
                if payload[:8] == verifier.PATCH_V2_MAGIC
                else 1,
                "bodyUncompressedSize": verifier.inspect_srwfp_v2(payload)["bodyUncompressedSize"]
                if payload[:8] == verifier.PATCH_V2_MAGIC
                else 45,
                **(manifest_patch or {}),
            },
            "provenance": {
                "v5Commit": commit,
                "buildReceiptSha256": "44" * 32,
                "acceptanceReceiptSha256": hashlib.sha256(receipt_path.read_bytes()).hexdigest(),
            },
        }
        release_path = root / f"releases/{release_id}.json"
        write_json(release_path, release)
        write_json(root / "manifest/releases.json", {
            "$schema": "../schemas/releases.schema.json",
            "schema": "srwf-kor.public-release-index.v2",
            "project": {"id": "srwf-kor-v5", "status": "HAS_ACCEPTED_RELEASE"},
            "games": [
                {
                    "id": "srwf-f",
                    "label": "슈퍼로봇대전 F",
                    "status": "HAS_ACCEPTED_RELEASE",
                    "defaultReleaseId": release_id,
                },
                {
                    "id": "srwf-final",
                    "label": "슈퍼로봇대전 F 완결편",
                    "status": "NO_ACCEPTED_RELEASE",
                    "defaultReleaseId": None,
                },
            ],
            "stock_profiles": [{
                "gameId": "srwf-f",
                **verifier.STOCK_PROFILE,
                "label": "Synthetic stock",
            }],
            "releases": [{
                "gameId": "srwf-f",
                "id": release_id,
                "state": "ACCEPTED",
                "label": "Synthetic accepted growth release",
                "manifest": f"releases/{release_id}.json",
                "manifestSha256": hashlib.sha256(release_path.read_bytes()).hexdigest(),
            }],
        })

    def validate(self, payload: bytes, **options: Any) -> list[str]:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            self.build_tree(root, payload, **options)
            with verifier_root(root):
                files = [path for path in root.rglob("*") if path.is_file()]
                verifier.validate_index(files)
                return list(verifier.errors)

    def growth_payload(self, target_size: int) -> bytes:
        stock_size = verifier.STOCK_PROFILE["size"]
        return make_v2_patch(
            stock_size,
            target_size,
            [v2_copy(stock_size, target_size - stock_size, 0)],
            source_sha256=bytes.fromhex(verifier.STOCK_PROFILE["sha256"]),
            target_sha256=bytes.fromhex("11" * 32),
        )

    def test_complete_synthetic_v2_release_is_cross_checked(self) -> None:
        target_size = verifier.STOCK_PROFILE["size"] + 2352
        self.assertEqual(self.validate(self.growth_payload(target_size), target_size=target_size), [])

    def test_v2_manifest_rules_fail_closed(self) -> None:
        stock_size = verifier.STOCK_PROFILE["size"]
        good_size = stock_size + 2352
        payload = self.growth_payload(good_size)
        cases = {
            "v2 target size/hash is invalid": self.validate(
                self.growth_payload(stock_size + 2353), target_size=stock_size + 2353
            ),
            "patch size is outside": self.validate(
                payload, target_size=good_size, manifest_patch={"size": 128}
            ),
            "v2 patch body is too small": self.validate(
                payload,
                target_size=good_size,
                manifest_patch={"recordCount": 2, "bodyUncompressedSize": 27},
            ),
            "unsupported patch format": self.validate(
                payload, target_size=good_size, patch_format="srwf.sparse-byte-delta.v4"
            ),
            # v3 has its own eight-key patch object, so a six-key v3 manifest is malformed.
            "keys differ (missing=['commonRecordCount', 'variant']": self.validate(
                payload, target_size=good_size, patch_format="srwf.sparse-byte-delta.v3"
            ),
        }
        for message, errors in cases.items():
            with self.subTest(message=message):
                self.assertTrue(any(message in error for error in errors), errors)

        # A v1 manifest keeps its stock-size rule and cannot authenticate a v2 payload.
        v1_errors = self.validate(
            payload, target_size=good_size, patch_format="srwf.sparse-byte-delta.v1"
        )
        self.assertTrue(any("target size/hash is invalid" in error for error in v1_errors), v1_errors)
        self.assertTrue(any("magic is not SRWFKP1" in error for error in v1_errors), v1_errors)

        # A v2 manifest cannot point at a v1 payload.
        v1_payload = make_structural_patch(stock_size, [(0, bytes(range(1, 200)))])
        v2_on_v1 = self.validate(v1_payload, target_size=good_size)
        self.assertTrue(any("magic is not SRWFKP2" in error for error in v2_on_v1), v2_on_v1)


def load_v3_fixtures():
    """The synthetic v3 fixtures live with the converter tests (one builder, two consumers)."""
    import importlib.util

    path = PROJECT_ROOT / "tests/test_convert_to_v3.py"
    spec = importlib.util.spec_from_file_location("srwf_v3_fixtures", path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


v3fx = load_v3_fixtures()
convert = v3fx.convert


def v3_payload_from_records(
    common: list[tuple[int, int, bytes]],
    unique: dict[str, list[tuple[int, int, bytes]]],
    canaries: list[tuple[int, int, bytes]],
    *,
    image_size: int = verifier.STOCK_PROFILE["size"],
) -> bytes:
    """A wire-valid v3 payload from explicit sections (no partition, no canary rule applied)."""
    ids = sorted(unique)
    targets = {variant: (hashlib.sha256(b"t" + variant.encode()).digest(), []) for variant in ids}
    header, body, _ = convert.build_header_and_body(
        image_size, hashlib.sha256(b"source").digest(), targets, canaries, common=common, unique=unique
    )
    return header + convert.compress_body(body)


class SrwfpV3InspectionTests(unittest.TestCase):
    def setUp(self) -> None:
        verifier.errors.clear()
        self.payload = v3fx.golden_payload()

    def tearDown(self) -> None:
        verifier.errors.clear()

    def test_golden_vector_is_accepted_with_the_documented_fingerprints(self) -> None:
        descriptor = verifier.inspect_srwfp_v3(self.payload)
        self.assertEqual(descriptor["patchSize"], 871)
        self.assertEqual(descriptor["patchSha256"], v3fx.GOLDEN_SHA256)
        self.assertEqual(descriptor["sourceSize"], 4096)
        self.assertEqual(descriptor["targetSize"], 4096)
        self.assertEqual(descriptor["bodyUncompressedSize"], 585)
        self.assertEqual(descriptor["commonRecordCount"], 4)
        self.assertEqual(descriptor["canaryCount"], 2)
        self.assertEqual(descriptor["format"], verifier.PATCH_FORMAT_V3)
        self.assertEqual(sorted(descriptor["variants"]), ["a", "b", "c"])
        for variant, entry in descriptor["variants"].items():
            self.assertEqual(entry["targetSha256"], v3fx.GOLDEN_TARGETS[variant])
            self.assertEqual(entry["recordSetSha256"], v3fx.GOLDEN_RECORD_SETS[variant])
        self.assertEqual(
            {variant: entry["recordCount"] for variant, entry in descriptor["variants"].items()},
            {"a": 6, "b": 6, "c": 4},
        )

    def test_the_independent_inspector_and_the_converter_decoder_agree(self) -> None:
        cases = golden_negative = v3fx.golden_negative_cases()
        self.assertGreaterEqual(len(cases), 40)
        for name, data, code in golden_negative:
            with self.subTest(name=name):
                with self.assertRaises(verifier.SrwfpFormatError) as raised:
                    verifier.inspect_srwfp_v3(data)
                self.assertTrue(str(raised.exception).startswith(code), (str(raised.exception), code))
        group = v3fx.SyntheticGroup()
        v1 = {v: convert.V1Payload(group.v1[v], v) for v in "abc"}
        common, _ = convert.partition({v: v1[v].records for v in v1})
        payload, _ = convert.encode_group(
            v1["a"].image_size, v1["a"].source_sha256,
            {v: (v1[v].target_sha256, v1[v].records) for v in v1}, convert.select_canaries(common, v1),
        )
        descriptor = verifier.inspect_srwfp_v3(payload)
        decoded = convert.decode(payload)
        for variant in "abc":
            self.assertEqual(descriptor["variants"][variant]["recordSetSha256"], decoded.variant_record_set_sha256(variant))
            self.assertEqual(descriptor["variants"][variant]["recordSetSha256"], group.pins[group.release_ids[variant]]["recordSetSha256"])

    def test_mutation_campaign_never_escapes_the_error_type_and_stays_at_least_as_strict(self) -> None:
        """Random damage: only SrwfpFormatError escapes, and the repository inspector accepts
        nothing the converter's independent decoder rejects (it may only be stricter)."""
        rng = random.Random(20260929)
        group = v3fx.SyntheticGroup(variants="abc", seed=21, common_count=24)
        v1 = {v: convert.V1Payload(group.v1[v], v) for v in "abc"}
        common, _ = convert.partition({v: v1[v].records for v in v1})
        synthetic, _ = convert.encode_group(
            v1["a"].image_size, v1["a"].source_sha256,
            {v: (v1[v].target_sha256, v1[v].records) for v in v1}, convert.select_canaries(common, v1),
        )
        accepted = rejected = 0
        for base in (self.payload, synthetic):
            header = convert.parse_header(base)
            for iteration in range(300):
                data = bytearray(base)
                kind = iteration % 5
                if kind == 0:  # damage anywhere in the file
                    data[rng.randrange(len(data))] ^= 1 << rng.randrange(8)
                elif kind == 1:  # damage the header fields (hash fields are opaque to inspection)
                    data[rng.randrange(header["headerSize"])] = rng.randrange(256)
                elif kind == 2:  # truncate
                    del data[rng.randrange(len(data)):]
                else:  # valid zlib around a damaged body
                    body = bytearray(convert.inflate_body(base, header))
                    for _ in range(1 + kind - 3):
                        body[rng.randrange(len(body))] = rng.randrange(256)
                    compressor = zlib.compressobj(9, 8, 15, 9)
                    data = bytearray(base[:header["headerSize"]]) + compressor.compress(bytes(body)) + compressor.flush()
                mutated = bytes(data)
                try:
                    convert.decode(mutated)
                    converter_ok = True
                except convert.V3Error:
                    converter_ok = False
                try:
                    verifier.inspect_srwfp_v3(mutated)
                    verifier_ok = True
                except verifier.SrwfpFormatError:
                    verifier_ok = False
                self.assertTrue(converter_ok or not verifier_ok, (iteration, kind))
                accepted += verifier_ok
                rejected += not verifier_ok
        self.assertGreater(rejected, 150)
        self.assertGreater(accepted, 150, "damage to data bytes or opaque hash fields is invisible without the stock")

    def test_descriptor_cache_rechecks_bytes_and_returns_private_copies(self) -> None:
        with mock_patch.object(verifier, "inspect_srwfp_v3", wraps=verifier.inspect_srwfp_v3) as inspect:
            first = verifier.inspect_srwfp_v3_cached(self.payload)
            first["variants"]["a"]["targetSha256"] = "tampered"
            second = verifier.inspect_srwfp_v3_cached(self.payload)
            self.assertEqual(inspect.call_count, 1)
            self.assertEqual(second["variants"]["a"]["targetSha256"], v3fx.GOLDEN_TARGETS["a"])
            with self.assertRaises(verifier.SrwfpFormatError):
                verifier.inspect_srwfp_v3_cached(self.payload + b"\0")
            self.assertEqual(inspect.call_count, 2)

    def test_formats_never_cross(self) -> None:
        v1_patch, _, _ = make_patch(bytes(range(64)), [(2, b"\xf0\xf1")])
        with self.assertRaisesRegex(verifier.SrwfpFormatError, "BAD_MAGIC"):
            verifier.inspect_srwfp_v3(v1_patch)
        with self.assertRaises(verifier.SrwfpFormatError):
            verifier.inspect_srwfp(self.payload)
        with self.assertRaises(verifier.SrwfpFormatError):
            verifier.inspect_srwfp_v2(self.payload)

    def test_canaries_must_be_the_generator_choice(self) -> None:
        group = v3fx.SyntheticGroup()
        v1 = {v: convert.V1Payload(group.v1[v], v) for v in "abc"}
        common, unique = convert.partition({v: v1[v].records for v in v1})
        eligible = [r for r in common if 16 <= r[1] <= 4096]
        rule = [eligible[p] for p in convert.canary_positions(len(eligible))]
        good = [(o, l, v3fx.fake_preimage(o, l)) for o, l, _ in rule]
        self.assertEqual(len(verifier.inspect_srwfp_v3(v3_payload_from_records(common, unique, good))["variants"]), 3)
        first_eight = [(o, l, v3fx.fake_preimage(o, l)) for o, l, _ in eligible[:8]]
        with self.assertRaisesRegex(verifier.SrwfpFormatError, "generator selection rule"):
            verifier.inspect_srwfp_v3(v3_payload_from_records(common, unique, first_eight))
        too_few = good[:7]
        with self.assertRaisesRegex(verifier.SrwfpFormatError, "generator selection rule"):
            verifier.inspect_srwfp_v3(v3_payload_from_records(common, unique, too_few))
        # a record of 4097 bytes is not an eligible canary even though it is a common record
        long_record = next(r for r in common if r[1] == 4097)
        with self.assertRaisesRegex(verifier.SrwfpFormatError, "BAD_CANARY_TABLE"):
            verifier.inspect_srwfp_v3(v3_payload_from_records(common, unique, [(long_record[0], 4097, bytes(32))]))

    def test_partition_must_be_canonical(self) -> None:
        group = v3fx.SyntheticGroup()
        v1 = {v: convert.V1Payload(group.v1[v], v) for v in "abc"}
        common, unique = convert.partition({v: v1[v].records for v in v1})
        eligible = [r for r in common if 16 <= r[1] <= 4096]
        canaries = [(eligible[p][0], eligible[p][1], bytes(32)) for p in convert.canary_positions(len(eligible))]
        canary_offsets = {c[0] for c in canaries}
        movable = next(r for r in common if r[0] not in canary_offsets)
        smaller = [r for r in common if r != movable]
        # `movable` now lives in every variant section instead of in common
        payload = v3_payload_from_records(smaller, {v: sorted(unique[v] + [movable]) for v in unique}, [
            c for c in canaries
        ])
        with self.assertRaisesRegex(verifier.SrwfpFormatError, "NON_CANONICAL_PARTITION"):
            verifier.inspect_srwfp_v3(payload)
        # in only some of the variant sections it is a legitimate variant record
        partial = {v: (sorted(unique[v] + [movable]) if v != "c" else unique[v]) for v in unique}
        verifier.inspect_srwfp_v3(v3_payload_from_records(smaller, partial, canaries))

    def test_download_capture_budget_boundary(self) -> None:
        window = verifier.DOWNLOAD_CAPTURE_CHUNK_BYTES

        def payload_with_windows(count: int) -> bytes:
            # `count` common records, each alone in its own 1 MiB window, plus one variant-b record
            common = [(2 * window * k, 16, bytes([1 + k % 200]) * 16) for k in range(count)]
            canaries = [
                (common[p][0], 16, bytes(32)) for p in convert.canary_positions(len(common))
            ]
            return v3_payload_from_records(common, {"a": [], "b": [(window * 2 * count + 8, 3, b"xyz")]}, canaries)

        limit = verifier.MAX_DOWNLOAD_CAPTURE_BYTES // window
        ok = verifier.inspect_srwfp_v3(payload_with_windows(limit - 1))  # + variant b's own window
        self.assertEqual(ok["variants"]["b"]["capturedBytes"], limit * window)
        self.assertEqual(ok["variants"]["a"]["capturedBytes"], (limit - 1) * window)
        with self.assertRaisesRegex(verifier.SrwfpFormatError, "DOWNLOAD_CAPTURE_TOO_LARGE"):
            verifier.inspect_srwfp_v3(payload_with_windows(limit + 1))


class SyntheticV3ReleaseTests(unittest.TestCase):
    """A converted synthetic font group must pass; every documented tampering must not."""

    template: Path
    group: Any
    _tmp: tempfile.TemporaryDirectory

    @classmethod
    def setUpClass(cls) -> None:
        cls._tmp = tempfile.TemporaryDirectory()
        cls.group = v3fx.SyntheticGroup()
        cls.v1_root = Path(cls._tmp.name).resolve() / "v1"
        cls.template = Path(cls._tmp.name).resolve() / "v3"
        for root in (cls.v1_root, cls.template):
            root.mkdir()
            cls.group.write(root)
        with cls.group.history():
            code, out, err = v3fx.run_cli("install", "--root", str(cls.template), "--group", v3fx.GROUP)
        assert code == 0, (out, err)

    @classmethod
    def tearDownClass(cls) -> None:
        cls._tmp.cleanup()

    def setUp(self) -> None:
        verifier.errors.clear()
        history = self.group.history()
        history.start()
        self.addCleanup(history.stop)
        self.addCleanup(verifier.errors.clear)
        self.rid = {v: self.group.release_ids[v] for v in "abc"}
        self.url = f"patches/{v3fx.GROUP}.v3.srwfp"

    def fresh(self) -> Path:
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        root = Path(directory.name).resolve() / "repo"
        shutil.copytree(self.template, root)
        return root

    def errors_for(self, root: Path) -> list[str]:
        with verifier_root(root):
            verifier.validate_index([path for path in root.rglob("*") if path.is_file()])
            return list(verifier.errors)

    @staticmethod
    def edit_json(path: Path, mutate) -> None:
        data = json.loads(path.read_text(encoding="utf-8"))
        mutate(data)
        path.write_bytes(convert.dump_json(data))

    def relink(self, root: Path, variants: str = "abc") -> None:
        """Keep the hash chain (receipt -> manifest -> index) consistent after an edit."""
        index_path = root / "manifest/releases.json"
        index = json.loads(index_path.read_text(encoding="utf-8"))
        for variant in variants:
            rid = self.rid[variant]
            manifest_path = root / f"releases/{rid}.json"
            self.edit_json(
                manifest_path,
                lambda m, r=rid: m["provenance"].__setitem__(
                    "acceptanceReceiptSha256",
                    hashlib.sha256((root / f"receipts/{r}.acceptance.json").read_bytes()).hexdigest(),
                ),
            )
            for row in index["releases"]:
                if row["id"] == rid:
                    row["manifestSha256"] = hashlib.sha256(manifest_path.read_bytes()).hexdigest()
        index_path.write_bytes(convert.dump_json(index))

    def assertRejected(self, root: Path, message: str) -> None:
        errors = self.errors_for(root)
        self.assertTrue(any(message in error for error in errors), (message, errors))

    def test_converted_synthetic_group_is_clean(self) -> None:
        self.assertEqual(self.errors_for(self.template), [])

    def test_a_v1_group_is_rejected_by_the_font_variant_policy(self) -> None:
        errors = self.errors_for(self.v1_root)
        for variant in "abc":
            self.assertTrue(any(f"release {self.rid[variant]}: an equal-size -a/-b/-c font variant may not use a v1" in e for e in errors), errors)

    def test_v2_rows_and_non_font_rows_are_not_touched_by_the_policy(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            for release_id, patch_format, expect_error in (
                ("srwf-final-20260928-v0-2-a", verifier.PATCH_FORMAT_V2, False),
                ("srwf-f-20260823-v0-3", verifier.PATCH_FORMAT_V1, False),
                ("srwf-f-20261002-v1-0-c", verifier.PATCH_FORMAT_V1, True),
            ):
                write_json(root / f"releases/{release_id}.json", {"patch": {"format": patch_format}})
                game = "srwf-final" if release_id.startswith("srwf-final") else "srwf-f"
                with verifier_root(root):
                    verifier.validate_v3_groups([{"id": release_id, "gameId": game}])
                    self.assertEqual(bool(verifier.errors), expect_error, (release_id, verifier.errors))

    def test_total_srwfp_budget(self) -> None:
        root = self.fresh()
        with mock_patch.object(verifier, "SRWFP_TOTAL_MAX", 1000):
            self.assertRejected(root, "exceeding the 1000-byte repository budget")
        with mock_patch.object(verifier, "SRWFP_TOTAL_MAX", (root / self.url).stat().st_size):
            self.assertEqual(self.errors_for(root), [])
        with mock_patch.object(verifier, "SRWFP_TOTAL_MAX", (root / self.url).stat().st_size - 1):
            self.assertRejected(root, "repository budget")

    def test_manifest_shape_and_url_rules(self) -> None:
        cases = {
            "keys differ (missing=['variant']": lambda m: m["patch"].pop("variant"),
            "keys differ (missing=[], unexpected=['extra']": lambda m: m["patch"].__setitem__("extra", 1),
            "patch variant must be the release id suffix 'a'": lambda m: m["patch"].__setitem__("variant", "b"),
            f"patch URL must be {self.url}": lambda m: m["patch"].__setitem__("url", f"patches/{m['id']}.srwfp"),
            "patch URL must be patches/srwf-f-20261001-v0-9.v3.srwfp": lambda m: m["patch"].__setitem__("url", "patches/other.v3.srwfp"),
            "v3 target filename must end with -a.bin": lambda m: m["target"].__setitem__("filename", "SRWF-KOR-x.bin"),
            "v3 CUE filename must end with -a.cue": lambda m: m["target"].__setitem__("cueFilename", "SRWF-KOR-x.cue"),
            "v3 title must end with (a)": lambda m: m.__setitem__("title", "Synthetic font release"),
            "v3 requires target size equal to source size": lambda m: m["target"].__setitem__("size", m["target"]["size"] + 2352),
            "patch size is outside its hard limits": lambda m: m["patch"].__setitem__("size", 201),
            "patch recordCount is outside its hard limits": lambda m: m["patch"].__setitem__("recordCount", 0),
            "patch bodyUncompressedSize is outside its hard limits": lambda m: m["patch"].__setitem__("bodyUncompressedSize", 2),
            "patch commonRecordCount is outside its hard limits": lambda m: m["patch"].__setitem__("commonRecordCount", 0),
            "v3 variant must be a, b or c": lambda m: m["patch"].__setitem__("variant", "d"),
            "v3 recordCount must be commonRecordCount plus at most": lambda m: m["patch"].__setitem__("recordCount", m["patch"]["commonRecordCount"] + 65_537),
            "patch descriptor recordCount is": lambda m: m["patch"].__setitem__("recordCount", m["patch"]["recordCount"] + 1),
            "patch descriptor commonRecordCount is": lambda m: m["patch"].__setitem__("commonRecordCount", m["patch"]["commonRecordCount"] + 1),
            "patch descriptor bodyUncompressedSize is": lambda m: m["patch"].__setitem__("bodyUncompressedSize", m["patch"]["bodyUncompressedSize"] + 1),
            "patch descriptor patchSize is": lambda m: m["patch"].__setitem__("size", m["patch"]["size"] + 1),
            "keys differ (missing=[], unexpected=['commonRecordCount', 'variant']": lambda m: m["patch"].__setitem__(
                "format", "srwf.sparse-byte-delta.v4"
            ),
        }
        for message, mutate in cases.items():
            with self.subTest(message=message):
                root = self.fresh()
                self.edit_json(root / f"releases/{self.rid['a']}.json", mutate)
                self.relink(root, "a")
                self.assertRejected(root, message)

    def test_receipt_shape_pins_and_evidence_ceiling(self) -> None:
        cases = {
            "keys differ (missing=['patchFormat']": lambda r: r.pop("patchFormat"),
            "keys differ (missing=['supersedes']": lambda r: r.pop("supersedes"),
            "keys differ (missing=['variantId']": lambda r: r.pop("variantId"),
            "keys differ (missing=[], unexpected=['extra']": lambda r: r.__setitem__("extra", 1),
            f"patchFormat must be {verifier.PATCH_FORMAT_V3}": lambda r: r.__setitem__("patchFormat", "srwf.sparse-byte-delta.v1"),
            "variantId must be the release id's -a/-b/-c suffix": lambda r: r.__setitem__("variantId", "b"),
            "supersedes must name a different, earlier payload": lambda r: r["supersedes"].__setitem__("patchSha256", r["patchSha256"]),
            "supersedes recordSetSha256 is invalid": lambda r: r["supersedes"].__setitem__("recordSetSha256", "xyz"),
            "supersedes: keys differ": lambda r: r["supersedes"].pop("decisionAuthority"),
            "supersedes does not match the pinned superseded history": lambda r: r["supersedes"].__setitem__("receiptSha256", "00" * 32),
            "v3 record-set fingerprint differs from the accepted v1 result": lambda r: None,
            "acceptedAt differs from the original acceptance": lambda r: r.__setitem__("acceptedAt", "2026-10-02T09:00:00+09:00"),
            "the evidence ceiling (gates) must stay unchanged": lambda r: r["gates"].__setitem__("longPlayProgression", "PASS"),
            "decisionAuthority must be the pinned v3 redistribution text": lambda r: r.__setitem__("decisionAuthority", "edited"),
            "receipt targetSha256 differs from the v3 header target hash": lambda r: r.__setitem__("targetSha256", "00" * 32),
            "patch hash does not match release manifest": lambda r: r.__setitem__("patchSha256", "00" * 32),
        }
        for message, mutate in cases.items():
            with self.subTest(message=message):
                root = self.fresh()
                if message.startswith("v3 record-set fingerprint"):
                    bad = {k: dict(v) for k, v in self.group.pins.items()}
                    bad[self.rid["a"]]["recordSetSha256"] = "00" * 32
                    with mock_patch.dict(verifier.V3_SUPERSEDED, bad, clear=True):
                        self.assertRejected(root, message)
                    continue
                self.edit_json(root / f"receipts/{self.rid['a']}.acceptance.json", mutate)
                self.relink(root, "a")
                self.assertRejected(root, message)

    def test_v1_or_v2_receipts_must_not_carry_the_v3_keys(self) -> None:
        verifier.errors.clear()
        receipt = {
            "schema": "srwf-kor.acceptance-receipt.v1", "releaseId": "v5-r999", "state": "ACCEPTED",
            "acceptedAt": "2026-08-09T12:34:56Z", "stockProfileId": verifier.STOCK_PROFILE["id"],
            "sourceSha256": verifier.STOCK_PROFILE["sha256"], "targetSha256": "11" * 32, "patchSha256": "22" * 32,
            "v5Commit": "33" * 20,
            "gates": {"staticStructure": "PASS", "runtimeConsumption": "PASS", "visualLayout": "PASS", "longPlayProgression": "PASS"},
            "decisionAuthority": "synthetic", "patchFormat": verifier.PATCH_FORMAT_V3,
        }
        args = dict(
            release_id="v5-r999",
            source={"profileId": verifier.STOCK_PROFILE["id"], "sha256": verifier.STOCK_PROFILE["sha256"]},
            target={"sha256": "11" * 32}, provenance={"v5Commit": "33" * 20},
        )
        for patch_format in (verifier.PATCH_FORMAT_V1, verifier.PATCH_FORMAT_V2):
            verifier.errors.clear()
            verifier.validate_acceptance_receipt(receipt, patch={"sha256": "22" * 32, "format": patch_format}, **args)
            self.assertTrue(any("unexpected=['patchFormat']" in e for e in verifier.errors), verifier.errors)

    def test_group_membership_is_checked_both_ways(self) -> None:
        # a payload variant without an ACCEPTED row
        root = self.fresh()
        index_path = root / "manifest/releases.json"
        self.edit_json(index_path, lambda i: i.__setitem__("releases", [r for r in i["releases"] if r["id"] != self.rid["c"]]))
        for path in (root / f"releases/{self.rid['c']}.json", root / f"receipts/{self.rid['c']}.acceptance.json"):
            path.unlink()
        self.assertRejected(root, "header variant 'c' has no ACCEPTED row")
        # an ACCEPTED row whose variant the payload does not carry
        group = v3fx.SyntheticGroup(variants="ab", seed=3, group="srwf-f-20261003-v1-0")
        with tempfile.TemporaryDirectory() as directory, group.history():
            two = Path(directory).resolve() / "repo"
            two.mkdir()
            group.write(two)
            self.assertEqual(v3fx.run_cli("install", "--root", str(two), "--group", "srwf-f-20261003-v1-0")[0], 0)
            self.assertEqual(self.errors_for(two), [])
            extra_id = "srwf-f-20261003-v1-0-c"
            for kind, suffix in (("releases", ".json"), ("receipts", ".acceptance.json")):
                shutil.copy2(two / kind / f"srwf-f-20261003-v1-0-b{suffix}", two / kind / f"{extra_id}{suffix}")
            self.edit_json(two / f"releases/{extra_id}.json", lambda m: (
                m.__setitem__("id", extra_id), m["patch"].__setitem__("variant", "c"),
                m["target"].__setitem__("filename", "SRWF-KOR-20261001-v0.9-c.bin"),
                m["target"].__setitem__("cueFilename", "SRWF-KOR-20261001-v0.9-c.cue"),
                m.__setitem__("title", "Synthetic font release (c)")))
            self.edit_json(two / f"receipts/{extra_id}.acceptance.json", lambda r: (
                r.__setitem__("releaseId", extra_id), r.__setitem__("variantId", "c")))
            index = json.loads((two / "manifest/releases.json").read_text(encoding="utf-8"))
            index["releases"].append({
                "gameId": "srwf-f", "id": extra_id, "state": "ACCEPTED", "label": index["releases"][0]["label"],
                "manifest": f"releases/{extra_id}.json", "manifestSha256": "0" * 64,
            })
            (two / "manifest/releases.json").write_bytes(convert.dump_json(index))
            with mock_patch.dict(verifier.V3_SUPERSEDED, {**group.pins, extra_id: dict(group.pins["srwf-f-20261003-v1-0-b"])}, clear=True):
                self.assertRejected(two, "ACCEPTED row variant 'c' is missing from the header")

    def test_group_level_rules(self) -> None:
        # rows must not mix v3 with another format
        root = self.fresh()
        v1_manifest = json.loads((self.v1_root / f"releases/{self.rid['c']}.json").read_text(encoding="utf-8"))
        self.edit_json(root / f"releases/{self.rid['c']}.json", lambda m: m.__setitem__("patch", v1_manifest["patch"]))
        self.relink(root, "c")
        self.assertRejected(root, "v3 rows and non-v3 rows must not be mixed")
        # a v3 row that is not part of the redistributed history is refused
        root = self.fresh()
        reduced = {k: v for k, v in self.group.pins.items() if k != self.rid["c"]}
        with mock_patch.dict(verifier.V3_SUPERSEDED, reduced, clear=True):
            self.assertRejected(root, f"release {self.rid['c']}: v3 is limited to the redistributed accepted releases")
        # rows may not disagree on the shared payload fields
        root = self.fresh()
        self.edit_json(root / f"releases/{self.rid['b']}.json", lambda m: m["patch"].__setitem__("bodyUncompressedSize", m["patch"]["bodyUncompressedSize"] + 1))
        self.relink(root, "b")
        self.assertRejected(root, f"v3 payload {self.url}: rows disagree on patch bodyUncompressedSize")
        # the payload URL is derived from the group id
        root = self.fresh()
        moved = "patches/srwf-f-20261001-v0-9-shared.v3.srwfp"
        (root / self.url).rename(root / moved)
        for variant in "abc":
            self.edit_json(root / f"releases/{self.rid[variant]}.json", lambda m: m["patch"].__setitem__("url", moved))
        self.relink(root)
        self.assertRejected(root, f"v3 payload {moved}: URL must be patches/{v3fx.GROUP}.v3.srwfp")

    def test_payload_file_rules(self) -> None:
        root = self.fresh()
        payload_path = root / self.url
        data = payload_path.read_bytes()
        flipped = bytearray(data)
        flipped[-9] ^= 0x01
        payload_path.write_bytes(bytes(flipped))
        self.assertRejected(root, "malformed .srwfp payload")
        payload_path.write_bytes(data + b"\0")
        self.assertRejected(root, "BAD_ZLIB_BODY: not exactly one complete zlib stream")
        payload_path.write_bytes(data[:-1])
        self.assertRejected(root, "malformed .srwfp payload")
        payload_path.unlink()
        self.assertRejected(root, ".srwfp payload is missing")
        root = self.fresh()
        (root / f"patches/{self.rid['a']}.srwfp").write_bytes(self.group.v1["a"])
        self.assertRejected(root, f"unaccepted or unindexed .srwfp payload is forbidden: patches/{self.rid['a']}.srwfp")

    def test_a_payload_that_is_not_the_accepted_result_is_refused(self) -> None:
        """Re-encoding a different record set (one changed byte) breaks the pinned fingerprint."""
        root = self.fresh()
        decoded = convert.decode((root / self.url).read_bytes())
        header = decoded.header
        common = decoded.common_records()
        offset, length, data = common[0]
        changed = [(offset, length, bytes([data[0] ^ 1]) + data[1:])] + common[1:]
        unique = {v: decoded.unique_records(v) for v in "abc"}
        targets = {v: (decoded.variant_target(v), []) for v in "abc"}
        new_header, body, _ = convert.build_header_and_body(
            header["imageSize"], header["sourceSha256"], targets, header["canaries"], common=changed, unique=unique
        )
        payload = new_header + convert.compress_body(body)
        (root / self.url).write_bytes(payload)
        digest = hashlib.sha256(payload).hexdigest()
        for variant in "abc":
            rid = self.rid[variant]
            self.edit_json(root / f"releases/{rid}.json", lambda m: (m["patch"].__setitem__("sha256", digest), m["patch"].__setitem__("size", len(payload))))
            self.edit_json(root / f"receipts/{rid}.acceptance.json", lambda r: r.__setitem__("patchSha256", digest))
        self.relink(root)
        self.assertRejected(root, "v3 record-set fingerprint differs from the accepted v1 result")


def schema_errors(schema: dict[str, Any], value: Any, path: str = "$") -> list[str]:
    """A small JSON Schema (2020-12 subset) checker for exactly the keywords our schemas use.

    Enough to prove the oneOf / if-then / dependentRequired contracts behave, without a
    third-party validator (the repository is dependency-free)."""
    import re

    errors: list[str] = []
    types = {
        "object": lambda v: isinstance(v, dict), "string": lambda v: isinstance(v, str),
        "array": lambda v: isinstance(v, list), "null": lambda v: v is None,
        "integer": lambda v: isinstance(v, int) and not isinstance(v, bool),
    }
    if "type" in schema:
        wanted = schema["type"] if isinstance(schema["type"], list) else [schema["type"]]
        if not any(types[name](value) for name in wanted):
            return [f"{path}: type {wanted}"]
    if "const" in schema and value != schema["const"]:
        errors.append(f"{path}: const")
    if "enum" in schema and value not in schema["enum"]:
        errors.append(f"{path}: enum")
    if isinstance(value, str):
        if "pattern" in schema and re.search(schema["pattern"], value) is None:
            errors.append(f"{path}: pattern")
        if "minLength" in schema and len(value) < schema["minLength"]:
            errors.append(f"{path}: minLength")
        if "maxLength" in schema and len(value) > schema["maxLength"]:
            errors.append(f"{path}: maxLength")
    if isinstance(value, int) and not isinstance(value, bool):
        if "minimum" in schema and value < schema["minimum"]:
            errors.append(f"{path}: minimum")
        if "maximum" in schema and value > schema["maximum"]:
            errors.append(f"{path}: maximum")
        if "multipleOf" in schema and value % schema["multipleOf"]:
            errors.append(f"{path}: multipleOf")
    if isinstance(value, dict):
        for key in schema.get("required", []):
            if key not in value:
                errors.append(f"{path}: required {key}")
        properties = schema.get("properties", {})
        if schema.get("additionalProperties") is False:
            errors += [f"{path}: additional {key}" for key in value if key not in properties]
        for key, sub in properties.items():
            if key in value:
                errors += schema_errors(sub, value[key], f"{path}.{key}")
        for key, needed in schema.get("dependentRequired", {}).items():
            if key in value:
                errors += [f"{path}: {key} requires {name}" for name in needed if name not in value]
    if "oneOf" in schema:
        matches = [sub for sub in schema["oneOf"] if not schema_errors(sub, value, path)]
        if len(matches) != 1:
            errors.append(f"{path}: oneOf matched {len(matches)}")
    for sub in schema.get("allOf", []):
        if not schema_errors(sub["if"], value, path):
            errors += schema_errors(sub["then"], value, path)
    return errors


class SchemaSemanticsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.release = json.loads((PROJECT_ROOT / "schemas/release.schema.json").read_text(encoding="utf-8"))
        cls.receipt = json.loads((PROJECT_ROOT / "schemas/acceptance-receipt.schema.json").read_text(encoding="utf-8"))
        cls.descriptor = json.loads((PROJECT_ROOT / "schemas/patch-descriptor-v3.schema.json").read_text(encoding="utf-8"))
        cls._tmp = tempfile.TemporaryDirectory()
        cls.group = v3fx.SyntheticGroup()
        cls.root = Path(cls._tmp.name).resolve() / "v3"
        cls.root.mkdir()
        cls.group.write(cls.root)
        with cls.group.history():
            assert v3fx.run_cli("install", "--root", str(cls.root), "--group", v3fx.GROUP)[0] == 0
        cls.rid = cls.group.release_ids["b"]

    @classmethod
    def tearDownClass(cls) -> None:
        cls._tmp.cleanup()

    def manifest(self) -> dict[str, Any]:
        return json.loads((self.root / f"releases/{self.rid}.json").read_text(encoding="utf-8"))

    def receipt_doc(self) -> dict[str, Any]:
        return json.loads((self.root / f"receipts/{self.rid}.acceptance.json").read_text(encoding="utf-8"))

    def test_the_checker_itself_rejects_and_accepts(self) -> None:
        self.assertEqual(schema_errors({"type": "object", "required": ["a"], "additionalProperties": False, "properties": {"a": {"type": "integer", "minimum": 2}}}, {"a": 2}), [])
        self.assertTrue(schema_errors({"type": "object", "properties": {"a": {"type": "integer", "minimum": 2}}}, {"a": 1}))
        self.assertTrue(schema_errors({"oneOf": [{"type": "string"}, {"type": "string", "pattern": "x"}]}, "x"))

    def test_v1_v2_and_v3_manifests_and_receipts_satisfy_their_schemas(self) -> None:
        self.assertEqual(schema_errors(self.release, self.manifest()), [])
        self.assertEqual(schema_errors(self.receipt, self.receipt_doc()), [])
        self.assertEqual(schema_errors(self.release, json.loads((self.group.files[f"releases/{self.rid}.json"]))), [])
        self.assertEqual(schema_errors(self.receipt, json.loads((self.group.files[f"receipts/{self.rid}.acceptance.json"]))), [])
        for path in sorted((PROJECT_ROOT / "releases").glob("*.json")):
            manifest = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(schema_errors(self.release, manifest), [], path.name)
        for path in sorted((PROJECT_ROOT / "receipts").glob("*.json")):
            self.assertEqual(schema_errors(self.receipt, json.loads(path.read_text(encoding="utf-8"))), [], path.name)

    def test_manifest_patch_object_is_a_closed_six_or_eight_key_choice(self) -> None:
        def broken(mutate) -> list[str]:
            manifest = self.manifest()
            mutate(manifest)
            return schema_errors(self.release, manifest)

        cases = {
            "v3 without variant": lambda m: m["patch"].pop("variant"),
            "v3 without commonRecordCount": lambda m: m["patch"].pop("commonRecordCount"),
            "v3 with an extra key": lambda m: m["patch"].__setitem__("extra", 1),
            "v3 with a v1-style url": lambda m: m["patch"].__setitem__("url", "patches/srwf-f-20261001-v0-9-b.srwfp"),
            "v3 variant d": lambda m: m["patch"].__setitem__("variant", "d"),
            "v3 patch too small": lambda m: m["patch"].__setitem__("size", 201),
            "v3 patch too large": lambda m: m["patch"].__setitem__("size", 50_331_649),
            "v3 unequal target size": lambda m: m["target"].__setitem__("size", 578_512_032 + 2352),
            "v1 format with eight keys": lambda m: m["patch"].__setitem__("format", "srwf.sparse-byte-delta.v1"),
            "v3 format with six keys": lambda m: (m["patch"].pop("variant"), m["patch"].pop("commonRecordCount"), m["patch"].__setitem__("url", "patches/x.srwfp")),
            "unknown format": lambda m: m["patch"].__setitem__("format", "srwf.sparse-byte-delta.v4"),
        }
        for name, mutate in cases.items():
            with self.subTest(name=name):
                self.assertTrue(broken(mutate), name)

    def test_receipt_v3_keys_are_all_or_none_and_closed(self) -> None:
        def broken(mutate) -> list[str]:
            receipt = self.receipt_doc()
            mutate(receipt)
            return schema_errors(self.receipt, receipt)

        cases = {
            "patchFormat alone": lambda r: (r.pop("variantId"), r.pop("supersedes")),
            "variantId alone": lambda r: (r.pop("patchFormat"), r.pop("supersedes")),
            "supersedes alone": lambda r: (r.pop("patchFormat"), r.pop("variantId")),
            "supersedes missing": lambda r: r.pop("supersedes"),
            "supersedes with an extra key": lambda r: r["supersedes"].__setitem__("extra", "x"),
            "supersedes missing recordSetSha256": lambda r: r["supersedes"].pop("recordSetSha256"),
            "supersedes bad hash": lambda r: r["supersedes"].__setitem__("patchSha256", "zz"),
            "patchFormat v1": lambda r: r.__setitem__("patchFormat", "srwf.sparse-byte-delta.v1"),
            "variantId d": lambda r: r.__setitem__("variantId", "d"),
            "unknown top-level key": lambda r: r.__setitem__("other", 1),
        }
        for name, mutate in cases.items():
            with self.subTest(name=name):
                self.assertTrue(broken(mutate), name)
        old = json.loads(self.group.files[f"receipts/{self.rid}.acceptance.json"])
        self.assertEqual(schema_errors(self.receipt, old), [], "the pre-v3 receipt form stays valid")

    def test_descriptor_v3_has_exactly_the_eleven_keys(self) -> None:
        descriptor = {
            "patchSize": 22_152_354, "patchSha256": "a" * 64, "sourceSize": 578_512_032, "sourceSha256": "b" * 64,
            "targetSize": 578_512_032, "targetSha256": "c" * 64, "recordCount": 1_330_782,
            "bodyUncompressedSize": 39_438_740, "format": "srwf.sparse-byte-delta.v3", "variant": "a",
            "commonRecordCount": 1_330_116,
        }
        self.assertEqual(schema_errors(self.descriptor, descriptor), [])
        self.assertEqual(len(descriptor), 11)
        for key in descriptor:
            with self.subTest(missing=key):
                self.assertTrue(schema_errors(self.descriptor, {k: v for k, v in descriptor.items() if k != key}))
        self.assertTrue(schema_errors(self.descriptor, {**descriptor, "extra": 1}))
        self.assertTrue(schema_errors(self.descriptor, {**descriptor, "format": "srwf.sparse-byte-delta.v2"}))
        self.assertTrue(schema_errors(self.descriptor, {**descriptor, "variant": "d"}))
        self.assertTrue(schema_errors(self.descriptor, {**descriptor, "patchSize": 201}))


class V3RepositoryContractTests(unittest.TestCase):
    def test_required_files_schemas_and_scripts_are_in_lockstep(self) -> None:
        for name in (
            "assets/patch-core-v3.mjs", "docs/PATCH_FORMAT_V3.md", "docs/V3_REDISTRIBUTION.md",
            "schemas/patch-descriptor-v3.schema.json", "scripts/convert_to_v3.py", "tests/test_convert_to_v3.py",
        ):
            self.assertIn(name, verifier.REQUIRED_FILES)
        package = json.loads((PROJECT_ROOT / "package.json").read_text(encoding="utf-8"))
        self.assertEqual(package["scripts"], verifier.EXPECTED_PACKAGE_SCRIPTS)
        for key in ("build", "test"):
            self.assertIn("tests/test_verify_repo.py tests/test_convert_to_v3.py", package["scripts"][key])

    def test_v3_schema_contract_detects_weakening(self) -> None:
        def broken(mutate, file_name: str) -> list[str]:
            with tempfile.TemporaryDirectory() as directory:
                root = Path(directory).resolve()
                copy_schema_files(root)
                path = root / "schemas" / file_name
                document = json.loads(path.read_text(encoding="utf-8"))
                mutate(document)
                write_json(path, document)
                with verifier_root(root):
                    verifier.validate_schema_documents()
                    return list(verifier.errors)

        cases = {
            "release: v3 patch keys weakened": (
                lambda d: d["properties"]["patch"]["oneOf"][1]["properties"].__setitem__("variant", {"type": "string"}),
                "release.schema.json",
            ),
            "release: oneOf collapsed": (
                lambda d: d["properties"].__setitem__("patch", d["properties"]["patch"]["oneOf"][0]),
                "release.schema.json",
            ),
            "release: v3 size rule dropped": (lambda d: d["allOf"].pop(), "release.schema.json"),
            "release: v3 url pattern loosened": (
                lambda d: d["properties"]["patch"]["oneOf"][1]["properties"]["url"].__setitem__("pattern", ".*"),
                "release.schema.json",
            ),
            "receipt: dependentRequired removed": (lambda d: d.pop("dependentRequired"), "acceptance-receipt.schema.json"),
            "receipt: supersedes opened": (
                lambda d: d["properties"]["supersedes"].__setitem__("additionalProperties", True),
                "acceptance-receipt.schema.json",
            ),
            "receipt: supersedes key dropped": (
                lambda d: d["properties"]["supersedes"]["required"].remove("recordSetSha256"),
                "acceptance-receipt.schema.json",
            ),
            "receipt: variantId widened": (
                lambda d: d["properties"]["variantId"].__setitem__("enum", ["a", "b", "c", "d"]),
                "acceptance-receipt.schema.json",
            ),
            "descriptor v3: minimum lowered": (
                lambda d: d["properties"]["patchSize"].__setitem__("minimum", 1), "patch-descriptor-v3.schema.json"
            ),
            "descriptor v3: key removed": (
                lambda d: (d["required"].remove("variant"), d["properties"].pop("variant")),
                "patch-descriptor-v3.schema.json",
            ),
        }
        for name, (mutate, file_name) in cases.items():
            with self.subTest(name=name):
                errors = broken(mutate, file_name)
                self.assertTrue(any("out of sync" in e or "must be a closed" in e for e in errors), errors)

    def test_real_schemas_pass_their_own_pins(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            copy_schema_files(root)
            with verifier_root(root):
                verifier.validate_schema_documents()
                self.assertEqual(verifier.errors, [])

    def test_superseded_history_is_complete_and_consistent(self) -> None:
        groups = {}
        for release_id, entry in verifier.V3_SUPERSEDED.items():
            self.assertRegex(release_id, verifier.FONT_RELEASE_ID_PATTERN.pattern)
            self.assertEqual(
                set(entry),
                {"acceptedAt", "receiptSha256", "patchSha256", "recordSetSha256", "targetSha256",
                 "longPlayProgression", "decisionAuthority"},
            )
            for key in ("receiptSha256", "patchSha256", "recordSetSha256", "targetSha256"):
                self.assertTrue(verifier.is_hex64(entry[key]), (release_id, key))
            self.assertTrue(verifier.is_rfc3339_datetime(entry["acceptedAt"]))
            self.assertEqual(entry["longPlayProgression"], "NOT_CLAIMED")
            groups.setdefault(verifier.FONT_RELEASE_ID_PATTERN.fullmatch(release_id).group(1), []).append(release_id[-1])
        self.assertEqual({g: sorted(v) for g, v in groups.items()}, {
            "srwf-f-20260915-v0-4": ["a", "b", "c"], "srwf-f-20260928-v0-5": ["a", "b", "c"],
        })
        self.assertEqual(len({e["patchSha256"] for e in verifier.V3_SUPERSEDED.values()}), 6)
        self.assertEqual(len({e["recordSetSha256"] for e in verifier.V3_SUPERSEDED.values()}), 6)
        self.assertEqual(verifier.V3_SUPERSEDED_ANCHOR_COMMIT, "3cb5e690e7a8a629962719d80f909e7cc1dd6722")


if __name__ == "__main__":
    unittest.main()
