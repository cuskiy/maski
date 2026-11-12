import type { ComposerModel, MarkType } from "../composer-model";
import { ComposerModel as Model } from "../composer-model";
import { el } from "../dom";
import { icon, iconButton } from "../icons";
import { t } from "../../i18n";
import { sanitizeRich } from "../sanitize";
import type { ActionPosition } from "../action-menu";

export interface PendingFile {
  file: File;
  url: string;
}

export interface ComposerMessage {
  body: string;
  formattedBody: string | null;
  files: PendingFile[];
  context: { kind: "reply" | "edit"; eventId: string } | null;
}

export interface ComposerCallbacks {
  onSend: (message: ComposerMessage) => void;
  onOpenPicker: (anchor: HTMLElement, tab: "emoji" | "sticker") => void;
  onTyping: (typing: boolean) => void;
  onFormatMenu: (position: ActionPosition) => void;
  onChange: () => void;
  loadEmoji: (url: string) => Promise<string | null>;
}

export class Composer {
  readonly model: ComposerModel = new Model();
  readonly element: HTMLElement;
  private readonly textarea: HTMLTextAreaElement;
  private readonly rich: HTMLElement;
  private readonly attachments: HTMLElement;
  private readonly fileInput: HTMLInputElement;
  private readonly attachButton: HTMLButtonElement;
  private readonly emojiButton: HTMLButtonElement;
  private readonly sendButton: HTMLButtonElement;
  private readonly contextBar: HTMLElement;
  private readonly contextLabel: HTMLElement;
  private readonly callbacks: ComposerCallbacks;
  private files: PendingFile[] = [];
  private typingTimer: number | null = null;
  private context: { kind: "reply" | "edit"; eventId: string; name: string } | null = null;

  constructor(callbacks: ComposerCallbacks) {
    this.callbacks = callbacks;
    this.textarea = el("textarea", {
      class: "composer-input",
      attrs: {
        rows: 1,
        placeholder: "",
        enterkeyhint: "enter",
        "aria-label": t("composer.placeholderSimple"),
      },
    });
    this.rich = el("div", { class: "composer-rich event-text", attrs: { hidden: true } });
    this.attachments = el("div", { class: "attachments" });
    this.fileInput = el("input", { attrs: { type: "file", multiple: true, hidden: true } });
    this.attachButton = iconButton(t("composer.attach"), "paperclip", () => this.fileInput.click(), "icon-button attach-button");
    this.emojiButton = iconButton(t("composer.emoji"), "smile", () => this.callbacks.onOpenPicker(this.element, "emoji"), "icon-button field-emoji");
    this.sendButton = el("button", {
      class: "icon-button action-button",
      attrs: { type: "button" },
      on: { click: () => this.primaryAction() },
    });
    this.contextBar = el("div", { class: "composer-context", attrs: { hidden: true } });
    this.contextLabel = el("span", {});
    this.element = el("div", { class: "composer-wrap" }, [
      this.contextBar,
      this.attachments,
      el("div", { class: "composer-bar" }, [
        this.attachButton,
        el("div", { class: "composer-field" }, [this.textarea, this.rich, this.emojiButton]),
        this.sendButton,
      ]),
      this.fileInput,
    ]);
    this.bind();
  }

  setRoom(name: string): void {
    const room = name.length > 24 ? `${name.slice(0, 23)}\u2026` : name;
    this.textarea.placeholder = t("composer.placeholder", { room });
  }

  setContext(kind: "reply" | "edit", eventId: string, name: string): void {
    this.context = { kind, eventId, name };
    this.contextLabel.textContent =
      kind === "reply" ? t("composer.replyTo", { name }) : t("composer.editing");
    this.contextBar.replaceChildren(
      this.contextLabel,
      iconButton(t("composer.cancel"), "close", () => this.clearContext()),
    );
    this.contextBar.hidden = false;
    this.textarea.focus();
    this.callbacks.onChange();
  }

  clearContext(): void {
    this.context = null;
    this.contextBar.hidden = true;
    this.contextBar.replaceChildren(this.contextLabel);
    this.callbacks.onChange();
  }

  restore(state: import("../composer-model").ComposerState): void {
    this.model.restoreState(state);
    this.syncTextarea();
    this.updateSendState();
  }

  applyFormat(type: MarkType): void {
    this.model.toggleMark(type);
    if (document.activeElement !== this.textarea) this.showRich();
    this.callbacks.onChange();
  }

