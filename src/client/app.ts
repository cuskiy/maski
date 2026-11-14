import { locales } from "../catalogs/index.ts";
import { initAuth } from "./auth.ts";
import { initChat } from "./chat.ts";
import type { LocaleId } from "../core/locales.ts";

export function start(): void {
  const page = document.documentElement.dataset.page ?? "";
  const locale: LocaleId = document.documentElement.lang === "zh-CN" ? "zh-CN" : "en";
  const c = locales.find((entry) => entry.id === locale)?.catalog;
  if (c === undefined) throw new Error("The page locale has no catalog");

  if (page === "chat") initChat(c, locale);
  else if (page === "review") initChat(c, locale, true);
  else if (page === "server" || page === "login" || page === "register" || page === "key") {
    initAuth(page, c, locale);
  }
}
