/** One place for the browser's local UI storage and its failure policy. */
export const STORAGE = {
  locale: "maski.locale",
  server: "maski.server",
  account: "maski.account",
  gate: "maski.gate",
  sections: (account: string) => `maski.sections.${account}`,
  spaces: (account: string) => `maski.spaces.${account}`,
  notifications: (account: string) => `maski.notifications.${account}`,
  backup: (account: string) => `maski.backup.${account}`,
  recentEmoji: (account: string) => `maski.recent-emoji.${account}`,
  recentReactions: (account: string) => `maski.recent-reactions.${account}`,
  recentStickers: (account: string) => `maski.recent-stickers.${account}`,
  stickers: (account: string) => `maski.stickers.${account}`,
  legacySections: "maski.sections",
  legacySpaces: "maski.spaces",
} as const;

const PROBE = "maski.storage-check";

export function available(): boolean {
  try {
    localStorage.setItem(PROBE, "1");
    localStorage.removeItem(PROBE);
    return true;
  } catch {
    return false;
  }
}

export function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // The page keeps its in-memory value; the guard reports the unavailable store once.
  }
}

export function readJson(key: string): unknown {
  const value = read(key);
  if (value === null) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  write(key, JSON.stringify(value));
}
