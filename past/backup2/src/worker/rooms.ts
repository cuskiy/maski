import { PushRuleKind, type MatrixClient } from "matrix-js-sdk";
import { STORE } from "../core/schema.ts";
import type { AccountDb } from "./db.ts";
import { projectRooms, readDirect, refreshDirect } from "./project.ts";

/** Joining, creating and the account-level settings that live on a room. */
export class Rooms {
  private readonly db: AccountDb;
  private readonly client: MatrixClient;

  constructor(db: AccountDb, client: MatrixClient) {
    this.db = db;
    this.client = client;
  }

  async join(target: string): Promise<{ roomId: string }> {
    const room = await this.client.joinRoom(target);
    await projectRooms(this.db, this.client, [room.roomId]);
    return { roomId: room.roomId };
  }

  async leave(roomId: string): Promise<void> {
    await this.client.leave(roomId);
    await this.db.del(STORE.rooms, roomId);
    await this.db.delMatching(STORE.events, "room", roomId);
    await this.db.delMatching(STORE.members, "room", roomId);
  }

  async create(name: string, topic: string, isPublic: boolean, encrypted: boolean, invites: string[]): Promise<{ roomId: string }> {
    const options: Record<string, unknown> = {
      name,
      topic,
      visibility: isPublic ? "public" : "private",
      preset: isPublic ? "public_chat" : "private_chat",
      invite: invites.filter(Boolean),
    };
    if (encrypted) {
      options["initial_state"] = [{ type: "m.room.encryption", state_key: "", content: { algorithm: "m.megolm.v1.aes-sha2" } }];
    }
    const result = await this.client.createRoom(options as never);
    await projectRooms(this.db, this.client, [result.room_id]);
    return { roomId: result.room_id };
  }

  async direct(userId: string): Promise<{ roomId: string }> {
    const existing = readDirect(this.client);
    const rooms = existing?.[userId] ?? [];
    for (const roomId of rooms) {
      const room = this.client.getRoom(roomId);
      if (room && room.getMyMembership() === "join") return { roomId };
    }
    const result = await this.client.createRoom({
      is_direct: true,
      invite: [userId],
      preset: "trusted_private_chat",
      initial_state: [{ type: "m.room.encryption", state_key: "", content: { algorithm: "m.megolm.v1.aes-sha2" } }],
    } as never);
    await this.client.setAccountData("m.direct" as never, { ...existing, [userId]: [...rooms, result.room_id] } as never);
    await refreshDirect(this.db, this.client);
    await projectRooms(this.db, this.client, [result.room_id]);
    return { roomId: result.room_id };
  }

  async moderate(roomId: string, userId: string, action: "kick" | "ban" | "unban"): Promise<void> {
    if (action === "kick") await this.client.kick(roomId, userId);
    else if (action === "ban") await this.client.ban(roomId, userId);
    else await this.client.unban(roomId, userId);
    await projectRooms(this.db, this.client, [roomId]);
  }

  async tag(roomId: string, tag: string, on: boolean): Promise<void> {
    if (on) await this.client.setRoomTag(roomId, tag, { order: 0.5 });
    else await this.client.deleteRoomTag(roomId, tag);
  }

  async mute(roomId: string, on: boolean): Promise<void> {
    if (!on) {
      await this.client.deletePushRule("global", PushRuleKind.Override, roomId);
      return;
    }
    await this.client.addPushRule("global", PushRuleKind.Override, roomId, {
      actions: ["dont_notify"],
      conditions: [{ kind: "event_match", key: "room_id", pattern: roomId }],
    } as never);
  }

  async profile(name?: string, avatar?: string): Promise<void> {
    if (name !== undefined) await this.client.setDisplayName(name);
    if (avatar !== undefined) await this.client.setAvatarUrl(avatar);
  }

  async uploadAvatar(data: ArrayBuffer, mime: string): Promise<{ url: string }> {
    const uploaded = await this.client.uploadContent(new File([data], "avatar", { type: mime }));
    await this.client.setAvatarUrl(uploaded.content_uri);
    return { url: uploaded.content_uri };
  }

  async uploadRoomAvatar(roomId: string, data: ArrayBuffer, mime: string): Promise<{ url: string }> {
    const uploaded = await this.client.uploadContent(new File([data], "room-avatar", { type: mime }));
    await this.client.sendStateEvent(roomId, "m.room.avatar" as never, { url: uploaded.content_uri } as never, "");
    await projectRooms(this.db, this.client, [roomId]);
    return { url: uploaded.content_uri };
  }

  async setRoomState(roomId: string, name?: string, topic?: string, avatarUrl?: string): Promise<void> {
    if (name !== undefined) await this.client.setRoomName(roomId, name);
    if (topic !== undefined) await this.client.setRoomTopic(roomId, topic);
    if (avatarUrl !== undefined) await this.client.sendStateEvent(roomId, "m.room.avatar" as never, { url: avatarUrl } as never, "");
  }
}
