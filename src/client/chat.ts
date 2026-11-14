import type { Catalog } from "../lib/catalog.ts";
import type { ChatState, SectionId } from "../core/types.ts";
import { emptyChatState } from "../core/state.ts";
import { mockChatState } from "../core/mock.ts";
import { createStore } from "./store.ts";
import { MockSource } from "./mockSource.ts";
import { createActions, wireSources } from "./actions.ts";
import { Composer } from "./regions/composer.ts";
import { mountHeader } from "./regions/header.ts";
import { mountNavigation } from "./regions/navigation.ts";
import { mountTimeline } from "./regions/timeline.ts";
import { wireSurfaces } from "./surfaces.ts";
import type { LocaleId } from "../core/locales.ts";
import { mockSession } from "./session.ts";
import * as prefs from "./prefs.ts";

export function initChat(c: Catalog, locale: LocaleId, review = false): void {
  const account = mockSession().account ?? "local";
  const base = review ? mockChatState() : emptyChatState();
  const storedSections = prefs.readSections(account);
  const sections = { ...base.sections };
  if (storedSections !== null) {
    for (const [id, open] of Object.entries(storedSections)) {
      if (open !== undefined) sections[id as SectionId] = { open };
    }
  }
  const initial: ChatState = {
    ...base,
    sections,
    openSpaces: prefs.readSpaces(account) ?? base.openSpaces,
    notifications: prefs.readNotifications(account) ?? base.notifications,
  };

  const store = createStore(initial);
  const source = new MockSource(review);
  const actions = createActions({ store, source, c, account });
  const unwire = wireSources(store, source);

  source.start();
  if (initial.roomId !== null) source.open(initial.roomId);

  const composer = new Composer({ store, actions, c, account });
  const disposers = [
    mountNavigation({ store, actions, c }),
    mountHeader({ store, actions, c }),
    mountTimeline({ store, actions, c, locale }),
    wireSurfaces({ store, actions, c, composer }),
  ];

  const baseTitle = document.title;
  const updateTitle = (): void => {
    const state = store.snapshot();
    const total = state.rooms.reduce((sum, room) => sum + room.unread, 0);
    document.title = state.notifications.titleTotal && total > 0 ? `(${String(total)}) ${baseTitle}` : baseTitle;
  };
  const unwatchTitle = store.watch(["rooms", "notifications"], updateTitle);
  updateTitle();

  window.addEventListener(
    "beforeunload",
    () => {
      unwire();
      unwatchTitle();
      composer.dispose();
      for (const dispose of disposers) dispose();
      source.dispose();
    },
    { once: true },
  );
}
