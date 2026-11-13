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
 * Unlocking opens the account's secrets for this device: the cross-signing private keys are
 * imported from secret storage and this device is signed with them, and the backup key opens the
 * encrypted history. Signing needs the account's public cross-signing keys, which sync does not
 * fetch, so they are asked for first; without them the import fails silently and the gate stays
 * shut with nothing to read.
 */
export async function openKeys(client: MatrixClient): Promise<void> {
  const crypto = client.getCrypto();
  if (!crypto) throw new Error("restore");
  const userId = client.getUserId() ?? "";
  const status = await crypto.getCrossSigningStatus();
  // Creating a new identity here would rotate the account's keys behind the reader's back, and
  // that is what the gate's "start over" path is for.
  if (!status.privateKeysInSecretStorage) throw new Error("no-cross-signing");
  try {
    // A key query, not a sync, is what puts the account's public keys in the machine.
    await crypto.getUserDeviceInfo([userId], true);
    await crypto.bootstrapCrossSigning({});
  } catch (cause) {
    throw new Error("restore", { cause });
  }
  await crypto.loadSessionBackupPrivateKeyFromSecretStorage().catch(() => undefined);
  await crypto.checkKeyBackupAndEnable().catch(() => undefined);
}
