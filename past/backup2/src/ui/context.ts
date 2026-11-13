import type { Draft, Mark, Message, RoomSummary } from "../core/types.ts";
import type { LocalDb } from "../store/db.ts";
import type { WorkerClient } from "../client/worker-client.ts";
import type { MediaCache } from "./media.ts";

export interface UiContext {
  local: LocalDb;
  worker: WorkerClient;
  media: MediaCache;
  openRoom(roomId: string): void;
  openDialog(name: string, roomId?: string): void;
  closeDialog(): void;
  setDraft(patch: Partial<Draft>): void;
  draft(): Draft;
  draftMarks(): Mark[];
  startReply(message: Message): void;
  startEdit(message: Message): void;
  submitText(body: string, html: string | null, replyTo: string | null): Promise<void>;
  submitEdit(eventId: string, body: string, html: string | null): Promise<void>;
  submitFile(file: File): Promise<void>;
  sendSticker(url: string, body: string): void;
  react(message: Message, key: string): void;
  reactPicker(message: Message): void;
  reveal(eventId: string): void;
  redact(message: Message): void;
  retry(message: Message): void;
  removePending(message: Message): void;
  profile(userId: string): void;
  copy(text: string, done: string): void;
  toast(text: string): void;
  typing(on: boolean): void;
  togglePicker(mode: "emoji" | "sticker"): void;
  activeRoom(): RoomSummary | null;
}
