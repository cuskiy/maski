import data from "web-features/data.json" with { type: "json" };

interface Feature {
  readonly name: string;
  readonly status: {
    readonly baseline: "high" | "low" | false;
    readonly baseline_low_date?: string;
    readonly support?: Record<string, string>;
  };
}

const features = (data as unknown as { features: Record<string, Feature> }).features;
const args = process.argv.slice(2);

function find(query: string): Array<[string, Feature]> {
  const exact = features[query];
  if (exact) return [[query, exact]];
  return Object.entries(features).filter(([id, feature]) => id.includes(query) || feature.name.toLowerCase().includes(query.toLowerCase()));
}

function line(id: string, feature: Feature): string {
  const support = feature.status.support ?? {};
  const engines = ["chrome", "firefox", "safari"].map((engine) => `${engine} ${support[engine] ?? "-"}`);
  const baseline = feature.status.baseline === false ? "not baseline" : `baseline ${feature.status.baseline_low_date ?? "?"}`;
  return `${id.padEnd(34)} ${baseline.padEnd(24)} ${engines.join(" · ")}`;
}

if (args.length === 0) {
  process.stdout.write("usage: npm run features -- <id|substring> [--require 2026]\n");
  process.exit(1);
}

const requireIndex = args.indexOf("--require");
const requireYear = requireIndex >= 0 ? (args[requireIndex + 1] ?? "") : null;
const queries = args.filter((_argument, index) => index !== requireIndex && index !== requireIndex + 1);
let missing = 0;

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
  }
}

if (missing > 0) process.exit(1);
