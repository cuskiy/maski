import type { MediaRef } from "../core/types.ts";
import { fileSize, t } from "../i18n/index.ts";
import { el, icon, ICON } from "./dom.ts";
import { LocalDb } from "../store/db.ts";
import { WorkerClient } from "../client/worker-client.ts";

const MAX_ENTRIES = 200;

export class MediaCache {
  private urls = new Map<string, string>();
  private pending = new Map<string, Promise<string | null>>();
  private local: LocalDb;
  private worker: WorkerClient;

  constructor(local: LocalDb, worker: WorkerClient) {
    this.local = local;
    this.worker = worker;
  }

  async url(ref: MediaRef, size: number, method: "scale" | "crop" = "scale"): Promise<string | null> {
    // A thumbnail of an encrypted original is ciphertext, so the original is the only
    // fetchable size and every caller shares that one entry.
    const chosen = ref.file ? 0 : size;
    const key = `${ref.mxc}@${chosen}/${method}`;
    const cached = this.urls.get(key);
    if (cached) return cached;
    const running = this.pending.get(key);
    if (running) return running;
    const task = this.load(key, ref, chosen, method);
    this.pending.set(key, task);
    try {
      return await task;
    } finally {
      this.pending.delete(key);
    }
  }

  private async load(key: string, ref: MediaRef, size: number, method: "scale" | "crop"): Promise<string | null> {
    try {
      const stored = await this.local.media(key);
      if (stored) return this.keep(key, stored.data);
      const result = await this.worker.send<{ blob: Blob }>({ type: "media", mxc: ref.mxc, size, method, file: ref.file });
      return this.keep(key, result.blob);
    } catch {
      return null;
    }
  }

  private keep(key: string, blob: Blob): string {
    const url = URL.createObjectURL(blob);
    this.urls.set(key, url);
    if (this.urls.size > MAX_ENTRIES) {
      const oldest = this.urls.keys().next().value;
      if (oldest) {
        const stale = this.urls.get(oldest);
        if (stale) URL.revokeObjectURL(stale);
        this.urls.delete(oldest);
      }
    }
    return url;
  }
}

let cache: MediaCache | null = null;

export function useMedia(next: MediaCache): void {
  cache = next;
}

export function avatar(mxc: string | null, name: string, size: number): HTMLElement {
  const letter = (name.trim()[0] ?? "?").toUpperCase();
  const node = el("span", { class: "avatar", attrs: { "aria-hidden": "true" } }, [el("span", { class: "avatar-letter", text: letter })]);
  node.style.setProperty("--avatar-size", `${size}px`);
  if (mxc && cache) {
    void cache.url({ mxc, mime: "image/*", size: 0, width: null, height: null, duration: null, name, file: null }, 64, "crop").then((url) => {
      if (!url) return;
      const img = el("img", { class: "avatar-image", attrs: { alt: "", src: url, decoding: "async" } });
      img.addEventListener("load", () => node.classList.add("avatar-ready"), { once: true });
      node.appendChild(img);
    });
  }
  return node;
}

export function openViewer(url: string, name: string): void {
  const dialog = el("dialog", { class: "viewer" }, [
    el("img", { class: "viewer-image", attrs: { src: url, alt: name } }),
    el("div", { class: "viewer-bar" }, [
      el("span", { class: "viewer-name", text: name }),
      el("a", { class: "button", attrs: { href: url, download: name } }, [icon(ICON.arrowDown), el("span", { text: t("room.download") })]),
      el("button", { class: "icon-button", attrs: { type: "button", "aria-label": t("common.close") }, on: { click: () => dialog.close() } }, [icon(ICON.close)]),
    ]),
  ]);
  dialog.addEventListener("close", () => {
    dialog.remove();
  });
  document.body.appendChild(dialog);
  dialog.showModal();
}

export function picture(ref: MediaRef, kind: "image" | "video" | "sticker"): HTMLElement {
  const ratio = ref.width && ref.height ? `${ref.width} / ${ref.height}` : kind === "sticker" ? "1 / 1" : "4 / 3";
  const box = el("div", { class: `media media-kind-${kind}` });
  box.style.setProperty("--media-ratio", ratio);
  if (ref.mime.startsWith("video/")) {
    const video = el("video", { class: "media-video", attrs: { controls: true, preload: "none", playsinline: true } });
    box.appendChild(video);
    box.classList.add("media-pending");
    void cache?.url(ref, 640).then((url) => {
      if (!url) return;
      video.src = url;
      box.classList.remove("media-pending");
    });
    return box;
  }
  const placeholder = el("div", { class: "media-placeholder" });
  box.appendChild(placeholder);
  void cache?.url(ref, kind === "sticker" ? 320 : 640).then((url) => {
    if (!url) {
      box.classList.add("media-failed");
      placeholder.textContent = ref.name;
      return;
    }
    const img = el("img", { class: "media-image", attrs: { src: url, alt: ref.name, decoding: "async", loading: "lazy" } });
    img.addEventListener("load", () => box.classList.add("media-ready"), { once: true });
    img.addEventListener("click", () => openViewer(url, ref.name));
    box.appendChild(img);
  });
  return box;
}

export function fileCard(ref: MediaRef): HTMLElement {
  return el("div", { class: "file-card" }, [
    el("div", { class: "file-name", text: ref.name }),
    el("div", { class: "file-meta", text: [ref.mime, ref.size > 0 ? fileSize(ref.size) : ""].filter(Boolean).join(" · ") }),
  ]);
}
