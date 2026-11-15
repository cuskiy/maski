import bcd from "@mdn/browser-compat-data" with { type: "json" };
import data from "web-features/data.json" with { type: "json" };
import { isRecord } from "../src/lib/json.ts";

interface Feature {
  readonly name?: string;
  readonly status: {
    readonly baseline: string | false;
    readonly baseline_low_date?: string;
    readonly support?: Record<string, string>;
  };
}

function isFeature(value: unknown): value is Feature {
  if (typeof value !== "object" || value === null || !("status" in value)) return false;
  const status = value.status;
  return typeof status === "object" && status !== null && "baseline" in status;
}

const features: Record<string, Feature> = {};
for (const [id, value] of Object.entries(data.features)) {
  if (isFeature(value)) features[id] = value;
}
const args = process.argv.slice(2);
const BCD_ALIASES: Record<string, string> = {
  "crypto.randomUUID": "api.Crypto.randomUUID",
  "anchor-positioning": "css.properties.anchor-name",
  "anchor-size": "css.properties.inline-size.anchor-size",
};

const BCD_COMPAT = "__compat";

function bcdFeature(query: string): Feature | null {
  const path = BCD_ALIASES[query];
  if (path === undefined) return null;
  let node: unknown = bcd;
  for (const part of path.split(".")) {
    if (!isRecord(node) || !(part in node)) return null;
    node = node[part];
  }
  if (!isRecord(node) || !(BCD_COMPAT in node)) return null;
  const compat = node[BCD_COMPAT];
  if (!isRecord(compat) || !("support" in compat)) return null;
  const support = compat["support"];
  if (!isRecord(support)) return null;
  const versions: Record<string, string> = {};
  for (const engine of ["chrome", "firefox", "safari"]) {
    const rawEntry = support[engine];
    const entries: readonly unknown[] = Array.isArray(rawEntry) ? rawEntry : [rawEntry];
    const first: unknown = entries[0];
    if (!isRecord(first)) continue;
    const version = first["version_added"];
    if (typeof version === "string") versions[engine] = version;
    else if (version === true) versions[engine] = "0";
  }
  return { name: query, status: { baseline: false, support: versions } };
}

function find(query: string): Array<[string, Feature]> {
  const fallback = bcdFeature(query);
  if ((query === "anchor-positioning" || query === "anchor-size") && fallback !== null) {
    return [[query, fallback]];
  }
  const exact = features[query];
  if (exact) return [[query, exact]];
  if (fallback !== null) return [[query, fallback]];
  return Object.entries(features).filter(([id, feature]) => {
    const name = feature.name ?? id;
    return id.includes(query) || name.toLowerCase().includes(query.toLowerCase());
  });
}

function line(id: string, feature: Feature): string {
  const support = feature.status.support ?? {};
  const engines = ["chrome", "firefox", "safari"].map((engine) => `${engine} ${support[engine] ?? "-"}`);
  const baseline =
    feature.status.baseline === false ? "not baseline" : `baseline ${feature.status.baseline_low_date ?? "?"}`;
  return `${id.padEnd(34)} ${baseline.padEnd(24)} ${engines.join(" · ")}`;
}

if (args.length === 0) {
  process.stdout.write(
    "usage: npm run features -- <id|substring> [--require YEAR] [--floor chrome=156,firefox=157,safari=27]\n",
  );
  process.exit(1);
}

const requireIndex = args.indexOf("--require");
const requireYear = requireIndex >= 0 ? (args[requireIndex + 1] ?? "") : null;
const floorIndex = args.indexOf("--floor");
const floorArgument = floorIndex >= 0 ? (args[floorIndex + 1] ?? "") : null;
const floor: Record<string, string> = {};
for (const part of floorArgument?.split(",") ?? []) {
  const [engine, version] = part.split("=");
  if (engine !== undefined && version !== undefined && engine !== "" && version !== "") floor[engine] = version;
}
const optionIndexes = new Set<number>();
if (requireIndex >= 0) {
  optionIndexes.add(requireIndex);
  optionIndexes.add(requireIndex + 1);
}
if (floorIndex >= 0) {
  optionIndexes.add(floorIndex);
  optionIndexes.add(floorIndex + 1);
}
const queries = args.filter((_argument, index) => !optionIndexes.has(index));
let missing = 0;

function versionParts(value: string): number[] {
  const numeric = value.replace(/^[≤<≥>]=?/u, "").trim();
  return numeric.split(".").map(Number);
}

function shippedBy(support: string, minimum: string): boolean {
  const current = versionParts(support);
  const target = versionParts(minimum);
  for (let index = 0; index < Math.max(current.length, target.length); index += 1) {
    const left = current[index] ?? 0;
    const right = target[index] ?? 0;
    if (left !== right) return left < right;
  }
  return true;
}

for (const query of queries) {
  const hits = find(query);
  if (hits.length === 0) {
    process.stdout.write(`${query.padEnd(34)} unknown\n`);
    missing += 1;
    continue;
  }
  for (const [id, feature] of hits) {
    process.stdout.write(`${line(id, feature)}\n`);
    const low = feature.status.baseline_low_date ?? "";
    if (requireYear !== null && (feature.status.baseline === false || !low.startsWith(requireYear))) missing += 1;
    for (const [engine, minimum] of Object.entries(floor)) {
      const support = feature.status.support?.[engine];
      if (support === undefined || !shippedBy(support, minimum)) {
        process.stdout.write(`${"".padEnd(34)} ${engine} ${support ?? "missing"} is not in ${minimum}\n`);
        missing += 1;
      }
    }
  }
}
process.exit(missing > 0 ? 1 : 0);
