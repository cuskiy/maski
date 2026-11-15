import assert from "node:assert/strict";
import { pbkdf2Sync } from "node:crypto";
import test from "node:test";
import { decodeRecoveryKey, derivePassphraseKey } from "../src/worker/recovery.ts";

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function encodeBase58(bytes: Uint8Array): string {
  const digits: number[] = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let index = 0; index < digits.length; index += 1) {
      const next = (digits[index] ?? 0) * 256 + carry;
      digits[index] = next % 58;
      carry = Math.floor(next / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let result = "";
  for (const byte of bytes) {
    if (byte !== 0) break;
    result += "1";
  }
  for (const digit of digits.toReversed()) result += ALPHABET[digit] ?? "";
  return result;
}

function encodeRecovery(raw: Uint8Array): string {
  const bytes = new Uint8Array(2 + raw.length + 1);
  bytes.set([0x8b, 0x01], 0);
  bytes.set(raw, 2);
  let parity = 0;
  for (const byte of bytes.subarray(0, bytes.length - 1)) parity ^= byte;
  bytes[bytes.length - 1] = parity;
  return encodeBase58(bytes);
}

void test("decodes the Matrix recovery key representation", () => {
  const raw = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
  assert.deepEqual(decodeRecoveryKey(encodeRecovery(raw)), raw);
  const spaced = encodeRecovery(raw).replace(/.{4}/gu, "$& ");
  assert.deepEqual(decodeRecoveryKey(spaced), raw);
});

void test("rejects a wrong prefix, parity or length", () => {
  const raw = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
  const wrongPrefix = new Uint8Array(35);
  wrongPrefix.set([0x8b, 0x02], 0);
  wrongPrefix.set(raw, 2);
  assert.throws(() => decodeRecoveryKey(encodeBase58(wrongPrefix)));

  const encoded = encodeRecovery(raw);
  const wrongParity = encoded.slice(0, -1) + (encoded.endsWith("1") ? "2" : "1");
  assert.throws(() => decodeRecoveryKey(wrongParity));

  assert.throws(() => decodeRecoveryKey(encodeRecovery(raw.subarray(0, 31))));
});

void test("derives an SSSS key with PBKDF2-SHA-512 and a UTF-8 salt", async () => {
  const expected = pbkdf2Sync("password", "salt", 1_000, 32, "sha512");
  const derived = await derivePassphraseKey("password", { salt: "salt", iterations: 1_000 });
  assert.deepEqual(derived, Uint8Array.from(expected));
});
