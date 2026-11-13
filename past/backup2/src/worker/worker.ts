import { GateError, WorkerApi } from "./api.ts";
import type { Command, Event } from "../protocol/messages.ts";

const api = new WorkerApi((event: Event) => {
  self.postMessage(event);
});

self.addEventListener("unhandledrejection", (event) => {
  self.postMessage({ event: "fatal", message: `unhandled: ${String(event.reason)}` });
});

self.addEventListener("error", (event) => {
  self.postMessage({ event: "fatal", message: `error: ${event.message}` });
});

self.addEventListener("message", (message: MessageEvent<unknown>) => {
  const data = message.data;
  if (typeof data !== "object" || data === null) return;
  const envelope = data as { id?: unknown; command?: unknown };
  if (typeof envelope.id !== "number" || typeof envelope.command !== "object" || envelope.command === null) return;
  api
    .dispatch(envelope.command as Command)
    .then((result) => {
      self.postMessage({ id: envelope.id, ok: true, data: result });
    })
    .catch((error: unknown) => {
      const code = error instanceof GateError ? error.code : "internal";
      const detail = error instanceof Error ? error.message : String(error);
      self.postMessage({ id: envelope.id, ok: false, error: { code, message: detail } });
    });
});
