import type { NotificationPrefs, SectionId } from "../core/types.ts";
import { isSectionId } from "../core/state.ts";
import * as storage from "./storage.ts";

function sectionId(value: string): SectionId | null {
  if (isSectionId(value)) return value;
  if (value === "channels") return "spaces";
  return null;
}

export function readSections(account: string): Partial<Record<SectionId, boolean>> | null {
  const key = storage.STORAGE.sections(account);
  const scoped = storage.readJson(key);
  const stored = scoped ?? storage.readJson(storage.STORAGE.legacySections);
  if (typeof stored !== "object" || stored === null) return null;
  const sections: Partial<Record<SectionId, boolean>> = {};
  for (const [value, open] of Object.entries(stored)) {
    const id = sectionId(value);
    if (id !== null && typeof open === "boolean") sections[id] = open;
  }
  if (scoped === null && stored !== null) {
    storage.writeJson(key, stored);
    storage.write(storage.STORAGE.legacySections, null);
  }
  return sections;
}

export function saveSections(account: string, sections: Readonly<Record<SectionId, { open: boolean }>>): void {
  storage.writeJson(storage.STORAGE.sections(account), {
    favorites: sections.favorites.open,
    rooms: sections.rooms.open,
    direct: sections.direct.open,
    spaces: sections.spaces.open,
  });
}

export function readSpaces(account: string): readonly string[] | null {
  const key = storage.STORAGE.spaces(account);
  const stored = storage.readJson(key) ?? storage.readJson(storage.STORAGE.legacySpaces);
  if (!Array.isArray(stored)) return null;
  const spaces = stored.filter((value): value is string => typeof value === "string");
  if (storage.readJson(key) === null) {
    storage.writeJson(key, spaces);
    storage.write(storage.STORAGE.legacySpaces, null);
  }
  return spaces;
}

export function saveSpaces(account: string, spaces: readonly string[]): void {
  storage.writeJson(storage.STORAGE.spaces(account), spaces);
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

export function readStickers(account: string): boolean | null {
  const stored = storage.read(storage.STORAGE.stickers(account));
  if (stored === null) return null;
  return stored !== "false";
}

export function saveStickers(account: string, enabled: boolean): void {
  storage.write(storage.STORAGE.stickers(account), String(enabled));
}
