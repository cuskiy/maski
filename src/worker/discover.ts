import type { Discovery } from "../core/types.ts";
import type { Address } from "../core/server.ts";

/** 404 means "no delegation here", which the specification says to ignore rather than fail on. */
async function wellKnown(serverName: string): Promise<string | null> {
  let response: Response;
  try {
    response = await fetch(`https://${serverName}/.well-known/matrix/client`);
  } catch {
    return null;
  }
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`well-known ${String(response.status)}`);
  const body: unknown = await response.json();
  const homeserver = typeof body === "object" && body !== null ? (body as Record<string, unknown>)["m.homeserver"] : null;
  const url = typeof homeserver === "object" && homeserver !== null ? (homeserver as Record<string, unknown>)["base_url"] : null;
  if (typeof url !== "string" || url.length === 0) throw new Error("well-known has no m.homeserver.base_url");
  try {
    new URL(url);
  } catch {
    throw new Error("well-known base_url is not a URL");
  }
  return url.replace(/\/+$/u, "");
}

/** The client-server API base and what the server offers there. The `m.server` key is federation, not us. */
export async function discover(address: Address): Promise<Discovery> {
  const serverName = address.kind === "name" ? address.serverName : new URL(address.baseUrl).host;
  const delegated = address.kind === "name" ? await wellKnown(address.serverName) : null;
  const baseUrl = address.kind === "url" ? address.baseUrl : (delegated ?? `https://${address.serverName}`);

  // The specification asks for a versions check, so a mistyped host fails here rather than later.
  const versions = await fetch(`${baseUrl}/_matrix/client/versions`).catch(() => null);
  if (versions === null || !versions.ok) throw new Error("not a homeserver");
  const supported: unknown = await versions.json().catch(() => null);
  const list = typeof supported === "object" && supported !== null ? (supported as { versions?: unknown }).versions : null;
  if (!Array.isArray(list)) throw new Error("not a homeserver");

  const login = await fetch(`${baseUrl}/_matrix/client/v3/login`);
  if (!login.ok) throw new Error(`login flows ${String(login.status)}`);
  const body: unknown = await login.json();
  const flows = typeof body === "object" && body !== null ? (body as { flows?: unknown }).flows : null;
  const types = Array.isArray(flows)
    ? flows
        .map((flow) => (typeof flow === "object" && flow !== null ? (flow as { type?: unknown }).type : null))
        .filter((type): type is string => typeof type === "string")
    : [];

  let registration = false;
  try {
    const probe = await fetch(`${baseUrl}/_matrix/client/v3/register`);
    registration = probe.ok || probe.status === 401;
  } catch {
    registration = false;
  }

  return { baseUrl, serverName, password: types.includes("m.login.password"), registration };
}
