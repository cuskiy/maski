import type { KeyGate } from "../core/types.ts";
import type { LocaleId } from "../core/locales.ts";
import { LOCALE_DEFS } from "../core/locales.ts";
import * as storage from "./storage.ts";

export interface MockSession {
  readonly server: string | null;
  readonly account: string | null;
  readonly gate: KeyGate;
}

function isGate(value: string): value is KeyGate {
  return GATES.has(value);
}

const GATES: ReadonlySet<string> = new Set<KeyGate>([
  "ready",
  "missing",
  "unknown",
  "needs-recovery",
  "needs-verification",
]);

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
  const gate = storage.read(storage.STORAGE.gate);
  return {
    server: storage.read(storage.STORAGE.server),
    account: storage.read(storage.STORAGE.account),
    gate: gate !== null && isGate(gate) ? gate : "unknown",
  };
}

export function setServer(server: string): void {
  storage.write(storage.STORAGE.server, server);
}

export function setAccount(account: string): void {
  storage.write(storage.STORAGE.account, account);
}

export function setGate(gate: KeyGate): void {
  storage.write(storage.STORAGE.gate, gate);
}

export function clearSession(): void {
  storage.write(storage.STORAGE.server, null);
  storage.write(storage.STORAGE.account, null);
  storage.write(storage.STORAGE.gate, null);
}
