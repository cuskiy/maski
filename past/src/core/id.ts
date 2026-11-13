/** The account database is keyed by the user id, never by a token. */
export async function accountHash(userId: string): Promise<string> {
  const bytes = new TextEncoder().encode(userId);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest).slice(0, 16)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function newTxnId(): string {
  return `txn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
