export type Record_ = Record<string, unknown>;

export function isRecord(value: unknown): value is Record_ {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function pick<T>(record: Record_, key: string, guard: (value: unknown) => value is T): T | null {
  const value = record[key];
  return guard(value) ? value : null;
}
