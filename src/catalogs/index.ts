import { en } from "./en.ts";
import { zhCN } from "./zh-CN.ts";
import type { Catalog } from "../lib/catalog.ts";

export interface Locale {
  readonly id: string;
  readonly path: string;
  readonly catalog: Catalog;
}

export const locales: readonly Locale[] = [
  { id: "en", path: "/en/", catalog: en },
  { id: "zh-CN", path: "/zh-CN/", catalog: zhCN },
];
