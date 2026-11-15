type MediaKind = "image" | "video" | "file" | "audio" | "sticker";

const LOCAL_PATH = /^(?:\/(?!\/)|\.\/|\.\.\/)[^\s\\]*$/u;
const BLOB_URL = /^blob:\S+$/u;
const IMAGE_TYPES = { png: true, jpeg: true, webp: true, gif: true, avif: true } as const;
const VIDEO_TYPES = { mp4: true, webm: true, ogg: true } as const;
const AUDIO_TYPES = { mpeg: true, wav: true, ogg: true, webm: true, mp4: true } as const;

function localOnly(value: string): boolean {
  return LOCAL_PATH.test(value) || BLOB_URL.test(value);
}

function dataUrlAllowed(value: string, prefix: string, types: Readonly<Record<string, true>>): boolean {
  if (!value.startsWith(prefix)) return false;
  const comma = value.indexOf(",");
  if (comma === -1) return false;
  const [subtype, ...parameters] = value.slice(prefix.length, comma).toLowerCase().split(";");
  return (
    subtype !== undefined && types[subtype] === true && parameters.some((parameter) => parameter.trim() === "base64")
  );
}

export function safeAvatarUrl(value: string | null): string | null {
  if (value === null || value === "") return null;
  return localOnly(value) || dataUrlAllowed(value, "data:image/", IMAGE_TYPES) ? value : null;
}

export function safeMediaUrl(value: string | null, kind: MediaKind): string | null {
  if (value === null || value === "") return null;
  if (localOnly(value)) return value;
  if ((kind === "image" || kind === "sticker") && dataUrlAllowed(value, "data:image/", IMAGE_TYPES)) {
    return value;
  }
  if (kind === "video" && dataUrlAllowed(value, "data:video/", VIDEO_TYPES)) return value;
  if (kind === "audio" && dataUrlAllowed(value, "data:audio/", AUDIO_TYPES)) return value;
  return null;
}
