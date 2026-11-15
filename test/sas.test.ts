import assert from "node:assert/strict";
import test from "node:test";
import type { SasState } from "../src/core/types.ts";
import { WorkerFailure } from "../src/worker/failure.ts";
import {
  SasSessions,
  type SasCallbacks,
  type SasCrypto,
  type SasEvents,
  type SasGeneratedSas,
  type SasRequest,
  type SasVerifier,
} from "../src/worker/sas.ts";

const OWN = "@alice:example.org";
const OTHER = "PHONE";

class FakeCallbacks implements SasCallbacks {
  confirmed = 0;
  mismatched = 0;
  readonly sas: SasGeneratedSas;

  constructor(sas: SasGeneratedSas) {
    this.sas = sas;
  }

  async confirm(): Promise<void> {
    this.confirmed += 1;
  }

  mismatch(): void {
    this.mismatched += 1;
  }

  cancel(): void {
    // The state machine cancels through the request, not the callback.
  }
}

class FakeVerifier implements SasVerifier {
  hasBeenCancelled = false;
  verified = 0;
  cancelled = 0;
  private readonly callbacks: SasCallbacks | null;
  private resolveVerify: () => void = () => undefined;

  constructor(callbacks: SasCallbacks | null) {
    this.callbacks = callbacks;
  }

  verify(): Promise<void> {
    this.verified += 1;
    const pending = Promise.withResolvers<void>();
    this.resolveVerify = pending.resolve;
    return pending.promise;
  }

  cancel(_error: Error): void {
    this.cancelled += 1;
    this.hasBeenCancelled = true;
  }

  getShowSasCallbacks(): SasCallbacks | null {
    return this.callbacks;
  }

  on(): void {
    // The adapter under test owns subscriptions; the fake only needs the methods.
  }

  off(): void {
    // See `on`.
  }

  resolve(): void {
    this.resolveVerify();
  }
}

class FakeRequest implements SasRequest {
  transactionId: string | undefined;
  otherUserId = OWN;
  otherDeviceId: string | undefined = OTHER;
  isSelfVerification = true;
  initiatedByMe: boolean;
  pending = true;
  phase = 2;
  cancellationCode: string | null = null;
  verifier: SasVerifier | undefined;
  accepted = 0;
  cancelled = 0;
  readonly startedMethods: string[] = [];
  nextVerifier: FakeVerifier | null = null;
  supportsSas = true;

  constructor(initiatedByMe: boolean, transactionId: string | undefined) {
    this.initiatedByMe = initiatedByMe;
    this.transactionId = transactionId;
  }

  on(): void {
    // See FakeVerifier.on.
  }

  off(): void {
    // See FakeVerifier.on.
  }

  otherPartySupportsMethod(method: string): boolean {
    return method === "m.sas.v1" && this.supportsSas;
  }

  async accept(): Promise<void> {
    this.accepted += 1;
    this.phase = 3;
  }

  async cancel(): Promise<void> {
    this.cancelled += 1;
    this.cancellationCode = "m.user";
    this.pending = false;
  }

  async startVerification(method: string): Promise<SasVerifier> {
    this.startedMethods.push(method);
    const verifier = this.nextVerifier ?? new FakeVerifier(null);
    this.verifier = verifier;
    return verifier;
  }
}

interface Harness {
  readonly sas: SasSessions;
  readonly states: SasState[];
  readonly crypto: {
    own: SasRequest | null;
    device: SasRequest | null;
    inProgress: SasRequest[];
    readonly deviceRequests: { readonly userId: string; readonly deviceId: string }[];
  };
  readonly settledCount: () => number;
  change(): void;
  showSas(callbacks: SasCallbacks): void;
  verifierCancel(): void;
  incoming(request: SasRequest): void;
}

