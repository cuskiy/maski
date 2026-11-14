import { createClient } from "matrix-js-sdk";
import type { StoredSession } from "./db.ts";

export interface Registered {
  session: StoredSession;
  kind: "done";
}

export interface NeedsToken {
  kind: "token";
  session: string;
}

export type RegisterResult = Registered | NeedsToken;

/**
 * Registration is one loop: the server answers 401 with the stages it still wants, and this answers
 * with the ones we can satisfy. Terms are accepted as they are; a token is asked for; anything else
 * is reported rather than guessed.
 */
export async function register(baseUrl: string, username: string, password: string): Promise<RegisterResult> {
  const client = createClient({ baseUrl });
  let session = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await client.registerRequest({
        username,
        password,
        initial_device_display_name: "maski",
        ...(session.length > 0 ? { auth: { type: "m.login.dummy", session } } : {}),
      } as never);
      const token = response.access_token ?? "";
      const userId = response.user_id ?? "";
      const deviceId = response.device_id ?? "";
      if (token.length === 0 || userId.length === 0) throw new Error("registration returned no session");
      return { kind: "done", session: { token, session: { userId, deviceId, name: username, avatar: null, baseUrl, accountHash: "" } } };
    } catch (error) {
      const data = (error as { data?: unknown }).data;
      const body = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};
      session = typeof body["session"] === "string" ? body["session"] : session;
      const stages = new Set<string>();
      for (const flow of Array.isArray(body["flows"]) ? body["flows"] : []) {
        if (typeof flow !== "object" || flow === null) continue;
        for (const stage of Array.isArray((flow as { stages?: unknown }).stages) ? ((flow as { stages: unknown[] }).stages as unknown[]) : []) {
          if (typeof stage === "string") stages.add(stage);
        }
      }
      const pending = [...stages].filter((stage) => stage !== "m.login.dummy");
      if (pending.length === 0) throw new Error("registration refused", { cause: error });
      if (pending.every((stage) => stage === "m.login.terms")) continue;
      if (pending.length === 1 && pending[0] === "m.login.registration_token") return { kind: "token", session };
      throw new Error(`unsupported stage: ${pending.join(", ")}`, { cause: error });
    }
  }
  throw new Error("registration did not finish");
}
