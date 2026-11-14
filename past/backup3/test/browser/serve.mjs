import { fileURLToPath } from "node:url";
import { serve as staticServe } from "../../scripts/static.ts";

/** A static host that serves wasm the way every real one does. */
export function serve(root, port) {
  return staticServe(root, port);
}

export const dist = fileURLToPath(new URL("../../dist", import.meta.url));
