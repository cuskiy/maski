export const LOCALE_DEFS = [
  { id: "en", path: "/en/" },
  { id: "zh-CN", path: "/zh-CN/" },
] as const;

export type LocaleId = (typeof LOCALE_DEFS)[number]["id"];

export function localeForPath(pathname: string): LocaleId | null {
  for (const locale of LOCALE_DEFS) {
    if (pathname === locale.path || pathname.startsWith(locale.path)) return locale.id;
  }
  return null;
}

export function localeRoot(locale: LocaleId): string {
  return LOCALE_DEFS.find((entry) => entry.id === locale)?.path ?? LOCALE_DEFS[0].path;
}
