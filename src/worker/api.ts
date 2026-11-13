import type { Keys, Media, Session } from "../core/types.ts";
import { readServer } from "../core/server.ts";
import { discover } from "./discover.ts";
import type { Command } from "../protocol/messages.ts";
import type { Event } from "../protocol/messages.ts";
import { WorkerSession } from "./session.ts";

/** One handler per command. Nothing here knows about pages or styles. */
export class WorkerApi {
  private readonly session: WorkerSession;
  private wasm = "";

  constructor(post: (event: Event) => void) {
    this.session = new WorkerSession(post);
  }

  async dispatch(command: Command): Promise<unknown> {
    switch (command.type) {
      case "start":
        this.wasm = command.wasm;
        return this.session.start(command.accountHash, command.wasm);
      case "discover": {
        const address = readServer(command.address);
        if (address === null) throw new Error("unusable address");
        const result = await discover(address);
        return result;
      }
      case "login": {
        const session: Session = await this.session.login(command.baseUrl, command.user, command.password, this.wasm);
        return { session };
      }
      case "logout":
        await this.session.logout();
        return {};
      case "keyStatus": {
        const keys: Keys = await this.session.keys();
        return keys;
      }
      case "unlock":
        return this.session.unlock(command.input);
      case "open":
        return this.session.open(command.roomId);
      case "older":
        return this.session.older(command.roomId, command.keep);
      case "send":
        await this.session.send(command.roomId, command.txnId, command.body, command.html);
        return {};
      case "retry":
        await this.session.retry(command.txnId, command.roomId);
        return {};
      case "discard":
        await this.session.discard(command.txnId, command.roomId);
        return {};
      case "media": {
        const blob: Blob = await this.session.media(command.media, command.size);
        return { blob };
      }
      case "markRead":
        await this.session.markRead(command.roomId, command.eventId);
        return {};
      case "typing":
        await this.session.typing(command.roomId, command.on);
        return {};
      default:
        throw new Error("unknown command");
    }
  }
}

export type { Command, Event };
export type { Media };
