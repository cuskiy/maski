import {
  CryptoEvent,
  VerificationPhase,
  VerificationRequestEvent,
  VerifierEvent,
  type ShowSasCallbacks,
  type VerificationRequest,
  type Verifier,
} from "matrix-js-sdk/lib/crypto-api/index.js";
import type { MatrixClient } from "matrix-js-sdk";
import type { VerifyState } from "../core/types.ts";

/**
 * One SAS verification at a time. The side that asked for it starts the method once
 * the other side is ready; the side that was asked waits for the verifier to appear.
 */
export class Verification {
  private readonly client: MatrixClient;
  private readonly post: (update: VerifyState) => void;
  private request: VerificationRequest | null = null;
  private verifier: Verifier | null = null;
  private sas: ShowSasCallbacks | null = null;

  constructor(client: MatrixClient, post: (update: VerifyState) => void) {
    this.client = client;
    this.post = post;
  }

  attach(): void {
    this.client.on(CryptoEvent.VerificationRequestReceived, (request) => this.track(request));
    const userId = this.client.getUserId();
    if (!userId) return;
    for (const request of this.client.getCrypto()?.getVerificationRequestsToDeviceInProgress(userId) ?? []) {
      this.track(request);
    }
  }

  async start(deviceId: string): Promise<void> {
    const crypto = this.client.getCrypto();
    const userId = this.client.getUserId();
    if (!crypto || !userId) throw new Error("encryption is not ready");
    const request: VerificationRequest = await crypto.requestDeviceVerification(userId, deviceId);
    this.track(request);
  }

  async accept(): Promise<void> {
    if (!this.request) throw new Error("no verification is waiting");
    await this.request.accept();
  }

  confirm(): void {
    if (!this.sas) return;
    void this.sas.confirm();
  }

  mismatch(): void {
    this.sas?.mismatch();
    this.post({ state: "cancelled" });
  }

  cancel(): void {
    void this.request?.cancel().catch(() => undefined);
    this.verifier?.cancel(new Error("cancelled by the user"));
    this.post({ state: "cancelled" });
  }

  private track(request: VerificationRequest): void {
    this.request = request;
    this.post({ state: "requested", from: request.otherUserId, deviceId: request.otherDeviceId ?? null });
    request.on(VerificationRequestEvent.Change, () => void this.onChange());
    void this.onChange();
  }

  private async onChange(): Promise<void> {
    const request = this.request;
    if (!request) return;
    switch (request.phase) {
      case VerificationPhase.Ready:
        this.post({ state: "ready" });
        if (request.initiatedByMe) await this.begin(request);
        break;
      case VerificationPhase.Started:
        this.verifier ??= request.verifier ?? null;
        this.watch();
        break;
      case VerificationPhase.Done:
        this.post({ state: "done" });
        break;
      case VerificationPhase.Cancelled:
        this.post({ state: "cancelled" });
        break;
      default:
        break;
    }
  }

  private async begin(request: VerificationRequest): Promise<void> {
    if (this.verifier) return;
    try {
      this.verifier = await request.startVerification("m.sas.v1");
      this.watch();
      void this.verifier.verify().catch(() => this.post({ state: "cancelled" }));
    } catch {
      this.post({ state: "cancelled" });
    }
  }

  private watch(): void {
    const verifier = this.verifier;
    if (!verifier) return;
    verifier.on(VerifierEvent.ShowSas, (sas) => this.show(sas));
    verifier.on(VerifierEvent.Cancel, () => this.post({ state: "cancelled" }));
    const present = verifier.getShowSasCallbacks();
    if (present) this.show(present);
  }

  private show(sas: ShowSasCallbacks): void {
    this.sas = sas;
    const emoji = (sas.sas.emoji ?? []).map(([symbol, name]) => ({ symbol, name }));
    this.post({ state: "sas", emoji });
  }
}

