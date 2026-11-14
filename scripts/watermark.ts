import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ICONS } from "./watermark-icons.ts";

export const TILE_W = 1600;
export const TILE_H = 2560;
export const COVERAGE_COLS = 16;
export const COVERAGE_ROWS = 25;

export interface WatermarkLayer {
  readonly id: "large" | "medium" | "small";
  readonly count: number;
  readonly minScale: number;
  readonly maxScale: number;
  readonly gap: number;
  readonly stroke: number;
  readonly opacity: number;
}

export interface PlacedMotif {
  readonly layer: WatermarkLayer["id"];
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly scale: number;
  readonly angle: number;
  readonly icon: number;
}

export const LAYERS: readonly WatermarkLayer[] = [
  { id: "large", count: 30, minScale: 1.3, maxScale: 1.5, gap: 18, stroke: 1.4, opacity: 1 },
  { id: "medium", count: 200, minScale: 1.0, maxScale: 1.2, gap: 10, stroke: 1.3, opacity: 1 },
  { id: "small", count: 590, minScale: 0.8, maxScale: 0.95, gap: 5, stroke: 1.2, opacity: 1 },
];

const SEED = 0x5eed2026;
const ATTEMPTS = 420;

function randomSource(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function clearance(box: PlacedMotif | Omit<PlacedMotif, "layer" | "icon">, other: PlacedMotif): number {
  const dx = Math.max(other.x - (box.x + box.w), box.x - (other.x + other.w), 0);
  const dy = Math.max(other.y - (box.y + box.h), box.y - (other.y + other.h), 0);
  return Math.hypot(dx, dy);
}

export function packWatermark(seed = SEED): PlacedMotif[] {
  const random = randomSource(seed);
  const placed: PlacedMotif[] = [];
  for (const layer of LAYERS) {
    for (let index = 0; index < layer.count; index += 1) {
      let best: (Omit<PlacedMotif, "layer" | "icon"> & { min: number }) | null = null;
      for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
        const scale = layer.minScale + random() * (layer.maxScale - layer.minScale);
        const angle = (random() * 64 - 32) * (Math.PI / 180);
        const side = 24 * scale * (Math.abs(Math.cos(angle)) + Math.abs(Math.sin(angle))) + layer.stroke * scale;
        const candidate = {
          x: random() * (TILE_W - side),
          y: random() * (TILE_H - side),
          w: side,
          h: side,
          scale,
          angle: (angle * 180) / Math.PI,
          min: Infinity,
        };
        for (const other of placed) {
          const distance = clearance(candidate, other);
          if (distance < candidate.min) candidate.min = distance;
          if (candidate.min <= layer.gap) break;
        }
        if (candidate.min < layer.gap) continue;
        if (best === null || candidate.min > best.min) best = candidate;
      }
      if (best === null) {
        throw new Error(`Cannot place the ${layer.id} layer inside the watermark tile`);
      }
      placed.push({
        layer: layer.id,
        x: best.x,
        y: best.y,
        w: best.w,
        h: best.h,
        scale: best.scale,
        angle: best.angle,
        icon: Math.floor(random() * ICONS.length),
      });
    }
  }

  const smallLayer = LAYERS.find((layer) => layer.id === "small");
  if (smallLayer === undefined) throw new Error("The small watermark layer is missing");
  const cellW = TILE_W / COVERAGE_COLS;
  const cellH = TILE_H / COVERAGE_ROWS;
  const covered = new Set<string>();
  const coverageKey = (motif: PlacedMotif): string => {
    const column = Math.min(COVERAGE_COLS - 1, Math.floor((motif.x + motif.w / 2) / cellW));
    const row = Math.min(COVERAGE_ROWS - 1, Math.floor((motif.y + motif.h / 2) / cellH));
    return `${String(column)},${String(row)}`;
  };
  for (const motif of placed) covered.add(coverageKey(motif));

  for (let row = 0; row < COVERAGE_ROWS; row += 1) {
    for (let column = 0; column < COVERAGE_COLS; column += 1) {
      if (covered.has(`${String(column)},${String(row)}`)) continue;
      let best: (Omit<PlacedMotif, "layer" | "icon"> & { min: number }) | null = null;
      for (let attempt = 0; attempt < 180; attempt += 1) {
        const scale = smallLayer.minScale + random() * (smallLayer.maxScale - smallLayer.minScale);
        const angle = (random() * 64 - 32) * (Math.PI / 180);
        const side = 24 * scale * (Math.abs(Math.cos(angle)) + Math.abs(Math.sin(angle))) + smallLayer.stroke * scale;
        const cellX = column * cellW;
        const cellY = row * cellH;
        if (side > cellW || side > cellH) continue;
        const candidate = {
          x: cellX + random() * (cellW - side),
          y: cellY + random() * (cellH - side),
          w: side,
          h: side,
          scale,
          angle: (angle * 180) / Math.PI,
          min: Infinity,
        };
        for (const other of placed) {
          const distance = clearance(candidate, other);
          if (distance < candidate.min) candidate.min = distance;
          if (candidate.min <= smallLayer.gap) break;
        }
        if (candidate.min < smallLayer.gap) continue;
        if (best === null || candidate.min > best.min) best = candidate;
      }
      if (best === null) continue;
      const motif: PlacedMotif = {
        layer: "small",
        x: best.x,
        y: best.y,
        w: best.w,
        h: best.h,
        scale: best.scale,
        angle: best.angle,
        icon: Math.floor(random() * ICONS.length),
      };
      placed.push(motif);
      covered.add(coverageKey(motif));
    }
  }
  return placed;
}

export function renderWatermark(seed = SEED): string {
  const motifs = packWatermark(seed);
  const groups = LAYERS.map((layer) => {
    const children = motifs
      .filter((motif) => motif.layer === layer.id)
      .map((motif) => {
        const centerX = motif.x + motif.w / 2;
        const centerY = motif.y + motif.h / 2;
        const tx = centerX - 12 * motif.scale;
        const ty = centerY - 12 * motif.scale;
        return `<g transform="translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(${motif.scale.toFixed(2)}) rotate(${motif.angle.toFixed(1)} 12 12)">${ICONS[motif.icon]}</g>`;
      })
      .join("\n");
    return `<g fill="none" stroke="#000" stroke-width="${layer.stroke}" stroke-opacity="${layer.opacity}" stroke-linecap="round" stroke-linejoin="round">
${children}
</g>`;
  }).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE_W}" height="${TILE_H}" viewBox="0 0 ${TILE_W} ${TILE_H}">
<!-- Lucide icons, ISC License. See watermark.LICENSE. Generated by scripts/watermark.ts. -->
${groups}
</svg>
`;
}

async function main(): Promise<void> {
  const output = fileURLToPath(new URL("../src/styles/watermark.svg", import.meta.url));
  await writeFile(output, renderWatermark());
  process.stdout.write(`watermark written: ${output}\n`);
}

if (import.meta.main) {
  void main();
}
