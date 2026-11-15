import { t } from "../lib/catalog.ts";
import type { Catalog } from "../lib/catalog.ts";
import { html, type Html } from "../lib/html.ts";
import { emptyChatState } from "../core/state.ts";
import { REGION } from "../core/regions.ts";
import { CHAT_SURFACES } from "../core/surfaces.ts";
import type { ChatState, SourceCapabilities } from "../core/types.ts";
import { REVIEW_CAPABILITIES } from "../core/types.ts";
import { composer } from "../components/composer.ts";
import { nav } from "../components/nav.ts";
import { surface } from "../components/surface.ts";
import { bootSurfaceBody } from "../components/surfaces.ts";
import { timeline } from "../components/timeline.ts";
import { topbar } from "../components/topbar.ts";

export function appShell(c: Catalog, locale: string, capabilities: SourceCapabilities = REVIEW_CAPABILITIES): Html {
  const state: ChatState = emptyChatState();
  return html`<div class="app" data-region="${REGION.shell}" data-view="list">
      ${nav(state, c, capabilities)}
      <main class="content" id="${REGION.content}" data-region="${REGION.content}">
        <h1 class="visually-hidden">${t(c, "chat.title")}</h1>
        ${topbar(state, c, capabilities)} ${timeline(state, c, locale, capabilities)} ${composer(state, c, capabilities)}
      </main>
    </div>
    ${CHAT_SURFACES.map((entry) =>
      surface({
        c,
        id: entry.id,
        titleKey: entry.titleKey,
        kind: entry.kind,
        manual: entry.popover === "manual",
        body: bootSurfaceBody(c, entry.id, capabilities),
      }),
    )}`;
}
