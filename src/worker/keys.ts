import { decodeRecoveryKey, deriveRecoveryKeyFromPassphrase } from "matrix-js-sdk/lib/crypto-api/index.js";
import type { MatrixClient } from "matrix-js-sdk";
import type { Keys } from "../core/types.ts";

export type KeyError = "no-keys" | "invalid" | "restore" | "uia";

/** A recovery key arrives in groups of four; a passphrase arrives as words. Both are tried. */
export async function keyFromInput(input: string, info: { passphrase?: { salt: string; iterations: number; bits?: number } }): Promise<Uint8Array<ArrayBuffer>> {
  const compact = input.replace(/[\s\u200b-\u200d\ufeff]/gu, "");
  if (compact.length > 0) {
    try {
      return decodeRecoveryKey(compact);
    } catch {
      // not base58, so it is a passphrase
    }
  }
  const passphrase = info.passphrase;
  if (!passphrase || input.trim().length === 0) throw new Error("invalid");
  return await deriveRecoveryKeyFromPassphrase(input.trim(), passphrase.salt, passphrase.iterations, passphrase.bits);
}

/**
 * Restoring the keys is one path: check the key against secret storage, then let the SDK import the
 * cross-signing keys (which signs this device) and reopen the backup with the key it finds there.
 */
export async function unlockWith(client: MatrixClient, input: string): Promise<Keys> {
  if (!(await client.secretStorage.hasKey())) throw new Error("no-keys");
  const stored = await client.secretStorage.getKey();
  if (!stored) throw new Error("no-keys");
  const [keyId, info] = stored;
  const key = await keyFromInput(input, info);
  if (!(await client.secretStorage.checkKey(key, info))) throw new Error("invalid");

  const crypto = client.getCrypto();
  if (!crypto) throw new Error("restore");
  const previous = client.cryptoCallbacks;
  client.cryptoCallbacks = {
    ...previous,
    getSecretStorageKey: async () => [keyId, key],
    cacheSecretStorageKey: () => undefined,
  };
  try {
    await crypto.bootstrapCrossSigning({});
    await crypto.bootstrapSecretStorage({});
    await crypto.loadSessionBackupPrivateKeyFromSecretStorage();
    await crypto.checkKeyBackupAndEnable();
  } catch {
    throw new Error("restore");
  } finally {
    client.cryptoCallbacks = previous;
  }
  return { ready: true };
}