function createHarness(): Harness {
  const states: SasState[] = [];
  const cryptoState: Harness["crypto"] = {
    own: null,
    device: null,
    inProgress: [],
    deviceRequests: [],
  };
  const handlers: {
    change: (() => void) | null;
    showSas: ((callbacks: SasCallbacks) => void) | null;
    verifierCancel: (() => void) | null;
    incoming: ((request: SasRequest) => void) | null;
  } = { change: null, showSas: null, verifierCancel: null, incoming: null };
  const events: SasEvents = {
    watchIncoming(listener) {
      handlers.incoming = listener;
      return () => {
        handlers.incoming = null;
      };
    },
    watchRequest(_request, onChange) {
      handlers.change = onChange;
      return () => {
        handlers.change = null;
      };
    },
    watchVerifier(_verifier, subscribed) {
      handlers.showSas = subscribed.showSas;
      handlers.verifierCancel = subscribed.cancel;
      return () => {
        handlers.showSas = null;
        handlers.verifierCancel = null;
      };
    },
  };
  const crypto: SasCrypto = {
    requestOwnUserVerification() {
      const request = cryptoState.own;
      if (request === null) return Promise.reject(new Error("no cross-signing identity"));
      cryptoState.own = null;
      return Promise.resolve(request);
    },
    requestDeviceVerification(userId, deviceId) {
      cryptoState.deviceRequests.push({ userId, deviceId });
      const request = cryptoState.device;
      if (request === null) return Promise.reject(new Error("unknown device"));
      return Promise.resolve(request);
    },
    getVerificationRequestsToDeviceInProgress() {
      return cryptoState.inProgress;
    },
  };
  let settled = 0;
  const sas = new SasSessions({
    crypto: () => crypto,
    ownUserId: OWN,
    events,
    emit: (state) => states.push(state),
    settled: () => {
      settled += 1;
    },
    failure: (error) => (error instanceof WorkerFailure ? error : new WorkerFailure("network")),
  });
  return {
    sas,
    states,
    crypto: cryptoState,
    settledCount: () => settled,
    change() {
      handlers.change?.();
    },
    showSas(callbacks) {
      handlers.showSas?.(callbacks);
    },
    verifierCancel() {
      handlers.verifierCancel?.();
    },
    incoming(request) {
      handlers.incoming?.(request);
    },
  };
}

const tick = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

const isInvalid = (error: unknown): boolean => error instanceof WorkerFailure && error.code === "invalid";

const projectionKeys = [
  "cancellationCode",
  "decimal",
  "emoji",
  "id",
  "isSelfVerification",
  "otherDeviceId",
  "otherUserId",
  "phase",
];

void test("a started own-user request projects its phases and negotiated SAS", async () => {
  const h = createHarness();
  const request = new FakeRequest(true, "txn-1");
  const verifier = new FakeVerifier(null);
  request.nextVerifier = verifier;
  h.crypto.own = request;

  const initial = await h.sas.start(null);
  assert.equal(initial.id, "sas-1");
  assert.equal(initial.phase, "requested");
  assert.equal(initial.otherDeviceId, OTHER);
  assert.deepEqual(Object.keys(initial).toSorted(), projectionKeys);
  assert.deepEqual(h.states.at(-1), initial);

  request.phase = 3;
  h.change();
  assert.equal(h.states.at(-1)?.phase, "ready");
  await tick();
  assert.deepEqual(request.startedMethods, ["m.sas.v1"]);
  assert.equal(h.states.at(-1)?.phase, "started");

  const callbacks = new FakeCallbacks({ emoji: [["🐶", "Dog"]], decimal: [1, 2, 3] });
  h.showSas(callbacks);
  assert.deepEqual(h.states.at(-1)?.emoji, ["🐶"]);
  assert.deepEqual(h.states.at(-1)?.decimal, [1, 2, 3]);

  await h.sas.confirm("sas-1");
  assert.equal(callbacks.confirmed, 1);
  assert.equal(h.settledCount(), 0);

  verifier.resolve();
  await tick();
  assert.equal(h.states.at(-1)?.phase, "done");
  assert.equal(h.states.at(-1)?.cancellationCode, null);
  assert.equal(h.settledCount(), 1);
});

void test("a specific device start asks the worker for that device", async () => {
  const h = createHarness();
  const request = new FakeRequest(true, "txn-2");
  h.crypto.device = request;
  const state = await h.sas.start(OTHER);
  assert.deepEqual(h.crypto.deviceRequests, [{ userId: OWN, deviceId: OTHER }]);
  assert.equal(state.otherDeviceId, OTHER);
  assert.equal(state.phase, "requested");
});

void test("a peer that does not offer emoji verification is cancelled with a code", async () => {
  const h = createHarness();
  const request = new FakeRequest(true, "txn-11");
  request.supportsSas = false;
  h.crypto.own = request;
  await h.sas.start(null);
  request.phase = 3;
  h.change();
  assert.deepEqual(request.startedMethods, []);
  assert.equal(request.cancelled, 1);
  assert.equal(h.states.at(-1)?.phase, "cancelled");
  assert.equal(h.states.at(-1)?.cancellationCode, "m.unknown-method");
  assert.equal(h.settledCount(), 1);
});

