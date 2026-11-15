/**
 * Encrypted attachment support for the pinned SDK, which has none. The ciphertext hash is verified
 * before a byte is decrypted, and every malformed field is a typed `corrupt` failure: no key, no IV
 * and no verified hash means no URL.
 */
import { WorkerFailure } from "./failure.ts";
import { isRecord } from "../lib/json.ts";
import type { EncryptedFileData } from "./mediaTypes.ts";

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const BASE64_URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const KEY_BYTES = 32;
const IV_BYTES = 16;

function encode(bytes: Uint8Array, alphabet: string): string {
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    output += alphabet[first >> 2] ?? "";
    output += alphabet[((first & 0x03) << 4) | ((second ?? 0) >> 4)] ?? "";
    if (second !== undefined) output += alphabet[((second & 0x0f) << 2) | ((third ?? 0) >> 6)] ?? "";
    if (third !== undefined) output += alphabet[third & 0x3f] ?? "";
  }
  return output;
}

function decode(value: string, alphabet: string): Uint8Array<ArrayBuffer> | null {
  const clean = value.replace(/=+$/u, "");
  if (clean.length === 0 || clean.length % 4 === 1) return null;
  const output: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const character of clean) {
    const index = alphabet.indexOf(character);
    if (index === -1) return null;
    buffer = (buffer << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output.push((buffer >> bits) & 0xff);
    }
  }
  return new Uint8Array(output);
}

export function toBase64(bytes: Uint8Array): string {
  return encode(bytes, BASE64);
}

export function toBase64Url(bytes: Uint8Array): string {
  return encode(bytes, BASE64_URL);
}

/** Accepts both the standard and the URL-safe alphabet, padded or not. */
export function fromBase64(value: string): Uint8Array<ArrayBuffer> | null {
  return decode(value, BASE64) ?? decode(value, BASE64_URL);
}

function equal(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  return difference === 0;
}

export async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

export interface AttachmentEncryption {
  readonly ciphertext: Blob;
  /** Standard unpadded base64, as the spec requires for `iv` and `hashes`. */
  readonly iv: string;
  readonly sha256: string;
  /** URL-safe unpadded base64, as a JWK requires. */
  readonly key: string;
}

export async function encryptAttachment(plaintext: Blob): Promise<AttachmentEncryption> {
  const key = crypto.getRandomValues(new Uint8Array(KEY_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  // AES-CTR with a 64-bit counter: the low 8 bytes of the counter block must stay zero.
  iv.fill(0, 8);
  const cryptoKey = await crypto.subtle.importKey("raw", key, "AES-CTR", false, ["encrypt"]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-CTR", counter: iv, length: 64 }, cryptoKey, await plaintext.arrayBuffer()),
  );
  return {
    ciphertext: new Blob([ciphertext], { type: "application/octet-stream" }),
    iv: toBase64(iv),
    sha256: toBase64(await sha256(ciphertext)),
    key: toBase64Url(key),
  };
}

/** The spec `EncryptedFile`, with the uploaded ciphertext URL attached. */
export function encryptedFile(url: string, encryption: AttachmentEncryption): EncryptedFileData {
  return {
    url,
    v: "v2",
    key: {
      kty: "oct",
      alg: "A256CTR",
      key_ops: ["encrypt", "decrypt"],
      ext: true,
      k: encryption.key,
    },
    iv: encryption.iv,
    hashes: { sha256: encryption.sha256 },
  };
}

interface ParsedFile {
  readonly key: Uint8Array<ArrayBuffer>;
  readonly iv: Uint8Array<ArrayBuffer>;
  readonly sha256: Uint8Array<ArrayBuffer>;
}

function parse(value: unknown): ParsedFile {
  if (!isRecord(value)) throw new WorkerFailure("corrupt");
  const key = value["key"];
  const hashes = value["hashes"];
  if (
    value["v"] !== "v2" ||
    typeof value["url"] !== "string" ||
    !value["url"].startsWith("mxc://") ||
    typeof value["iv"] !== "string" ||
    !isRecord(key) ||
    !isRecord(hashes) ||
    key["kty"] !== "oct" ||
    key["alg"] !== "A256CTR" ||
    typeof key["k"] !== "string" ||
    typeof hashes["sha256"] !== "string"
  ) {
    throw new WorkerFailure("corrupt");
  }
  const keyBytes = fromBase64(key["k"]);
  const ivBytes = fromBase64(value["iv"]);
  const hashBytes = fromBase64(hashes["sha256"]);
  if (
    keyBytes === null ||
    keyBytes.length !== KEY_BYTES ||
    ivBytes === null ||
    ivBytes.length !== IV_BYTES ||
    hashBytes === null ||
    hashBytes.length !== 32
  ) {
    throw new WorkerFailure("corrupt");
  }
  return { key: keyBytes, iv: ivBytes, sha256: hashBytes };
}

/**
 * Verifies the ciphertext hash, then decrypts. The event's key and IV are used once; a bad field
 * or a hash mismatch is a `corrupt` failure and no plaintext leaves this function.
 */
export async function decryptAttachment(ciphertext: Blob, value: unknown): Promise<Blob> {
  const file = parse(value);
  const bytes = new Uint8Array(await ciphertext.arrayBuffer());
  if (!equal(await sha256(bytes), file.sha256)) throw new WorkerFailure("corrupt");
  try {
    const cryptoKey = await crypto.subtle.importKey("raw", file.key, "AES-CTR", false, ["decrypt"]);
    const plaintext = await crypto.subtle.decrypt({ name: "AES-CTR", counter: file.iv, length: 64 }, cryptoKey, bytes);
    return new Blob([plaintext], { type: "application/octet-stream" });
  } catch {
    throw new WorkerFailure("corrupt");
  }
}
