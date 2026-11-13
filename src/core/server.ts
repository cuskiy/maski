export interface ServerAddress {
  baseUrl: string;
  host: string;
}

/**
 * Accepts what a person types: `matrix.org`, `unredacted.org:8448`, `https://matrix.unredacted.org`,
 * `http://localhost:8008`. The path is dropped, because the homeserver lives at the origin.
 */
export function readServer(input: string): ServerAddress | null {
  const trimmed = input.trim();
  if (trimmed.length === 0 || /\s/u.test(trimmed)) return null;
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//iu.exec(trimmed)?.[1] ?? "";
  if (scheme.length > 0 && !/^https?$/iu.test(scheme)) return null;
  const withScheme = scheme.length > 0 ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.hostname.length === 0) return null;
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return { baseUrl: `${url.protocol}//${url.host}`, host: url.host };
  } catch {
    return null;
  }
}
