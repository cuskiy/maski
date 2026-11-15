import type { NotificationPrefs, SectionId } from "../core/types.ts";
import * as storage from "./storage.ts";

function isSectionId(value: string): value is SectionId {
  return value === "favorites" || value === "rooms" || value === "direct" || value === "channels";
}

export function readSections(account: string): Partial<Record<SectionId, boolean>> | null {
  const key = storage.STORAGE.sections(account);
  const scoped = storage.readJson(key);
  const stored = scoped ?? storage.readJson(storage.STORAGE.legacySections);
  if (typeof stored !== "object" || stored === null) return null;
  const sections: Partial<Record<SectionId, boolean>> = {};
  for (const [id, value] of Object.entries(stored)) {
    if (isSectionId(id) && typeof value === "boolean") sections[id] = value;
  }
  if (scoped === null && stored !== null) storage.writeJson(key, stored);
  return sections;
}

export function saveSections(account: string, sections: Readonly<Record<SectionId, { open: boolean }>>): void {
  storage.writeJson(storage.STORAGE.sections(account), {
    favorites: sections.favorites.open,
    rooms: sections.rooms.open,
    direct: sections.direct.open,
    channels: sections.channels.open,
  });
}

export function readSpaces(account: string): readonly string[] | null {
  const key = storage.STORAGE.spaces(account);
  const stored = storage.readJson(key) ?? storage.readJson(storage.STORAGE.legacySpaces);
  if (!Array.isArray(stored)) return null;
  const spaces = stored.filter((value): value is string => typeof value === "string");
  if (storage.readJson(key) === null) storage.writeJson(key, spaces);
  return spaces;
}

export function saveSpaces(account: string, spaces: readonly string[]): void {
  storage.writeJson(storage.STORAGE.spaces(account), spaces);
}

export function readDraft(account: string, roomId: string): string {
  const key = storage.STORAGE.draft(account, roomId);
  const scoped = storage.read(key);
  if (scoped !== null) return scoped;
  const legacy = storage.read(storage.STORAGE.legacyDraft(roomId)) ?? "";
  if (legacy !== "") storage.write(key, legacy);
  return legacy;
}

export function saveDraft(account: string, roomId: string, value: string): void {
  storage.write(storage.STORAGE.draft(account, roomId), value === "" ? null : value);
}

export function readNotifications(account: string): NotificationPrefs | null {
  const stored = storage.readJson(storage.STORAGE.notifications(account));
  if (typeof stored !== "object" || stored === null) return null;
  const value = stored as Partial<NotificationPrefs>;
  if (typeof value.badge !== "boolean" || typeof value.desktop !== "boolean") return null;
  return {
    badge: value.badge,
    titleTotal: value.titleTotal === true,
    desktop: value.desktop,
    preview: value.preview === true,
    level: value.level === "mentions" || value.level === "mute" ? value.level : "all",
  };
}

export function saveNotifications(account: string, prefs: NotificationPrefs): void {
  storage.writeJson(storage.STORAGE.notifications(account), prefs);
}

export function readBackup(account: string): boolean | null {
  const stored = storage.read(storage.STORAGE.backup(account));
  if (stored === null) return null;
  return stored === "true";
}

export function saveBackup(account: string, ready: boolean): void {
  storage.write(storage.STORAGE.backup(account), ready ? "true" : null);
}

export function readRecentEmoji(account: string): readonly string[] | null {
  const stored = storage.readJson(storage.STORAGE.recentEmoji(account));
  if (!Array.isArray(stored)) return null;
  return stored.filter((value): value is string => typeof value === "string" && value !== "").slice(0, 18);
}

export function saveRecentEmoji(account: string, emoji: readonly string[]): void {
  storage.writeJson(storage.STORAGE.recentEmoji(account), emoji.slice(0, 18));
}

export function readRecentReactions(account: string): readonly string[] | null {
  const stored = storage.readJson(storage.STORAGE.recentReactions(account));
  if (!Array.isArray(stored)) return null;
  return stored.filter((value): value is string => typeof value === "string" && value !== "").slice(0, 18);
}

export function saveRecentReactions(account: string, emoji: readonly string[]): void {
  storage.writeJson(storage.STORAGE.recentReactions(account), emoji.slice(0, 18));
}

export function readRecentStickers(account: string): readonly string[] | null {
  const stored = storage.readJson(storage.STORAGE.recentStickers(account));
  if (!Array.isArray(stored)) return null;
  return stored.filter((value): value is string => typeof value === "string" && value !== "").slice(0, 6);
}

export function saveRecentStickers(account: string, stickers: readonly string[]): void {
  storage.writeJson(storage.STORAGE.recentStickers(account), stickers.slice(0, 6));
}
