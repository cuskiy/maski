/** The page remembers which account database to open; the token never leaves the worker. */
export interface LastAccount {
  hash: string;
  userId: string;
  name: string;
  baseUrl: string;
  keysReady: boolean;
}

const KEY = "maski:account";

export function readAccount(): LastAccount | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const record = value as Record<string, unknown>;
    if (typeof record["hash"] !== "string" || typeof record["userId"] !== "string") return null;
    return {
      hash: record["hash"],
      userId: record["userId"],
      name: typeof record["name"] === "string" ? record["name"] : record["userId"],
      baseUrl: typeof record["baseUrl"] === "string" ? record["baseUrl"] : "",
      keysReady: record["keysReady"] === true,
    };
  } catch {
    return null;
  }
}

export function writeAccount(account: LastAccount | null): void {
  if (account === null) localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, JSON.stringify(account));
}
