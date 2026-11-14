import assert from "node:assert/strict";
import test from "node:test";
import {
  COVERAGE_COLS,
  COVERAGE_ROWS,
  TILE_H,
  TILE_W,
  LAYERS,
  packWatermark,
  type PlacedMotif,
} from "../scripts/watermark.ts";

function overlaps(left: PlacedMotif, right: PlacedMotif): boolean {
  return (
    left.x < right.x + right.w && left.x + left.w > right.x && left.y < right.y + right.h && left.y + left.h > right.y
  );
}

void test("watermark layers fill the tile without collisions", () => {
  const motifs = packWatermark();
  const expected = LAYERS.reduce((total, layer) => total + layer.count, 0);
  assert.ok(motifs.length >= expected);

  for (const motif of motifs) {
    assert.ok(motif.x >= 0 && motif.y >= 0);
    assert.ok(motif.x + motif.w <= TILE_W);
    assert.ok(motif.y + motif.h <= TILE_H);
  }

  for (let leftIndex = 0; leftIndex < motifs.length; leftIndex += 1) {
    const left = motifs[leftIndex];
    if (left === undefined) throw new Error("missing left motif");
    for (let rightIndex = leftIndex + 1; rightIndex < motifs.length; rightIndex += 1) {
      const right = motifs[rightIndex];
      if (right === undefined) throw new Error("missing right motif");
      assert.equal(overlaps(left, right), false);
    }
  }

  assert.deepEqual(packWatermark(), motifs);

  const cellW = TILE_W / COVERAGE_COLS;
  const cellH = TILE_H / COVERAGE_ROWS;
  const covered = new Set<string>();
  for (const motif of motifs) {
    const column = Math.min(COVERAGE_COLS - 1, Math.floor((motif.x + motif.w / 2) / cellW));
    const row = Math.min(COVERAGE_ROWS - 1, Math.floor((motif.y + motif.h / 2) / cellH));
    covered.add(`${String(column)},${String(row)}`);
  }
  assert.equal(covered.size, COVERAGE_COLS * COVERAGE_ROWS);
});

void test("watermark layer sizes move from large to small", () => {
  const motifs = packWatermark();
  const average = (id: string) => {
    const sizes = motifs.filter((motif) => motif.layer === id).map((motif) => motif.scale);
    return sizes.reduce((total, value) => total + value, 0) / sizes.length;
  };
  assert.ok(average("large") > average("medium"));
  assert.ok(average("medium") > average("small"));
});
