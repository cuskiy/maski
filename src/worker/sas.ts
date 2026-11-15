// Worker-owned SAS sessions: SDK request and verifier objects never leave this module.
import type { SasPhase, SasState } from "../core/types.ts";
import { WorkerFailure } from "./failure.ts";

export interface SasGeneratedSas {
  readonly decimal?: readonly [number, number, number];
  readonly emoji?: readonly (readonly [string, string])[];
}

export interface SasCallbacks {
  readonly sas: SasGeneratedSas;
  confirm(): Promise<void>;
  mismatch(): void;
  cancel(): void;
}

export interface SasVerifier {
  readonly hasBeenCancelled: boolean;
  verify(): Promise<void>;
  cancel(error: Error): void;
  getShowSasCallbacks(): SasCallbacks | null;
  on(event: string, listener: (...args: never[]) => void): void;
  off(event: string, listener: (...args: never[]) => void): void;
}

export interface SasRequest {
  readonly transactionId: string | undefined;
  readonly otherUserId: string;
  readonly otherDeviceId: string | undefined;
  readonly isSelfVerification: boolean;
  readonly initiatedByMe: boolean;
  readonly pending: boolean;
  /** `VerificationPhase` is not exported from the SDK root; its numeric value is. */
  readonly phase: number;
  readonly cancellationCode: string | null;
  readonly verifier: SasVerifier | undefined;
  on(event: string, listener: (...args: never[]) => void): void;
  off(event: string, listener: (...args: never[]) => void): void;
  otherPartySupportsMethod(method: string): boolean;
  accept(): Promise<void>;
  cancel(): Promise<void>;
  startVerification(method: string): Promise<SasVerifier>;
}

export interface SasCrypto {
  requestOwnUserVerification(): Promise<SasRequest>;
  requestDeviceVerification(userId: string, deviceId: string): Promise<SasRequest>;
  getVerificationRequestsToDeviceInProgress(userId: string): readonly SasRequest[];
}

/** Verification UI does not subscribe to SDK emitters; the worker adapter supplies these hooks. */
export interface SasEvents {
  watchIncoming(listener: (request: SasRequest) => void): () => void;
  watchRequest(request: SasRequest, onChange: () => void): () => void;
  watchVerifier(
    verifier: SasVerifier,
    handlers: { readonly showSas: (callbacks: SasCallbacks) => void; readonly cancel: () => void },
  ): () => void;
}

export interface SasOptions {
  readonly crypto: () => SasCrypto | undefined;
  readonly ownUserId: string;
  readonly events: SasEvents;
  readonly emit: (state: SasState) => void;
  /** Called once per finished or cancelled session so the gate and device list refresh. */
  readonly settled: () => void;
  readonly failure: (error: unknown) => WorkerFailure;
}

interface Entry {
  readonly id: string;
  readonly request: SasRequest;
  phase: SasPhase;
  verifier: SasVerifier | null;
  callbacks: SasCallbacks | null;
  emoji: readonly string[] | null;
  decimal: readonly [number, number, number] | null;
  cancellationCode: string | null;
  starting: boolean;
  settled: boolean;
  unwatchRequest: (() => void) | null;
  unwatchVerifier: (() => void) | null;
}

const SAS_METHOD = "m.sas.v1";

/** Pinned `VerificationPhase` values from matrix-js-sdk 45.1.0; the enum is not exported. */
const REQUEST_PHASE = {
  requested: 2,
  ready: 3,
  started: 4,
  cancelled: 5,
  done: 6,
} as const;

function peerKey(request: SasRequest): string {
  return `${request.otherUserId}|${request.otherDeviceId ?? ""}`;
}

/** Copies the negotiated SAS out of the SDK shape; the UI only ever sees strings and numbers. */
function sasFromCallbacks(callbacks: SasCallbacks): {
  readonly emoji: readonly string[] | null;
  readonly decimal: readonly [number, number, number] | null;
} {
  const generated = callbacks.sas;
  const emoji = generated.emoji;
  const decimal = generated.decimal;
  return {
    emoji:
      emoji === undefined || emoji.length === 0
        ? null
        : emoji.slice(0, 7).map((entry: readonly [string, string]) => entry[0]),
    decimal: decimal === undefined ? null : [decimal[0], decimal[1], decimal[2]],
  };
}

export class SasSessions {
  private readonly entries = new Map<string, Entry>();
  private readonly byKey = new Map<string, string>();
  private readonly options: SasOptions;
  private readonly unwatchIncoming: () => void;
  private counter = 0;

  constructor(options: SasOptions) {
    this.options = options;
    this.unwatchIncoming = options.events.watchIncoming((request) => this.adopt(request));
  }

  /** Own-user requests already in progress, so a worker restart does not hide a pending request. */
  adoptInProgress(): void {
    const crypto = this.options.crypto();
    if (crypto === undefined) return;
    let requests: readonly SasRequest[];
    try {
      requests = crypto.getVerificationRequestsToDeviceInProgress(this.options.ownUserId);
    } catch {
      // A crypto store that cannot list requests has nothing the reader can act on.
      return;
    }
    for (const request of requests) this.adopt(request);
  }

