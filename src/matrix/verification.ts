import {
  VerificationPhase,
  VerificationRequestEvent,
  VerifierEvent,
  type ShowSasCallbacks,
  type VerificationRequest,
  type Verifier,
} from "matrix-js-sdk/lib/crypto-api/verification";
import { CryptoEvent } from "matrix-js-sdk/lib/crypto-api/CryptoEvent";
import type { MatrixClient } from "matrix-js-sdk";
import type { VerificationSas, VerificationState } from "../data/records";
import type { WorkerToClient } from "../protocol";

interface Tracked {
  request: VerificationRequest;
  id: string;
  started: boolean;
  sas: ShowSasCallbacks | null;
  verifier: Verifier | null;
}

export class Verification {
  private readonly tracked = new Map<string, Tracked>();
  private readonly byTransaction = new Map<string, Tracked>();
  private readonly client: MatrixClient;
  private readonly post: (event: WorkerToClient) => void;
  private readonly onDone: () => void;

  constructor(
    client: MatrixClient,
    post: (event: WorkerToClient) => void,
    onDone: () => void,
  ) {
    this.client = client;
    this.post = post;
    this.onDone = onDone;
    this.client.on(CryptoEvent.VerificationRequestReceived, (request) => {
      this.track(request);
    });
  }

  track(request: VerificationRequest): string {
    const existing = [...this.tracked.values()].find((entry) => entry.request === request);
    if (existing) return existing.id;
    const id = crypto.randomUUID();
    const entry: Tracked = { request, id, started: false, sas: null, verifier: null };
    this.tracked.set(id, entry);
    if (request.transactionId) this.byTransaction.set(request.transactionId, entry);
    const emit = (): void => {
      if (request.transactionId && !this.byTransaction.has(request.transactionId)) {
        this.byTransaction.set(request.transactionId, entry);
      }
      this.emit(entry);
      if (request.phase === VerificationPhase.Started && request.verifier) {
        this.attach(entry, request.verifier);
      }
      if (
        request.initiatedByMe &&
        request.phase === VerificationPhase.Ready &&
        request.methods.includes("m.sas.v1") &&
        !entry.started
      ) {
        void this.startSas(entry.id);
      }
      if (request.phase === VerificationPhase.Done) this.onDone();
    };
    request.on(VerificationRequestEvent.Change, emit);
    emit();
    return id;
  }

  private attach(entry: Tracked, verifier: Verifier): void {
    if (entry.verifier === verifier) return;
    entry.verifier = verifier;
    verifier.on(VerifierEvent.ShowSas, (sas) => {
      entry.sas = sas;
      this.emit(entry);
    });
    verifier.on(VerifierEvent.Cancel, () => {
      this.emit(entry);
    });
    void verifier.verify().catch((error: unknown) => {
      this.post({
        type: "verification",
        state: this.state(entry, error instanceof Error ? error.message : "Verification failed"),
      });
    });
  }

  async startSas(requestId: string): Promise<void> {
    const entry = this.find(requestId);
    if (!entry) throw new Error("Unknown verification request");
    if (entry.started) return;
    entry.started = true;
    if (entry.request.phase === VerificationPhase.Ready) {
      const verifier = await entry.request.startVerification("m.sas.v1");
      this.attach(entry, verifier);
      return;
    }
    if (entry.request.verifier) {
      this.attach(entry, entry.request.verifier);
      return;
    }
    this.emit(entry);
  }

  async accept(requestId: string): Promise<void> {
    const entry = this.find(requestId);
    if (!entry) throw new Error("Unknown verification request");
    await entry.request.accept();
  }

  async confirm(requestId: string): Promise<void> {
    const entry = this.find(requestId);
    if (!entry?.sas) throw new Error("No SAS to confirm");
    await entry.sas.confirm();
  }

  async cancel(requestId: string): Promise<void> {
    const entry = this.find(requestId);
    if (!entry) return;
    if (entry.verifier && !entry.verifier.hasBeenCancelled) {
      entry.verifier.cancel(new Error("Cancelled"));
    } else if (entry.request.pending) {
      await entry.request.cancel();
    }
    this.emit(entry);
  }

  async requestOwn(): Promise<string> {
    const crypto = this.client.getCrypto();
    if (!crypto) throw new Error("Crypto is not initialized");
    return this.track(await crypto.requestOwnUserVerification());
  }

  async requestDevice(deviceId: string): Promise<string> {
    const crypto = this.client.getCrypto();
    if (!crypto) throw new Error("Crypto is not initialized");
    const userId = this.client.getSafeUserId();
    return this.track(await crypto.requestDeviceVerification(userId, deviceId));
  }

  async requestUser(userId: string, roomId: string): Promise<string> {
    const crypto = this.client.getCrypto();
    if (!crypto) throw new Error("Crypto is not initialized");
    const existing = crypto.findVerificationRequestDMInProgress(roomId, userId);
    if (existing) return this.track(existing);
    return this.track(await crypto.requestVerificationDM(userId, roomId));
  }

  private find(requestId: string): Tracked | undefined {
    return this.tracked.get(requestId) ?? this.byTransaction.get(requestId);
  }

  private emit(entry: Tracked): void {
    this.post({ type: "verification", state: this.state(entry, null) });
  }

  private state(entry: Tracked, error: string | null): VerificationState {
    const request = entry.request;
    const sas: VerificationSas | null = entry.sas?.sas
      ? {
          emoji: entry.sas.sas.emoji ?? [],
          decimal: entry.sas.sas.decimal ?? null,
        }
      : null;
    return {
      requestId: entry.id,
      phase: phaseName(request.phase),
      userId: request.otherUserId,
      deviceId: request.otherDeviceId ?? null,
      initiatedByMe: request.initiatedByMe,
      sas,
      error,
    };
  }
}

function phaseName(phase: VerificationPhase): string {
  switch (phase) {
    case VerificationPhase.Unsent:
      return "unsent";
    case VerificationPhase.Requested:
      return "requested";
    case VerificationPhase.Ready:
      return "ready";
    case VerificationPhase.Started:
      return "started";
    case VerificationPhase.Cancelled:
      return "cancelled";
    case VerificationPhase.Done:
      return "done";
    default:
      return "unknown";
  }
}
