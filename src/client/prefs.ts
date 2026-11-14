import type { NotificationPrefs, SectionId } from "../core/types.ts";

const LEGACY = {
  sections: "maski.sections",
  spaces: "maski.spaces",
  draft: "maski.draft.",
} as const;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable; the page keeps its in-memory value.
  }
}

function readJson(key: string): unknown {
  const value = read(key);
  if (value === null) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  write(key, JSON.stringify(value));
}

function isSectionId(value: string): value is SectionId {
  return value === "favorites" || value === "rooms" || value === "direct" || value === "channels";
}

export function readSections(account: string): Partial<Record<SectionId, boolean>> | null {
  const key = `${LEGACY.sections}.${account}`;
  const scoped = readJson(key);
  const stored = scoped ?? readJson(LEGACY.sections);
  if (typeof stored !== "object" || stored === null) return null;
  const sections: Partial<Record<SectionId, boolean>> = {};
  for (const [id, value] of Object.entries(stored)) {
    if (isSectionId(id) && typeof value === "boolean") sections[id] = value;
  }
  if (scoped === null && stored !== null) writeJson(key, stored);
  return sections;
}

export function saveSections(account: string, sections: Readonly<Record<SectionId, { open: boolean }>>): void {
  writeJson(`${LEGACY.sections}.${account}`, {
    favorites: sections.favorites.open,
    rooms: sections.rooms.open,
    direct: sections.direct.open,
    channels: sections.channels.open,
  });
}

export function readSpaces(account: string): readonly string[] | null {
  const key = `${LEGACY.spaces}.${account}`;
  const stored = readJson(key) ?? readJson(LEGACY.spaces);
  if (!Array.isArray(stored)) return null;
  const spaces = stored.filter((value): value is string => typeof value === "string");
  if (readJson(key) === null) writeJson(key, spaces);
  return spaces;
}

export function saveSpaces(account: string, spaces: readonly string[]): void {
  writeJson(`${LEGACY.spaces}.${account}`, spaces);
}

export function readDraft(account: string, roomId: string): string {
  const key = `${LEGACY.draft}${account}.${roomId}`;
  const scoped = read(key);
  if (scoped !== null) return scoped;
  const legacy = read(`${LEGACY.draft}${roomId}`) ?? "";
  if (legacy !== "") write(key, legacy);
  return legacy;
}

export function saveDraft(account: string, roomId: string, value: string): void {
  const key = `${LEGACY.draft}${account}.${roomId}`;
  if (value === "") write(key, null);
  else write(key, value);
}

export function readNotifications(account: string): NotificationPrefs | null {
  const stored = readJson(`maski.notifications.${account}`);
  if (typeof stored !== "object" || stored === null) return null;
  const value = stored as Partial<NotificationPrefs>;
  if (typeof value.badge !== "boolean" || typeof value.desktop !== "boolean") return null;
  return {
    badge: value.badge,
    titleTotal: value.titleTotal === true,
    desktop: value.desktop,
    preview: value.preview === true,
  };
}

export function saveNotifications(account: string, prefs: NotificationPrefs): void {
  writeJson(`maski.notifications.${account}`, prefs);
}
