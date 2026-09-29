#!/usr/bin/env python3
"""Synthetic tests for scripts/split_font_variants.py (no game data)."""

from __future__ import annotations

from contextlib import contextmanager, redirect_stdout
import hashlib
import io
import json
from pathlib import Path
import random
import shutil
import struct
import subprocess
import sys
import tempfile
import unittest
import zlib

sys.dont_write_bytecode = True
PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from scripts import split_font_variants as split  # noqa: E402
from scripts import verify_repo as verifier  # noqa: E402

GROUP = "srwf-f-20990101-v9-9"
REVISIONS = ("a", "b", "c")
SIZE = 3 * 2352 * 8  # 56,448 bytes: spans several stream chunks when the chunk is small


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def maximal_runs(source: bytes, target: bytes) -> list[tuple[int, int]]:
    runs, start = [], None
    for index, (left, right) in enumerate(zip(source, target)):
        if left != right and start is None:
            start = index
        elif left == right and start is not None:
            runs.append((start, index))
            start = None
    if start is not None:
        runs.append((start, len(source)))
    return runs


def v1_patch(source: bytes, target: bytes) -> tuple[bytes, int, int]:
    runs = maximal_runs(source, target)
    body = b"".join(
        struct.pack(">QI", start, end - start) + hashlib.sha256(source[start:end]).digest()
        + target[start:end]
        for start, end in runs
    )
    header = split.encode_header(len(runs), len(source), len(body), sha(source), sha(target))
    return header + zlib.compress(body, 9), len(runs), len(body)


def edit(image: bytearray, start: int, length: int, salt: int) -> None:
    for index in range(start, start + length):
        image[index] ^= ((index * 7 + salt) & 0xFF) | 1


def synthetic_images(unique_edits: dict[str, list[tuple[int, int]]] | None = None) -> tuple[bytes, dict[str, bytes], bytes]:
    rng = random.Random(1234)
    stock = bytes(rng.randrange(256) for _ in range(SIZE))
    common = bytearray(stock)
    for start, length in [(10, 20), (4000, 1), (9000, 300), (30_000, 64), (SIZE - 5, 5)]:
        edit(common, start, length, 0x21)
    unique_edits = unique_edits or {
        "a": [(2_000, 16), (40_000, 3)],
        "b": [(2_000, 16), (41_000, 30)],
        "c": [(2_100, 8), (45_000, 100), (50_000, 1)],
    }
    targets = {}
    for revision, edits in unique_edits.items():
        image = bytearray(common)
        for start, length in edits:
            edit(image, start, length, ord(revision))
        targets[revision] = bytes(image)
    return stock, targets, bytes(common)


def write_json(path: Path, value: object) -> bytes:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    path.write_bytes(data)
    return data


