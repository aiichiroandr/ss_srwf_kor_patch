import test from "node:test";
import assert from "node:assert/strict";
import { findPatchedEditorImage } from "../assets/editor-directory.mjs";

// A BIN of `size` bytes whose first sector carries the Saturn header of `product`.
const saturn = (name, size, product = "T-20610G", fill = 0) => {
  const bytes = new Uint8Array(size).fill(fill);
  bytes.set(new TextEncoder().encode("SEGA SEGASATURN "), 16);
  bytes.set(new TextEncoder().encode(product), 48);
  return new File([bytes], name);
};
const release = {
  gameId: "srwf-f",
  source: { size: 2400, sha256: "0".repeat(64) },
  target: { size: 2352, filename: "patch.bin", sha256: "1".repeat(64) },
};
const directory = (...files) => ({ async *values() {
  for (const file of files) yield { kind: "file", name: file.name, getFile: async () => file };
} });

test("the patched line picks the BIN of the target size by name, size and header and never hashes it", async () => {
  const renamed = saturn("renamed.bin", release.target.size);
  assert.equal(await findPatchedEditorImage(directory(renamed), release), renamed);
  const exact = saturn("patch.bin", release.target.size, "T-20610G", 7);
  assert.equal(await findPatchedEditorImage(directory(renamed, exact), release), exact, "the selected release's own file name wins");
  // a different file name of the same size is still the candidate: the editor worker decides what it is
  await assert.rejects(findPatchedEditorImage(directory(renamed, saturn("other.bin", release.target.size)), release), /여러 개/);
});

test("a folder without a source- or target-sized BIN gives null", async () => {
  assert.equal(await findPatchedEditorImage(directory(saturn("wrong-size.bin", release.source.size - 1)), release), null);
  assert.equal(await findPatchedEditorImage(directory(new File(["x"], "track3.bin")), release), null);
  assert.equal(await findPatchedEditorImage(directory(new File(["note"], "readme.txt")), release), null);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(findPatchedEditorImage(directory(saturn("p.bin", release.target.size)), release, { signal: controller.signal }), { name: "AbortError" });
});

test("a BIN of another game is refused by its header before the editor reads it", async () => {
  await assert.rejects(findPatchedEditorImage(directory(saturn("p.bin", release.target.size, "T-20612G")), release), /새턴 BIN이 아닙니다/);
  await assert.rejects(findPatchedEditorImage(directory(new File([new Uint8Array(release.target.size)], "p.bin")), release), /새턴 BIN이 아닙니다/);
  await assert.rejects(findPatchedEditorImage(directory(saturn("p.bin", release.target.size)), { ...release, gameId: "srwf-final" }), /새턴 BIN이 아닙니다/);
});

test("a personal BIN and its single-file CUE report the CUE track layout of the user's folder", async () => {
  const personal = saturn("personal.bin", release.target.size);
  const cue = new File(['FILE "personal.bin" BINARY\n TRACK 01 MODE1/2352\n INDEX 01 00:00:00\n TRACK 02 MODE2/2352\n INDEX 01 22:36:18\n'], "personal.cue");
  let tracks;
  assert.equal(await findPatchedEditorImage(directory(personal, cue), release, { onCueTracks: value => { tracks = value; } }), personal);
  assert.deepEqual(tracks, ["TRACK 01 MODE1/2352", "INDEX 01 00:00:00", "TRACK 02 MODE2/2352", "INDEX 01 22:36:18"]);
  // a CUE that names another file, or whose layout is not a CD layout, never describes this BIN
  let other = null;
  const stranger = new File(['FILE "elsewhere.bin" BINARY\n TRACK 01 MODE1/2352\n INDEX 01 00:00:00\n'], "x.cue");
  assert.equal(await findPatchedEditorImage(directory(personal, stranger), release, { onCueTracks: value => { other = value; } }), personal);
  assert.equal(other, null);
  const odd = new File(['FILE "personal.bin" BINARY\n TRACK 01 MODE2/2336\n INDEX 01 00:00:00\n'], "odd.cue");
  await assert.rejects(findPatchedEditorImage(directory(personal, odd), release), /CUE 트랙 구성/);
});

test("source-sized BINs are candidates for original-language editing and get the same header checks",async()=>{
 const file=saturn("original-custom.bin",release.source.size);
 assert.equal(await findPatchedEditorImage(directory(file),release),file);
 await assert.rejects(findPatchedEditorImage(directory(saturn("wrong-game.bin",release.source.size,"T-20612G")),release),/새턴 BIN이 아닙니다/);
});
