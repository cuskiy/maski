/** A JSON object, as opposed to `null`, an array or a primitive value. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
