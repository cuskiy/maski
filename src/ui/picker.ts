import type { Pack, PackImage } from "../core/types.ts";
import { t } from "../i18n/index.ts";
import type { UiContext } from "./context.ts";
import { el, icon, ICON } from "./dom.ts";

const UNICODE = "😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😙 🥲 😋 😛 😜 🤪 😝 🤗 🤭 🤫 🤔 🤨 😐 😑 😶 😏 😒 🙄 😬 😮‍💨 🤥 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 💩 🤡 👻 👽 🤖 😺 😸 😹 😻 😼 😽 🙀 😿 😾 ❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 👍 👎 👌 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 🤝 🙏 💪 🫶 🔥 ⭐ ✨ 🎉 🎊 💯 ✅ ❌ ⚠️ ❓ ❗ 👀 💬 🫡 🫠 🥹 🤌 👏 🙌 🧠 🌈 ☀️ 🌙 🍀 🌸 🎵 📌 📎 🕐 🚀 🥳 🐱 🐶 🦊 🌊".split(" ");

const RECENT_LIMIT = 24;

interface Recent {
  shortcode: string;
  url: string;
  body: string;
  sticker: boolean;
}

export class Picker {
  readonly root: HTMLElement;
  private tabs: HTMLElement;
  private body: HTMLElement;
  private search: HTMLInputElement;
  private packs: Pack[] = [];
  private active = "";
  private mode: "emoji" | "sticker" = "emoji";
  private ctx: UiContext;

  constructor(ctx: UiContext) {
    this.ctx = ctx;
    this.search = el("input", {
      class: "field picker-search",
      attrs: { type: "search", placeholder: t("picker.search"), "aria-label": t("picker.search") },
      on: { input: () => this.renderBody() },
    });
    this.tabs = el("div", { class: "picker-tabs", attrs: { role: "tablist" } });
    this.body = el("div", { class: "picker-body" });
    this.root = el("aside", { class: "picker", attrs: { "aria-label": t("picker.title"), hidden: true } }, [
      el("div", { class: "picker-head" }, [
        this.search,
        el("button", { class: "icon-button", attrs: { type: "button", "aria-label": t("picker.close") }, on: { click: () => this.close() } }, [icon(ICON.close, 20)]),
      ]),
      this.tabs,
      this.body,
    ]);
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  async open(mode: "emoji" | "sticker"): Promise<void> {
    this.mode = mode;
    this.root.hidden = false;
    this.search.value = "";
    this.packs = await this.ctx.local.packs();
    this.active = "";
    this.renderTabs();
    this.renderBody();
    this.search.focus();
  }

  close(): void {
    this.root.hidden = true;
  }

  toggle(mode: "emoji" | "sticker"): void {
    if (this.isOpen && this.mode === mode) this.close();
    else void this.open(mode);
  }

  load(packs: Pack[]): void {
    this.packs = packs;
    if (this.isOpen) {
      this.renderTabs();
      this.renderBody();
    }
  }

  private visiblePacks(): Pack[] {
    return this.packs.filter((pack) => (this.mode === "sticker" ? pack.usage !== "emoticon" : pack.usage !== "sticker"));
  }

  private recent(): Recent[] {
    try {
      const raw = localStorage.getItem("maski-recent");
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? (parsed as Recent[]) : [];
    } catch {
      return [];
    }
  }

  private remember(entry: Recent): void {
    const next = [entry, ...this.recent().filter((item) => item.url !== entry.url)].slice(0, RECENT_LIMIT);
    localStorage.setItem("maski-recent", JSON.stringify(next));
  }

  private renderTabs(): void {
    const packs = this.visiblePacks();
    const tabs = [{ id: "", label: this.mode === "sticker" ? t("picker.stickers") : t("picker.emoji") }, ...packs.map((pack) => ({ id: pack.id, label: pack.name }))];
    if (!tabs.some((tab) => tab.id === this.active)) this.active = tabs[0]?.id ?? "";
    this.tabs.replaceChildren(
      ...tabs.map((tab) =>
        el("button", {
          class: `picker-tab${tab.id === this.active ? " is-active" : ""}`,
          attrs: { type: "button", role: "tab", "aria-selected": String(tab.id === this.active) },
          on: {
            click: () => {
              this.active = tab.id;
              this.renderTabs();
              this.renderBody();
            },
          },
        }, [el("span", { text: tab.label })]),
      ),
    );
  }

  private renderBody(): void {
    const query = this.search.value.trim().toLowerCase();
    const pack = this.packs.find((entry) => entry.id === this.active) ?? null;
    const cells: HTMLElement[] = [];
    if (!pack) {
      if (this.mode === "emoji") {
        const recent = this.recent().filter((entry) => !entry.sticker && (!query || entry.shortcode.includes(query)));
        if (recent.length > 0 && !query) cells.push(...this.recentCells(recent));
        for (const emoji of UNICODE) {
          if (query && !emoji.includes(query)) continue;
          cells.push(el("button", { class: "emoji-cell", attrs: { type: "button", title: emoji }, on: { click: () => this.insert(emoji) } }, [el("span", { text: emoji })]));
        }
      } else {
        const recent = this.recent().filter((entry) => entry.sticker && (!query || entry.shortcode.includes(query)));
        cells.push(...this.recentCells(recent));
      }
    } else {
      const images = pack.images.filter((image) => !query || image.shortcode.toLowerCase().includes(query) || image.body.toLowerCase().includes(query));
      cells.push(...images.map((image) => this.imageCell(image, pack)));
    }
    this.body.replaceChildren(
      ...(cells.length > 0 ? cells : [el("p", { class: "picker-empty", text: t("picker.empty") })]),
    );
  }

  private recentCells(entries: Recent[]): HTMLElement[] {
    return entries.map((entry) =>
      el("button", {
        class: "emoji-cell",
        attrs: { type: "button", title: entry.shortcode },
        on: {
          click: () => {
            if (entry.sticker) this.ctx.sendSticker(entry.url, entry.body);
            else this.insert(entry.body);
            this.close();
          },
        },
      }, [el("img", { class: "emoji-image-loading", attrs: { alt: entry.shortcode } })]),
    );
  }

  private imageCell(image: PackImage, pack: Pack): HTMLElement {
    const button = el("button", {
      class: "emoji-cell",
      attrs: { type: "button", title: image.shortcode, "aria-label": image.shortcode },
      on: {
        click: () => {
          this.remember({ shortcode: image.shortcode, url: image.url, body: image.body, sticker: pack.usage !== "emoticon" });
          if (this.mode === "sticker") {
            this.ctx.sendSticker(image.url, image.body);
            this.close();
            return;
          }
          this.insert(`:${image.shortcode}:`);
        },
      },
    }, [el("span", { class: "emoji-slot" })]);
    if (image.info) {
      void this.ctx.media.url(image.info, 64).then((url) => {
        if (!url) return;
        button.replaceChildren(el("img", { class: "emoji-image", attrs: { src: url, alt: image.shortcode, loading: "lazy" } }));
      });
    }
    return button;
  }

  private insert(text: string): void {
    const detail = new CustomEvent("picker-insert", { detail: text });
    this.root.dispatchEvent(detail);
  }
}
