import type { Keys, Session } from "../core/types.ts";
import type { Command, Event } from "../protocol/messages.ts";
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
      case "start": {
        this.wasm = command.wasm;
        const state = await this.session.start(command.accountHash, command.wasm);
        return state;
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
      case "send":
        await this.session.send(command.roomId, command.txnId, command.body);
        return {};
      default:
        throw new Error("unknown command");
    }
  }
}
