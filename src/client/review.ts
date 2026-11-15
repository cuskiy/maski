import { locales } from "../catalogs/index.ts";
import type { LocaleId } from "../core/locales.ts";
import { initReviewChat } from "./reviewChat.ts";

const locale: LocaleId = document.documentElement.lang === "zh-CN" ? "zh-CN" : "en";
const c = locales.find((entry) => entry.id === locale)?.catalog;
if (c === undefined) throw new Error("The page locale has no catalog");
if (document.documentElement.dataset["page"] === "review") initReviewChat(c, locale);
