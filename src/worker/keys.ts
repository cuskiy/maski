import { decodeRecoveryKey, deriveRecoveryKeyFromPassphrase } from "matrix-js-sdk/lib/crypto-api/index.js";
import type { MatrixClient } from "matrix-js-sdk";

export interface SecretKey {
  id: string;
  key: Uint8Array<ArrayBuffer>;
}

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

export async function secretKeyFor(client: MatrixClient, input: string): Promise<SecretKey> {
  if (!(await client.secretStorage.hasKey())) throw new Error("no-keys");
  const stored = await client.secretStorage.getKey();
  if (!stored) throw new Error("no-keys");
  const [id, info] = stored;
  const key = await keyFromInput(input, info);
  if (!(await client.secretStorage.checkKey(key, info))) throw new Error("invalid");
  return { id, key };
}

/**
 * Restoring is one path: with the key available to the client's callbacks, the SDK imports the
 * cross-signing keys (which signs this device) and reopens the backup with what it finds there.
 */
export async function openKeys(client: MatrixClient): Promise<void> {
  const crypto = client.getCrypto();
  if (!crypto) throw new Error("restore");
  try {
    await crypto.bootstrapCrossSigning({});
    await crypto.bootstrapSecretStorage({});
  } catch (cause) {
    throw new Error("restore", { cause });
  }
  // A backup is not the gate: the keys are. When the account has none, or its key is not in secret
  // storage, the device still opens and the timeline keeps saying what it cannot read.
  await crypto.loadSessionBackupPrivateKeyFromSecretStorage().catch(() => undefined);
  await crypto.checkKeyBackupAndEnable().catch(() => undefined);
}
