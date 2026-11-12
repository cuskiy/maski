import type { MatrixClient } from "matrix-js-sdk";
import { decodeRecoveryKey, encodeRecoveryKey } from "matrix-js-sdk/lib/crypto-api/recovery-key";
import { deriveRecoveryKeyFromPassphrase } from "matrix-js-sdk/lib/crypto-api/key-passphrase";
import type { SecretStorageKeyDescriptionAesV1 } from "matrix-js-sdk/lib/secret-storage";
import type { RecoveryStatus } from "../protocol";
import type { Uia } from "./uia";
import { isRecord } from "./session";

export interface SetupResult {
  recoveryKey: string;
  status: RecoveryStatus;
}

export class Recovery {
  private readonly client: MatrixClient;
  private readonly keys: Map<string, Uint8Array<ArrayBuffer>>;
  private readonly uia: Uia;
  private readonly hash: string;

  constructor(
    client: MatrixClient,
    keys: Map<string, Uint8Array<ArrayBuffer>>,
    uia: Uia,
    hash: string,
  ) {
    this.client = client;
    this.keys = keys;
    this.uia = uia;
    this.hash = hash;
  }

  async status(): Promise<RecoveryStatus> {
    const crypto = this.client.getCrypto();
    if (!crypto) throw new Error("Crypto is not initialized");
    const [secret, cross, backup, keyId] = await Promise.all([
      crypto.getSecretStorageStatus(),
      crypto.getCrossSigningStatus(),
      crypto.getKeyBackupInfo(),
      this.client.secretStorage.getDefaultKeyId(),
    ]);
    const userId = this.client.getUserId();
    const deviceId = this.client.getDeviceId();
    const device =
      userId && deviceId ? await crypto.getDeviceVerificationStatus(userId, deviceId) : null;
    return {
      secretStorage: secret.ready,
      backup: backup !== null,
      crossSigning:
        cross.publicKeysOnDevice &&
        cross.privateKeysCachedLocally.masterKey &&
        cross.privateKeysCachedLocally.selfSigningKey &&
        cross.privateKeysCachedLocally.userSigningKey,
      deviceVerified: device?.isVerified() ?? false,
      hasRecoveryKey: keyId !== null,
    };
  }

  async setup(passphrase?: string): Promise<SetupResult> {
    const crypto = this.client.getCrypto();
    if (!crypto) throw new Error("Crypto is not initialized");
    const generated = await crypto.createRecoveryKeyFromPassphrase(passphrase);
    await crypto.bootstrapSecretStorage({
      createSecretStorageKey: async () => generated,
      setupNewSecretStorage: true,
    });
    await crypto.bootstrapCrossSigning({
      setupNewCrossSigning: true,
      authUploadDeviceSigningKeys: (makeRequest) =>
        this.uia.run((auth) => makeRequest(auth)),
    });
    await crypto.resetKeyBackup();
    const encoded = generated.encodedPrivateKey ?? encodeRecoveryKey(generated.privateKey);
    if (!encoded) throw new Error("Could not encode the recovery key");
    return { recoveryKey: encoded, status: await this.status() };
  }

  async unlock(recoveryKey?: string, passphrase?: string): Promise<RecoveryStatus> {
    const crypto = this.client.getCrypto();
    if (!crypto) throw new Error("Crypto is not initialized");
    const keyId = await this.client.secretStorage.getDefaultKeyId();
    if (!keyId) throw new Error("No recovery key found for this account");
    const event = this.client.getAccountData(`m.secret_storage.key.${keyId}`);
    if (!event) throw new Error("Recovery key metadata is missing");
    const content = event.getContent();
    if (!isRecord(content) || content["algorithm"] !== "m.secret_storage.v1.aes-hmac-sha2") {
      throw new Error("Unsupported recovery key");
    }
    const keyInfo = content as unknown as SecretStorageKeyDescriptionAesV1;
    let key: Uint8Array<ArrayBuffer> | null = null;
    if (recoveryKey) {
      key = decodeRecoveryKey(recoveryKey);
      if (!(await this.client.secretStorage.checkKey(key, keyInfo))) {
        throw new Error("Invalid recovery key");
      }
    } else if (passphrase) {
      const pass = content["passphrase"];
      if (!isRecord(pass) || typeof pass["salt"] !== "string" || typeof pass["iterations"] !== "number") {
        throw new Error("No recovery passphrase is configured");
      }
      key = await deriveRecoveryKeyFromPassphrase(
        passphrase,
        pass["salt"],
        pass["iterations"],
        typeof pass["bits"] === "number" ? pass["bits"] : 256,
      );
      if (!(await this.client.secretStorage.checkKey(key, keyInfo))) {
        throw new Error("Invalid recovery passphrase");
      }
    }
    if (!key) throw new Error("Enter a recovery key or passphrase");
    this.keys.set(keyId, key);
    await crypto.bootstrapCrossSigning({
      authUploadDeviceSigningKeys: (makeRequest) =>
        this.uia.run((auth) => makeRequest(auth)),
    });
    await crypto.bootstrapSecretStorage({});
    try {
      await crypto.loadSessionBackupPrivateKeyFromSecretStorage();
      await crypto.checkKeyBackupAndEnable();
      await crypto.restoreKeyBackup();
    } catch {
      // A missing backup does not block the key gate; the status reports it.
    }
    return this.status();
  }

  async reset(): Promise<SetupResult> {
    const crypto = this.client.getCrypto();
    if (!crypto) throw new Error("Crypto is not initialized");
    await crypto.resetEncryption((makeRequest) =>
      this.uia.run((auth) => makeRequest(auth)),
    );
    return this.setup();
  }

  async restoreBackup(): Promise<void> {
    const crypto = this.client.getCrypto();
    if (!crypto) throw new Error("Crypto is not initialized");
    await crypto.loadSessionBackupPrivateKeyFromSecretStorage();
    await crypto.restoreKeyBackup({
      progressCallback: () => undefined,
    });
  }

  async createBackup(): Promise<void> {
    const crypto = this.client.getCrypto();
    if (!crypto) throw new Error("Crypto is not initialized");
    await crypto.resetKeyBackup();
  }

  hashValue(): string {
    return this.hash;
  }
}
