import {
  ACCOUNT_DB_VERSION,
  ACCOUNT_STORES,
  STORE,
  accountDbName,
  getAll,
  getAllByIndex,
  getOne,
  openDb,
  putMany,
  putOne,
  deleteOne,
  requestResult,
  transactionDone,
} from "../data";
import { normalizeText, tokenize } from "../data/text";
import { relationOf } from "./normalize";
import type {
  DeltaPayload,
  EventRecord,
  MediaRecord,
  MemberRecord,
  MetaRecord,
  OutboxRecord,
  PackRecord,
  RelationRecord,
  RoomRecord,
} from "../data/records";

export interface ProjectionSnapshot {
  revision: number;
  rooms: RoomRecord[];
  events: EventRecord[];
  members: MemberRecord[];
  packs: PackRecord[];
  outbox: OutboxRecord[];
}

export class Projection {
  private db: IDBDatabase | null = null;
  private revision = 0;
  private readonly accountHash: string;
  private readonly selfUserId: string;

  constructor(accountHash: string, selfUserId: string) {
    this.accountHash = accountHash;
    this.selfUserId = selfUserId;
  }

  async open(): Promise<void> {
    if (this.db) return;
    this.db = await openDb(accountDbName(this.accountHash), ACCOUNT_DB_VERSION, ACCOUNT_STORES);
    const meta = await getOne<MetaRecord>(this.db, STORE.meta, "projectionRevision");
    this.revision = typeof meta?.value === "number" ? meta.value : 0;
  }

  async close(): Promise<void> {
    this.db?.close();
    this.db = null;
  }

  get currentRevision(): number {
    return this.revision;
  }

  private requireDb(): IDBDatabase {
    if (!this.db) throw new Error("Projection is not open");
    return this.db;
  }

  async snapshot(): Promise<ProjectionSnapshot> {
    const db = this.requireDb();
    const [rooms, events, members, packs, outbox] = await Promise.all([
      getAll<RoomRecord>(db, STORE.rooms),
      getAll<EventRecord>(db, STORE.events),
      getAll<MemberRecord>(db, STORE.members),
      getAll<PackRecord>(db, STORE.packs),
      getAll<OutboxRecord>(db, STORE.outbox),
    ]);
    return {
      revision: this.revision,
      rooms: rooms.toSorted((a, b) => b.lastTs - a.lastTs),
      events: events.toSorted((a, b) => a.ts - b.ts),
      members,
      packs,
      outbox,
    };
  }

  async replace(
    rooms: readonly RoomRecord[],
    events: readonly EventRecord[],
    members: readonly MemberRecord[],
    packs: readonly PackRecord[],
  ): Promise<number> {
    const db = this.requireDb();
    const tx = db.transaction(
      [STORE.rooms, STORE.events, STORE.members, STORE.relations, STORE.packs, STORE.meta],
      "readwrite",
    );
    // Nothing is cleared. The SDK view during a first sync is partial, so clearing
    // would erase rooms and messages the projection already has; a row that is gone
    // from the server is removed explicitly instead.
    for (const store of [STORE.members, STORE.packs]) {
      tx.objectStore(store).clear();
    }
    for (const room of rooms) tx.objectStore(STORE.rooms).put(room);
    for (const event of events) tx.objectStore(STORE.events).put(event);
    for (const member of members) tx.objectStore(STORE.members).put(member);
    for (const pack of packs) tx.objectStore(STORE.packs).put(pack);
    this.revision += 1;
    tx.objectStore(STORE.meta).put({ key: "projectionRevision", value: this.revision } satisfies MetaRecord);
    await transactionDone(tx);
    return this.revision;
  }

  async removeRoom(roomId: string): Promise<void> {
    const db = this.requireDb();
    await deleteOne(db, STORE.rooms, roomId);
  }

  // The projection keeps its own copy of m.direct, so a restart cannot reclassify a
  // direct message as a room before the account data arrives.
  async putDirectRooms(roomIds: readonly string[]): Promise<void> {
    const db = this.requireDb();
    await putOne(db, STORE.meta, { key: "directRooms", value: [...roomIds] } satisfies MetaRecord);
  }

  async getDirectRooms(): Promise<Set<string>> {
    const record = await getOne<MetaRecord>(this.requireDb(), STORE.meta, "directRooms");
    if (!Array.isArray(record?.value)) return new Set();
    return new Set(record.value.filter((value): value is string => typeof value === "string"));
  }

