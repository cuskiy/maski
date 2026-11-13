import type { Discovery, Keys, Media, Session } from "../core/types.ts";
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
      case "discover":
        return discover(command.baseUrl);
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

/** A domain may delegate to another host; the well-known document is the address a person types. */
async function resolve(baseUrl: string): Promise<string> {
  try {
    const response = await fetch(`${baseUrl}/.well-known/matrix/client`);
    if (!response.ok) return baseUrl;
    const body: unknown = await response.json();
    const server = typeof body === "object" && body !== null ? (body as Record<string, unknown>)["m.homeserver"] : null;
    const url = typeof server === "object" && server !== null ? (server as Record<string, unknown>)["base_url"] : null;
    return typeof url === "string" && url.length > 0 ? url.replace(/\/$/u, "") : baseUrl;
  } catch {
    return baseUrl;
  }
}

/** What a server offers, so the next page is the one that can work. */
async function discover(address: string): Promise<Discovery> {
  const baseUrl = await resolve(address);
  const response = await fetch(`${baseUrl}/_matrix/client/v3/login`);
  if (!response.ok) throw new Error(`login flows ${String(response.status)}`);
  const body: unknown = await response.json();
  const flows = typeof body === "object" && body !== null ? (body as { flows?: unknown }).flows : null;
  const types = Array.isArray(flows)
    ? flows.map((flow) => (typeof flow === "object" && flow !== null ? (flow as { type?: unknown }).type : null)).filter((type): type is string => typeof type === "string")
    : [];
  let registration = false;
  try {
    const probe = await fetch(`${baseUrl}/_matrix/client/v3/register`);
    registration = probe.ok || probe.status === 401;
  } catch {
    registration = false;
  }
  return { baseUrl, password: types.includes("m.login.password"), registration };
}
