import type { Draft, Mark, MediaRef, PackImage, RoomSummary } from "../core/types.ts";
import { t } from "../i18n/index.ts";
import type { UiContext } from "./context.ts";
import { el, icon, ICON } from "./dom.ts";
import { offsetOf, segments, serialize, toggleMark } from "./marks.ts";
import { openMenu } from "./overlay.ts";

const MAX_UPLOAD = 100 * 1024 * 1024;

interface EmojiLookup {
  url(image: PackImage): Promise<string | null>;
}

function ref(mxc: string, name: string): MediaRef {
  return { mxc, mime: "image/png", size: 0, width: null, height: null, duration: null, name, file: null };
}

function renderFragment(text: string, marks: Mark[], emoji: Map<string, PackImage>, lookup: EmojiLookup): HTMLElement {
  const host = el("div", { class: "composer-rendered" });
  for (const segment of segments(text, marks)) {
    const holder = segment.marks.reduce<HTMLElement>((parent, type) => {
      const next = document.createElement(type === "bold" ? "strong" : type === "italic" ? "em" : type === "strike" ? "del" : type);
      if (type === "code") next.className = "inline-code";
      parent.appendChild(next);
      return next;
    }, host);
    const parts = segment.text.split("\n");
    for (const [index, part] of parts.entries()) {
      if (index > 0) holder.appendChild(document.createElement("br"));
      let rest = part;
      while (rest.length > 0) {
        const match = /^:([a-zA-Z0-9-_]+):/.exec(rest);
        const image = match ? emoji.get(match[1] ?? "") : undefined;
        if (match && image) {
          const node = el("img", { class: "emoji-inline", attrs: { alt: image.body, title: image.shortcode } });
          holder.appendChild(node);
          void lookup.url(image).then((url) => {
            if (url) node.src = url;
            else node.remove();
          });
          rest = rest.slice(match[0].length);
          continue;
        }
        const next = rest.search(/:([a-zA-Z0-9-_]+):/);
        if (next < 0) {
          holder.appendChild(document.createTextNode(rest));
          break;
        }
        if (next > 0) {
          holder.appendChild(document.createTextNode(rest.slice(0, next)));
          rest = rest.slice(next);
          continue;
        }
        holder.appendChild(document.createTextNode(rest.slice(0, 1)));
        rest = rest.slice(1);
      }
    }
  }
  return host;
}

export class Composer {
  readonly root: HTMLElement;
  private textarea: HTMLTextAreaElement;
  private sendButton: HTMLButtonElement;
  private stickerButton: HTMLButtonElement;
  private tray: HTMLElement;
  private banner: HTMLElement;
  private note: HTMLElement;
  private rendered: HTMLElement;
  private files: File[] = [];
  private caret = 0;
  private trayUrls = new Set<string>();
  private emoji = new Map<string, PackImage>();
  private ctx: UiContext;

  constructor(ctx: UiContext) {
    this.ctx = ctx;
    this.textarea = el("textarea", {
      class: "field composer-field",
      attrs: { rows: 1, placeholder: "", "aria-label": t("room.placeholder", { room: "" }) },
      on: {
        input: () => {
          this.caret = this.textarea.selectionStart;
          this.sync();
        },
        select: () => {
          this.caret = this.textarea.selectionStart;
        },
        keydown: (event) => this.onKey(event as KeyboardEvent),
        blur: () => this.showRendered(),
        focus: () => this.hideRendered(),
        contextmenu: (event) => this.onContextMenu(event as MouseEvent),
        paste: (event) => this.onPaste(event as ClipboardEvent),
      },
    });
    this.rendered = el("div", {
      class: "field composer-rendered",
      attrs: { hidden: true },
      on: {
        pointerdown: (event) => this.onRenderedClick(event as PointerEvent),
      },
    });
    this.sendButton = el("button", {
      class: "icon-button composer-send",
      attrs: { type: "button", "aria-label": t("room.send") },
      on: { click: () => void this.send() },
    }, [icon(ICON.send, 20)]);
    this.stickerButton = el("button", {
      class: "icon-button composer-send",
      attrs: { type: "button", "aria-label": t("picker.stickers") },
      on: { click: () => this.ctx.togglePicker("sticker") },
    }, [icon(ICON.sticker, 20)]);
    const attach = el("button", {
      class: "icon-button",
      attrs: { type: "button", "aria-label": t("room.attach") },
      on: { click: () => this.pickFiles() },
    }, [icon(ICON.attach, 20)]);
    const emoji = el("button", {
      class: "icon-button",
      attrs: { type: "button", "aria-label": t("room.emoji") },
      on: { click: () => this.ctx.togglePicker("emoji") },
    }, [icon(ICON.smile, 20)]);
    this.tray = el("div", { class: "composer-tray" });
    this.banner = el("div", { class: "composer-banner", attrs: { hidden: true } });
    this.note = el("p", { class: "composer-note", attrs: { hidden: true } });
    const field = el("div", { class: "composer-field-wrap" }, [this.textarea, this.rendered]);
    this.root = el("div", { class: "composer" }, [
      this.banner,
      this.note,
      this.tray,
      el("div", { class: "composer-row" }, [attach, el("div", { class: "composer-field-group" }, [field, emoji]), this.sendButton, this.stickerButton]),
    ]);
  }

