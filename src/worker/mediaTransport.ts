/**
 * Authenticated media download. The URL is built by the SDK's own mxc validator so an event can
 * never inject a path; the request carries `cache: "no-store"` because authenticated bytes must
 * not enter the HTTP cache, and a 401 triggers one SDK token refresh before giving up.
 */
import { getHttpUriForMxc, Method, type MatrixClient } from "matrix-js-sdk";
import { WorkerFailure } from "./failure.ts";

export interface DownloadSize {
  readonly width: number;
  readonly height: number;
}

const DOWNLOAD_TIMEOUT = 60_000;

export function mxcDownloadUrl(baseUrl: string, mxc: string, size: DownloadSize | null, animated = false): string {
  const url =
    size === null
      ? getHttpUriForMxc(baseUrl, mxc, undefined, undefined, undefined, false, false, true)
      : getHttpUriForMxc(baseUrl, mxc, size.width, size.height, "scale", false, true, true, animated);
  if (url === "") throw new WorkerFailure("unsupported");
  return url;
}

async function send(client: MatrixClient, url: string, token: string): Promise<Response> {
  return client.http.fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    credentials: "omit",
    referrerPolicy: "no-referrer",
    mode: "cors",
    redirect: "follow",
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT),
  });
}

function statusFailure(status: number): WorkerFailure {
  if (status === 404) return new WorkerFailure("unavailable");
  if (status === 413) return new WorkerFailure("too-large");
  if (status === 401 || status === 403) return new WorkerFailure("auth");
  return new WorkerFailure("network");
}

/** Downloads one original or one thumbnail; the caller verifies, decrypts and allowlists it. */
export async function fetchMedia(
  client: MatrixClient,
  mxc: string,
  size: DownloadSize | null,
  animated = false,
): Promise<Blob> {
  const url = mxcDownloadUrl(client.getHomeserverUrl(), mxc, size, animated);
  const token = client.getAccessToken();
  if (token === null) throw new WorkerFailure("not-signed-in");
  let response: Response;
  try {
    response = await send(client, url, token);
  } catch {
    throw new WorkerFailure("network");
  }
  if (response.status === 401) {
    try {
      await client.http.authedRequest(Method.Get, "/account/whoami");
    } catch {
      throw new WorkerFailure("auth");
    }
    const refreshed = client.getAccessToken();
    if (refreshed === null) throw new WorkerFailure("auth");
    try {
      response = await send(client, url, refreshed);
    } catch {
      throw new WorkerFailure("network");
    }
  }
  if (!response.ok) throw statusFailure(response.status);
  try {
    return await response.blob();
  } catch {
    throw new WorkerFailure("network");
  }
}
