/** The account database is keyed by the user id, never by a token. */
export async function accountHash(userId: string): Promise<string> {
  const bytes = new TextEncoder().encode(userId);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest).slice(0, 12)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
