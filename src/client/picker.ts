import type { Pack, PackImage } from "../core/types.ts";
import { t } from "../i18n.ts";
import { el } from "../ui.ts";
import type { WorkerClient } from "./worker.ts";

const EMOJI = ["😀", "😂", "🥹", "😊", "😍", "🤔", "🙃", "😴", "😭", "😡", "👍", "👎", "🙏", "👏", "🎉", "❤️", "🔥", "✨", "🌙", "☕", "🍜", "🌿", "🐈", "🫖"];

/** Emoji and stickers in one surface: a search, two tabs, a strip of packs and a grid. */
export class Picker {
  private readonly root: HTMLElement;
  private readonly worker: WorkerClient;
  private readonly insert: (text: string) => void;
  private readonly roomId: () => string | null;
  private packs: Pack[] = [];
  private mode: "emoticon" | "sticker" = "emoticon";
  private query = "";
  private packId = "";

  constructor(root: HTMLElement, worker: WorkerClient, insert: (text: string) => void, roomId: () => string | null) {
    this.root = root;
    this.worker = worker;
    this.insert = insert;
    this.roomId = roomId;
    this.root.addEventListener("toggle", () => {
      if (this.root.matches(":popover-open")) void this.load();
    });
  }

  private async load(): Promise<void> {
    try {
      const result = await this.worker.send<{ packs: Pack[] }>({ type: "packs" });
      this.packs = result.packs;
    } catch {
      this.packs = [];
    }
    this.draw();
  }

  private draw(): void {
    const body = this.root.querySelector(".surface-body");
    if (!body) return;
    const search = el("input", { class: "picker-search", attrs: { type: "search", placeholder: t("picker.search") } });
    search.value = this.query;
    search.addEventListener("input", () => {
      this.query = search.value;
      this.grid(this.gridHost);
    });
    const tabs = el("div", { class: "picker-tabs" }, [
      this.tab("emoticon", t("picker.emoji")),
      this.tab("sticker", t("picker.stickers")),
    ]);
    this.gridHost = el("div", { class: "picker-grid" });
    body.replaceChildren(search, tabs, this.packStrip(), this.gridHost);
    this.grid(this.gridHost);
  }

  private gridHost: HTMLElement = el("div");

  private tab(mode: "emoticon" | "sticker", label: string): HTMLElement {
    const button = el("button", { class: `picker-tab${this.mode === mode ? " is-active" : ""}`, text: label, attrs: { type: "button" } });
    button.addEventListener("click", () => {
      this.mode = mode;
      this.packId = "";
      this.draw();
    });
    return button;
  }

  private packStrip(): HTMLElement {
    const packs = this.visiblePacks();
    if (packs.length === 0) return el("div", { class: "picker-packs" });
    return el(
      "div",
      { class: "picker-packs" },
      packs.map((pack) => {
        const button = el("button", {
          class: `picker-pack${pack.id === this.packId || (this.packId === "" && pack === packs[0]) ? " is-active" : ""}`,
          text: pack.name.slice(0, 2),
          attrs: { type: "button", title: pack.name },
        });
        button.addEventListener("click", () => {
          this.packId = pack.id;
          this.draw();
        });
        return button;
      }),
    );
  }

  private visiblePacks(): Pack[] {
    const byMode = this.packs.filter((pack) => pack.usage === this.mode);
    if (this.mode === "emoticon") return byMode;
    const withMatches = this.query.length === 0 ? byMode : byMode.filter((pack) => pack.images.some((image) => image.shortcode.includes(this.query)));
    return withMatches;
  }

  private grid(host: HTMLElement): void {
    if (this.mode === "emoticon" && this.visiblePacks().length === 0) {
      host.replaceChildren(
        ...EMOJI.filter((emoji) => this.query.length === 0 || emoji.includes(this.query)).map((emoji) =>
          el("button", {
            class: "picker-cell",
            text: emoji,
            attrs: { type: "button" },
            on: { click: () => this.insert(emoji) },
          } as never),
        ),
      );
      return;
    }
    const packs = this.visiblePacks();
    const pack = packs.find((entry) => entry.id === this.packId) ?? packs[0];
    if (!pack) {
      host.replaceChildren(el("p", { class: "note", text: this.mode === "sticker" ? t("picker.noStickers") : t("picker.empty") }));
      return;
    }
    const images = pack.images.filter((image) => this.query.length === 0 || image.shortcode.includes(this.query));
    host.replaceChildren(
      ...images.map((image) => {
        const cell = el("button", { class: "picker-cell", attrs: { type: "button", title: image.shortcode } });
        void this.thumbnail(image).then((url) => {
          if (url !== null) cell.append(el("img", { class: "picker-image", attrs: { src: url, alt: image.body } }));
        });
        cell.addEventListener("click", () => void this.send(image));
        return cell;
      }),
    );
  }

  private async thumbnail(image: PackImage): Promise<string | null> {
    try {
      const { blob } = await this.worker.send<{ blob: Blob }>({ type: "media", media: image.media, size: 64 });
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  }

  private async send(image: PackImage): Promise<void> {
    const roomId = this.roomId();
    if (roomId === null) return;
    const txnId = `txn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    this.root.hidePopover();
    await this.worker.send({ type: "sticker", roomId, txnId, body: image.body, media: image.media });
  }
}
