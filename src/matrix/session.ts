import { createClient, IndexedDBCryptoStore, IndexedDBStore, type MatrixClient } from "matrix-js-sdk";
import type { CryptoCallbacks } from "matrix-js-sdk/lib/crypto-api";
import type { SessionRecord } from "../data/records";
import { accountHash, accountDb } from "../data/ids";
import { ACCOUNT_DB_VERSION, ACCOUNT_STORES, STORE, getOne, openDb, putOne, deleteOne } from "../data";
import type { DiscoveryResult } from "../protocol";
import { readSsoTargets } from "./sso";

export interface LoginResult {
  session: SessionRecord;
  hash: string;
}

export interface MatrixRuntimeClient {
  client: MatrixClient;
  store: IndexedDBStore;
  cryptoStore: IndexedDBCryptoStore;
}

export async function readSession(hash: string): Promise<SessionRecord | null> {
  const db = await openDb(accountDb(hash), ACCOUNT_DB_VERSION, ACCOUNT_STORES);
  try {
    return (await getOne<SessionRecord>(db, STORE.session, "session")) ?? null;
  } finally {
    db.close();
  }
}

export async function writeSession(hash: string, session: SessionRecord): Promise<void> {
  const db = await openDb(accountDb(hash), ACCOUNT_DB_VERSION, ACCOUNT_STORES);
  try {
    await putOne(db, STORE.session, session);
  } finally {
    db.close();
  }
}

export async function removeSession(hash: string): Promise<void> {
  const db = await openDb(accountDb(hash), ACCOUNT_DB_VERSION, ACCOUNT_STORES);
  try {
    await deleteOne(db, STORE.session, "session");
  } finally {
    db.close();
  }
}

export async function discoverHomeserver(input: string): Promise<DiscoveryResult> {
  const server = normalizeServer(input);
  let baseUrl = server;
  try {
    const response = await fetch(`${server}/.well-known/matrix/client`, {
      headers: { Accept: "application/json" },
    });
    if (response.ok) {
      const data: unknown = await response.json();
      if (isRecord(data)) {
        const homeserver = data["m.homeserver"];
        if (isRecord(homeserver) && typeof homeserver["base_url"] === "string") {
          baseUrl = homeserver["base_url"].replace(/\/$/, "");
        }
      }
    }
  } catch {
    // .well-known is optional; the server URL itself is the fallback.
  }
  const client = createClient({ baseUrl });
  const login = await client.loginFlows();
  const registration = await allowsRegistration(baseUrl);
  return {
    baseUrl,
    loginFlows: login.flows.map((flow) => flow.type),
    ssoTargets: readSsoTargets(login.flows),
    registration,
  };
}

async function allowsRegistration(baseUrl: string): Promise<boolean> {
  const client = createClient({ baseUrl });
  try {
    await client.registerRequest({});
  } catch (error) {
    const data = errorData(error);
    return data !== null && Array.isArray(data["flows"]);
  }
  return true;
}


export async function loginWithPassword(
  baseUrl: string,
  identifier: string,
  password: string,
): Promise<LoginResult> {
  const client = createClient({ baseUrl });
  const response = await client.loginWithPassword(identifier, password);
  const userId = response.user_id;
  const accessToken = response.access_token;
  const deviceId = response.device_id;
  if (!userId || !accessToken || !deviceId) throw new Error("Login response is incomplete");
  const hash = await accountHash(userId);
  const session: SessionRecord = {
    id: "session",
    userId,
    deviceId,
    accessToken,
    refreshToken: response.refresh_token ?? null,
    baseUrl,
  };
  await writeSession(hash, session);
  return { session, hash };
}

export async function loginWithToken(
  baseUrl: string,
  token: string,
  deviceId?: string,
): Promise<LoginResult> {
  const client = createClient({ baseUrl });
  const response = await client.login("m.login.token", {
    token,
    ...(deviceId ? { device_id: deviceId } : {}),
  });
  const userId = response.user_id;
  const accessToken = response.access_token;
  const responseDeviceId = response.device_id;
  if (!userId || !accessToken || !responseDeviceId) throw new Error("Login response is incomplete");
  const hash = await accountHash(userId);
  const session: SessionRecord = {
    id: "session",
    userId,
    deviceId: responseDeviceId,
    accessToken,
    refreshToken: response.refresh_token ?? null,
    baseUrl,
  };
  await writeSession(hash, session);
  return { session, hash };
}

export async function createRuntimeClient(
  session: SessionRecord,
  hash: string,
  callbacks: CryptoCallbacks,
): Promise<MatrixRuntimeClient> {
  const store = new IndexedDBStore({
    indexedDB,
    dbName: `maski-sdk-${hash}-${session.deviceId}`,
  });
  const cryptoStore = new IndexedDBCryptoStore(indexedDB, `maski-crypto-${hash}-${session.deviceId}`);
  const client = createClient({
    baseUrl: session.baseUrl,
    accessToken: session.accessToken,
    ...(session.refreshToken ? { refreshToken: session.refreshToken } : {}),
    userId: session.userId,
    deviceId: session.deviceId,
    store,
    cryptoStore,
    timelineSupport: true,
    verificationMethods: ["m.sas.v1"],
    cryptoCallbacks: callbacks,
  });
  client.setMaxListeners(50);
  // The store loads persisted presence through the client, so it starts after
  // the client holds it. See IndexedDBStore's own usage example.
  await store.startup();
  await client.initRustCrypto({
    useIndexedDB: true,
    cryptoDatabasePrefix: `maski-rust-${hash}-${session.deviceId}`,
  });
  return { client, store, cryptoStore };
}

export function normalizeServer(input: string): string {
  const value = input.trim();
  if (!value) throw new Error("Enter a homeserver domain or URL");
  if (/^https?:\/\//i.test(value)) return value.replace(/\/$/, "");
  return `https://${value}`.replace(/\/$/, "");
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function errorData(error: unknown): Record<string, unknown> | null {
  if (!isRecord(error)) return null;
  const data = error["data"];
  return isRecord(data) ? data : null;
}
