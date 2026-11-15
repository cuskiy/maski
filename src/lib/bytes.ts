export function formatBytes(size: number | null): string {
  if (size === null) return "";
  if (size < 1000) return `${String(size)} B`;
  if (size >= 1_000_000) return `${Math.round(size / 100_000) / 10} MB`;
  return `${Math.round(size / 1000)} kB`;
}
