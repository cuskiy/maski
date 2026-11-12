import { accountDbName } from "./schema";

const encoder = new TextEncoder();

export async function accountHash(userId: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(userId));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

export function accountDb(hash: string): string {
  return accountDbName(hash);
}

export function txnId(): string {
  return crypto.randomUUID();
}

export function roomPackId(roomId: string, stateKey: string): string {
  return `room:${roomId}:${stateKey}`;
}

export function userPackId(userId: string): string {
  return `user:${userId}`;
}

export function legacyPackId(roomId: string, stateKey: string): string {
  return `legacy:${roomId}:${stateKey}`;
}

export function mediaCacheKey(
  mxc: string,
  width: number,
  height: number,
  method: string,
  encryptedHash: string | null,
): string {
  return `${mxc}|${width}x${height}|${method}|${encryptedHash ?? ""}`;
}

export function mxcMediaId(mxc: string): string {
  return mxc.replace(/^mxc:\/\//, "");
}
