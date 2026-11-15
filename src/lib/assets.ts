/** The fixed-name service worker declared in the page metadata. */
export const SERVICE_WORKER_PATH = "/service-worker.js";

/** The hashed URLs the page generator needs; written once by the build. */
export interface Assets {
  readonly stylesheet: string;
  readonly icon: string;
  readonly guard: string;
  readonly prepaint: string;
  readonly client: string;
  readonly reviewClient: string;
  readonly matrixWorker: string;
  readonly cryptoWasm: string;
}

/** The one check the build manifest crosses before any page generation reads it. */
export function isAssets(value: unknown): value is Assets {
  return (
    typeof value === "object" &&
    value !== null &&
    "stylesheet" in value &&
    typeof value.stylesheet === "string" &&
    "icon" in value &&
    typeof value.icon === "string" &&
    "guard" in value &&
    typeof value.guard === "string" &&
    "prepaint" in value &&
    typeof value.prepaint === "string" &&
    "client" in value &&
    typeof value.client === "string" &&
    "reviewClient" in value &&
    typeof value.reviewClient === "string" &&
    "matrixWorker" in value &&
    typeof value.matrixWorker === "string" &&
    "cryptoWasm" in value &&
    typeof value.cryptoWasm === "string"
  );
}
