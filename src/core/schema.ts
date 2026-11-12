export const DB_VERSION = 1;

export const STORE = {
  meta: "meta",
  rooms: "rooms",
  events: "events",
  relations: "relations",
  members: "members",
  media: "media",
  packs: "packs",
} as const;

export type StoreName = (typeof STORE)[keyof typeof STORE];

export const INDEX = {
  eventsRoom: "room",
  eventsRoomTs: "roomTs",
  eventsSearch: "search",
  relationsTarget: "target",
  membersRoom: "room",
  mediaUsed: "used",
} as const;

export function accountDbName(hash: string): string {
  return `maski-${hash}`;
}

export const UI_DB = "maski-ui";
export const UI_VERSION = 1;

export function upgradeAccount(db: IDBDatabase): void {
  const events = db.createObjectStore(STORE.events, { keyPath: "id" });
  events.createIndex(INDEX.eventsRoom, "roomId");
  events.createIndex(INDEX.eventsRoomTs, ["roomId", "ts", "id"]);
  events.createIndex(INDEX.eventsSearch, "search", { multiEntry: true });

  const relations = db.createObjectStore(STORE.relations, { keyPath: "id" });
  relations.createIndex(INDEX.relationsTarget, "target");

  const members = db.createObjectStore(STORE.members, { keyPath: ["roomId", "userId"] });
  members.createIndex(INDEX.membersRoom, "roomId");

  db.createObjectStore(STORE.rooms, { keyPath: "roomId" });
  db.createObjectStore(STORE.packs, { keyPath: "id" });
  db.createObjectStore(STORE.meta, { keyPath: "key" });

  const media = db.createObjectStore(STORE.media, { keyPath: "key" });
  media.createIndex(INDEX.mediaUsed, "lastUsed");
}

export function upgradeUi(db: IDBDatabase): void {
  db.createObjectStore("settings", { keyPath: "key" });
  db.createObjectStore("drafts", { keyPath: "key" });
}
