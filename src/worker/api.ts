import type { CommandMap, CommandName, Event, FailureCode, Reply, ReplyData } from "../protocol/index.ts";
import { parseCommand } from "../protocol/index.ts";
import { WorkerFailure } from "./failure.ts";
import type { SessionPort } from "./ports.ts";

function fail(id: number, code: FailureCode): Reply {
  return { id, ok: false, code };
}

function assertNever(value: never): never {
  throw new Error(`Unhandled command ${String(value)}`);
}

export function createWorkerApi(
  session: SessionPort,
  emit?: (event: Event) => void,
): {
  handle(raw: unknown): Promise<Reply>;
  dispose(): void;
} {
  const unsubscribe = emit === undefined ? undefined : session.onEvent(emit);

  async function run<K extends CommandName>(type: K, payload: CommandMap[K]): Promise<ReplyData[K]> {
    switch (type) {
      case "start":
        return session.start(payload as CommandMap["start"]) as Promise<ReplyData[K]>;
      case "login":
        return session.login(payload as CommandMap["login"]) as Promise<ReplyData[K]>;
      case "logout":
        return session.logout() as Promise<ReplyData[K]>;
      case "keyStatus":
        return session.keyStatus() as Promise<ReplyData[K]>;
      case "open":
        return session.open((payload as CommandMap["open"]).roomId) as Promise<ReplyData[K]>;
      case "older":
        return session.older((payload as CommandMap["older"]).roomId) as Promise<ReplyData[K]>;
      case "send": {
        const input = payload as CommandMap["send"];
        return session.send(
          input.roomId,
          input.body,
          input.html,
          input.replyTo,
          input.transactionId,
          input.messageId,
        ) as Promise<ReplyData[K]>;
      }
      case "markRead": {
        const input = payload as CommandMap["markRead"];
        return session.markRead(input.roomId, input.eventId) as Promise<ReplyData[K]>;
      }
      case "members":
        return session.members((payload as CommandMap["members"]).roomId) as Promise<ReplyData[K]>;
      case "resetIdentity":
        return session.resetIdentity((payload as CommandMap["resetIdentity"]).password) as Promise<ReplyData[K]>;
      default:
        return assertNever(type);
    }
  }

  return {
    async handle(raw) {
      const command = parseCommand(raw);
      if (command === null) {
        const value = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>)["id"] : null;
        const id = typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : 0;
        return fail(id, "invalid");
      }
      try {
        const data = await run(command.type, command.payload);
        return { id: command.id, ok: true, data };
      } catch (error) {
        if (error instanceof WorkerFailure) return fail(command.id, error.code);
        return fail(command.id, "unavailable");
      }
    },
    dispose() {
      unsubscribe?.();
    },
  };
}
