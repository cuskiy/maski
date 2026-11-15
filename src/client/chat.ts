import type { Catalog } from "../lib/catalog.ts";
import type { ChatState } from "../core/types.ts";
import { emptyChatState, isSectionId } from "../core/state.ts";
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
import { localeRoot } from "../core/locales.ts";
import { mockSession } from "./session.ts";
import { watchMediaLoads } from "./mediaLoads.ts";
import { wireComposerInteractions } from "./interactions.ts";
import { hydrateDrafts } from "./uiDb.ts";
import * as prefs from "./prefs.ts";
import { ROOM_HASH, roomHash, roomIdFromHash } from "./roomRoute.ts";

function pageUrl(): string {
  return `${location.pathname}${location.search}`;
}

export function initChat(c: Catalog, locale: LocaleId): void {
  mountChat(c, locale, new WorkerSource(), emptyChatState(), mockSession().account ?? "local");
}

export function mountChat(c: Catalog, locale: LocaleId, source: ChatSource, base: ChatState, account: string): void {
  const storedSections = prefs.readSections(account);
  const sections = { ...base.sections };
  if (storedSections !== null) {
    for (const [id, open] of Object.entries(storedSections)) {
      if (open !== undefined && isSectionId(id)) sections[id] = { open };
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
    stickersEnabled: prefs.readStickers(account) ?? base.stickersEnabled,
  };

  const store = createStore(initial);
  const actions = createActions({ store, source, c, account });
  const unwire = wireSources(store, source);
  const unwatchMedia = watchMediaLoads();
  const unwatchGate = store.watch(["phase"], () => {
    if (store.read("phase") === "locked") location.assign(`${localeRoot(locale)}key/`);
  });

  const routing = document.documentElement.dataset["page"] === "chat";
  let roomsSeen = false;
  const selectFromHash = (): void => {
    if (!routing || !roomsSeen) return;
    const wanted = roomIdFromHash(location.hash);
    if (wanted === null) return;
    const state = store.snapshot();
    if (state.rooms.some((room) => room.roomId === wanted)) {
      if (state.roomId !== wanted) actions.selectRoom(wanted);
    } else {
      history.replaceState(null, "", pageUrl());
    }
  };
  const unwatchRoomsHash = store.watch(["rooms"], () => {
    roomsSeen = true;
    selectFromHash();
  });
  const unwatchRoomUrl = store.watch(["roomId"], () => {
    if (!routing) return;
    const roomId = store.read("roomId");
    if (roomId === null) {
      if (location.hash.startsWith(ROOM_HASH)) history.replaceState(null, "", pageUrl());
      return;
    }
    const next = roomHash(roomId);
    if (location.hash !== next) history.pushState(null, "", `${pageUrl()}${next}`);
  });
  const onHashChange = (): void => {
    if (!routing) return;
    if (location.hash === "" && store.read("roomId") !== null) {
      actions.back();
      return;
    }
    if (location.hash.startsWith(ROOM_HASH) && roomIdFromHash(location.hash) === null) {
      history.replaceState(null, "", pageUrl());
      return;
    }
    selectFromHash();
  };
  window.addEventListener("hashchange", onHashChange);

  source.start();
  if (initial.roomId !== null) {
    source.open(initial.roomId);
    source.members(initial.roomId);
  }

  let disposed = false;
  let composer: Composer | null = null;
  let unwireInteractions: (() => void) | null = null;
  let unwireSurfaces: (() => void) | null = null;
  const mountComposer = (): void => {
    if (disposed) return;
    composer = new Composer({ store, actions, c, account });
    unwireInteractions = wireComposerInteractions(composer);
    unwireSurfaces = wireSurfaces({ store, actions, c, composer });
  };
  // The composer's synchronous draft reads come from the mirror hydrated here first.
  void hydrateDrafts(account).then(mountComposer, mountComposer);

  const disposers = [
    mountNavigation({ store, actions, c }),
    mountHeader({ store, actions, c }),
    mountTimeline({ store, actions, c, locale }),
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
      disposed = true;
      unwire();
      unwatchTitle();
      unwatchMedia();
      unwatchGate();
      unwatchRoomsHash();
      unwatchRoomUrl();
      window.removeEventListener("hashchange", onHashChange);
      unwireInteractions?.();
      composer?.dispose();
      unwireSurfaces?.();
      for (const dispose of disposers) dispose();
      source.dispose();
    },
    { once: true },
  );
}
