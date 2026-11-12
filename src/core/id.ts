export async function accountHash(userId: string): Promise<string> {
  const bytes = new TextEncoder().encode(userId);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .slice(0, 8)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function mediaCacheKey(mxc: string, size: number, method: "scale" | "crop"): string {
  return `${mxc}@${size}/${method}`;
}

export function mxcFromUrl(url: string): string {
  return url.startsWith("mxc://") ? url : "";
}