  activeMarks(): Set<MarkType> {
    return this.model.activeMarks();
  }

  clearFormat(): void {
    if (this.model.selection.collapsed) return;
    for (const mark of this.model.activeMarks()) this.model.toggleMark(mark);
    if (document.activeElement !== this.textarea) this.showRich();
    this.callbacks.onChange();
  }

  get contextTarget(): { kind: "reply" | "edit"; eventId: string } | null {
    return this.context ? { kind: this.context.kind, eventId: this.context.eventId } : null;
  }

  reset(): void {
    this.model.clear();
    this.syncTextarea();
    this.clearContext();
    this.renderAttachments();
    this.updateSendState();
  }

  setBody(value: string): void {
    this.model.clear();
    this.model.insertText(value);
    this.syncTextarea();
    this.updateSendState();
    this.callbacks.onChange();
  }

  insertEmoji(shortcode: string, url: string, body: string, info: Record<string, unknown>): void {
    this.syncSelection();
    this.model.insertEmoji(shortcode, url, body, info);
    this.syncTextarea();
    if (this.textarea.hidden) this.showRich();
    this.updateSendState();
  }

  insertUnicode(value: string): void {
    this.syncSelection();
    this.model.insertText(value);
    this.syncTextarea();
    if (this.textarea.hidden) this.showRich();
    this.updateSendState();
  }

  insertText(value: string): void {
    this.syncSelection();
    this.model.insertText(value);
    this.syncTextarea();
    this.updateSendState();
  }

  addFiles(files: FileList | readonly File[]): void {
    for (const file of Array.from(files)) {
      this.files.push({ file, url: URL.createObjectURL(file) });
    }
    this.renderAttachments();
    this.updateSendState();
  }

  focus(): void {
    this.textarea.focus();
  }

  destroy(): void {
    for (const file of this.files) URL.revokeObjectURL(file.url);
    if (this.typingTimer !== null) window.clearTimeout(this.typingTimer);
  }

