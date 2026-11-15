const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const PREFIX = [0x8b, 0x01] as const;
const KEY_SIZE = 32;

function decodeBase58(value: string): Uint8Array {
  const bytes: number[] = [0];
  for (const character of value) {
    const digit = ALPHABET.indexOf(character);
    if (digit === -1) throw new Error("invalid base58");
    let carry = digit;
    for (let index = 0; index < bytes.length; index += 1) {
      const next = (bytes[index] ?? 0) * 58 + carry;
      bytes[index] = next & 0xff;
      carry = next >> 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const character of value) {
    if (character !== "1") break;
    bytes.push(0);
  }
  return Uint8Array.from(bytes.toReversed());
}

/** Decode the Matrix cryptographic key representation into the raw 32-byte key. */
export function decodeRecoveryKey(value: string): Uint8Array<ArrayBuffer> {
  const decoded = decodeBase58(value.replace(/\s/gu, ""));
  if (decoded.length !== PREFIX.length + KEY_SIZE + 1) throw new Error("invalid recovery key length");
  let parity = 0;
  for (const byte of decoded) parity ^= byte;
  if (parity !== 0) throw new Error("invalid recovery key parity");
  if (decoded[0] !== PREFIX[0] || decoded[1] !== PREFIX[1]) throw new Error("invalid recovery key prefix");
  return Uint8Array.from(decoded.slice(PREFIX.length, PREFIX.length + KEY_SIZE));
}

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    throw new Error("invalid secret storage salt");
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export interface PassphraseDerivation {
  readonly salt: string;
  readonly iterations: number;
  readonly bits?: number;
}

/** Derive an SSSS private key from a passphrase using the spec's PBKDF2 parameters. */
export async function derivePassphraseKey(
  passphrase: string,
  derivation: PassphraseDerivation,
): Promise<Uint8Array<ArrayBuffer>> {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: decodeBase64(derivation.salt),
      iterations: derivation.iterations,
      hash: "SHA-256",
    },
    material,
    derivation.bits ?? 256,
  );
  return new Uint8Array(bits);
}
