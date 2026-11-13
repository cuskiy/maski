import type { Message } from "../core/types.ts";
import { t } from "../i18n.ts";
import { el } from "../ui.ts";
import { get, subscribe } from "./store.ts";
import type { WorkerClient } from "./worker.ts";
import { openRoom } from "./router.ts";

const DAY = new Intl.DateTimeFormat(undefined, { dateStyle: "full" });
const TIME = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });

/** Rows are keyed by message id and updated in place: the reader's place is never rebuilt away. */
export class Timeline {
  private readonly root: HTMLElement;
  private readonly list: HTMLElement;
  private readonly older: HTMLButtonElement;
  private readonly rows = new Map<string, HTMLElement>();
  private readonly worker: WorkerClient;
  private pinned = true;
  private loading = false;

  constructor(root: HTMLElement, worker: WorkerClient) {
    this.root = root;
    this.worker = worker;
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
    this.rows.clear();
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
    row.append(avatar, bubble);
    return row;
  }

  private picture(message: Message, bubble: HTMLElement): void {
    const media = message.media;
    if (!media) return;
    const frame = el("div", { class: "media" });
    if (media.width !== null && media.height !== null) frame.style.setProperty("--media-ratio", `${String(media.width)} / ${String(media.height)}`);
    bubble.append(frame);
    void this.worker
      .send<{ blob: Blob }>({ type: "media", roomId: message.roomId, media, size: 640 })
      .then(({ blob }) => {
        frame.append(el("img", { class: "media-image", attrs: { src: URL.createObjectURL(blob), alt: media.name, decoding: "async" } }));
      })
      .catch(() => {
        frame.append(el("span", { class: "media-name", text: media.name }));
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

export { openRoom };