  async start(deviceId: string | null): Promise<SasState> {
    const crypto = this.options.crypto();
    if (crypto === undefined) throw new WorkerFailure("unavailable");
    let request: SasRequest;
    try {
      request =
        deviceId === null
          ? await crypto.requestOwnUserVerification()
          : await crypto.requestDeviceVerification(this.options.ownUserId, deviceId);
    } catch (error) {
      throw this.options.failure(error);
    }
    if (!request.isSelfVerification) {
      void request.cancel().catch(() => undefined);
      throw new WorkerFailure("invalid");
    }
    const existing = this.find(request);
    if (existing !== null) {
      this.emitState(existing);
      return this.project(existing);
    }
    const entry = this.create(request, this.initialPhase(request));
    if (request.verifier !== undefined) {
      entry.phase = "started";
      this.installVerifier(entry, request.verifier);
    }
    this.emitState(entry);
    return this.project(entry);
  }

  async accept(id: string): Promise<null> {
    const entry = this.requireEntry(id);
    if (entry.phase !== "needs-accept") throw new WorkerFailure("invalid");
    try {
      await entry.request.accept();
    } catch (error) {
      throw this.options.failure(error);
    }
    if (!entry.settled && entry.phase === "needs-accept") {
      entry.phase = "ready";
      this.emitState(entry);
    }
    return null;
  }

  async confirm(id: string): Promise<null> {
    const entry = this.requireEntry(id);
    const callbacks = entry.callbacks;
    if (callbacks === null) throw new WorkerFailure("unavailable");
    try {
      await callbacks.confirm();
    } catch (error) {
      throw this.options.failure(error);
    }
    return null;
  }

  async mismatch(id: string): Promise<null> {
    const entry = this.requireEntry(id);
    const callbacks = entry.callbacks;
    if (callbacks === null) throw new WorkerFailure("unavailable");
    entry.cancellationCode = "m.mismatched_sas";
    try {
      callbacks.mismatch();
    } catch (error) {
      throw this.options.failure(error);
    }
    this.settle(entry, "cancelled", "m.mismatched_sas");
    return null;
  }

  async cancel(id: string): Promise<null> {
    const entry = this.requireEntry(id);
    entry.cancellationCode ??= "m.user";
    if (entry.verifier !== null) {
      entry.verifier.cancel(new Error("The user cancelled the verification"));
    } else {
      try {
        await entry.request.cancel();
      } catch (error) {
        throw this.options.failure(error);
      }
    }
    this.settle(entry, "cancelled", entry.cancellationCode);
    return null;
  }

  dispose(): void {
    this.unwatchIncoming();
    for (const entry of this.entries.values()) {
      entry.settled = true;
      entry.unwatchRequest?.();
      entry.unwatchVerifier?.();
    }
    this.entries.clear();
    this.byKey.clear();
  }

  private adopt(request: SasRequest): void {
    if (!request.isSelfVerification || !request.pending) return;
    if (this.find(request) !== null) return;
    const entry = this.create(request, this.initialPhase(request));
    if (request.verifier !== undefined) {
      entry.phase = "started";
      this.installVerifier(entry, request.verifier);
    } else if (entry.phase === "ready" && request.initiatedByMe) {
      this.startMethod(entry);
    }
    this.emitState(entry);
  }

  private create(request: SasRequest, phase: SasPhase): Entry {
    this.counter += 1;
    const entry: Entry = {
      id: `sas-${String(this.counter)}`,
      request,
      phase,
      verifier: null,
      callbacks: null,
      emoji: null,
      decimal: null,
      cancellationCode: request.cancellationCode,
      starting: false,
      settled: false,
      unwatchRequest: null,
      unwatchVerifier: null,
    };
    this.entries.set(entry.id, entry);
    this.register(entry);
    entry.unwatchRequest = this.options.events.watchRequest(request, () => this.onChange(entry));
    return entry;
  }

  private onChange(entry: Entry): void {
    if (entry.settled) return;
    this.register(entry);
    const request = entry.request;
    const phase = request.phase;
    if (phase === REQUEST_PHASE.cancelled) {
      this.settle(entry, "cancelled", request.cancellationCode);
      return;
    }
    if (phase === REQUEST_PHASE.done) {
      this.settle(entry, "done", null);
      return;
    }
    if (request.cancellationCode !== null) {
      this.settle(entry, "cancelled", request.cancellationCode);
      return;
    }
    if (phase === REQUEST_PHASE.started || request.verifier !== undefined) {
      if (entry.phase !== "started") entry.phase = "started";
      const verifier = request.verifier;
      if (verifier !== undefined) this.installVerifier(entry, verifier);
      else this.emitState(entry);
      return;
    }
    if (phase === REQUEST_PHASE.ready) {
      if (entry.phase !== "ready") {
        entry.phase = "ready";
        this.emitState(entry);
      }
      if (request.initiatedByMe) this.startMethod(entry);
      return;
    }
    const next: SasPhase = request.initiatedByMe ? "requested" : "needs-accept";
    if (entry.phase !== next) {
      entry.phase = next;
      this.emitState(entry);
    }
  }

