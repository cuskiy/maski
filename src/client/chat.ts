import type { Catalog } from "../lib/catalog.ts";
import type { ChatState, SectionId } from "../core/types.ts";
import { emptyChatState } from "../core/state.ts";
import { createStore } from "./store.ts";
import { WorkerSource } from "./workerSource.ts";
import type { ChatSource } from "./source.ts";
import { createActions, wireSources } from "./actions.ts";
import { Composer } from "./regions/composer.ts";
import { mountHeader } from "./regions/header.ts";
import { mountNavigation } from "./regions/navigation.ts";
import { mountTimeline } from "./regions/timeline.ts";
import { wireSurfaces } from "./surfaces.ts";
import type { LocaleId } from "../core/locales.ts";
import { mockSession } from "./session.ts";
import { watchMediaLoads } from "./mediaLoads.ts";
import { wireComposerInteractions } from "./interactions.ts";
import * as prefs from "./prefs.ts";

export function initChat(c: Catalog, locale: LocaleId): void {
  mountChat(c, locale, new WorkerSource(), emptyChatState(), mockSession().account ?? "local");
}

export function mountChat(c: Catalog, locale: LocaleId, source: ChatSource, base: ChatState, account: string): void {
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
    backupReady: prefs.readBackup(account) ?? base.backupReady,
    recentEmoji: prefs.readRecentEmoji(account) ?? base.recentEmoji,
    recentReactions: prefs.readRecentReactions(account) ?? base.recentReactions,
    recentStickers: prefs.readRecentStickers(account) ?? base.recentStickers,
  };

  const store = createStore(initial);
  const actions = createActions({ store, source, c, account });
  const unwire = wireSources(store, source);
  const unwatchMedia = watchMediaLoads();

  source.start();
  if (initial.roomId !== null) {
    source.open(initial.roomId);
    source.members(initial.roomId);
  }

  const composer = new Composer({ store, actions, c, account });
  const unwireInteractions = wireComposerInteractions(composer);
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
      unwatchMedia();
      unwireInteractions();
      composer.dispose();
      for (const dispose of disposers) dispose();
      source.dispose();
    },
    { once: true },
  );
}
