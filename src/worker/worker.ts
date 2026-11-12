import { WorkerApi } from "./api.ts";
import type { Command, Event } from "../protocol/messages.ts";

const api = new WorkerApi((event: Event) => {
  self.postMessage(event);
});

self.onmessage = (message: MessageEvent<unknown>) => {
  const data = message.data;
  if (typeof data !== "object" || data === null) return;
  const envelope = data as { id?: unknown; command?: unknown };
  if (typeof envelope.id !== "number" || typeof envelope.command !== "object" || envelope.command === null) return;
  const command = envelope.command as Command;
  api
    .dispatch(command)
    .then((result) => {
      self.postMessage({ id: envelope.id, ok: true, data: result });
    })
    .catch((error: unknown) => {
      self.postMessage({ id: envelope.id, ok: false, error: { code: "internal", message: error instanceof Error ? error.message : String(error) } });
    });
};
