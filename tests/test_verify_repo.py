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


if __name__ == "__main__":
    unittest.main()
