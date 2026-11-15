export interface MessageLink {
  readonly url: string;
  readonly host: string;
}

const URL_PATTERN = /https?:\/\/[^\s<>"']+/giu;

function safeUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

export function messageLinks(body: string, html: string | null): readonly MessageLink[] {
  const found = new Map<string, MessageLink>();
  for (const candidate of `${body}\n${html ?? ""}`.match(URL_PATTERN) ?? []) {
    const trimmed = candidate.replace(/[),.;:!?]+$/u, "");
    const url = safeUrl(trimmed);
    if (url === null || found.has(url.href)) continue;
    found.set(url.href, { url: url.href, host: url.hostname });
  }
  return Array.from(found.values());
}

export function uniqueLinks(
  messages: ReadonlyArray<{ readonly body: string; readonly html: string | null }>,
): readonly MessageLink[] {
  const found = new Map<string, MessageLink>();
  for (const message of messages) {
    for (const link of messageLinks(message.body, message.html)) {
      if (!found.has(link.url)) found.set(link.url, link);
    }
  }
  return Array.from(found.values());
}
