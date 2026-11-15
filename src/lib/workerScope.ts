/** The two members a worker entry uses from its own global scope. */
export interface WorkerScope<In, Out> {
  onmessage: ((event: MessageEvent<In>) => void) | null;
  postMessage(message: Out): void;
}

function isWorkerScope<In, Out>(value: unknown): value is WorkerScope<In, Out> {
  return (
    typeof value === "object" &&
    value !== null &&
    "onmessage" in value &&
    typeof Reflect.get(value, "postMessage") === "function"
  );
}

/** `globalThis` as a worker scope, after one runtime check for the members the entry uses. */
export function workerScope<In, Out>(): WorkerScope<In, Out> {
  const scope: unknown = globalThis;
  if (!isWorkerScope<In, Out>(scope)) throw new Error("worker scope unavailable");
  return scope;
}
