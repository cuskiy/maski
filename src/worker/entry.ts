import type { Event } from "../protocol/index.ts";
import { workerScope } from "../lib/workerScope.ts";
import { createWorkerApi } from "./api.ts";
import { MatrixSession } from "./matrix.ts";

const scope = workerScope<unknown, unknown>();
const api = createWorkerApi(new MatrixSession(), (event: Event) => scope.postMessage(event));

scope.onmessage = (event) => {
  void api.handle(event.data).then(
    (reply) => scope.postMessage(reply),
    () => scope.postMessage({ id: 0, ok: false, code: "unavailable" }),
  );
};