  async putRooms(rooms: readonly RoomRecord[]): Promise<void> {
    const db = this.requireDb();
    await putMany(db, STORE.rooms, rooms);
  }

  async putMembers(members: readonly MemberRecord[]): Promise<void> {
    const db = this.requireDb();
    await putMany(db, STORE.members, members);
  }

  async putPacks(packs: readonly PackRecord[], removed: readonly string[] = []): Promise<void> {
    const db = this.requireDb();
    if (removed.length > 0) {
      const tx = db.transaction(STORE.packs, "readwrite");
      for (const packId of removed) tx.objectStore(STORE.packs).delete(packId);
      await transactionDone(tx);
    }
    await putMany(db, STORE.packs, packs);
  }

  async putEvents(events: readonly EventRecord[]): Promise<void> {
    const db = this.requireDb();
    const changed = new Map<string, EventRecord>();
    for (const event of events) {
      changed.set(event.eventId, event);
      const pending = await getAllByIndex<RelationRecord>(db, STORE.relations, "targetEventId", event.eventId);
      for (const relation of pending) {
        const updated = applyRelationToEvent(event, relation, this.selfUserId);
        if (updated) changed.set(updated.eventId, updated);
        // An annotation stays: redacting it later has to find the sender again.
        if (relation.type !== "annotation") await deleteOne(db, STORE.relations, relation.relationEventId);
      }
    }
    await putMany(db, STORE.events, [...changed.values()]);
  }

  async applyRelation(relation: RelationRecord, target: EventRecord | null): Promise<EventRecord | null> {
    const db = this.requireDb();
    if (relation.type === "annotation") {
      const seen = await getOne<RelationRecord>(db, STORE.relations, relation.relationEventId);
      if (seen) return null;
    }
    if (relation.type === "redaction") {
      const withdrawn = await this.withdrawReaction(relation, db);
      if (withdrawn) return withdrawn;
    }
    if (!target) {
      await putOne(db, STORE.relations, relation);
      return null;
    }
    const updated = applyRelationToEvent(target, relation, this.selfUserId);
    if (updated) await putOne(db, STORE.events, updated);
    if (relation.type === "annotation") await putOne(db, STORE.relations, relation);
    return updated;
  }

  // A redaction can target an annotation rather than an event.
  private async withdrawReaction(relation: RelationRecord, db: IDBDatabase): Promise<EventRecord | null> {
    const annotation = await getOne<RelationRecord>(db, STORE.relations, relation.targetEventId);
    if (annotation?.type !== "annotation") return null;
    await deleteOne(db, STORE.relations, annotation.relationEventId);
    const parent = await this.getEvent(annotation.targetEventId);
    if (!parent) return null;
    const updated = removeReaction(parent, annotation, this.selfUserId);
    if (updated) await putOne(db, STORE.events, updated);
    return updated;
  }

  async putRelations(relations: readonly RelationRecord[]): Promise<void> {
    await putMany(this.requireDb(), STORE.relations, relations);
  }

  async getEvent(eventId: string): Promise<EventRecord | undefined> {
    return getOne<EventRecord>(this.requireDb(), STORE.events, eventId);
  }

  async getMedia(mediaKey: string): Promise<MediaRecord | undefined> {
    return getOne<MediaRecord>(this.requireDb(), STORE.media, mediaKey);
  }

  async putMedia(record: MediaRecord): Promise<void> {
    await putOne(this.requireDb(), STORE.media, record);
  }

  async getRoomEvents(roomId: string): Promise<EventRecord[]> {
    const db = this.requireDb();
    const tx = db.transaction(STORE.events, "readonly");
    const index = tx.objectStore(STORE.events).index("roomTs");
    const range = IDBKeyRange.bound(
      [roomId, Number.MIN_SAFE_INTEGER, ""],
      [roomId, Number.MAX_SAFE_INTEGER, "\uffff"],
    );
    const events = (await requestResult(index.getAll(range))) as EventRecord[];
    return events.toSorted((a, b) => a.ts - b.ts);
  }

  async setMeta(key: string, value: MetaRecord["value"]): Promise<void> {
    await putOne(this.requireDb(), STORE.meta, { key, value } satisfies MetaRecord);
  }

  async getMeta(key: string): Promise<MetaRecord["value"]> {
    const record = await getOne<MetaRecord>(this.requireDb(), STORE.meta, key);
    return record?.value ?? null;
  }

  async bumpRevision(): Promise<number> {
    const db = this.requireDb();
    this.revision += 1;
    await putOne(db, STORE.meta, { key: "projectionRevision", value: this.revision } satisfies MetaRecord);
    return this.revision;
  }

