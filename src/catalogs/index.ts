import { t, type Catalog } from "../lib/catalog.ts";
import { en } from "./en.ts";
import { zhCN } from "./zh-CN.ts";

export interface Locale {
  readonly id: string;
  readonly path: string;
  readonly label: string;
  readonly catalog: Catalog;
}

export const locales: readonly Locale[] = [
  { id: "en", path: "/", label: t(en, "lang.name"), catalog: en },
  { id: "zh-CN", path: "/zh-CN/", label: t(zhCN, "lang.name"), catalog: zhCN },
];
