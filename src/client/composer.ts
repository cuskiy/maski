import { get, subscribe } from "./store.ts";
import type { WorkerClient } from "./worker.ts";
import { openRoom } from "./router.ts";

/** Enter inserts a newline; the button or Ctrl/Cmd+Enter sends. */
export class Composer {
  private readonly field: HTMLTextAreaElement;
  private readonly send: HTMLButtonElement;
  private readonly worker: WorkerClient;
  private typingTimer = 0;
  private typing = false;

  constructor(root: HTMLElement, worker: WorkerClient) {
    this.worker = worker;
    const field = root.querySelector("textarea");
    const send = root.querySelector<HTMLButtonElement>(".composer-send");
    if (!field || !send) throw new Error("the composer region is incomplete");
    this.field = field;
    this.send = send;
    field.addEventListener("input", () => this.onInput());
    field.addEventListener("keydown", (event) => this.onKey(event));
    send.addEventListener("click", () => void this.commit());
    subscribe(["roomId", "phase"], () => this.render());
    this.render();
  }

  private onInput(): void {
    this.render();
    const state = get();
    if (state.roomId === null || state.phase !== "ready") return;
    const typing = this.field.value.length > 0;
    window.clearTimeout(this.typingTimer);
    this.typingTimer = window.setTimeout(() => this.setTyping(false), 20000);
    if (typing !== this.typing) {
      this.typing = typing;
      void this.worker.send({ type: "typing", roomId: state.roomId, on: typing });
    }
  }

  private setTyping(on: boolean): void {
    const state = get();
    if (state.roomId === null || on === this.typing) return;
    this.typing = on;
    void this.worker.send({ type: "typing", roomId: state.roomId, on });
  }

  private onKey(event: KeyboardEvent): void {
    if (event.key !== "Enter" || event.isComposing) return;
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    void this.commit();
  }

  private async commit(): Promise<void> {
    const state = get();
    const body = this.field.value.trim();
    if (state.roomId === null || state.phase !== "ready" || body.length === 0) return;
    const txnId = `txn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const html = body.includes("\n") ? escapeText(body).replace(/\n/gu, "<br>") : null;
    this.field.value = "";
    this.setTyping(false);
    this.render();
    await this.worker.send({ type: "send", roomId: state.roomId, txnId, body, html });
    this.field.focus();
  }

  private render(): void {
    const state = get();
    const canWrite = state.roomId !== null && state.phase === "ready";
    this.field.disabled = !canWrite;
    this.send.disabled = !canWrite || this.field.value.trim().length === 0;
  }
}

function escapeText(text: string): string {
  return text.replace(/[&<>"']/gu, (character) => `&#${String(character.charCodeAt(0))};`);
}

export { openRoom };
