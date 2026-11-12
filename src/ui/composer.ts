import type { Draft, Mark, RoomSummary } from "../core/types.ts";
import { escapeText } from "../core/text.ts";
import { t } from "../i18n/index.ts";
import type { UiContext } from "./context.ts";
import { el, icon, ICON } from "./dom.ts";
import { openMenu } from "./overlay.ts";

const MAX_UPLOAD = 100 * 1024 * 1024;

function serialize(text: string, marks: Mark[]): string | null {
  if (marks.length === 0) return null;
  const open: string[] = [];
  const close: string[] = [];
  let out = "";
  for (let index = 0; index < text.length; index += 1) {
    const closing = activeAt(marks, index - 1).filter((kind) => !activeAt(marks, index).includes(kind));
    for (const kind of closing.toReversed()) {
      const name = tag(kind)[1];
      const position = close.lastIndexOf(name);
      if (position >= 0) close.splice(position, 1);
      out += name;
    }
    const opening = new Set(activeAt(marks, index).filter((kind) => !activeAt(marks, index - 1).includes(kind)));
    for (const kind of MARK_TYPES.filter((entry) => opening.has(entry))) {
      out += tag(kind)[0];
    }
    const char = text[index] ?? "";
    out += char === "\n" ? "<br>" : escapeText(char);
  }
  for (const type of activeAt(marks, text.length - 1).toReversed()) out += tag(type)[1];
  void open;
  return out;
}

const MARK_TYPES: Mark["type"][] = ["bold", "italic", "underline", "strike", "code"];

function tag(type: Mark["type"]): [string, string] {
  switch (type) {
    case "bold":
      return ["<strong>", "</strong>"];
    case "italic":
      return ["<em>", "</em>"];
    case "underline":
      return ["<u>", "</u>"];
    case "strike":
      return ["<del>", "</del>"];
    default:
      return ["<code>", "</code>"];
  }
}

function activeAt(marks: Mark[], index: number): Mark["type"][] {
  return marks.filter((mark) => index >= mark.start && index < mark.end).map((mark) => mark.type);
}

function renderFragment(text: string, marks: Mark[]): HTMLElement {
  const host = el("div", { class: "field-render" });
  let current: HTMLElement = host;
  let activeState = "";
  let buffer = "";
  const flush = (): void => {
    if (!buffer) return;
    current.appendChild(document.createTextNode(buffer));
    buffer = "";
  };
  const apply = (state: string): void => {
    flush();
    current = host;
    for (const type of MARK_TYPES) {
      if (!state.includes(type)) continue;
      const next = document.createElement(type === "strike" ? "del" : type === "bold" ? "strong" : type === "italic" ? "em" : type);
      if (type === "code") next.className = "inline-code";
      current.appendChild(next);
      current = next;
    }
  };
  for (let index = 0; index < text.length; index += 1) {
    const state = activeAt(marks, index).join(" ");
    if (state !== activeState) {
      apply(state);
      activeState = state;
    }
    const char = text[index] ?? "";
    if (char === "\n") {
      flush();
      host.appendChild(document.createElement("br"));
      continue;
    }
    buffer += char;
  }
  flush();
  return host;
}

function caretOffset(container: HTMLElement, node: Node, offset: number): number {
  let total = 0;
  let found = false;
  const visit = (current: Node): void => {
    if (found) return;
    if (current === node) {
      if (current.nodeType === Node.TEXT_NODE) total += offset;
      else for (let index = 0; index < Math.min(offset, current.childNodes.length); index += 1) visit(current.childNodes[index] as Node);
      found = true;
      return;
    }
    if (current.nodeName === "BR") {
      total += 1;
      return;
    }
    if (current.nodeType === Node.TEXT_NODE) {
      total += (current.nodeValue ?? "").length;
      return;
    }
    for (const child of current.childNodes) visit(child);
  };
  for (const child of container.childNodes) visit(child);
  return total;
}

export class Composer {
  readonly root: HTMLElement;
  private textarea: HTMLTextAreaElement;
  private sendButton: HTMLButtonElement;
  private tray: HTMLElement;
  private banner: HTMLElement;
  private rendered: HTMLElement;
  private files: File[] = [];
  private ctx: UiContext;

