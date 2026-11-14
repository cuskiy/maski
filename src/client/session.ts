import type { LocaleId } from "../core/locales.ts";
import { LOCALE_DEFS } from "../core/locales.ts";
import * as storage from "./storage.ts";

export interface MockSession {
  readonly server: string | null;
  readonly account: string | null;
  readonly key: boolean;
}

export function storedLocale(): LocaleId | null {
  const value = storage.read(storage.STORAGE.locale);
  return LOCALE_DEFS.find((entry) => entry.id === value)?.id ?? null;
}

export function setLocale(locale: LocaleId): void {
  if (storedLocale() === locale) return;
  storage.write(storage.STORAGE.locale, locale);
}

export function systemLocale(): LocaleId {
  const language = navigator.languages.at(0) ?? navigator.language;
  return language.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

export function mockSession(): MockSession {
  return {
    server: storage.read(storage.STORAGE.server),
    account: storage.read(storage.STORAGE.account),
    key: storage.read(storage.STORAGE.key) === "ready",
  };
}

export function setServer(server: string): void {
  storage.write(storage.STORAGE.server, server);
}

export function setAccount(account: string): void {
  storage.write(storage.STORAGE.account, account);
}

export function setKeyReady(): void {
  storage.write(storage.STORAGE.key, "ready");
}

export function clearSession(): void {
  storage.write(storage.STORAGE.server, null);
  storage.write(storage.STORAGE.account, null);
  storage.write(storage.STORAGE.key, null);
}
