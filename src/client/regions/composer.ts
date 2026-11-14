import { marked } from "marked";
import { t } from "../../lib/catalog.ts";
import type { Catalog } from "../../lib/catalog.ts";
import { html, type Html } from "../../lib/html.ts";
import { REGION, SURFACE } from "../../core/regions.ts";
import type { ChatState, MessageRow, ReplyRef } from "../../core/types.ts";
import { icons } from "../../components/icons.ts";
import type { Actions } from "../actions.ts";
import type { Store } from "../store.ts";
import { sanitizeMessageHtml } from "../sanitize.ts";
import * as prefs from "../prefs.ts";

interface ComposerInput {
  readonly store: Store;
  readonly actions: Actions;
  readonly c: Catalog;
  readonly account: string;
}

export class Composer {
  private readonly store: Store;
  private readonly actions: Actions;
  private readonly c: Catalog;
  private readonly account: string;
  private readonly form: HTMLFormElement | null;
  private readonly textarea: HTMLTextAreaElement | null;
  private readonly trayRegion: HTMLElement | null;
  private readonly replyRegion: HTMLElement | null;
  private tray: File[] = [];
  private replyTo: MessageRow | null = null;
  private editing: MessageRow | null = null;
  private preDraft: string | null = null;
  private roomId: string | null;
  private draftRoom: string | null = null;

  constructor({ store, actions, c, account }: ComposerInput) {
    this.store = store;
    this.actions = actions;
    this.c = c;
    this.account = account;
    this.form = document.querySelector<HTMLFormElement>(".composer");
    this.textarea = document.querySelector<HTMLTextAreaElement>("#composer-input");
    this.trayRegion = document.querySelector<HTMLElement>(`[data-region="${REGION.tray}"]`);
    this.replyRegion = document.querySelector<HTMLElement>(`[data-region="${REGION.composerReply}"]`);
    this.roomId = store.read("roomId");
    this.mount();
    this.render(store.snapshot());
  }