  private onKey(event: KeyboardEvent): void {
    const meta = event.ctrlKey || event.metaKey;
    if (meta && event.key === "Enter") {
      event.preventDefault();
      void this.send();
      return;
    }
    if (meta && ["b", "i", "u"].includes(event.key.toLowerCase())) {
      event.preventDefault();
      const type = event.key.toLowerCase() === "b" ? "bold" : event.key.toLowerCase() === "i" ? "italic" : "underline";
      this.applyMark(type);
      return;
    }
    if (meta && event.shiftKey && event.key.toLowerCase() === "x") {
      event.preventDefault();
      this.applyMark("strike");
    }
  }

  private onContextMenu(event: MouseEvent): void {
    const start = this.textarea.selectionStart;
    const end = this.textarea.selectionEnd;
    if (start === end) return;
    event.preventDefault();
    openMenu(event.clientX, event.clientY, [
      { label: "Bold", action: () => this.applyMark("bold") },
      { label: "Italic", action: () => this.applyMark("italic") },
      { label: "Underline", action: () => this.applyMark("underline") },
      { label: "Strikethrough", action: () => this.applyMark("strike") },
      { label: "Code", action: () => this.applyMark("code") },
      { label: "Clear", action: () => this.clearMarks() },
    ]);
  }

  private applyMark(type: Mark["type"]): void {
    const start = this.textarea.selectionStart;
    const end = this.textarea.selectionEnd;
    if (start === end) return;
    this.ctx.setDraft({ marks: toggleMark(this.ctx.draftMarks(), type, start, end) });
    this.sync();
  }

  private clearMarks(): void {
    this.ctx.setDraft({ marks: [] });
    this.sync();
  }

  private onPaste(event: ClipboardEvent): void {
    const files = [...(event.clipboardData?.files ?? [])];
    if (files.length === 0) return;
    event.preventDefault();
    this.addFiles(files);
  }

  private pickFiles(): void {
    const input = el("input", { attrs: { type: "file", multiple: true, hidden: true } });
    input.addEventListener("change", () => {
      this.addFiles([...(input.files ?? [])]);
      input.remove();
    });
    document.body.appendChild(input);
    input.click();
  }

  private addFiles(files: File[]): void {
    for (const file of files) {
      if (file.size > MAX_UPLOAD) {
        this.ctx.toast(t("error.upload"));
        continue;
      }
      this.files.push(file);
    }
    this.renderTray();
  }

  private renderTray(): void {
    for (const url of this.trayUrls) URL.revokeObjectURL(url);
    this.trayUrls.clear();
    this.tray.replaceChildren(
      ...this.files.map((file) => {
        const preview = file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
        if (preview) this.trayUrls.add(preview);
        return el("div", { class: "tray-item" }, [
          preview
            ? el("img", { class: "tray-preview", attrs: { src: preview, alt: file.name } })
            : el("span", { class: "tray-icon" }, [icon(ICON.attach, 16)]),
          el("span", { class: "tray-name", text: file.name }),
          el("button", {
            class: "icon-button",
            attrs: { type: "button", "aria-label": t("common.cancel") },
            on: {
              click: () => {
                this.files = this.files.filter((entry) => entry !== file);
                this.renderTray();
              },
            },
          }, [icon(ICON.close, 16)]),
        ]);
      }),
    );
    this.tray.hidden = this.files.length === 0;
  }

  private async loadEmoji(): Promise<void> {
    const packs = await this.ctx.local.packs();
    const emoji = new Map<string, PackImage>();
    for (const pack of packs) {
      if (pack.usage === "sticker") continue;
      for (const image of pack.images) emoji.set(image.shortcode, image);
    }
    this.emoji = emoji;
  }

  load(draft: Draft, room: RoomSummary | null): void {
    this.textarea.value = draft.text;
    this.textarea.style.height = "";
    this.textarea.placeholder = room ? t("room.placeholder", { room: room.name }) : "";
    this.files = [];
    this.renderTray();
    this.updateBanner();
    this.sync();
    if (this.emoji.size === 0) void this.loadEmoji();
  }