void test("a mismatch cancels with the mismatch code and refreshes once", async () => {
  const h = createHarness();
  const request = new FakeRequest(true, "txn-3");
  const callbacks = new FakeCallbacks({ emoji: [["🐱", "Cat"]] });
  const verifier = new FakeVerifier(callbacks);
  request.nextVerifier = verifier;
  h.crypto.own = request;
  await h.sas.start(null);
  request.phase = 3;
  h.change();
  await tick();
  h.showSas(callbacks);

  await h.sas.mismatch("sas-1");
  assert.equal(callbacks.mismatched, 1);
  assert.equal(h.states.at(-1)?.phase, "cancelled");
  assert.equal(h.states.at(-1)?.cancellationCode, "m.mismatched_sas");
  assert.equal(h.settledCount(), 1);

  await tick();
  assert.equal(h.settledCount(), 1);
});

void test("a user cancel ends the request and refreshes once", async () => {
  const h = createHarness();
  const request = new FakeRequest(true, "txn-4");
  h.crypto.own = request;
  await h.sas.start(null);

  await h.sas.cancel("sas-1");
  assert.equal(request.cancelled, 1);
  assert.equal(h.states.at(-1)?.phase, "cancelled");
  assert.equal(h.states.at(-1)?.cancellationCode, "m.user");
  assert.equal(h.settledCount(), 1);
});

void test("an incoming request waits for accept, then adopts the verifier", async () => {
  const h = createHarness();
  const request = new FakeRequest(false, "txn-5");
  const callbacks = new FakeCallbacks({ decimal: [4, 5, 6] });
  const verifier = new FakeVerifier(callbacks);
  h.incoming(request);

  assert.equal(h.states.at(-1)?.phase, "needs-accept");
  await h.sas.accept("sas-1");
  assert.equal(request.accepted, 1);
  assert.equal(h.states.at(-1)?.phase, "ready");

  request.phase = 4;
  request.verifier = verifier;
  h.change();
  await tick();
  assert.equal(h.states.at(-1)?.phase, "started");
  assert.equal(verifier.verified, 1);

  h.showSas(callbacks);
  assert.deepEqual(h.states.at(-1)?.decimal, [4, 5, 6]);
  verifier.resolve();
  await tick();
  assert.equal(h.states.at(-1)?.phase, "done");
});

void test("a worker restart adopts only live self-verification requests", () => {
  const h = createHarness();
  const ready = new FakeRequest(true, "txn-6");
  ready.phase = 3;
  const cancelled = new FakeRequest(false, "txn-7");
  cancelled.pending = false;
  const foreign = new FakeRequest(true, "txn-8");
  foreign.isSelfVerification = false;
  h.crypto.inProgress = [ready, cancelled, foreign];
  h.sas.adoptInProgress();
  assert.equal(h.states.length, 1);
  assert.equal(h.states[0]?.phase, "ready");
  assert.equal(h.states[0]?.otherUserId, OWN);
});

void test("a repeated request reuses the worker id", async () => {
  const h = createHarness();
  const first = new FakeRequest(true, "txn-9");
  h.crypto.own = first;
  const initial = await h.sas.start(null);
  const repeat = new FakeRequest(true, "txn-9");
  h.crypto.own = repeat;
  const second = await h.sas.start(null);
  assert.equal(second.id, initial.id);
  assert.equal(repeat.startedMethods.length, 0);
});

void test("an unknown id is a typed failure and a verifier cancel settles the request", async () => {
  const h = createHarness();
  await assert.rejects(h.sas.accept("sas-404"), isInvalid);
  await assert.rejects(h.sas.confirm("sas-404"), isInvalid);
  await assert.rejects(h.sas.mismatch("sas-404"), isInvalid);
  await assert.rejects(h.sas.cancel("sas-404"), isInvalid);

  const request = new FakeRequest(true, "txn-10");
  const verifier = new FakeVerifier(null);
  request.nextVerifier = verifier;
  h.crypto.own = request;
  await h.sas.start(null);
  request.phase = 3;
  h.change();
  await tick();
  request.cancellationCode = "m.timeout";
  h.verifierCancel();
  assert.equal(h.states.at(-1)?.phase, "cancelled");
  assert.equal(h.states.at(-1)?.cancellationCode, "m.timeout");
  assert.equal(h.settledCount(), 1);
  assert.equal(verifier.cancelled, 0);
});

void test("the projection type stays free of SDK objects", () => {
  const state: SasState = {
    id: "sas-1",
    otherUserId: OWN,
    otherDeviceId: null,
    isSelfVerification: true,
    phase: "started",
    emoji: ["🐶"],
    decimal: [7, 8, 9],
    cancellationCode: null,
  };
  const clone = structuredClone(state);
  assert.deepEqual(clone, state);
  assert.deepEqual(Object.keys(clone).toSorted(), projectionKeys);
});
