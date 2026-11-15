import type { Catalog } from "../lib/catalog.ts";
import { mockChatState } from "../core/mock.ts";
import type { LocaleId } from "../core/locales.ts";
import { MockSource } from "./mockSource.ts";
import { mockSession } from "./session.ts";
import { mountChat } from "./chat.ts";

export function initReviewChat(c: Catalog, locale: LocaleId): void {
  mountChat(c, locale, new MockSource(true), mockChatState(), mockSession().account ?? "local");
}
