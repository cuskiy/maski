import type { Keys, Room, Session, Window } from "../core/types.ts";
import type { Event } from "../protocol/messages.ts";
import { locales } from "../catalogs/index.ts";
import { useCatalog, t } from "../i18n.ts";
import { el } from "../ui.ts";
import { readAccount } from "./account.ts";
import { Composer } from "./composer.ts";
import { Picker } from "./picker.ts";
import { mountSettings } from "./settings.ts";
import { Nav } from "./nav.ts";
import { watchRoute } from "./router.ts";
import { applySession, get, set, subscribe } from "./store.ts";
import { Timeline } from "./timeline.ts";
import { WorkerClient } from "./worker.ts";

/** The chat page: start the worker, follow the hash, and let each region draw itself. */
export function startChat(): void {
  const locale = locales.find((entry) => entry.id === document.documentElement.lang) ?? locales[0];
  if (locale) useCatalog(locale.catalog);

  const shell = document.querySelector<HTMLElement>(".shell");
  const timelineRoot = document.querySelector<HTMLElement>(".timeline-wrap");
  const composerRoot = document.querySelector<HTMLElement>(".composer");
  const navRoot = document.querySelector<HTMLElement>(".nav-sections");
  const header = document.querySelector<HTMLElement>(".room-header");
  if (!shell || !timelineRoot || !composerRoot || !navRoot || !header) return;

  const worker = new WorkerClient();
  new Nav(navRoot, worker);
  const composer = new Composer(composerRoot, worker);
  const emojiSurface = document.querySelector<HTMLElement>('#surface-emoji');
  if (!emojiSurface) return;
  const picker = new Picker(emojiSurface, worker, (text) => composer.insert(text), () => get().roomId);
  const timeline = new Timeline(timelineRoot, worker, composer, picker);
  const settingsBody = document.querySelector<HTMLElement>('[data-region="settings-body"]');
  if (settingsBody) mountSettings(settingsBody, worker);

  const draw = (): void => {
    const state = get();
    const room = state.rooms.find((entry) => entry.roomId === state.roomId) ?? null;
    shell.dataset["room"] = room === null ? "false" : "true";
    drawHeader(header, room);
    drawNotice(timelineRoot, state.phase, timeline);
    const newest = state.messages.at(-1) ?? null;
    if (state.phase === "ready" && room !== null && newest !== null && newest.roomId === state.roomId) {
      markRead(state.roomId, newest.id);
    }
  };

  subscribe(["phase", "rooms", "roomId", "messages"], draw);

  const account = readAccount();
  // The router only lands here when the last check opened the gate; the stored rooms can paint
  // before the worker finishes crypto, and the start reply corrects the gate if the keys are gone.
  if (account?.keysReady === true) set({ phase: "ready" });
  const started = worker.send<{ session: Session | null; keys: Keys | null }>({ type: "start", accountHash: account?.hash ?? null, wasm: worker.wasm() });

  const openWindow = async (roomId: string): Promise<void> => {
    try {
      await started;
      const window = await worker.send<Window>({ type: "open", roomId });
      if (window.roomId === get().roomId) set({ messages: window.messages, hasOlder: window.hasOlder });
    } catch {
      // the room may be gone; the next sync repairs the list
    }
  };

  worker.onEvent((event: Event) => {
    if (event.event === "rooms") set({ rooms: event.rooms });
    if (event.event === "connection") set({ connection: event.state });
    if (event.event === "window" && event.window.roomId === get().roomId) {
      set({ messages: event.window.messages, hasOlder: event.window.hasOlder });
    }
    if (event.event === "outbox") {
      const roomId = get().roomId;
      if (roomId !== null) void openWindow(roomId);
    }
    if (event.event === "ready") applySession(event.session, event.keys);
  });

  let marked = "";
  let pending = "";

  const markRead = (roomId: string | null, eventId: string): void => {
    if (roomId === null || !eventId.startsWith("$") || !timeline.atBottom()) return;
    const key = `${roomId}:${eventId}`;
    if (marked === key || pending === key) return;
    pending = key;
    void worker
      .send({ type: "markRead", roomId, eventId })
      .catch(() => undefined)
      .finally(() => {
        marked = key;
        if (pending === key) pending = "";
      });
  };

  watchRoute((roomId) => {
    if (roomId === null) {
      set({ messages: [], hasOlder: false });
      return;
    }
    void openWindow(roomId);
  });

  started.then((result) => applySession(result.session, result.keys)).catch(() => applySession(null, null));

  draw();
  void timeline;
}

function drawHeader(header: HTMLElement, room: Room | null): void {
  header.hidden = room === null;
  const text = header.querySelector<HTMLElement>(".room-head-text");
  if (!text) return;
  text.replaceChildren();
  if (room === null) return;
  text.append(
    el("h2", { class: "room-title", text: room.name }),
    el("p", { class: "room-topic", text: room.topic }),
  );
}

function drawNotice(root: HTMLElement, phase: string, timeline: Timeline): void {
  const existing = root.querySelector<HTMLElement>(".timeline-note");
  if (phase === "ready" || phase === "boot") {
    existing?.remove();
    return;
  }
  const text = phase === "gated" ? t("chat.keyMissing") : t("chat.notSignedIn");
  if (existing) {
    existing.textContent = text;
    return;
  }
  root.prepend(el("p", { class: "note timeline-note", text }));
  timeline.scrollToBottom();
}
