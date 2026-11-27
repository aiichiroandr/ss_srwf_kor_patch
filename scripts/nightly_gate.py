"""Validate a separately marked SRWFP v3 candidate; never add an ACCEPTED row."""

from pathlib import Path
import hashlib
import json
import re
import struct

META = "assets/nightly-build.mjs"
HEX = re.compile(r"^[0-9a-f]{64}$")
ID = re.compile(r"^srwf-final-\d{8}-v0-4-nightly$")
FMT = "srwf.sparse-byte-delta.v3"
SECTOR = 2352


def require(ok, label):
    if not ok:
        raise ValueError(label)


def nightly_artifact(root: Path, *, metadata=META):
    if not (root / metadata).is_file():
        return None
    text = (root / metadata).read_text(encoding="utf-8")
    match = re.fullmatch(r"export const NIGHTLY = Object\.freeze\((\{[\s\S]*\})\);\n", text)
    require(match, "Nightly metadata must be a data-only module")
    spec = json.loads(match[1])
    require(spec.get("nightly") is True and spec.get("gameId") == "srwf-final"
            and spec.get("version") == "v0.4 Nightly" and ID.fullmatch(spec.get("id", "")),
            "Nightly does not have an approved channel identity")
    expected = f"patches/{spec['id']}.srwfp"
    patch, d = spec["patch"], spec["descriptor"]
    require(patch["url"] == expected and patch["format"] == d["format"] == FMT
            and patch["size"] == d["patchSize"] and patch["sha256"] == d["patchSha256"],
            "Nightly descriptor mismatch")
    require(12 < patch["size"] <= 80 * 1024 * 1024, "Nightly patch exceeds the package cap")
    require(all(isinstance(d.get(k), str) and HEX.fullmatch(d[k])
                for k in ["sourceSha256", "donorSha256", "targetSha256", "patchSha256"]),
            "Missing valid hash")
    require(d["sourceSize"] == spec["source"]["size"] == 520408224
            and d["sourceSha256"] == spec["source"]["sha256"] ==
            "ff7192abc112d5c969a0e236f5061fc6853234eedc350525c46c0548c57dfbdb"
            and spec["source"]["profileId"] == "saturn-jp-stock-track01-mode1-2352-ff7192ab",
            "Unpinned Final stock")
    require(d["donorSha256"] == "66fe113b6c0d99dc74c9f32e587466877719ecd67a59a7c1adea1b71f5e5707a"
            and type(d["donorSize"]) is int and 0 < d["donorSize"] <= 783216000
            and d["donorSize"] % SECTOR == 0, "Unpinned F stock")
    require(d["targetSha256"] == spec["target"]["sha256"] and
            d["targetSize"] == spec["target"]["size"] and type(d["targetSize"]) is int and
            d["sourceSize"] < d["targetSize"] <= 783216000 and d["targetSize"] % SECTOR == 0,
            "Nightly output identity or geometry mismatch")
    artifact = root / expected
    require(artifact.is_file() and not artifact.is_symlink() and artifact.stat().st_size == patch["size"],
            "Missing exact Nightly patch")
    with artifact.open("rb") as stream:
        h = hashlib.file_digest(stream, "sha256").hexdigest()
        require(h == patch["sha256"], "Nightly asset hash mismatch")
        stream.seek(0)
        raw = stream.read(12)
        require(raw[:8] == b"SRWFKP3\x00", "Not an SRWFP v3 patch")
        n = struct.unpack(">I", raw[8:])[0]
        require(0 < n <= 131072, "Nightly header exceeds the cap")
        stored = json.loads(stream.read(n))
        require(stored["format"] == FMT and
                all(stored[k] == d[k] for k in ("sourceSize","sourceSha256","donorSize","donorSha256","targetSize","targetSha256"))
                and stream.read(5) == bytes.fromhex("d6c3c40000"), "Nightly envelope mismatch")
    return expected
