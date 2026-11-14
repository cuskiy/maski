import type { Catalog } from "../lib/catalog.ts";
import type { LocaleId } from "../core/locales.ts";
import { LOCALE_DEFS } from "../core/locales.ts";
import { en } from "./en.ts";
import { zhCN } from "./zh-CN.ts";

export interface Locale {
  readonly id: LocaleId;
  readonly path: string;
  readonly catalog: Catalog;
}

const CATALOGS: Readonly<Record<LocaleId, Catalog>> = {
  en,
  "zh-CN": zhCN,
};

export const locales: readonly Locale[] = LOCALE_DEFS.map((definition) => ({
  id: definition.id,
  path: definition.path,
  catalog: CATALOGS[definition.id],
}));
