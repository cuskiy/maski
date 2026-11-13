export type Address =
  | { kind: "url"; baseUrl: string }
  | { kind: "name"; serverName: string };

/**
 * Two things a person can type. A URL is the client-server API base as given; a bare name is the
 * server name from a Matrix ID, which still has to be resolved through the well-known document.
 * A path is kept, because a homeserver may live under one.
 */
export function readServer(input: string): Address | null {
  const trimmed = input.trim();
  if (trimmed.length === 0 || /\s/u.test(trimmed)) return null;
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//iu.exec(trimmed)?.[1] ?? "";
  if (scheme.length > 0) {
    if (!/^https?$/iu.test(scheme)) return null;
    try {
      const url = new URL(trimmed);
      const path = url.pathname.replace(/\/+$/u, "");
      return { kind: "url", baseUrl: `${url.protocol}//${url.host}${path}` };
    } catch {
      return null;
    }
  }
  const host = trimmed.replace(/\/+$/u, "");
  return /^[a-z0-9.-]+(:\d{1,5})?$/iu.test(host) ? { kind: "name", serverName: host } : null;
}
