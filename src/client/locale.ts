import { locales } from "../catalogs/index.ts";

const KEY = "maski:locale";

export function storedLocale(): string | null {
  const value = localStorage.getItem(KEY);
  return value !== null && locales.some((locale) => locale.id === value) ? value : null;
}

/** The browser's languages, matched to the ones we generate; English when nothing matches. */
export function browserLocale(): string {
  for (const tag of navigator.languages) {
    const lower = tag.toLowerCase();
    const exact = locales.find((locale) => locale.id.toLowerCase() === lower);
    if (exact) return exact.id;
    const base = lower.split("-")[0] ?? "";
    const partial = locales.find((locale) => locale.id.toLowerCase().split("-")[0] === base);
    if (partial) return partial.id;
  }
  return "en";
}

export function resolveLocale(): string {
  return storedLocale() ?? browserLocale();
}

export function rememberLocale(id: string): void {
  localStorage.setItem(KEY, id);
}

export function pathOf(id: string): string {
  return locales.find((locale) => locale.id === id)?.path ?? "/";
}