  async delta(
    rooms: readonly RoomRecord[],
    events: readonly EventRecord[],
    members: readonly MemberRecord[],
    packs: readonly PackRecord[],
    removedRooms: readonly string[] = [],
    removedPacks: readonly string[] = [],
    syncState = "SYNCING",
  ): Promise<DeltaPayload> {
    return {
      revision: this.revision,
      rooms: [...rooms],
      events: [...events],
      members: [...members],
      packs: [...packs],
      removedRooms: [...removedRooms],
      removedPacks: [...removedPacks],
      syncState,
    };
  }
}

export function relationFromEvent(event: {
  getId: () => string | undefined;
  getRoomId: () => string | undefined;
  getSender: () => string | undefined;
  getTs: () => number;
  getType: () => string;
  getContent: () => Record<string, unknown>;
  getAssociatedId?: () => string | undefined;
  getRelation: () => { event_id?: string; rel_type?: string; key?: string } | null;
  getUnsigned: () => Record<string, unknown>;
}, selfUserId: string): RelationRecord | null {
  const eventId = event.getId();
  const roomId = event.getRoomId();
  // The SDK marks a local echo with a ~ id; the server echo carries the real one, and
  // a redaction can only ever target that.
  if (!eventId || !roomId || eventId.startsWith("~")) return null;
  const content = event.getContent();
  const relation = event.getRelation() ?? relationOf(content);
  const type = event.getType();
  const isRedaction = type === "m.room.redaction";
  if (!isRedaction && !relation?.event_id) return null;
  // Room v11 moved redacts out of the content; getAssociatedId reads both places.
  const associated = isRedaction ? event.getAssociatedId?.() : undefined;
  const redacts = isRedaction
    ? (associated ?? (typeof content["redacts"] === "string" ? content["redacts"] : null))
    : null;
  const targetEventId = isRedaction ? redacts : (relation?.event_id ?? null);
  if (!targetEventId || targetEventId.startsWith("~")) return null;
  return {
    relationEventId: eventId,
    roomId,
    targetEventId,
    type: isRedaction ? "redaction" : relation?.rel_type === "m.annotation" ? "annotation" : "replace",
    key: relation?.key ?? null,
    senderId: event.getSender() ?? selfUserId,
    ts: event.getTs(),
    content,
    redacts,
  };
}

export function applyRelationToEvent(
  target: EventRecord,
  relation: RelationRecord,
  selfUserId: string,
): EventRecord | null {
  if (relation.type === "redaction") {
    const redacted: EventRecord = {
      ...target,
      body: "",
      formattedBody: null,
      media: null,
      replyTo: null,
      edited: false,
      redacted: true,
      decryptionError: null,
      decrypting: false,
      reactions: {},
      searchText: "",
      tokens: [],
      kind: "redacted",
    };
    return redacted;
  }
  if (relation.type === "replace") {
    const newContent = relation.content["m.new_content"];
    if (!isRecord(newContent)) return null;
    const body = typeof newContent["body"] === "string" ? newContent["body"] : target.body;
    const formatted = typeof newContent["formatted_body"] === "string" ? newContent["formatted_body"] : target.formattedBody;
    return {
      ...target,
      body,
      formattedBody: formatted,
      edited: true,
      searchText: normalizeText(body),
      tokens: tokenize(body),
      media: target.media,
    };
  }
  if (relation.type === "annotation") {
    const key = relation.key ?? "";
    const mine = relation.senderId === selfUserId;
    const existing = target.reactions[key] ?? { count: 0, me: false, myReaction: null };
    if (mine && existing.me) return null;
    return {
      ...target,
      reactions: {
        ...target.reactions,
        [key]: {
          count: existing.count + 1,
          me: mine || existing.me,
          myReaction: mine ? relation.relationEventId : existing.myReaction,
        },
      },
    };
  }
  return null;
}

function removeReaction(
  target: EventRecord,
  annotation: RelationRecord,
  selfUserId: string,
): EventRecord | null {
  const key = annotation.key ?? "";
  const summary = target.reactions[key];
  if (!summary) return null;
  const reactions = { ...target.reactions };
  const mine = annotation.senderId === selfUserId;
  if (summary.count <= 1) delete reactions[key];
  else {
    reactions[key] = {
      count: summary.count - 1,
      me: mine ? false : summary.me,
      myReaction: mine ? null : summary.myReaction,
    };
  }
  return { ...target, reactions };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