  private mount(): void {
    this.form?.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.send("text");
    });
    this.textarea?.addEventListener("keydown", (event) => {
      if (event.isComposing) return;
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        void this.send("text");
      }
    });
    this.textarea?.addEventListener("input", () => {
      this.saveDraft();
    });
    this.textarea?.addEventListener("paste", (event) => {
      const files = event.clipboardData?.files;
      if (files === undefined || files.length === 0) return;
      event.preventDefault();
      this.addFiles(Array.from(files));
    });
    this.store.watch(["roomId", "rooms", "phase"], (changed) => {
      if (changed.has("roomId") || changed.has("rooms") || changed.has("phase")) {
        this.render(this.store.snapshot());
      }
    });
  }

  private render(state: ChatState): void {
    const room = state.rooms.find((entry) => entry.roomId === state.roomId) ?? null;
    if (state.roomId !== this.roomId) {
      if (this.editing !== null && this.preDraft !== null && this.roomId !== null) {
        prefs.saveDraft(this.account, this.roomId, this.preDraft);
      } else {
        this.saveDraft();
      }
      this.roomId = state.roomId;
      this.tray = [];
      this.renderTray();
      this.clearReplyState();
      this.draftRoom = null;
    }
    const textarea = this.textarea;
    if (textarea === null) return;
    const disabled = room === null || state.phase !== "ready";
    textarea.disabled = disabled;
    textarea.placeholder =
      room === null ? t(this.c, "composer.placeholder") : t(this.c, "composer.placeholderRoom", { room: room.name });
    if (!disabled && this.editing === null && this.draftRoom !== room.roomId) {
      textarea.value = prefs.readDraft(this.account, room.roomId);
      this.draftRoom = room.roomId;
    }
    const form = this.form;
    if (form !== null) form.dataset["room"] = disabled ? "none" : "open";
    for (const button of document.querySelectorAll<HTMLButtonElement>(
      ".composer-send, .composer-action, .composer-emoji",
    )) {
      button.disabled = disabled;
    }
  }

  private saveDraft(): void {
    if (this.editing !== null) return;
    const textarea = this.textarea;
    const roomId = this.roomId;
    if (textarea === null || roomId === null) return;
    prefs.saveDraft(this.account, roomId, textarea.value);
  }

  private clearReplyState(): void {
    this.replyTo = null;
    this.editing = null;
    this.preDraft = null;
    if (this.replyRegion !== null) {
      this.replyRegion.hidden = true;
      this.replyRegion.replaceChildren();
    }
  }

  private setReply(label: string, body: string): void {
    if (this.replyRegion === null) return;
    this.replyRegion.hidden = false;
    this.replyRegion.innerHTML = html`<div class="composer-reply-text">
        <span class="composer-reply-label">${label}</span><span class="composer-reply-body">${body}</span>
      </div>
      <button class="tray-remove" type="button" data-clear-reply aria-label="${t(this.c, "chat.cancelReply")}">
        ${icons.close}
      </button>`.value;
  }

  showReply(message: MessageRow): void {
    if (this.editing !== null) this.leaveEditing();
    this.replyTo = message;
    this.setReply(t(this.c, "chat.replyingTo", { name: message.senderName }), message.body);
    this.textarea?.focus();
  }

  showEditing(message: MessageRow): void {
    this.preDraft = this.roomId === null ? null : prefs.readDraft(this.account, this.roomId);
    this.editing = message;
    this.replyTo = null;
    this.setReply(t(this.c, "chat.editing"), message.body);
    const textarea = this.textarea;
    if (textarea !== null) {
      textarea.value = message.body;
      textarea.focus();
    }
  }

  private leaveEditing(): void {
    if (this.editing === null) return;
    const draft = this.preDraft ?? "";
    this.editing = null;
    this.preDraft = null;
    if (this.textarea !== null) this.textarea.value = draft;
    this.saveDraft();
  }

  cancelReply(): void {
    const textarea = this.textarea;
    this.leaveEditing();
    this.clearReplyState();
    textarea?.focus();
  }

  private renderTray(): void {
    if (this.trayRegion === null) return;
    this.trayRegion.hidden = this.tray.length === 0;
    if (this.tray.length === 0) {
      this.trayRegion.replaceChildren();
      return;
    }
    this.trayRegion.innerHTML = html`${this.tray.map(
      (file, index) => html`<div class="tray-item">
        ${icons.file}<span class="tray-name">${file.name}</span>
        <button
          class="tray-remove"
          type="button"
          data-tray-index="${String(index)}"
          aria-label="${t(this.c, "composer.remove")}: ${file.name}"
        >
          ${icons.close}
        </button>
      </div>`,
    )}`.value;
  }

  addFiles(files: readonly File[]): void {
    if (files.length === 0) return;
    this.tray = [...this.tray, ...files];
    this.renderTray();
    this.textarea?.focus();
  }

  removeTray(index: number): void {
    const removeButton = this.trayRegion?.querySelector<HTMLElement>(`[data-tray-index="${String(index)}"]`);
    const hadFocus = removeButton !== null && removeButton !== undefined && document.activeElement === removeButton;
    this.tray = this.tray.filter((_file, position) => position !== index);
    this.renderTray();
    if (hadFocus) {
      const buttons = this.trayRegion?.querySelectorAll<HTMLElement>("[data-tray-index]");
      const next = buttons?.[Math.min(index, (buttons?.length ?? 0) - 1)];
      (next ?? this.textarea)?.focus();
    }
  }

  insertEmoji(emoji: string): void {
    const textarea = this.textarea;
    if (textarea === null || emoji === "") return;
    textarea.setRangeText(emoji, textarea.selectionStart, textarea.selectionEnd, "end");
    this.saveDraft();
    textarea.focus();
    this.hide(SURFACE.emoji);
  }

  sendSticker(sticker: string): void {
    if (sticker === "") return;
    this.actions.appendRows([
      this.actions.createRow(sticker, {
        kind: "sticker",
        media: { kind: "sticker", name: sticker, width: null, height: null, size: null, url: null },
      }),
    ]);
    this.hide(SURFACE.sticker);
  }

  openSendMenu(): void {
    const menu = document.getElementById(SURFACE.sendMenu);
    if (menu instanceof HTMLElement) menu.showPopover();
  }

  async send(mode: "text" | "markdown"): Promise<void> {
    const textarea = this.textarea;
    const roomId = this.roomId;
    if (textarea === null || roomId === null) return;
    const text = textarea.value.trim();
    if (text === "" && this.tray.length === 0) return;

    if (this.editing !== null) {
      if (text === "") return;
      const previous = this.preDraft ?? "";
      this.actions.edit(this.editing.id, text, await this.markdown(mode, text));
      this.editing = null;
      this.preDraft = null;
      this.replyTo = null;
      if (this.replyRegion !== null) {
        this.replyRegion.hidden = true;
        this.replyRegion.replaceChildren();
      }
      if (textarea !== null) {
        textarea.value = previous;
        textarea.focus();
      }
      this.saveDraft();
      return;
    }

    const reply: ReplyRef | null =
      this.replyTo === null
        ? null
        : {
            messageId: this.replyTo.id,
            senderName: this.replyTo.senderName,
            body: this.replyTo.body === "" ? (this.replyTo.media?.name ?? "") : this.replyTo.body,
          };
    const now = Date.now();
    const rows: MessageRow[] = [];
    for (const [index, file] of this.tray.entries()) {
      const row = this.actions.createRow("", {
        kind: "file",
        media: { kind: "file", name: file.name, width: null, height: null, size: file.size, url: null },
        ts: now + index,
        status: "sending",
      });
      rows.push(row);
      window.setTimeout(
        () => {
          this.actions.setMessageStatus(row.id, "sent");
        },
        500 + index * 250,
      );
    }
    if (text !== "") {
      rows.push(
        this.actions.createRow(text, {
          html: await this.markdown(mode, text),
          reply,
          ts: now + this.tray.length,
        }),
      );
    }
    this.actions.appendRows(rows);
    this.clearComposer();
  }

  private async markdown(mode: "text" | "markdown", text: string): Promise<string | null> {
    if (mode !== "markdown") return null;
    try {
      return sanitizeMessageHtml(await marked.parse(text));
    } catch {
      // A parse failure still sends the plain text body.
      return null;
    }
  }

  private clearComposer(): void {
    const textarea = this.textarea;
    if (textarea !== null) textarea.value = "";
    if (this.roomId !== null) prefs.saveDraft(this.account, this.roomId, "");
    this.draftRoom = this.roomId;
    this.tray = [];
    this.renderTray();
    this.clearReplyState();
    textarea?.focus();
  }

  private hide(id: string): void {
    const surface = document.getElementById(id);
    if (surface instanceof HTMLElement) surface.hidePopover();
  }

  handleFileInput(input: HTMLInputElement): void {
    const files = input.files;
    if (files !== null) this.addFiles(Array.from(files));
    input.value = "";
    this.hide(SURFACE.attach);
    this.textarea?.focus();
  }

  handleClick(target: Element): boolean {
    if (target.closest("[data-attach]") !== null) {
      document.querySelector<HTMLInputElement>("#surface-attach-input")?.click();
      return true;
    }
    const tray = target.closest<HTMLElement>("[data-tray-index]");
    if (tray !== null) {
      this.removeTray(Number(tray.dataset["trayIndex"]));
      return true;
    }
    if (target.closest("[data-clear-reply]") !== null) {
      this.cancelReply();
      return true;
    }
    const emoji = target.closest<HTMLElement>("[data-emoji]");
    if (emoji !== null) {
      this.insertEmoji(emoji.dataset["emoji"] ?? "");
      return true;
    }
    const sticker = target.closest<HTMLElement>("[data-sticker]");
    if (sticker !== null) {
      this.sendSticker(sticker.dataset["sticker"] ?? "");
      return true;
    }
    const send = target.closest<HTMLElement>("[data-send]");
    if (send !== null && send.closest(`#${SURFACE.sendMenu}`) !== null) {
      const mode = send.dataset["send"] === "markdown" ? "markdown" : "text";
      this.hide(SURFACE.sendMenu);
      void this.send(mode);
      return true;
    }
    return false;
  }
}

export type { Html };
