import type { MessageRow, SessionSummary } from "../core/types.ts";
import type { CommandMap, Event, KeyStatus, StartData } from "../protocol/index.ts";

export interface SessionPort {
  start(input: CommandMap["start"]): Promise<StartData>;
  login(input: CommandMap["login"]): Promise<SessionSummary>;
  logout(): Promise<null>;
  keyStatus(): Promise<KeyStatus>;
  recover(input: CommandMap["recover"]): Promise<KeyStatus>;
  open(roomId: string): Promise<null>;
  older(roomId: string): Promise<null>;
  send(
    roomId: string,
    body: string,
    html: string | null,
    replyTo: string | null,
    transactionId: string,
    messageId: string,
    kind: CommandMap["send"]["kind"],
    media: CommandMap["send"]["media"],
  ): Promise<MessageRow>;
  retrySend(roomId: string, messageId: string): Promise<MessageRow>;
  discardSend(roomId: string, messageId: string): Promise<null>;
  markRead(roomId: string, eventId: string): Promise<null>;
  members(roomId: string): Promise<null>;
  resetIdentity(password: string): Promise<string | null>;
  onEvent(listener: (event: Event) => void): () => void;
}
