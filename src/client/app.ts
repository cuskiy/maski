import { en } from "../catalogs/en.ts";
import { zhCN } from "../catalogs/zh-CN.ts";
import { initAuth } from "./auth.ts";
import { initChat } from "./chat.ts";
import type { LocaleId } from "./session.ts";

export function start(): void {
  const page = document.documentElement.dataset.page ?? "";
  const locale: LocaleId = document.documentElement.lang === "zh-CN" ? "zh-CN" : "en";
  const c = locale === "zh-CN" ? zhCN : en;

  if (page === "chat") initChat(c, locale);
  else if (page === "review") initChat(c, locale, true);
  else if (page === "server" || page === "login" || page === "register" || page === "key") {
    initAuth(page, c, locale);
  }
}
