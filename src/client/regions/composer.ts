// The composer owns its draft, tray, paste routing and caret state in one place.
import { Marked } from "marked";
import { t } from "../../lib/catalog.ts";
import type { Catalog } from "../../lib/catalog.ts";
import { html } from "../../lib/html.ts";
import { formatBytes } from "../../lib/bytes.ts";
import { REGION, SURFACE } from "../../core/regions.ts";
import type { ChatState, Member, MessageRow, ReplyRef } from "../../core/types.ts";
import { icons } from "../../components/icons.ts";
import type { Actions } from "../actions.ts";
import type { Store } from "../store.ts";
import { readDraft, saveDraft } from "../uiDb.ts";
import { roomPermissions } from "../../core/permissions.ts";
import { safeAvatarUrl } from "../../lib/safeUrl.ts";
import { replaceHtml } from "../dom.ts";

function composerText(field: HTMLElement): string {
  let value = "";
  const walk = (node: Node): void => {
    if (node instanceof Text) {
      value += node.data;
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.dataset["mentionText"] !== undefined) {
      value += node.dataset["mentionText"];
      return;
    }
    if (node.tagName === "BR") {
      value += "\n";
      return;
    }
    const block = node.tagName === "DIV" || node.tagName === "P";
    if (block && value !== "" && !value.endsWith("\n")) value += "\n";
    for (const child of Array.from(node.childNodes)) walk(child);
    if (block && value !== "" && !value.endsWith("\n")) value += "\n";
  };
  for (const child of Array.from(field.childNodes)) walk(child);
  return value;
}

function updateEmptyState(field: HTMLElement): void {
  field.dataset["empty"] = String(composerText(field).trim() === "");
}

function setComposerText(field: HTMLElement, value: string): void {
  field.replaceChildren();
  if (value !== "") field.append(document.createTextNode(value));
  updateEmptyState(field);
}

