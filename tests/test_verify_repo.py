#!/usr/bin/env python3
"""Synthetic regression tests for dependency-free release promotion checks."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import shutil
import struct
import sys
import tempfile
import unittest
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

    def test_missing_schema_field_and_failed_gate_are_rejected(self) -> None:
        missing = dict(self.receipt)
        missing.pop("acceptedAt")
        self.validate(missing)
        self.assertTrue(any("missing" in error and "acceptedAt" in error for error in verifier.errors))

        verifier.errors.clear()
        failed = dict(self.receipt)
        failed["gates"] = {**self.receipt["gates"], "visualLayout": "FAIL"}
        self.validate(failed)
        self.assertTrue(any("four exact acceptance gates" in error for error in verifier.errors))

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


if __name__ == "__main__":
    unittest.main()
