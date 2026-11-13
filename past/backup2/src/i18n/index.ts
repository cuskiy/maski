import type { Locale } from "../core/types.ts";
import { en, type MessageKey } from "./en.ts";
import { zhCN } from "./zh-CN.ts";

export type { MessageKey };

const catalogs: Record<Locale, Partial<Record<MessageKey, string>>> = {
  en,
  "zh-CN": zhCN,
};

let current: Locale = "en";

export function localeFromPath(pathname: string): Locale {
  return pathname.startsWith("/zh-CN/") ? "zh-CN" : "en";
}

export function getLocale(): Locale {
  return current;
}

export function setLocale(locale: Locale): void {
  current = locale;
  document.documentElement.lang = locale;
}

export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const text = catalogs[current][key] ?? en[key];
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => String(params[name] ?? match));
}

const timeFormat = new Map<Locale, Intl.DateTimeFormat>();
const dayFormat = new Map<Locale, Intl.DateTimeFormat>();
const dateFormat = new Map<Locale, Intl.DateTimeFormat>();
const relativeFormat = new Map<Locale, Intl.RelativeTimeFormat>();

function format<T>(cache: Map<Locale, T>, build: (locale: Locale) => T): T {
  const hit = cache.get(current);
  if (hit) return hit;
  const made = build(current);
  cache.set(current, made);
  return made;
}

export function timeOfDay(ts: number): string {
  return format(timeFormat, (locale) => new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" })).format(ts);
}

export function dayLabel(ts: number): string {
  const now = new Date();
  const then = new Date(ts);
  const sameDay = now.toDateString() === then.toDateString();
  if (sameDay) return t("room.today");
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (yesterday.toDateString() === then.toDateString()) return t("room.yesterday");
  return format(dayFormat, (locale) =>
    new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", year: "numeric" }),
  ).format(ts);
}

export function shortDate(ts: number): string {
  return format(dateFormat, (locale) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" })).format(ts);
}

export function relativeTime(ts: number, now: number): string {
  const seconds = Math.round((ts - now) / 1000);
  const abs = Math.abs(seconds);
  const rtf = format(relativeFormat, (locale) => new Intl.RelativeTimeFormat(locale, { numeric: "auto" }));
  if (abs < 60) return rtf.format(0, "second");
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), "hour");
  if (abs < 7 * 86400) return rtf.format(Math.round(seconds / 86400), "day");
  return shortDate(ts);
}

export function fileSize(bytes: number): string {
  const units = ["B", "kB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${new Intl.NumberFormat(current, { maximumFractionDigits: unit === 0 ? 0 : 1 }).format(value)} ${units[unit] ?? "B"}`;
}
