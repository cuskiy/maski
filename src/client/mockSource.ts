import type { ChatSource, SourceEvent, SourceEvents } from "./source.ts";
import type { DeviceSession, Invite, MessageRow, NotificationPrefs, RoomSummary } from "../core/types.ts";
import { mockChatState, mockDevices, mockInvites, mockMessagesFor, mockRecoveryKey } from "../core/mock.ts";

type Listener = (payload: unknown) => void;

export class MockSource implements ChatSource {
  private readonly listeners = new Map<SourceEvent, Set<Listener>>();
  private devices: readonly DeviceSession[] = [...mockDevices];
  private invites: readonly Invite[] = [...mockInvites];
  private readonly state = mockChatState();
  private readonly withData: boolean;

  constructor(withData = true) {
    this.withData = withData;
  }

  on<K extends SourceEvent>(event: K, listener: (payload: SourceEvents[K]) => void): () => void {
    let set = this.listeners.get(event);
    if (set === undefined) {
      set = new Set();
      this.listeners.set(event, set);
    }
    const wrapped: Listener = (payload) => {
      listener(payload as SourceEvents[K]);
    };
    set.add(wrapped);
    return () => {
      set?.delete(wrapped);
    };
  }

  private emit<K extends SourceEvent>(event: K, payload: SourceEvents[K]): void {
    for (const listener of this.listeners.get(event) ?? []) listener(payload);
  }

  start(): void {
    if (this.withData) this.emit("session", this.state.session);
    this.emit("phase", "ready");
    this.emit("connection", "online");
    this.emit("rooms", { rooms: this.withData ? this.state.rooms : [], loading: false });
    this.emit("devices", this.withData ? this.devices : []);
    this.emit("invites", this.withData ? this.invites : []);
    this.emit("members", this.withData ? this.state.members : []);
  }

  open(roomId: string): void {
    this.emit("window", {
      roomId,
      messages: this.withData ? mockMessagesFor(roomId) : [],
      hasOlder: this.withData,
      older: false,
    });
  }

  older(roomId: string): void {
    this.emit("window", { roomId, messages: [], hasOlder: false, older: true });
  }

  send(_roomId: string, _row: MessageRow): void {}
  markRead(_roomId: string): void {}
  react(_roomId: string, _messageId: string, _key: string): void {}
  edit(_roomId: string, _messageId: string, _body: string, _html: string | null): void {}
  redact(_roomId: string, _messageId: string): void {}
  typing(_roomId: string): void {}

  setNotification(_roomId: string, _mode: RoomSummary["notification"]): void {}

  revealRecoveryKey(): void {
    this.emit("recoveryKey", mockRecoveryKey);
  }

  verifyDevice(deviceId: string): void {
    this.devices = this.devices.map((device) => (device.id === deviceId ? { ...device, verified: true } : device));
    this.emit("devices", this.devices);
  }

  signOutDevice(deviceId: string): void {
    this.devices = this.devices.filter((device) => device.id !== deviceId || device.current);
    this.emit("devices", this.devices);
  }

  signOutOthers(): void {
    this.devices = this.devices.filter((device) => device.current);
    this.emit("devices", this.devices);
  }

  answerInvite(roomId: string, _accept: boolean): void {
    this.invites = this.invites.filter((invite) => invite.roomId !== roomId);
    this.emit("invites", this.invites);
  }

  saveNotifications(_prefs: NotificationPrefs): void {}

  logout(): void {}

  dispose(): void {
    this.listeners.clear();
  }
}
