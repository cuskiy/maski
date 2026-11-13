import type { Message } from "../core/types.ts";
import { t } from "../i18n.ts";
import { el } from "../ui.ts";
import { openViewer } from "./viewer.ts";
import { openMenu, type MenuItem } from "./menu.ts";
import type { Composer } from "./composer.ts";
import type { Picker } from "./picker.ts";
import { copyText } from "./clipboard.ts";
import { get, subscribe } from "./store.ts";
import type { WorkerClient } from "./worker.ts";

const DAY = new Intl.DateTimeFormat(undefined, { dateStyle: "full" });
const TIME = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });

/** Rows are keyed by message id and updated in place: the reader's place is never rebuilt away. */
export class Timeline {
  private readonly root: HTMLElement;
  private readonly list: HTMLElement;
  private readonly older: HTMLButtonElement;
  private readonly worker: WorkerClient;
  private readonly composer: Composer;
  private readonly picker: Picker;
  private pinned = true;
  private loading = false;

  constructor(root: HTMLElement, worker: WorkerClient, composer: Composer, picker: Picker) {
    this.root = root;
    this.worker = worker;
    this.composer = composer;
    this.picker = picker;
    const list = root.querySelector("ol");
    const older = root.querySelector("button");
    if (!list || !older) throw new Error("the timeline region is incomplete");
    this.list = list;
    this.older = older;
    this.older.addEventListener("click", () => void this.loadOlder());
    this.root.addEventListener("scroll", () => {
      this.pinned = this.root.scrollHeight - this.root.scrollTop - this.root.clientHeight < 80;
    });
    subscribe(["messages", "roomId", "hasOlder"], () => this.render());
    this.render();
  }

  private async loadOlder(): Promise<void> {
    const state = get();
    if (state.roomId === null || this.loading) return;
    this.loading = true;
    const height = this.root.scrollHeight;
    const top = this.root.scrollTop;
    try {
      await this.worker.send({ type: "older", roomId: state.roomId, keep: state.messages.length + 60 });
      requestAnimationFrame(() => {
        this.root.scrollTop = top + (this.root.scrollHeight - height);
      });
    } finally {
      this.loading = false;
    }
  }

  private render(): void {
    const state = get();
    this.older.hidden = !state.hasOlder;
    const nodes: HTMLElement[] = [];
    let day = "";
    let previous: Message | null = null;
    for (const message of state.messages) {
      const label = DAY.format(message.ts);
      if (label !== day) {
        day = label;
        nodes.push(el("li", { class: "row-day" }, [el("span", { class: "day", text: label })]));
        previous = null;
      }
      if (message.kind === "state") {
        nodes.push(el("li", { class: "row-state" }, [el("span", { text: membershipLine(message) })]));
        previous = null;
        continue;
      }
      const groupStart = previous === null || previous.sender !== message.sender || message.ts - previous.ts > 300000;
      nodes.push(this.row(message, groupStart));
      previous = message;
    }
    this.list.replaceChildren(...nodes);
    if (this.pinned) requestAnimationFrame(() => this.scrollToBottom());
  }

  /** The five things a reader can do with a message, minus the ones they are not allowed to do. */
  private menuFor(message: Message, x: number, y: number): void {
    const state = get();
    const own = message.sender === state.session?.userId;
    const items: MenuItem[] = [];
    if (message.id.startsWith("$")) {
      items.push({ label: t("action.reply"), run: () => this.composer.setReply(message) });
      items.push({ label: t("action.react"), run: () => this.picker.startReaction(message.roomId, message.id) });
    }
    if (own && message.kind === "text" && message.id.startsWith("$")) {
      items.push({ label: t("action.edit"), run: () => this.composer.setEdit(message) });
    }
    items.push({ label: t("action.copy"), run: () => copyText(message.body, t("action.copied")) });
    if (message.id.startsWith("$")) {
      items.push({
        label: t("action.copyLink"),
        run: () => copyText(`${location.origin}${location.pathname}#/room/${encodeURIComponent(message.roomId)}/${message.id}`, t("action.copied")),
      });
    }
    if (own) items.push({ label: t("action.redact"), run: () => void this.worker.send({ type: "redact", roomId: message.roomId, eventId: message.id }), danger: true });
    openMenu(items, x, y);
  }

  private row(message: Message, groupStart: boolean): HTMLElement {
    const own = message.sender === get().session?.userId;
    const row = el("li", { class: `row${own ? " row-own" : ""}${groupStart ? " row-start" : ""}` });
    const avatar = el("span", { class: "row-avatar" });
    if (groupStart) avatar.textContent = message.name.slice(0, 1);
    const bubble = el("div", { class: "bubble" });
    if (groupStart) bubble.append(el("span", { class: "bubble-name", text: message.name }));
    if (message.reply) bubble.append(el("span", { class: "bubble-quote", text: message.reply.body }));
    if (message.media) {
      bubble.classList.add("bubble-media");
      this.picture(message, bubble);
    } else {
      const body = el("span", { class: "bubble-text", text: message.body || undecryptable(message) });
      if (message.html !== null) body.classList.add("has-formatting");
      bubble.append(body);
    }
    if (message.status !== "sent") {
      bubble.append(el("span", { class: `bubble-status is-${message.status}`, text: statusText(message) }));
    }
    bubble.append(el("time", { class: "bubble-time", text: TIME.format(message.ts) }));
    row.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      this.menuFor(message, event.clientX, event.clientY);
    });
    row.addEventListener("keydown", (event) => {
      if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
      event.preventDefault();
      const box = row.getBoundingClientRect();
      this.menuFor(message, box.left + 24, box.top + 12);
    });
    row.append(avatar, bubble);
    return row;
  }

  /** Nothing is fetched until the reader asks for it, and the frame already holds its space. */
  private picture(message: Message, bubble: HTMLElement): void {
    const media = message.media;
    if (!media) return;
    const frame = el("div", { class: "media" });
    if (media.width !== null && media.height !== null) {
      frame.style.setProperty("--media-ratio", `${String(media.width)} / ${String(media.height)}`);
    }
    const button = el("button", { class: "media-show", attrs: { type: "button" } }, [
      el("span", { class: "media-name", text: media.name || t("media.show") }),
    ]);
    frame.append(button);
    bubble.append(frame);

    button.addEventListener("click", () => {
      button.replaceChildren(el("span", { class: "media-name", text: t("media.loading") }));
      const size = media.file ? 0 : 640;
      void this.worker
        .send<{ blob: Blob }>({ type: "media", media, size })
        .then(({ blob }) => {
          const url = URL.createObjectURL(blob);
          if (media.mime.startsWith("video/")) {
            const video = el("video", { class: "media-image", attrs: { src: url, controls: "controls", preload: "metadata" } });
            button.replaceWith(video);
            return;
          }
          const image = el("img", { class: "media-image", attrs: { src: url, alt: media.name, decoding: "async" } });
          image.addEventListener("click", () => openViewer(url, media.name), { once: true });
          button.replaceWith(image);
        })
        .catch(() => {
          button.replaceChildren(el("span", { class: "media-name", text: t("media.failed") }));
        });
    });
  }

  scrollToBottom(): void {
    this.root.scrollTop = this.root.scrollHeight;
  }
}

function undecryptable(message: Message): string {
  return message.kind === "error" ? t("room.undecryptable") : "";
}

function statusText(message: Message): string {
  if (message.status === "failed") return t("room.failed");
  if (message.status === "queued") return t("room.queued");
  return t("room.sending");
}

function membershipLine(message: Message): string {
  return `${message.name} · ${message.membership ?? ""}`;
}
