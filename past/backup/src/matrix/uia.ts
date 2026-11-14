import type { WorkerToClient } from "../protocol";
import { errorData, isRecord } from "./session";

interface Pending {
  resolve: (answer: Record<string, unknown>) => void;
  reject: (error: Error) => void;
}

export class Uia {
  private readonly pending = new Map<string, Pending>();
  private readonly post: (event: WorkerToClient) => void;
  private readonly userId: () => string;

  constructor(post: (event: WorkerToClient) => void, userId: () => string) {
    this.post = post;
    this.userId = userId;
  }

  async run<T>(makeRequest: (auth: Record<string, unknown> | null) => Promise<T>): Promise<T> {
    let data: Record<string, unknown> | null = null;
    try {
      return await makeRequest(null);
    } catch (error) {
      data = errorData(error);
      if (!data) throw error;
    }
    if (!data) throw new Error("Interactive authentication is not supported");
    const flows = Array.isArray(data["flows"]) ? data["flows"] : [];
    const stages = flowStages(flows);
    if (stages.length === 0) throw new Error("Interactive authentication is not supported");
    const requestId = crypto.randomUUID();
    const params = isRecord(data["params"]) ? data["params"] : {};
    const answer = needsAnswer(stages)
      ? await new Promise<Record<string, unknown>>((resolve, reject) => {
          this.pending.set(requestId, { resolve, reject });
          this.post({ type: "uia", requestId, stages, params });
        })
      : {};
    const auth = buildAuth(stages, answer, typeof data["session"] === "string" ? data["session"] : null, this.userId());
    return makeRequest(auth);
  }

  answer(requestId: string, auth: Record<string, unknown> | null): void {
    const pending = this.pending.get(requestId);
    if (!pending) return;
    this.pending.delete(requestId);
    if (auth) pending.resolve(auth);
    else pending.reject(new Error("Authentication cancelled"));
  }

  cancel(requestId: string): void {
    const pending = this.pending.get(requestId);
    if (!pending) return;
    this.pending.delete(requestId);
    pending.reject(new Error("Authentication cancelled"));
  }
}

// Dummy carries no user input; prompting for it would block the request.
function needsAnswer(stages: readonly string[]): boolean {
  return stages.some(
    (stage) =>
      stage === "m.login.password" ||
      stage === "m.login.registration_token" ||
      stage === "m.login.terms",
  );
}

function flowStages(flows: unknown[]): string[] {
  for (const flow of flows) {
    if (!isRecord(flow)) continue;
    const stages = flow["stages"];
    if (Array.isArray(stages)) {
      const result = stages.filter((stage): stage is string => typeof stage === "string");
      if (result.length > 0) return result;
    }
  }
  return [];
}

function buildAuth(
  stages: readonly string[],
  answer: Record<string, unknown>,
  session: string | null,
  userId: string,
): Record<string, unknown> {
  if (stages.includes("m.login.password")) {
    const password = typeof answer["password"] === "string" ? answer["password"] : "";
    if (!password) throw new Error("Password required");
    return {
      type: "m.login.password",
      identifier: { type: "m.id.user", user: userId },
      password,
      ...(session ? { session } : {}),
    };
  }
  if (stages.includes("m.login.registration_token")) {
    const token = typeof answer["token"] === "string" ? answer["token"] : "";
    if (!token) throw new Error("Registration token required");
    return { type: "m.login.registration_token", token, ...(session ? { session } : {}) };
  }
  if (stages.includes("m.login.terms")) {
    return { type: "m.login.terms", ...(session ? { session } : {}) };
  }
  if (stages.includes("m.login.dummy")) {
    return { type: "m.login.dummy", ...(session ? { session } : {}) };
  }
  throw new Error(`Unsupported authentication stage: ${stages.join(", ")}`);
}
