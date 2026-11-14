export type LocaleId = "en" | "zh-CN";

export interface MockSession {
  readonly server: string | null;
  readonly account: string | null;
  readonly key: boolean;
}

const KEYS = {
  locale: "maski.locale",
  server: "maski.server",
  account: "maski.account",
  key: "maski.key",
} as const;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    // Storage can be unavailable; the guard reports it instead of redirecting.
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable; the guard reports it instead of redirecting.
  }
}

export function storageAvailable(): boolean {
  try {
    const key = "maski.storage-check";
    localStorage.setItem(key, "1");
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function storedLocale(): LocaleId | null {
  const value = read(KEYS.locale);
  return value === "en" || value === "zh-CN" ? value : null;
}

export function setLocale(locale: LocaleId): void {
  write(KEYS.locale, locale);
}

export function systemLocale(): LocaleId {
  const language = navigator.languages.at(0) ?? navigator.language;
  return language.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

export function localeForPath(pathname: string): LocaleId | null {
  if (pathname.startsWith("/zh-CN/")) return "zh-CN";
  if (pathname.startsWith("/en/")) return "en";
  return null;
}

export function localeRoot(locale: LocaleId): string {
  return locale === "en" ? "/en/" : "/zh-CN/";
}

export function mockSession(): MockSession {
  return {
    server: read(KEYS.server),
    account: read(KEYS.account),
    key: read(KEYS.key) === "ready",
  };
}

export function setServer(server: string): void {
  write(KEYS.server, server);
}

export function setAccount(account: string): void {
  write(KEYS.account, account);
}

export function setKeyReady(): void {
  write(KEYS.key, "ready");
}

export function clearSession(): void {
  write(KEYS.server, null);
  write(KEYS.account, null);
  write(KEYS.key, null);
}