  updateBanner(): void {
    const draft = this.ctx.draft();
    if (draft.edit) {
      this.banner.hidden = false;
      this.banner.replaceChildren(el("span", { text: t("menu.editing") }), this.cancelButton());
    } else if (draft.reply) {
      this.banner.hidden = false;
      this.banner.replaceChildren(el("span", { text: t("menu.replyTo", { name: draft.reply.name }) }), this.cancelButton());
    } else {
      this.banner.hidden = true;
      this.banner.replaceChildren();
    }
  }

  private cancelButton(): HTMLElement {
    return el("button", {
      class: "icon-button",
      attrs: { type: "button", "aria-label": t("common.cancel") },
      on: {
        click: () => {
          this.ctx.setDraft({ reply: null, edit: null });
          this.updateBanner();
        },
      },
    }, [icon(ICON.close, 16)]);
  }

  private sync(): void {
    const text = this.textarea.value;
    this.ctx.setDraft({ text });
    this.resize();
    const empty = text.trim().length === 0 && this.files.length === 0;
    // An empty field offers stickers; the send control only exists when there is something to send.
    this.sendButton.hidden = empty;
    this.stickerButton.hidden = !empty;
    if (!this.textarea.matches(":focus")) this.showRendered();
    this.ctx.typing(text.length > 0);
  }

  private resize(): void {
    const field = this.textarea;
    field.style.height = "auto";
    const limit = Number.parseFloat(getComputedStyle(field).maxBlockSize);
    field.style.height = `${Math.min(field.scrollHeight, Number.isFinite(limit) ? limit : 220)}px`;
  }

  private showRendered(): void {
    const draft = this.ctx.draft();
    if (draft.marks.length === 0 || draft.text.length === 0) {
      this.rendered.hidden = true;
      this.textarea.hidden = false;
      return;
    }
    const fragment = renderFragment(draft.text, draft.marks, this.emoji, {
      url: (image) => this.ctx.media.url(image.info ?? ref(image.url, image.body), 64),
    });
    this.rendered.replaceChildren(...fragment.childNodes);
    this.rendered.hidden = false;
    this.textarea.hidden = true;
  }

  private hideRendered(): void {
    if (this.rendered.hidden) return;
    this.rendered.hidden = true;
    this.textarea.hidden = false;
  }

  private onRenderedClick(event: PointerEvent): void {
    const position = document.caretPositionFromPoint
      ? document.caretPositionFromPoint(event.clientX, event.clientY)
      : ((): { offsetNode: Node; offset: number } | null => {
          const range = document.caretRangeFromPoint?.(event.clientX, event.clientY);
          return range ? { offsetNode: range.startContainer, offset: range.startOffset } : null;
        })();
    const offset = position ? offsetOf(this.rendered, position.offsetNode, position.offset) : this.textarea.value.length;
    this.hideRendered();
    this.textarea.focus();
    this.textarea.setSelectionRange(offset, offset);
  }

  insert(text: string): void {
    const start = this.textarea.matches(":focus") ? this.textarea.selectionStart : this.caret;
    const end = this.textarea.matches(":focus") ? this.textarea.selectionEnd : this.caret;
    const value = this.textarea.value;
    this.textarea.value = `${value.slice(0, start)}${text}${value.slice(end)}`;
    this.caret = start + text.length;
    this.textarea.setSelectionRange(this.caret, this.caret);
    this.textarea.focus();
    this.sync();
  }

  setReadOnly(reason: string | null): void {
    this.textarea.disabled = reason !== null;
    this.note.hidden = reason === null;
    if (reason) this.note.textContent = reason;
  }

  focus(): void {
    if (this.textarea.disabled) return;
    this.textarea.focus();
  }

  async send(): Promise<void> {
    const room = this.ctx.activeRoom();
    if (!room) return;
    const draft = this.ctx.draft();
    const text = this.textarea.value;
    if (text.trim().length === 0 && this.files.length === 0) return;
    const files = [...this.files];
    this.files = [];
    this.renderTray();
    this.textarea.value = "";
    this.textarea.style.height = "";
    if (this.emoji.size === 0) await this.loadEmoji();
    if (draft.edit) {
      this.ctx.setDraft({ text: "", marks: [], edit: null, reply: null });
      await this.ctx.submitEdit(draft.edit.id, text, serialize(text, draft.marks, this.emoji));
    } else {
      const html = serialize(text, draft.marks, this.emoji);
      const replyTo = draft.reply?.id ?? null;
      this.ctx.setDraft({ text: "", marks: [], reply: null });
      if (text.trim().length > 0) await this.ctx.submitText(text, html, replyTo);
      for (const file of files) await this.ctx.submitFile(file);
    }
    this.sync();
    this.updateBanner();
    requestAnimationFrame(() => this.textarea.focus());
  }

  setTyping(on: boolean): void {
    this.ctx.typing(on);
  }
}
