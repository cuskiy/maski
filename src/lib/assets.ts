import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface Manifest {
  readonly stylesheet: string;
  readonly script: string;
  readonly worker?: string;
}

let cached: Manifest | null = null;

/** The one way a page learns a hashed name: the build writes the manifest, pages read it. */
export function manifest(path: string): Manifest {
  if (cached) return cached;
  const parsed: unknown = JSON.parse(readFileSync(join(path, "build", "manifest.json"), "utf8"));
  if (typeof parsed !== "object" || parsed === null) throw new Error("manifest is not an object");
  const record = parsed as Record<string, unknown>;
  const stylesheet = record["stylesheet"];
  const script = record["script"];
  if (typeof stylesheet !== "string" || typeof script !== "string") throw new Error("manifest is incomplete");
  cached = { stylesheet, script, ...(typeof record["worker"] === "string" ? { worker: record["worker"] } : {}) };
  return cached;
}

export function forgetManifest(): void {
  cached = null;
}