  constructor(ctx: UiContext) {
    this.ctx = ctx;
    this.textarea = el("textarea", {
      class: "field composer-field",
      attrs: { rows: 1, placeholder: "", "aria-label": t("room.placeholder", { room: "" }) },
      on: {
        input: () => this.sync(),
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
    const attach = el("button", {
      class: "icon-button",
      attrs: { type: "button", "aria-label": t("room.attach") },
      on: { click: () => this.pickFiles() },
    }, [icon(ICON.attach, 20)]);
    const emoji = el("button", {
      class: "icon-button",
      attrs: { type: "button", "aria-label": t("room.emoji") },
      on: {
        click: () => {
          const picket = document.querySelector<HTMLElement>(".picker");
          if (!picket) return;
          this.ctx.openDialog("picker");
        },
      },
    }, [icon(ICON.smile, 20)]);
    this.tray = el("div", { class: "composer-tray" });
    this.banner = el("div", { class: "composer-banner", attrs: { hidden: true } });
    const field = el("div", { class: "composer-field-wrap" }, [this.textarea, this.rendered]);
    this.root = el("div", { class: "composer" }, [
      this.banner,
      this.tray,
      el("div", { class: "composer-row" }, [attach, el("div", { class: "composer-field-group" }, [field, emoji]), this.sendButton]),
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
    const marks = this.ctx.draftMarks();
    const covered = marks.some((mark) => mark.type === type && mark.start <= start && mark.end >= end);
    const next = covered ? marks.filter((mark) => !(mark.type === type && mark.start <= start && mark.end >= end)) : [...marks, { type, start, end }];
    this.ctx.setDraft({ marks: next });
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
    this.tray.replaceChildren(
      ...this.files.map((file, index) =>
        el("div", { class: "tray-item" }, [
          el("span", { class: "tray-name", text: file.name }),
          el("button", {
            class: "icon-button",
            attrs: { type: "button", "aria-label": t("common.cancel") },
            on: {
              click: () => {
                this.files.splice(index, 1);
                this.renderTray();
              },
            },
          }, [icon(ICON.close, 16)]),
        ]),
      ),
    );
    this.tray.hidden = this.files.length === 0;
  }

  load(draft: Draft, room: RoomSummary | null): void {
    this.textarea.value = draft.text;
    this.textarea.placeholder = room ? t("room.placeholder", { room: room.name }) : "";
    this.textarea.disabled = !room || room.membership !== "join" || !room.canSend;
    this.files = [];
    this.renderTray();
    this.updateBanner();
    this.sync();
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
    this.textarea.style.setProperty("--rows", String(Math.min(8, Math.max(1, text.split("\n").length))));
    this.textarea.style.setProperty("--field-height", `${Math.min(220, this.textarea.scrollHeight)}px`);
    this.sendButton.disabled = text.trim().length === 0 && this.files.length === 0;
    if (!this.textarea.matches(":focus")) this.showRendered();
  }

  private showRendered(): void {
    const draft = this.ctx.draft();
    if (draft.marks.length === 0 || draft.text.length === 0) {
      this.rendered.hidden = true;
      this.textarea.hidden = false;
      return;
    }
    const fragment = renderFragment(draft.text, draft.marks);
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
    const position = document.caretPositionFromPoint(event.clientX, event.clientY);
    const offset = position ? caretOffset(this.rendered, position.offsetNode, position.offset) : this.textarea.value.length;
    this.hideRendered();
    this.textarea.focus();
    this.textarea.setSelectionRange(offset, offset);
  }

  insert(text: string): void {
    const start = this.textarea.selectionStart;
    const end = this.textarea.selectionEnd;
    const value = this.textarea.value;
    this.textarea.value = `${value.slice(0, start)}${text}${value.slice(end)}`;
    this.textarea.setSelectionRange(start + text.length, start + text.length);
    this.textarea.focus();
    this.sync();
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
    this.textarea.style.setProperty("--field-height", "");
    if (draft.edit) {
      this.ctx.setDraft({ text: "", marks: [], edit: null, reply: null });
      await this.ctx.submitEdit(draft.edit.id, text, serialize(text, draft.marks));
    } else {
      const html = serialize(text, draft.marks);
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