def build_repo(root: Path, stock: bytes, targets: dict[str, bytes]) -> dict[str, str]:
    profile = synthetic_profile(stock)
    shutil.copytree(PROJECT_ROOT / "schemas", root / "schemas")
    rows, hashes = [], {}
    for revision, target in targets.items():
        release_id = f"{GROUP}-{revision}"
        payload, count, body_size = v1_patch(stock, target)
        (root / "patches").mkdir(exist_ok=True)
        (root / f"patches/{release_id}.srwfp").write_bytes(payload)
        receipt = {
            "schema": "srwf-kor.acceptance-receipt.v1",
            "releaseId": release_id,
            "state": "ACCEPTED",
            "acceptedAt": "2099-01-01T00:00:00Z",
            "stockProfileId": profile["id"],
            "sourceSha256": profile["sha256"],
            "targetSha256": sha(target),
            "patchSha256": sha(payload),
            "v5Commit": "33" * 20,
            "gates": {
                "staticStructure": "PASS",
                "runtimeConsumption": "PASS",
                "visualLayout": "PASS",
                "longPlayProgression": "NOT_CLAIMED",
            },
            "decisionAuthority": "synthetic original authority",
        }
        receipt_bytes = write_json(root / f"receipts/{release_id}.acceptance.json", receipt)
        manifest = {
            "schema": "srwf-kor.public-release.v1",
            "id": release_id,
            "state": "ACCEPTED",
            "version": "v9.9",
            "title": f"Synthetic font variant {revision}",
            "publishedAt": "2099-01-01T00:00:00Z",
            "source": {"profileId": profile["id"], "size": profile["size"], "sha256": profile["sha256"]},
            "target": {
                "filename": f"SYN-{revision}.bin",
                "cueFilename": f"SYN-{revision}.cue",
                "size": len(target),
                "sha256": sha(target),
            },
            "patch": {
                "format": "srwf.sparse-byte-delta.v1",
                "size": len(payload),
                "sha256": sha(payload),
                "recordCount": count,
                "bodyUncompressedSize": body_size,
                "url": f"patches/{release_id}.srwfp",
            },
            "provenance": {
                "v5Commit": "33" * 20,
                "buildReceiptSha256": "44" * 32,
                "acceptanceReceiptSha256": sha(receipt_bytes),
            },
        }
        manifest_bytes = write_json(root / f"releases/{release_id}.json", manifest)
        hashes[release_id] = sha(payload)
        rows.append({
            "gameId": "srwf-f",
            "id": release_id,
            "state": "ACCEPTED",
            "label": "2099.01.01 · v9.9",
            "manifest": f"releases/{release_id}.json",
            "manifestSha256": sha(manifest_bytes),
        })
    write_json(root / "manifest/releases.json", {
        "$schema": "../schemas/releases.schema.json",
        "schema": "srwf-kor.public-release-index.v2",
        "project": {"id": "srwf-kor-v5", "status": "HAS_ACCEPTED_RELEASE"},
        "games": [
            {"id": "srwf-f", "label": "슈퍼로봇대전 F", "status": "HAS_ACCEPTED_RELEASE",
             "defaultReleaseId": f"{GROUP}-a"},
            {"id": "srwf-final", "label": "슈퍼로봇대전 F 완결편", "status": "NO_ACCEPTED_RELEASE",
             "defaultReleaseId": None},
        ],
        "stock_profiles": [{"gameId": "srwf-f", **profile, "label": "Synthetic stock"}],
        "releases": rows,
    })
    return hashes


def synthetic_profile(stock: bytes) -> dict[str, object]:
    return {
        "id": "synthetic-stock-profile",
        "size": len(stock),
        "sha256": sha(stock),
        "sectorCount": len(stock) // 2352,
        "sectorSize": 2352,
        "userDataOffset": 16,
        "userDataSize": 2048,
        "track": "TRACK 01 MODE1/2352",
    }


@contextmanager
def synthetic_world(stock: bytes):
    profile = synthetic_profile(stock)
    saved = (
        verifier.STOCK_PROFILES_BY_GAME, verifier.PINNED_STOCK_PROFILES,
        split.LAYERED_GROUPS, split.STREAM_CHUNK_BYTES,
    )
    verifier.STOCK_PROFILES_BY_GAME = {**saved[0], "srwf-f": profile}
    verifier.PINNED_STOCK_PROFILES = {profile["id"]: {"gameId": "srwf-f", **profile}}
    split.LAYERED_GROUPS = {GROUP: REVISIONS}
    split.STREAM_CHUNK_BYTES = 4096  # records straddle chunk boundaries
    try:
        yield
    finally:
        (verifier.STOCK_PROFILES_BY_GAME, verifier.PINNED_STOCK_PROFILES,
         split.LAYERED_GROUPS, split.STREAM_CHUNK_BYTES) = saved


def snapshot(root: Path) -> dict[str, bytes]:
    return {
        path.relative_to(root).as_posix(): path.read_bytes()
        for path in sorted(root.rglob("*")) if path.is_file()
    }


def quiet(function, *args, **kwargs):
    buffer = io.StringIO()
    with redirect_stdout(buffer):
        result = function(*args, **kwargs)
    return result, buffer.getvalue()


NODE_AVAILABLE = shutil.which("node") is not None


