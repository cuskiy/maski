import type { Command, Event, FailureCode, Reply } from "../protocol/index.ts";
import { parseCommand } from "../protocol/index.ts";
import { isRecord } from "../lib/json.ts";
import { WorkerFailure } from "./failure.ts";
import type { SessionPort } from "./ports.ts";

function fail(id: number, code: FailureCode): Reply {
  return { id, ok: false, code };
}

function assertNever(value: never): never {
  throw new Error(`Unhandled command ${String(value)}`);
}

function invalidId(raw: unknown): number {
  if (!isRecord(raw)) return 0;
  const value = raw["id"];
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : 0;
}

export interface WorkerApi {
  handle(raw: unknown): Promise<Reply>;
  dispose(): void;
}

export function createWorkerApi(session: SessionPort, emit?: (event: Event) => void): WorkerApi {
  const unsubscribe = emit === undefined ? undefined : session.onEvent(emit);

  async function run(id: number, command: Command): Promise<Reply> {
    switch (command.type) {
      case "start":
        return { id, ok: true, data: await session.start(command.payload) };
      case "login":
        return { id, ok: true, data: await session.login(command.payload) };
      case "logout":
        return { id, ok: true, data: await session.logout() };
      case "keyStatus":
        return { id, ok: true, data: await session.keyStatus() };
      case "recover":
        return { id, ok: true, data: await session.recover(command.payload) };
      case "open":
        return { id, ok: true, data: await session.open(command.payload.roomId) };
      case "older":
        return { id, ok: true, data: await session.older(command.payload.roomId) };
      case "send": {
        const input = command.payload;
        return {
          id,
          ok: true,
          data: await session.send(
            input.roomId,
            input.body,
            input.html,
            input.replyTo,
            input.transactionId,
            input.messageId,
            input.kind,
            input.media,
          ),
        };
      }
      case "retrySend":
        return {
          id,
          ok: true,
          data: await session.retrySend(command.payload.roomId, command.payload.messageId),
        };
      case "discardSend":
        return {
          id,
          ok: true,
          data: await session.discardSend(command.payload.roomId, command.payload.messageId),
        };
      case "sendMedia":
        return { id, ok: true, data: await session.sendMedia(command.payload) };
      case "media":
        return { id, ok: true, data: await session.media(command.payload) };
      case "markRead":
        return {
          id,
          ok: true,
          data: await session.markRead(command.payload.roomId, command.payload.eventId),
        };
      case "members":
        return { id, ok: true, data: await session.members(command.payload.roomId) };
      case "devices":
        return { id, ok: true, data: await session.devices() };
      case "resetIdentity":
        return { id, ok: true, data: await session.resetIdentity(command.payload.password) };
      case "react":
        return {
          id,
          ok: true,
          data: await session.react(command.payload.roomId, command.payload.eventId, command.payload.key),
        };
      case "edit":
        return {
          id,
          ok: true,
          data: await session.edit(
            command.payload.roomId,
            command.payload.eventId,
            command.payload.body,
            command.payload.html,
          ),
        };
      case "redact":
        return {
          id,
          ok: true,
          data: await session.redact(command.payload.roomId, command.payload.eventId),
        };
      case "typing":
        return {
          id,
          ok: true,
          data: await session.typing(command.payload.roomId, command.payload.typing),
        };
      case "search":
        return {
          id,
          ok: true,
          data: await session.search(
            command.payload.roomIds,
            command.payload.query,
            command.payload.mediaKinds,
            command.payload.limit,
          ),
        };
      case "leaveRoom":
        return { id, ok: true, data: await session.leaveRoom(command.payload.roomId) };
      case "setRoomTag":
        return {
          id,
          ok: true,
          data: await session.setRoomTag(command.payload.roomId, command.payload.tag, command.payload.enabled),
        };
      case "setNotification":
        return {
          id,
          ok: true,
          data: await session.setNotification(command.payload.roomId, command.payload.mode),
        };
      case "setRoomState":
        return {
          id,
          ok: true,
          data: await session.setRoomState(command.payload.roomId, command.payload.patch),
        };
      case "inviteUser":
        return {
          id,
          ok: true,
          data: await session.inviteUser(command.payload.roomId, command.payload.userId),
        };
      case "joinRoom":
        return { id, ok: true, data: await session.joinRoom(command.payload.roomIdOrAlias) };
      case "answerInvite":
        return {
          id,
          ok: true,
          data: await session.answerInvite(command.payload.roomId, command.payload.accept),
        };
      case "createRoom":
        return {
          id,
          ok: true,
          data: await session.createRoom(command.payload.name, command.payload.topic, command.payload.directUserId),
        };
      case "forward":
        return {
          id,
          ok: true,
          data: await session.forward(command.payload.targetRoomId, command.payload.sources),
        };
      case "memberAction":
        return {
          id,
          ok: true,
          data: await session.memberAction(command.payload.roomId, command.payload.userId, command.payload.action),
        };
      default:
        return assertNever(command);
    }
  }

  return {
    async handle(raw) {
      const command = parseCommand(raw);
      if (command === null) return fail(invalidId(raw), "invalid");
      try {
        return await run(command.id, command);
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
