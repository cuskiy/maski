import type {
  AckMessage,
  ClientToWorker,
  CommandReply,
  CommandRequest,
  ErrorInfo,
  SessionSummary,
  UiaAnswer,
  UiaCancel,
  WorkerToClient,
} from "./messages";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isCommandRequest(value: unknown): value is CommandRequest {
  return (
    isRecord(value) &&
    typeof value["id"] === "string" &&
    typeof value["type"] === "string" &&
    "payload" in value
  );
}

export function isAck(value: unknown): value is AckMessage {
  return isRecord(value) && value["type"] === "ack" && typeof value["revision"] === "number";
}

export function isUiaAnswer(value: unknown): value is UiaAnswer {
  return (
    isRecord(value) &&
    value["type"] === "uia" &&
    typeof value["requestId"] === "string" &&
    (value["auth"] === null || isRecord(value["auth"]))
  );
}

export function isUiaCancel(value: unknown): value is UiaCancel {
  return (
    isRecord(value) &&
    value["type"] === "uiaCancel" &&
    typeof value["requestId"] === "string"
  );
}

export function isClientToWorker(value: unknown): value is ClientToWorker {
  return isCommandRequest(value) || isAck(value) || isUiaAnswer(value) || isUiaCancel(value);
}

export function isWorkerToClient(value: unknown): value is WorkerToClient {
  return isRecord(value) && typeof value["type"] === "string";
}

export function isSessionSummary(value: unknown): value is SessionSummary {
  return (
    isRecord(value) &&
    typeof value["userId"] === "string" &&
    typeof value["deviceId"] === "string" &&
    typeof value["displayName"] === "string" &&
    typeof value["accountHash"] === "string" &&
    (value["avatarMxc"] === null || typeof value["avatarMxc"] === "string")
  );
}

export function isCommandReply(value: unknown): value is CommandReply {
  return (
    isRecord(value) &&
    typeof value["id"] === "string" &&
    typeof value["ok"] === "boolean"
  );
}

export function isErrorInfo(value: unknown): value is ErrorInfo {
  return (
    isRecord(value) &&
    typeof value["code"] === "string" &&
    typeof value["message"] === "string" &&
    typeof value["retryable"] === "boolean"
  );
}

export function readString(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`Expected ${field} to be a string`);
  return value;
}

export function readStringField(value: unknown, field: string): string {
  if (!isRecord(value)) throw new Error(`Expected ${field} to be on an object`);
  const item = value[field];
  if (typeof item !== "string") throw new Error(`Expected ${field} to be a string`);
  return item;
}

export function readOptionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  return readString(value, field);
}

export function readNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Expected ${field} to be a number`);
  }
  return value;
}

export function readNumberField(value: unknown, field: string): number {
  if (!isRecord(value)) throw new Error(`Expected ${field} to be on an object`);
  return readNumber(value[field], field);
}

export function readBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new Error(`Expected ${field} to be a boolean`);
  return value;
}

export function readBooleanField(value: unknown, field: string): boolean {
  if (!isRecord(value)) throw new Error(`Expected ${field} to be on an object`);
  return readBoolean(value[field], field);
}

export function readRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`Expected ${field} to be an object`);
  return value;
}

export function readArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Expected ${field} to be an array`);
  return value;
}

export function readStringArray(value: unknown, field: string): string[] {
  return readArray(value, field).map((item, index) => readString(item, `${field}[${index}]`));
}

export function errorInfo(error: unknown, fallback = "internal"): ErrorInfo {
  if (isRecord(error) && typeof error["message"] === "string") {
    return {
      code: typeof error["errcode"] === "string" ? error["errcode"] : fallback,
      message: error["message"],
      retryable: typeof error["retryable"] === "boolean" ? error["retryable"] : false,
    };
  }
  if (error instanceof Error) {
    return { code: fallback, message: error.message, retryable: false };
  }
  return { code: fallback, message: String(error), retryable: false };
}