class SplitLogicTests(unittest.TestCase):
    def records(self, stock: bytes, target: bytes) -> split.RecordSet:
        payload, _, _ = v1_patch(stock, target)
        return split.parse_payload(payload, "synthetic").records

    def test_split_partitions_exact_records(self) -> None:
        stock, targets, _ = synthetic_images()
        sets = [self.records(stock, targets[r]) for r in REVISIONS]
        result = split.split_records(sets)
        self.assertEqual(len(result.common), 5)
        # a and b edit the same span identically only if their bytes match; salts differ, so no.
        self.assertEqual([len(u) for u in result.unique], [2, 2, 3])
        for records, unique in zip(sets, result.unique):
            self.assertEqual(len(result.common) + len(unique), len(records))

    def test_disjointness_rejects_overlap_and_abutment(self) -> None:
        base = [(10, 20), (100, 110)]
        split.check_layers_disjoint(base, [(21, 30), (111, 120)], "ok")
        for font in ([(15, 25)], [(20, 25)], [(5, 10)], [(0, 200)], [(110, 111)]):
            with self.subTest(font=font), self.assertRaises(split.SplitError):
                split.check_layers_disjoint(base, font, "bad")

    def test_canonical_layer_rules(self) -> None:
        split.check_canonical_layer([(0, 1), (2, 3)], 10, "ok")
        for spans in ([], [(0, 1), (1, 2)], [(0, 3), (2, 4)], [(5, 5)], [(8, 11)]):
            with self.subTest(spans=spans), self.assertRaises(split.SplitError):
                split.check_canonical_layer(spans, 10, "bad")

    def test_variant_without_unique_records_is_refused(self) -> None:
        stock, targets, common = synthetic_images()
        sets = [self.records(stock, targets["a"]), self.records(stock, common), self.records(stock, targets["c"])]
        variants = [
            split.Variant(f"{GROUP}-{r}", r, {}, b"", {"source": {"size": SIZE}}, b"", {},
                          Path("unused"), split.ParsedPayload({}, records))
            for r, records in zip(REVISIONS, sets)
        ]
        with self.assertRaisesRegex(split.SplitError, "at least one record"):
            split.plan_group(GROUP, variants)

    def test_streaming_checks_preimage_non_differing_and_intermediate(self) -> None:
        stock, targets, common = synthetic_images()
        sets = [self.records(stock, targets[r]) for r in REVISIONS]
        result = split.split_records(sets)

        def run(source: bytes, base_records=None):
            chunks = [source[i:i + 1000] for i in range(0, len(source), 1000)]
            return split.stream_layers(
                chunks, SIZE,
                split.LayerStream("base", base_records or sets[0], None if base_records else result.common),
                [split.LayerStream(r, rs, u) for r, rs, u in zip(REVISIONS, sets, result.unique)],
            )

        chain = run(stock)
        self.assertEqual(chain.source_sha256, sha(stock))
        self.assertEqual(chain.intermediate_sha256, sha(common))
        self.assertEqual(chain.target_sha256, [sha(targets[r]) for r in REVISIONS])

        tampered = bytearray(stock)
        tampered[9005] ^= 1  # inside a common (base) record
        with self.assertRaisesRegex(split.SplitError, "preimage"):
            run(bytes(tampered))
        tampered = bytearray(stock)
        tampered[45_050] ^= 1  # inside a font-c record: checked against the intermediate
        with self.assertRaisesRegex(split.SplitError, "preimage"):
            run(bytes(tampered))

        # A base layer that carries an unchanged byte violates the canonical form.
        bad_target = bytearray(common)
        bad_body = split.build_body(sets[0], result.common)
        payload = split.encode_header(len(result.common), SIZE, len(bad_body), sha(stock), sha(common))
        records = split.parse_payload(payload + zlib.compress(bad_body), "base").records
        mutable = bytearray(records.body)
        first_target = records.positions[0] + split.RECORD_HEADER
        mutable[first_target] = stock[records.offsets[0]]
        records.body = bytes(mutable)
        del bad_target
        with self.assertRaisesRegex(split.SplitError, "unchanged byte"):
            run(stock, records)


