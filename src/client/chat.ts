import type { Keys, Room, Session, Window } from "../core/types.ts";
import type { Event } from "../protocol/messages.ts";
import { locales } from "../catalogs/index.ts";
import { useCatalog, t } from "../i18n.ts";
import { el } from "../ui.ts";
import { readAccount } from "./account.ts";
import { Composer } from "./composer.ts";
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
  new Nav(navRoot);
  const timeline = new Timeline(timelineRoot, worker);
  new Composer(composerRoot, worker);

  const draw = (): void => {
    const state = get();
    const room = state.rooms.find((entry) => entry.roomId === state.roomId) ?? null;
    shell.dataset["room"] = room === null ? "false" : "true";
    drawHeader(header, room);
    drawNotice(timelineRoot, state.phase, timeline);
    if (state.phase === "ready") markRead(state.roomId, state.messages.at(-1)?.id ?? "");
  };

  subscribe(["phase", "rooms", "roomId", "messages"], draw);

  const openWindow = async (roomId: string): Promise<void> => {
    try {
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

  const markRead = (roomId: string | null, eventId: string): void => {
    if (roomId === null || eventId.length === 0) return;
    void worker.send({ type: "markRead", roomId, eventId });
  };

  watchRoute((roomId) => {
    if (roomId === null) {
      set({ messages: [], hasOlder: false });
      return;
    }
    void openWindow(roomId);
  });

  const account = readAccount();
  void worker
    .send<{ session: Session | null; keys: Keys | null }>({ type: "start", accountHash: account?.hash ?? null, wasm: worker.wasm() })
    .then((result) => applySession(result.session, result.keys))
    .catch(() => applySession(null, null));

  draw();
  void timeline;
}

function drawHeader(header: HTMLElement, room: Room | null): void {
  const back = header.querySelector("a");
  header.replaceChildren();
  if (room === null) return;
  if (back) header.append(back);
  header.append(
    el("div", { class: "room-head-text" }, [
      el("h2", { class: "room-title", text: room.name }),
      el("p", { class: "room-subtitle", text: room.topic }),
    ]),
  );
}

function drawNotice(root: HTMLElement, phase: string, timeline: Timeline): void {
  const existing = root.querySelector<HTMLElement>(".timeline-note");
  if (phase === "ready") {
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
