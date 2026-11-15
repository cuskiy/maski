import type { Event } from "../protocol/index.ts";
import { createWorkerApi } from "./api.ts";
import { MatrixSession } from "./matrix.ts";

interface WorkerScope {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(message: unknown): void;
}

const scope = globalThis as unknown as WorkerScope;
const api = createWorkerApi(new MatrixSession(), (event: Event) => scope.postMessage(event));

scope.onmessage = (event) => {
  void api.handle(event.data).then(
    (reply) => scope.postMessage(reply),
    () => scope.postMessage({ id: 0, ok: false, code: "unavailable" }),
  );
};