  private bind(): void {
    this.textarea.addEventListener("input", () => {
      this.model.applyInput(this.textarea.value, this.textarea.selectionStart, this.textarea.selectionEnd);
      this.resizeTextarea();
      this.updateSendState();
      this.callbacks.onTyping(this.model.value.length > 0);
      this.callbacks.onChange();
      if (this.typingTimer !== null) window.clearTimeout(this.typingTimer);
      this.typingTimer = window.setTimeout(() => this.callbacks.onTyping(false), 4000);
    });
    this.textarea.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        this.send();
        return;
      }
      if (!(event.ctrlKey || event.metaKey)) return;
      const shortcut = shortcutMark(event);
      if (!shortcut) return;
      event.preventDefault();
      this.syncSelection();
      this.model.toggleMark(shortcut);
      this.callbacks.onChange();
    });
    this.textarea.addEventListener("contextmenu", (event) => {
      if (this.textarea.selectionStart === this.textarea.selectionEnd) return;
      event.preventDefault();
      this.model.setSelection(this.textarea.selectionStart, this.textarea.selectionEnd);
      this.callbacks.onFormatMenu({ x: event.clientX, y: event.clientY });
    });
    this.textarea.addEventListener("blur", () => this.showRich());
    this.textarea.addEventListener("paste", () => {
      window.setTimeout(() => {
        this.model.applyInput(this.textarea.value, this.textarea.selectionStart, this.textarea.selectionEnd);
        this.updateSendState();
      });
    });
    this.rich.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      this.enterEdit(this.offsetAt(event.clientX, event.clientY));
    });
    this.sendButton.addEventListener("click", () => this.send());
    this.fileInput.addEventListener("change", () => {
      if (this.fileInput.files) this.addFiles(this.fileInput.files);
      this.fileInput.value = "";
    });
    this.element.addEventListener("dragover", (event) => {
      event.preventDefault();
    });
    this.element.addEventListener("drop", (event) => {
      event.preventDefault();
      if (event.dataTransfer?.files) this.addFiles(event.dataTransfer.files);
    });
    this.updateSendState();
  }

  // Styled text is what the field shows when it is not being edited, so the
  // message reads as it will be sent instead of in a separate preview box.
  private showRich(): void {
    const hasMarks = this.model.state.marks.length > 0;
    this.rich.hidden = !hasMarks;
    this.textarea.hidden = hasMarks;
    if (!hasMarks) {
      this.rich.replaceChildren();
      return;
    }
    this.rich.innerHTML = sanitizeRich(this.model.previewHtml());
    for (const image of this.rich.querySelectorAll("img[data-mx-emoticon]")) {
      const source = image.getAttribute("src");
      if (!source?.startsWith("mxc://")) continue;
      void this.callbacks.loadEmoji(source).then((url) => {
        if (url) image.setAttribute("src", url);
        else image.remove();
      });
    }
  }

  private enterEdit(offset = this.model.selection.end): void {
    if (this.textarea.hidden) {
      this.rich.hidden = true;
      this.textarea.hidden = false;
      this.resizeTextarea();
    }
    this.textarea.focus();
    this.textarea.setSelectionRange(offset, offset);
    this.model.setSelection(offset, offset);
  }

  // The click lands in the rendered copy; its character offset is the caret.
  private offsetAt(clientX: number, clientY: number): number {
    const doc = document as Document & {
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
    };
    const range = doc.caretRangeFromPoint?.(clientX, clientY);
    if (!range || !this.rich.contains(range.startContainer)) return this.model.value.length;
    const before = document.createRange();
    before.selectNodeContents(this.rich);
    before.setEnd(range.startContainer, range.startOffset);
    return before.toString().length;
  }

  private syncTextarea(): void {
    this.textarea.value = this.model.value;
    this.textarea.selectionStart = this.model.selection.start;
    this.textarea.selectionEnd = this.model.selection.end;
    this.resizeTextarea();
  }

  // The cap is the CSS max block size, so the token stays the single source.
  private resizeTextarea(): void {
    const limit = Number.parseFloat(getComputedStyle(this.textarea).maxBlockSize);
    this.textarea.style.height = "auto";
    this.textarea.style.height = `${Math.min(this.textarea.scrollHeight, Number.isNaN(limit) ? Infinity : limit)}px`;
  }

  private renderAttachments(): void {
    this.attachments.replaceChildren(
      ...this.files.map((item, index) =>
        el("div", { class: "attachment" }, [
          item.file.type.startsWith("image/")
            ? el("img", { attrs: { src: item.url, alt: item.file.name } })
            : el("div", { class: "media-placeholder", text: item.file.name }),
          el("span", { class: "attachment-name", text: item.file.name }),
          iconButton(t("composer.remove"), "close", () => {
            URL.revokeObjectURL(item.url);
            this.files.splice(index, 1);
            this.renderAttachments();
            this.updateSendState();
          }, "attachment-remove"),
        ]),
      ),
    );
    this.attachments.hidden = this.files.length === 0;
  }

  private syncSelection(): void {
    this.model.setSelection(this.textarea.selectionStart, this.textarea.selectionEnd);
  }

  private hasContent(): boolean {
    return this.model.value.trim().length > 0 || this.files.length > 0;
  }

  // An empty field offers the sticker panel, a filled one offers send.
  private updateSendState(): void {
    const ready = this.hasContent();
    this.sendButton.replaceChildren(icon(ready ? "send" : "sticker"));
    const label = ready ? t("composer.send") : t("composer.emoji");
    this.sendButton.setAttribute("aria-label", label);
    this.sendButton.title = label;
  }

  private primaryAction(): void {
    if (this.hasContent()) this.send();
    else this.callbacks.onOpenPicker(this.element, "emoji");
  }

  private send(): void {
    const body = this.model.value;
    if (!body.trim() && this.files.length === 0) return;
    const serialized = this.model.serialize();
    const files = this.files;
    const context = this.context
      ? { kind: this.context.kind, eventId: this.context.eventId }
      : null;
    this.files = [];
    this.renderAttachments();
    this.model.clear();
    this.syncTextarea();
    this.showRich();
    this.updateSendState();
    this.clearContext();
    this.callbacks.onSend({
      body: serialized.body,
      formattedBody: serialized.formattedBody,
      files,
      context,
    });
    this.callbacks.onChange();
  }
}

function shortcutMark(event: KeyboardEvent): MarkType | null {
  if (event.shiftKey && event.key.toLowerCase() === "x") return "strike";
  if (event.shiftKey) return null;
  switch (event.key.toLowerCase()) {
    case "b":
      return "bold";
    case "i":
      return "italic";
    case "u":
      return "underline";
    default:
      return null;
  }
}
