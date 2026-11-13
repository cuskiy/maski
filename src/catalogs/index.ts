import type { Catalog } from "../lib/catalog.ts";
import { en } from "./en.ts";
import { zhCN } from "./zh-CN.ts";

export interface Locale {
  readonly id: string;
  readonly path: string;
  readonly label: string;
  readonly catalog: Catalog;
}

export const locales: readonly Locale[] = [
  { id: "en", path: "/", label: "English", catalog: en },
  { id: "zh-CN", path: "/zh-CN/", label: "简体中文", catalog: zhCN },
];
