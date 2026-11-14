import type { Command, Event, Reply } from "../protocol/messages.ts";
import { WorkerApi } from "./api.ts";

const api = new WorkerApi((event: Event) => {
  self.postMessage(event);
});

self.addEventListener("message", (message: MessageEvent<{ id?: unknown; command?: unknown }>) => {
  const id = message.data.id;
  const command = message.data.command;
  if (typeof id !== "number" || typeof command !== "object" || command === null) return;
  void api
    .dispatch(command as Command)
    .then((data): Reply => ({ id, ok: true, data }))
    .catch((error: unknown): Reply => ({ id, ok: false, error: error instanceof Error ? error.message : String(error) }))
    .then((reply) => {
      self.postMessage(reply);
    });
});