  private startMethod(entry: Entry): void {
    if (entry.settled || entry.starting || entry.verifier !== null) return;
    if (!entry.request.otherPartySupportsMethod(SAS_METHOD)) {
      this.settle(entry, "cancelled", "m.unknown-method");
      void entry.request.cancel().catch(() => undefined);
      return;
    }
    entry.starting = true;
    void entry.request.startVerification(SAS_METHOD).then(
      (verifier) => {
        entry.starting = false;
        if (entry.settled) return;
        entry.phase = "started";
        this.installVerifier(entry, verifier);
      },
      () => {
        entry.starting = false;
        if (entry.settled) return;
        const verifier = entry.request.verifier;
        if (verifier !== undefined) {
          entry.phase = "started";
          this.installVerifier(entry, verifier);
          return;
        }
        void entry.request.cancel().catch(() => undefined);
        this.settle(entry, "cancelled", entry.request.cancellationCode);
      },
    );
  }

  private installVerifier(entry: Entry, verifier: SasVerifier): void {
    if (entry.verifier === verifier) return;
    entry.unwatchVerifier?.();
    entry.verifier = verifier;
    entry.unwatchVerifier = this.options.events.watchVerifier(verifier, {
      showSas: (callbacks) => {
        if (entry.settled) return;
        entry.callbacks = callbacks;
        const sas = sasFromCallbacks(callbacks);
        entry.emoji = sas.emoji;
        entry.decimal = sas.decimal;
        this.emitState(entry);
      },
      cancel: () => {
        this.settle(entry, "cancelled", entry.request.cancellationCode ?? entry.cancellationCode);
      },
    });
    const callbacks = verifier.getShowSasCallbacks();
    if (callbacks !== null) {
      entry.callbacks = callbacks;
      const sas = sasFromCallbacks(callbacks);
      entry.emoji = sas.emoji;
      entry.decimal = sas.decimal;
    }
    this.emitState(entry);
    void verifier.verify().then(
      () => {
        if (entry.verifier !== verifier) return;
        this.settle(entry, "done", null);
      },
      () => {
        if (entry.settled || entry.verifier !== verifier) return;
        this.settle(entry, "cancelled", entry.request.cancellationCode ?? entry.cancellationCode);
      },
    );
  }

  private settle(entry: Entry, phase: "done" | "cancelled", code: string | null): void {
    if (entry.settled) return;
    entry.settled = true;
    entry.phase = phase;
    entry.cancellationCode = phase === "cancelled" ? (entry.request.cancellationCode ?? code) : null;
    entry.unwatchRequest?.();
    entry.unwatchRequest = null;
    entry.unwatchVerifier?.();
    entry.unwatchVerifier = null;
    entry.verifier = null;
    entry.callbacks = null;
    this.entries.delete(entry.id);
    for (const [key, value] of this.byKey) {
      if (value === entry.id) this.byKey.delete(key);
    }
    this.emitState(entry);
    this.options.settled();
  }

  private initialPhase(request: SasRequest): SasPhase {
    if (request.phase === REQUEST_PHASE.started || request.verifier !== undefined) return "started";
    if (request.phase === REQUEST_PHASE.ready) return "ready";
    return request.initiatedByMe ? "requested" : "needs-accept";
  }

  private find(request: SasRequest): Entry | null {
    for (const key of [request.transactionId, peerKey(request)]) {
      if (key === undefined) continue;
      const id = this.byKey.get(key);
      if (id === undefined) continue;
      const entry = this.entries.get(id);
      if (entry !== undefined) return entry;
    }
    return null;
  }

  private register(entry: Entry): void {
    const transactionId = entry.request.transactionId;
    if (transactionId !== undefined) this.byKey.set(transactionId, entry.id);
    this.byKey.set(peerKey(entry.request), entry.id);
  }

  private requireEntry(id: string): Entry {
    const entry = this.entries.get(id);
    if (entry === undefined) throw new WorkerFailure("invalid");
    return entry;
  }

  private project(entry: Entry): SasState {
    const decimal = entry.decimal;
    return {
      id: entry.id,
      otherUserId: entry.request.otherUserId,
      otherDeviceId: entry.request.otherDeviceId ?? null,
      isSelfVerification: entry.request.isSelfVerification,
      phase: entry.phase,
      emoji: entry.emoji === null ? null : [...entry.emoji],
      decimal: decimal === null ? null : [decimal[0], decimal[1], decimal[2]],
      cancellationCode: entry.cancellationCode,
    };
  }

  private emitState(entry: Entry): void {
    this.options.emit(this.project(entry));
  }
}
