import type { EventRecord, RoomRecord } from "../data/records";
import { t } from "../i18n";

export interface NotificationSettings {
  enabled: boolean;
  preview: boolean;
}

export class Notifier {
  private settings: NotificationSettings = { enabled: false, preview: true };
  private onOpen: ((roomId: string, eventId: string) => void) | null = null;

  configure(settings: NotificationSettings, onOpen: (roomId: string, eventId: string) => void): void {
    this.settings = settings;
    this.onOpen = onOpen;
  }

  setPreview(enabled: boolean): void {
    this.settings = { ...this.settings, preview: enabled };
  }

  setEnabled(enabled: boolean): void {
    this.settings = { ...this.settings, enabled };
  }

  requestPermission(): Promise<NotificationPermission | "unsupported"> {
    if (typeof Notification === "undefined") return Promise.resolve("unsupported");
    if (Notification.permission === "default") return Notification.requestPermission();
    return Promise.resolve(Notification.permission);
  }

  notify(event: EventRecord, room: RoomRecord, currentUserId: string): void {
    if (!this.settings.enabled) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (event.senderId === currentUserId) return;
    if (event.kind === "state" || event.kind === "membership" || event.kind === "redacted") return;
    if (document.visibilityState === "visible" && document.hasFocus()) return;
    const title = this.settings.preview ? room.name || room.roomId : t("notifications.message");
    const body = this.settings.preview ? preview(event) : t("notifications.body");
    const notification = new Notification(title, {
      body,
      tag: room.roomId,
      data: { roomId: room.roomId, eventId: event.eventId },
    });
    notification.addEventListener("click", () => {
      window.focus();
      this.onOpen?.(room.roomId, event.eventId);
      notification.close();
    });
  }
}

function preview(event: EventRecord): string {
  if (event.kind === "image") return t("media.image");
  if (event.kind === "video") return t("media.video");
  if (event.kind === "audio") return t("media.audio");
  if (event.kind === "file") return t("media.file");
  if (event.kind === "sticker") return t("media.sticker");
  if (event.kind === "encrypted") return t("media.encrypted");
  return event.body.slice(0, 180) || t("notifications.message");
}