class SplitEndToEndTests(unittest.TestCase):
    def run_split(self, root: Path, stock_path: Path | None, *, dry_run=False) -> tuple[int, str]:
        return quiet(
            split.run, root, [GROUP], stock_path, dry_run=dry_run,
            browser_check=NODE_AVAILABLE,
        )

    def test_generated_layers_reproduce_every_accepted_target_and_pass_verify_repo(self) -> None:
        stock, targets, common = synthetic_images()
        with tempfile.TemporaryDirectory() as directory, synthetic_world(stock):
            root = Path(directory) / "repo"
            root.mkdir()
            old_payload_hashes = build_repo(root, stock, targets)
            stock_path = Path(directory) / "stock.img"
            stock_path.write_bytes(stock)
            before = snapshot(root)

            # Dry run writes nothing and needs no stock.
            code, output = self.run_split(root, None, dry_run=True)
            self.assertEqual(code, 0)
            self.assertIn("DRY RUN total", output)
            self.assertEqual(snapshot(root), before)

            code, output = self.run_split(root, stock_path)
            self.assertEqual(code, 0, output)
            self.assertIn("installed", output)
            if NODE_AVAILABLE:
                self.assertIn("browserDownloadReapply", output)

            base_ref = verifier.layered_base_patch_reference(GROUP)
            base = (root / base_ref).read_bytes()
            base_info = verifier.inspect_srwfp(base)
            self.assertEqual(base_info["sourceSha256"], sha(stock))
            self.assertEqual(base_info["targetSha256"], sha(common))
            for revision in REVISIONS:
                release_id = f"{GROUP}-{revision}"
                self.assertFalse((root / f"patches/{release_id}.srwfp").exists())
                font = (root / verifier.layered_font_patch_reference(release_id)).read_bytes()
                font_info = verifier.inspect_srwfp(font)
                self.assertEqual(font_info["sourceSha256"], sha(common))
                self.assertEqual(font_info["targetSha256"], sha(targets[revision]))
                # Independent re-application in plain Python.
                image = bytearray(stock)
                for payload in (base, font):
                    body = zlib.decompress(payload[100:])
                    position = 0
                    while position < len(body):
                        offset, length = struct.unpack_from(">QI", body, position)
                        image[offset:offset + length] = body[position + 44:position + 44 + length]
                        position += 44 + length
                self.assertEqual(sha(bytes(image)), sha(targets[revision]))

                manifest = json.loads((root / f"releases/{release_id}.json").read_text(encoding="utf-8"))
                self.assertNotIn("patch", manifest)
                self.assertEqual(list(manifest)[8:10], ["patchLayers", "intermediate"])
                self.assertEqual(manifest["intermediate"], {"size": SIZE, "sha256": sha(common)})
                self.assertEqual(manifest["target"]["sha256"], sha(targets[revision]))
                self.assertEqual([layer["role"] for layer in manifest["patchLayers"]], ["base", "font"])
                receipt_bytes = (root / f"receipts/{release_id}.acceptance.json").read_bytes()
                self.assertEqual(manifest["provenance"]["acceptanceReceiptSha256"], sha(receipt_bytes))
                receipt = json.loads(receipt_bytes)
                self.assertNotIn("patchSha256", receipt)
                self.assertEqual(receipt["targetSha256"], sha(targets[revision]))
                self.assertEqual(receipt["basePatchSha256"], sha(base))
                self.assertEqual(receipt["fontPatchSha256"], sha(font))
                self.assertEqual(receipt["intermediateSha256"], sha(common))
                self.assertEqual(receipt["decisionAuthority"], split.DECISION_AUTHORITY)
                self.assertEqual(receipt["gates"]["longPlayProgression"], "NOT_CLAIMED")
                self.assertEqual(receipt["acceptedAt"], "2099-01-01T00:00:00Z")
                self.assertEqual(receipt["supersedes"]["patchSha256"], old_payload_hashes[release_id])
                self.assertEqual(
                    receipt["supersedes"]["receiptSha256"],
                    sha(before[f"receipts/{release_id}.acceptance.json"]),
                )
                self.assertEqual(receipt["supersedes"]["decisionAuthority"], "synthetic original authority")

            # verify_repo accepts the generated layered tree as a whole.
            with verifier_root(root):
                verifier.validate_index([p for p in root.rglob("*") if p.is_file()])
                self.assertEqual(verifier.errors, [])

            # A second run is a no-op.
            after = snapshot(root)
            code, output = self.run_split(root, stock_path)
            self.assertEqual(code, 0)
            self.assertIn("already layered", output)
            self.assertEqual(snapshot(root), after)

            # Byte-deterministic: the same inputs give the same files.
            second = Path(directory) / "repo2"
            second.mkdir()
            build_repo(second, stock, targets)
            code, _ = quiet(split.run, second, [GROUP], stock_path, dry_run=False,
                            browser_check=False)
            self.assertEqual(code, 0)
            self.assertEqual(snapshot(second), after)

    def test_wrong_stock_or_partial_state_is_refused_without_changes(self) -> None:
        stock, targets, _ = synthetic_images()
        with tempfile.TemporaryDirectory() as directory, synthetic_world(stock):
            root = Path(directory) / "repo"
            root.mkdir()
            build_repo(root, stock, targets)
            before = snapshot(root)
            wrong = bytearray(stock)
            wrong[20_000] ^= 1  # outside every record: only the stock hash notices
            wrong_path = Path(directory) / "wrong.img"
            wrong_path.write_bytes(bytes(wrong))
            with self.assertRaisesRegex(split.SplitError, "stock SHA-256"):
                quiet(split.run, root, [GROUP], wrong_path, dry_run=False, browser_check=False)
            self.assertEqual(snapshot(root), before)

            short_path = Path(directory) / "short.img"
            short_path.write_bytes(stock[:-1])
            with self.assertRaisesRegex(split.SplitError, "bytes, expected"):
                quiet(split.run, root, [GROUP], short_path, dry_run=False, browser_check=False)
            with self.assertRaisesRegex(split.SplitError, "--stock is required"):
                quiet(split.run, root, [GROUP], None, dry_run=False, browser_check=False)

            # A tampered accepted payload is refused against its manifest.
            payload_path = root / f"patches/{GROUP}-b.srwfp"
            payload_path.write_bytes(payload_path.read_bytes()[:-1] + b"\0")
            with self.assertRaisesRegex(split.SplitError, "payload size/SHA-256"):
                quiet(split.run, root, [GROUP], None, dry_run=True)
            payload_path.write_bytes(before[f"patches/{GROUP}-b.srwfp"])

            # Leftover layered files without layered manifests: refuse.
            (root / verifier.layered_base_patch_reference(GROUP)).write_bytes(b"partial")
            with self.assertRaisesRegex(split.SplitError, "already exist"):
                quiet(split.run, root, [GROUP], None, dry_run=True)

    def test_failed_post_install_verification_restores_the_previous_tree(self) -> None:
        stock, targets, _ = synthetic_images()
        with tempfile.TemporaryDirectory() as directory, synthetic_world(stock):
            root = Path(directory) / "repo"
            root.mkdir()
            build_repo(root, stock, targets)
            stock_path = Path(directory) / "stock.img"
            stock_path.write_bytes(stock)
            before = snapshot(root)
            original = split.verify_installed

            def failing(_root: Path) -> None:
                raise split.SplitError("synthetic verification failure")

            split.verify_installed = failing
            try:
                with self.assertRaisesRegex(split.SplitError, "synthetic verification failure"):
                    quiet(split.run, root, [GROUP], stock_path, dry_run=False, browser_check=False)
            finally:
                split.verify_installed = original
            self.assertEqual(snapshot(root), before)


@contextmanager
def verifier_root(root: Path):
    original = (verifier.ROOT, verifier.INDEX_PATH)
    verifier.ROOT, verifier.INDEX_PATH = root, root / "manifest/releases.json"
    verifier.errors.clear()
    try:
        yield
    finally:
        verifier.ROOT, verifier.INDEX_PATH = original
        verifier.errors.clear()


class CommandLineTests(unittest.TestCase):
    def test_unknown_group_is_rejected_by_the_cli(self) -> None:
        completed = subprocess.run(
            [sys.executable, str(PROJECT_ROOT / "scripts/split_font_variants.py"),
             "--dry-run", "--group", "srwf-final-20260928-v0-2"],
            capture_output=True, text=True, check=False,
        )
        self.assertNotEqual(completed.returncode, 0)


if __name__ == "__main__":
    unittest.main()