function placeCaretAtEnd(field: HTMLElement): void {
  const range = document.createRange();
  range.selectNodeContents(field);
  range.collapse(false);
  const selection = document.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function insertAtCaret(field: HTMLElement, node: Node): void {
  const selection = document.getSelection();
  const range =
    selection !== null && selection.rangeCount > 0 && field.contains(selection.getRangeAt(0).startContainer)
      ? selection.getRangeAt(0)
      : null;
  if (range === null) {
    field.append(node);
  } else {
    range.deleteContents();
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(range);
  }
  updateEmptyState(field);
}

function mentionElement(name: string, userId: string, avatar: string | null): HTMLElement {
  const mention = document.createElement("span");
  mention.className = "mention";
  mention.contentEditable = "false";
  mention.dataset["mentionId"] = userId;
  mention.dataset["mentionText"] = `@${name}`;
  const source = safeAvatarUrl(avatar);
  if (source === null) {
    const initial = document.createElement("span");
    initial.className = "mention-avatar";
    initial.textContent = name.slice(0, 1);
    mention.append(initial);
  } else {
    const image = document.createElement("img");
    image.className = "mention-avatar";
    image.src = source;
    image.alt = "";
    mention.append(image);
  }
  const label = document.createElement("span");
  label.className = "mention-name";
  label.textContent = name;
  const id = document.createElement("span");
  id.className = "mention-id";
  id.textContent = userId;
  mention.append(label, id);
  return mention;
}

interface ComposerInput {
  readonly store: Store;
  readonly actions: Actions;
  readonly c: Catalog;
  readonly account: string;
}

type TrayKind = "image" | "video" | "audio" | "file";

function fileKind(file: File): TrayKind {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return "file";
}

function escapeHtmlText(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

async function stickerFile(emoji: string): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("no canvas");
  context.clearRect(0, 0, 512, 512);
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = '400px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  context.fillText(emoji, 256, 276);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (blob === null) throw new Error("no sticker image");
  return new File([blob], `${emoji}.png`, { type: "image/png" });
}

const markdownParser = new Marked({
  renderer: {
    html({ text }) {
      return escapeHtmlText(text);
    },
  },
});

interface TrayEntry {
  readonly file: File;
  readonly kind: TrayKind;
}

interface MentionQuery {
  readonly range: Range;
  readonly query: string;
}

export class Composer {
  private readonly actions: Actions;
  private readonly c: Catalog;
  private readonly store: Store;
  private readonly account: string;
  private readonly form: HTMLFormElement | null;
  private readonly input: HTMLElement | null;
  private readonly trayRegion: HTMLElement | null;
  private readonly replyRegion: HTMLElement | null;
  private readonly errorRegion: HTMLElement | null;
  private tray: TrayEntry[] = [];
  private readonly previews = new Map<File, string>();
  private sending = false;
  private replyTo: MessageRow | null = null;
  private editing: MessageRow | null = null;
  private preDraft: string | null = null;
  private roomId: string | null;
  private draftRoom: string | null = null;
  private draftTimer: number | null = null;
  private typingTimer: number | null = null;
  private typingRoom: string | null = null;
  private typingActive = false;
  private mentionMenu: HTMLElement | null = null;
  private mentionOptions: readonly Member[] = [];
  private mentionIndex = 0;
  private readonly abort = new AbortController();
  private readonly unsubscribe: () => void;

  constructor({ store, actions, c, account }: ComposerInput) {
    this.actions = actions;
    this.c = c;
    this.store = store;
    this.account = account;
    this.form = document.querySelector<HTMLFormElement>(".composer");
    this.input = document.querySelector<HTMLElement>("#composer-input");
    this.trayRegion = document.querySelector<HTMLElement>(`[data-region="${REGION.tray}"]`);
    this.replyRegion = document.querySelector<HTMLElement>(`[data-region="${REGION.composerReply}"]`);
    this.errorRegion = document.querySelector<HTMLElement>("[data-composer-error]");
    this.roomId = store.read("roomId");
    this.mount();
    this.unsubscribe = store.watch(["roomId", "rooms", "phase", "members", "stickersEnabled"], () =>
      this.render(store.snapshot()),
    );
    this.render(store.snapshot());
  }

  dispose(): void {
    this.unsubscribe();
    this.abort.abort();
    this.clearDraftTimer();
    this.stopTyping();
    this.releasePreviews();
  }

  private updateTyping(): void {
    if (!this.actions.capabilities.typing) return;
    const roomId = this.roomId;
    const input = this.input;
    if (roomId === null || input === null || composerText(input).trim() === "") {
      this.stopTyping();
      return;
    }
    if (this.typingRoom !== roomId) {
      this.stopTyping();
      this.typingRoom = roomId;
    }
    if (!this.typingActive) {
      this.actions.typing(roomId, true);
      this.typingActive = true;
    }
    if (this.typingTimer !== null) window.clearTimeout(this.typingTimer);
    this.typingTimer = window.setTimeout(() => {
      this.typingTimer = null;
      this.stopTyping();
    }, 8_000);
  }

  private stopTyping(): void {
    if (this.typingTimer !== null) {
      window.clearTimeout(this.typingTimer);
      this.typingTimer = null;
    }
    if (this.typingActive && this.typingRoom !== null) this.actions.typing(this.typingRoom, false);
    this.typingActive = false;
    this.typingRoom = null;
  }

  focus(): void {
    const input = this.input;
    if (input === null || input.contentEditable === "false") return;
    input.focus();
    if (document.getSelection()?.isCollapsed !== false) placeCaretAtEnd(input);
  }

  insertMention(name: string, userId: string, avatar: string | null): void {
    const input = this.input;
    if (input === null || input.contentEditable === "false" || name === "" || userId === "") return;
    this.focus();
    insertAtCaret(input, mentionElement(name, userId, avatar));
    const space = document.createTextNode(" ");
    const selection = document.getSelection();
    const range = selection?.rangeCount === 0 ? null : selection?.getRangeAt(0);
    if (range !== null && range !== undefined) {
      range.insertNode(space);
      range.setStartAfter(space);
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
    } else {
      input.append(space);
    }
    updateEmptyState(input);
    this.saveDraft();
    input.focus();
  }

  private ensureMentionMenu(): HTMLElement | null {
    if (this.mentionMenu !== null) return this.mentionMenu;
    const host = this.input?.closest(".composer-field");
    if (host === null || host === undefined) return null;
    const menu = document.createElement("div");
    menu.className = "mention-menu";
    menu.id = "composer-mentions";
    menu.role = "listbox";
    menu.hidden = true;
    host.append(menu);
    this.mentionMenu = menu;
    this.input?.setAttribute("aria-autocomplete", "list");
    this.input?.setAttribute("aria-controls", menu.id);
    this.input?.setAttribute("aria-expanded", "false");
    return menu;
  }

  private mentionQuery(): MentionQuery | null {
    const input = this.input;
    const selection = document.getSelection();
    if (input === null || selection === null || selection.rangeCount === 0 || !selection.isCollapsed) return null;
    const range = selection.getRangeAt(0);
    if (!input.contains(range.startContainer)) return null;
    const node = range.startContainer;
    if (!(node instanceof Text)) return null;
    const offset = range.startOffset;
    const before = node.data.slice(0, offset);
    const at = before.lastIndexOf("@");
    if (at < 0) return null;
    if (at > 0 && !/\s/u.test(before.charAt(at - 1))) return null;
    const query = before.slice(at + 1);
    if (query.includes(" ") || query.includes("\n")) return null;
    const match = document.createRange();
    match.setStart(node, at);
    match.setEnd(node, offset);
    return { range: match, query };
  }

  private renderMentionMenu(): void {
    const menu = this.ensureMentionMenu();
    if (menu === null) return;
    menu.replaceChildren();
    if (this.mentionOptions.length === 0) {
      this.hideMentionMenu();
      return;
    }
    for (const [index, member] of this.mentionOptions.entries()) {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "mention-option";
      option.id = `composer-mention-${String(index)}`;
      option.role = "option";
      option.setAttribute("aria-selected", index === this.mentionIndex ? "true" : "false");
      const source = safeAvatarUrl(member.avatar);
      if (source === null) {
        const initial = document.createElement("span");
        initial.className = "mention-option-avatar";
        initial.textContent = member.displayName.slice(0, 1);
        option.append(initial);
      } else {
        const image = document.createElement("img");
        image.className = "mention-option-avatar";
        image.src = source;
        image.alt = "";
        option.append(image);
      }
      const text = document.createElement("span");
      text.className = "mention-option-text";
      const name = document.createElement("span");
      name.className = "mention-option-name";
      name.textContent = member.displayName;
      const id = document.createElement("span");
      id.className = "mention-option-id";
      id.textContent = member.userId;
      text.append(name, id);
      option.append(text);
      option.addEventListener("pointerdown", (event) => event.preventDefault());
      option.addEventListener("click", () => this.chooseMention(index));
      menu.append(option);
    }
    menu.hidden = false;
    this.input?.setAttribute("aria-expanded", "true");
    this.highlightMention();
  }

  private highlightMention(): void {
    const menu = this.mentionMenu;
    if (menu === null) return;
    for (const [index, option] of [...menu.querySelectorAll<HTMLElement>(".mention-option")].entries()) {
      option.setAttribute("aria-selected", index === this.mentionIndex ? "true" : "false");
    }
    const active = menu.querySelector<HTMLElement>(`#composer-mention-${String(this.mentionIndex)}`);
    this.input?.setAttribute("aria-activedescendant", active?.id ?? "");
    active?.scrollIntoView({ block: "nearest" });
  }

  private hideMentionMenu(): void {
    const menu = this.mentionMenu;
    if (menu === null) return;
    menu.hidden = true;
    menu.replaceChildren();
    this.mentionOptions = [];
    this.mentionIndex = 0;
    this.input?.setAttribute("aria-expanded", "false");
    this.input?.removeAttribute("aria-activedescendant");
  }

  private refreshMentionMenu(): void {
    const parsed = this.mentionQuery();
    if (parsed === null || this.input?.contentEditable === "false") {
      this.hideMentionMenu();
      return;
    }
    const needle = parsed.query.toLocaleLowerCase();
    this.mentionOptions = this.store
      .snapshot()
      .members.filter(
        (member) =>
          member.membership === "join" &&
          (needle === "" ||
            member.displayName.toLocaleLowerCase().includes(needle) ||
            member.userId.toLocaleLowerCase().includes(needle)),
      )
      .slice(0, 8);
    this.mentionIndex = 0;
    this.renderMentionMenu();
  }

  private chooseMention(index: number): void {
    const parsed = this.mentionQuery();
    const member = this.mentionOptions[index];
    if (parsed === null || member === undefined) return;
    const range = parsed.range;
    range.deleteContents();
    const mention = mentionElement(member.displayName, member.userId, member.avatar);
    range.insertNode(mention);
    const space = document.createTextNode(" ");
    mention.after(space);
    const next = document.createRange();
    next.setStartAfter(space);
    next.collapse(true);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(next);
    this.hideMentionMenu();
    const input = this.input;
    if (input !== null) updateEmptyState(input);
    this.saveDraft();
    input?.focus();
  }

  private handleMentionKey(event: KeyboardEvent): boolean {
    if (this.mentionMenu === null || this.mentionMenu.hidden) return false;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      this.mentionIndex = (this.mentionIndex + direction + this.mentionOptions.length) % this.mentionOptions.length;
      this.highlightMention();
      return true;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      this.chooseMention(this.mentionIndex);
      return true;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      this.hideMentionMenu();
      return true;
    }
    return false;
  }

  private deleteMention(key: "Backspace" | "Delete"): boolean {
    const input = this.input;
    const selection = document.getSelection();
    if (input === null || selection === null || selection.rangeCount === 0 || !selection.isCollapsed) return false;
    const range = selection.getRangeAt(0);
    if (!input.contains(range.startContainer)) return false;
    const container = range.startContainer;
    let mention: Node | null = null;
    if (container instanceof Text) {
      if (key === "Backspace" && range.startOffset === 0) mention = container.previousElementSibling;
      if (key === "Delete" && range.startOffset === container.data.length) mention = container.nextElementSibling;
    } else if (container instanceof HTMLElement) {
      const index = range.startOffset;
      mention = key === "Backspace" ? (container.childNodes[index - 1] ?? null) : (container.childNodes[index] ?? null);
      if (!(mention instanceof HTMLElement)) mention = null;
    }
    if (!(mention instanceof HTMLElement) || !mention.classList.contains("mention")) return false;
    mention.remove();
    updateEmptyState(input);
    this.saveDraft();
    return true;
  }

  private mount(): void {
    const signal = this.abort.signal;
    this.form?.addEventListener(
      "submit",
      (event) => {
        event.preventDefault();
        void this.send("text");
      },
      { signal },
    );
    this.input?.addEventListener(
      "keydown",
      (event) => {
        if (event.isComposing) return;
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          void this.send("text");
          return;
        }
        if (this.handleMentionKey(event)) return;
        if ((event.key === "Backspace" || event.key === "Delete") && this.deleteMention(event.key)) {
          event.preventDefault();
        }
      },
      { signal },
    );
    this.input?.addEventListener(
      "input",
      () => {
        if (this.input !== null) updateEmptyState(this.input);
        this.refreshMentionMenu();
        this.updateTyping();
        this.scheduleDraft();
      },
      { signal },
    );
    this.input?.addEventListener(
      "paste",
      (event) => {
        const clipboard = event.clipboardData;
        if (clipboard === null) return;
        const files: File[] = [];
        for (const item of clipboard.items) {
          if (item.kind !== "file") continue;
          const file = item.getAsFile();
          if (file !== null) files.push(file);
        }
        if (files.length === 0) {
          const text = clipboard.getData("text/plain");
          if (text !== "") {
            event.preventDefault();
            const field = this.input;
            if (field !== null) {
              insertAtCaret(field, document.createTextNode(text));
              this.scheduleDraft();
            }
          }
          return;
        }
        event.preventDefault();
        if (this.actions.capabilities.media) this.addFiles(files);
      },
      { signal },
    );
    document.addEventListener(
      "pointerdown",
      (event) => {
        if (this.mentionMenu === null || this.mentionMenu.hidden) return;
        const target = event.target;
        if (target instanceof Node && this.mentionMenu.contains(target)) return;
        if (target instanceof Element && target.closest(".composer-field") !== null) return;
        this.hideMentionMenu();
      },
      { signal },
    );
  }

  private render(state: ChatState): void {
    const room = state.rooms.find((entry) => entry.roomId === state.roomId) ?? null;
    if (state.roomId !== this.roomId) {
      if (this.editing !== null && this.preDraft !== null && this.roomId !== null) {
        saveDraft(this.account, this.roomId, this.preDraft);
      } else {
        this.saveDraft();
      }
      this.stopTyping();
      this.roomId = state.roomId;
      this.hideMentionMenu();
      this.clearTray();
      this.clearReplyState();
      this.clearError();
      this.draftRoom = null;
    }
    const input = this.input;
    if (input === null) return;
    const canSend = room !== null && roomPermissions(room, state.session?.userId ?? null).send;
    const disabled = room === null || state.phase !== "ready" || !canSend;
    input.contentEditable = disabled ? "false" : "true";
    input.setAttribute("aria-disabled", disabled ? "true" : "false");
    input.dataset["placeholder"] =
      room === null
        ? t(this.c, "composer.placeholder")
        : canSend
          ? t(this.c, "composer.placeholderRoom", { room: room.name })
          : t(this.c, "composer.noPermission");
    if (!disabled && this.editing === null && this.draftRoom !== room.roomId) {
      setComposerText(input, readDraft(this.account, room.roomId));
      this.draftRoom = room.roomId;
    }
    updateEmptyState(input);
    for (const button of document.querySelectorAll<HTMLButtonElement>(
      ".composer-send, .composer-action, .composer-emoji",
    )) {
      button.disabled = disabled;
    }
    const stickerButton = document.querySelector<HTMLButtonElement>(".composer-sticker");
    if (stickerButton !== null) {
      stickerButton.hidden = !state.stickersEnabled || !this.actions.capabilities.stickers;
    }
  }

  private clearDraftTimer(): void {
    if (this.draftTimer !== null) {
      window.clearTimeout(this.draftTimer);
      this.draftTimer = null;
    }
  }

  private scheduleDraft(): void {
    if (this.editing !== null) return;
    this.clearDraftTimer();
    this.draftTimer = window.setTimeout(() => {
      this.draftTimer = null;
      this.saveDraft();
    }, 150);
  }

  private saveDraft(): void {
    this.clearDraftTimer();
    if (this.editing !== null) return;
    const input = this.input;
    const roomId = this.roomId;
    if (input === null || roomId === null) return;
    saveDraft(this.account, roomId, composerText(input));
  }

  private clearError(): void {
    if (this.errorRegion === null) return;
    this.errorRegion.hidden = true;
    this.errorRegion.textContent = "";
  }

  private showMediaError(): void {
    if (this.errorRegion === null) return;
    this.errorRegion.textContent = t(this.c, "composer.mediaFailed");
    this.errorRegion.hidden = false;
  }

  private setBusy(busy: boolean): void {
    this.sending = busy;
    if (this.form === null) return;
    if (busy) this.form.setAttribute("aria-busy", "true");
    else this.form.removeAttribute("aria-busy");
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
    replaceHtml(
      this.replyRegion,
      html`<div class="composer-reply-text">
        <span class="composer-reply-label" dir="auto">${label}</span
        ><span class="composer-reply-body" dir="auto">${body}</span>
      </div>
      <button class="tray-remove" type="button" data-clear-reply aria-label="${t(this.c, "chat.cancelReply")}">
        ${icons.close}
      </button>`,
    );
  }

  showReply(message: MessageRow): void {
    if (this.editing !== null) this.leaveEditing();
    this.replyTo = message;
    this.setReply(t(this.c, "chat.replyingTo", { name: message.senderName }), message.body);
    this.input?.focus();
  }

  showEditing(message: MessageRow): void {
    if (!this.actions.capabilities.edit) return;
    this.preDraft = this.roomId === null ? null : readDraft(this.account, this.roomId);
    this.editing = message;
    this.replyTo = null;
    this.setReply(t(this.c, "chat.editing"), message.body);
    const input = this.input;
    if (input !== null) {
      setComposerText(input, message.body);
      input.focus();
      placeCaretAtEnd(input);
    }
  }

  private leaveEditing(): void {
    if (this.editing === null) return;
    const draft = this.preDraft ?? "";
    this.editing = null;
    this.preDraft = null;
    if (this.input !== null) setComposerText(this.input, draft);
    this.saveDraft();
  }

  cancelReply(): void {
    const textarea = this.input;
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
    replaceHtml(
      this.trayRegion,
      html`${this.tray.map(({ file, kind }, index) => {
        const preview = this.previews.get(file);
        return html`<div class="tray-item${preview === undefined ? "" : " has-thumb"}">
        ${preview === undefined ? icons.file : html`<img class="tray-thumb" src="${preview}" alt="" data-tray-preview="${preview}" data-tray-name="${file.name}" />`}
        <span class="tray-text"
          ><span class="tray-name" dir="auto">${file.name}</span
          ><span class="tray-size"
            >${t(
              this.c,
              kind === "image"
                ? "chat.media.image"
                : kind === "video"
                  ? "chat.media.video"
                  : kind === "audio"
                    ? "chat.media.audio"
                    : "chat.media.file",
            )} ·
            ${formatBytes(file.size)}</span
          ></span
        >
        <button
          class="tray-remove"
          type="button"
          data-tray-index="${String(index)}"
          aria-label="${t(this.c, "composer.remove")}: ${file.name}"
        >
          ${icons.close}
        </button>
      </div>`;
      })}`,
    );
  }

  addFiles(files: readonly File[]): void {
    if (!this.actions.capabilities.media || files.length === 0) return;
    const entries = files.map((file): TrayEntry => ({
      file,
      kind: fileKind(file),
    }));
    for (const { file } of entries) {
      if (!this.previews.has(file) && file.type.startsWith("image/")) {
        this.previews.set(file, URL.createObjectURL(file));
      }
    }
    this.clearError();
    this.tray = [...this.tray, ...entries];
    this.renderTray();
    this.input?.focus();
  }

  removeTray(index: number): void {
    const removeButton = this.trayRegion?.querySelector<HTMLElement>(`[data-tray-index="${String(index)}"]`);
    const hadFocus = removeButton !== null && removeButton !== undefined && document.activeElement === removeButton;
    const removed = this.tray[index];
    if (removed !== undefined) this.releasePreview(removed.file);
    this.clearError();
    this.tray = this.tray.filter((_entry, position) => position !== index);
    this.renderTray();
    if (hadFocus) {
      const buttons = this.trayRegion?.querySelectorAll<HTMLElement>("[data-tray-index]");
      const next = buttons?.[Math.min(index, (buttons?.length ?? 0) - 1)];
      (next ?? this.input)?.focus();
    }
  }

  insertEmoji(emoji: string): void {
    const input = this.input;
    if (input === null || emoji === "") return;
    insertAtCaret(input, document.createTextNode(emoji));
    this.actions.recordEmoji(emoji);
    this.saveDraft();
    input.focus();
    this.hide(SURFACE.emoji);
    this.hide(SURFACE.sticker);
  }

  insertStickerText(text: string): void {
    const input = this.input;
    if (input === null || text === "") return;
    insertAtCaret(input, document.createTextNode(text));
    this.saveDraft();
    input.focus();
    this.hide(SURFACE.emoji);
  }

  private stickerBlocked(): boolean {
    return !this.actions.capabilities.stickers || !this.store.read("stickersEnabled");
  }

  async sendSticker(sticker: string): Promise<void> {
    const roomId = this.roomId;
    if (sticker === "" || roomId === null || this.sending || this.stickerBlocked()) return;
    this.hide(SURFACE.sticker);
    this.setBusy(true);
    this.clearError();
    try {
      const file = await stickerFile(sticker);
      await this.actions.sendMedia(roomId, file, "sticker", sticker, null, null);
      if (this.roomId === roomId) this.actions.recordSticker(sticker);
    } catch {
      this.showMediaError();
    } finally {
      this.setBusy(false);
    }
  }

  async sendPackSticker(packId: string, shortcode: string): Promise<void> {
    const roomId = this.roomId;
    if (packId === "" || shortcode === "" || roomId === null || this.sending || this.stickerBlocked()) {
      return;
    }
    this.hide(SURFACE.sticker);
    this.setBusy(true);
    this.clearError();
    try {
      await this.actions.sendSticker(roomId, packId, shortcode);
    } catch {
      this.showMediaError();
    } finally {
      this.setBusy(false);
    }
  }

  openSendMenu(focusFirst = false): void {
    const menu = document.getElementById(SURFACE.sendMenu);
    if (!(menu instanceof HTMLElement)) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFirstItem = (): void => {
      menu.querySelector<HTMLElement>(".surface-item")?.focus({ preventScroll: true });
    };
    const onToggle = (event: Event): void => {
      if (!(event instanceof ToggleEvent)) return;
      if (event.newState === "closed") {
        const active = document.activeElement;
        if (!(active instanceof HTMLElement && active.closest(".composer") !== null)) {
          trigger?.focus({ preventScroll: true });
        }
        menu.removeEventListener("toggle", onToggle);
        return;
      }
      if (focusFirst) focusFirstItem();
    };
    if (focusFirst) menu.addEventListener("toggle", onToggle);
    menu.showPopover();
    if (focusFirst) window.setTimeout(focusFirstItem, 40);
  }

  async send(mode: "text" | "markdown"): Promise<void> {
    if (this.sending) return;
    this.setBusy(true);
    this.clearError();
    try {
      await this.sendNow(mode);
    } finally {
      this.setBusy(false);
    }
  }

  private async sendNow(mode: "text" | "markdown"): Promise<void> {
    const input = this.input;
    const roomId = this.roomId;
    if (input === null || roomId === null) return;
    const text = composerText(input).trim();
    const tray = [...this.tray];
    if (text === "" && tray.length === 0) return;

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
      if (input !== null) {
        setComposerText(input, previous);
        input.focus();
      }
      this.saveDraft();
      return;
    }

    const reply: ReplyRef | null =
      this.replyTo === null
        ? null
        : {
            messageId: this.replyTo.eventId ?? this.replyTo.id,
            senderName: this.replyTo.senderName,
            body: this.replyTo.body === "" ? (this.replyTo.media?.name ?? "") : this.replyTo.body,
          };
    const renderedHtml = text === "" ? null : await this.markdown(mode, text);
    if (this.roomId !== roomId) return;

    if (tray.length > 0) {
      // The bytes go to the worker; the queued row arrives through the outbox, not from here.
      try {
        for (const [index, entry] of tray.entries()) {
          await this.actions.sendMedia(
            roomId,
            entry.file,
            entry.kind,
            index === 0 ? text : "",
            index === 0 ? renderedHtml : null,
            index === 0 && reply !== null ? reply.messageId : null,
          );
          if (this.roomId !== roomId) return;
        }
      } catch {
        this.showMediaError();
        return;
      }
      this.clearComposer();
      return;
    }

    const row = this.actions.createRow(roomId, text, {
      html: renderedHtml,
      reply,
      ts: Date.now(),
    });
    this.actions.appendRows(roomId, [row]);
    this.clearComposer();
  }

  private async markdown(mode: "text" | "markdown", text: string): Promise<string | null> {
    if (mode !== "markdown") return null;
    try {
      return await markdownParser.parse(text);
    } catch {
      // A parse failure still sends the plain text body.
      return null;
    }
  }

  private clearComposer(): void {
    this.stopTyping();
    const input = this.input;
    if (input !== null) setComposerText(input, "");
    if (this.roomId !== null) saveDraft(this.account, this.roomId, "");
    this.draftRoom = this.roomId;
    this.clearTray();
    this.clearReplyState();
    input?.focus();
  }

  private releasePreview(file: File): void {
    const url = this.previews.get(file);
    if (url !== undefined) {
      URL.revokeObjectURL(url);
      this.previews.delete(file);
    }
  }

  private releasePreviews(): void {
    for (const url of this.previews.values()) URL.revokeObjectURL(url);
    this.previews.clear();
  }

  private clearTray(): void {
    this.releasePreviews();
    this.tray = [];
    this.renderTray();
  }

  private hide(id: string): void {
    const surface = document.getElementById(id);
    if (surface instanceof HTMLElement) surface.hidePopover();
  }

  handleFileInput(input: HTMLInputElement): void {
    if (!this.actions.capabilities.media) return;
    const files = input.files;
    const roomId = this.roomId;
    const selected = files === null ? [] : Array.from(files);
    input.value = "";
    this.hide(SURFACE.attach);
    this.input?.focus();
    if (selected.length > 0 && roomId !== null) void this.sendAttachments(selected, roomId);
  }

  private async sendAttachments(files: readonly File[], roomId: string): Promise<void> {
    if (this.sending) return;
    this.setBusy(true);
    this.clearError();
    try {
      for (const file of files) {
        await this.actions.sendMedia(roomId, file, fileKind(file), "", null, null);
        if (this.roomId !== roomId) return;
      }
    } catch {
      this.showMediaError();
    } finally {
      this.setBusy(false);
    }
  }

  handleClick(target: Element): boolean {
    const attach = target.closest<HTMLElement>("[data-attach]");
    if (attach !== null) {
      if (!this.actions.capabilities.media) return true;
      const input = document.querySelector<HTMLInputElement>("#surface-attach-input");
      if (input !== null) {
        const kind = attach.dataset["attach"];
        input.accept = kind === "image" ? "image/*" : kind === "video" ? "video/*" : "";
        input.click();
      }
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
    const stickerText = target.closest<HTMLElement>("[data-sticker-text]");
    if (stickerText !== null && stickerText.closest(`#${SURFACE.emoji}`) !== null) {
      this.insertStickerText(stickerText.dataset["stickerText"] ?? "");
      return true;
    }
    const emoji = target.closest<HTMLElement>("[data-emoji]");
    if (emoji !== null && emoji.closest(`#${SURFACE.reaction}`) === null) {
      const value = emoji.dataset["emoji"] ?? "";
      if (emoji.closest(`#${SURFACE.sticker}`) !== null) void this.sendSticker(value);
      else this.insertEmoji(value);
      return true;
    }
    const packSticker = target.closest<HTMLElement>("[data-sticker-pack]");
    if (packSticker !== null) {
      void this.sendPackSticker(
        packSticker.dataset["stickerPack"] ?? "",
        packSticker.dataset["stickerShortcode"] ?? "",
      );
      return true;
    }
    const sticker = target.closest<HTMLElement>("[data-sticker]");
    if (sticker !== null) {
      void this.sendSticker(sticker.dataset["sticker"] ?? "");
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
