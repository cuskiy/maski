export const ACCOUNT_DB_VERSION = 2;
export const UI_DB_VERSION = 1;

export interface IndexDefinition {
  name: string;
  keyPath: string | string[];
  multiEntry?: boolean;
  unique?: boolean;
}

export interface StoreDefinition {
  name: string;
  keyPath: string | string[];
  indexes?: IndexDefinition[];
}

export const ACCOUNT_STORES: readonly StoreDefinition[] = [
  { name: "session", keyPath: "id" },
  { name: "meta", keyPath: "key" },
  { name: "rooms", keyPath: "roomId", indexes: [{ name: "lastTs", keyPath: "lastTs" }] },
  {
    name: "events",
    keyPath: "eventId",
    indexes: [
      { name: "roomTs", keyPath: ["roomId", "ts", "eventId"] },
      { name: "byToken", keyPath: "tokens", multiEntry: true },
      { name: "roomId", keyPath: "roomId" },
    ],
  },
  {
    name: "members",
    keyPath: ["roomId", "userId"],
    indexes: [{ name: "roomId", keyPath: "roomId" }],
  },
  {
    name: "relations",
    keyPath: "relationEventId",
    indexes: [{ name: "targetEventId", keyPath: "targetEventId" }],
  },
  {
    name: "packs",
    keyPath: "packId",
    indexes: [
      { name: "roomId", keyPath: "roomId" },
      { name: "source", keyPath: "source" },
    ],
  },
  {
    name: "media",
    keyPath: "mediaKey",
    indexes: [{ name: "lastUsedAt", keyPath: "lastUsedAt" }],
  },
  {
    name: "outbox",
    keyPath: "txnId",
    indexes: [
      { name: "roomCreated", keyPath: ["roomId", "createdAt"] },
      { name: "status", keyPath: "status" },
    ],
  },
];

export const UI_STORES: readonly StoreDefinition[] = [
  { name: "settings", keyPath: "key" },
  { name: "drafts", keyPath: ["accountHash", "roomId"] },
  { name: "scroll", keyPath: ["accountHash", "roomId"] },
];

export const STORE = {
  session: "session",
  meta: "meta",
  rooms: "rooms",
  events: "events",
  members: "members",
  relations: "relations",
  packs: "packs",
  media: "media",
  outbox: "outbox",
  settings: "settings",
  drafts: "drafts",
  scroll: "scroll",
} as const;

export const UI_DB_NAME = "maski-ui";

export function accountDbName(hash: string): string {
  return `maski-${hash}`;
}
