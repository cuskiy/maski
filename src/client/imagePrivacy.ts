import { stripImageMetadata, type SanitizedImage } from "./imageSanitizer.ts";

export type { SanitizedImage } from "./imageSanitizer.ts";

interface WorkerRequest {
  readonly id: number;
  readonly file: File;
}

interface WorkerReply {
  readonly id: number;
  readonly ok: boolean;
  readonly file?: File;
  readonly width?: number;
  readonly height?: number;
}

interface Pending {
  readonly file: File;
  readonly resolve: (result: SanitizedImage) => void;
  readonly reject: (error: unknown) => void;
  readonly timer: number;
}

const WORKER_TIMEOUT = 30_000;
let worker: Worker | null = null;
let sequence = 0;
const pending = new Map<number, Pending>();

function processOnMain(file: File, resolve: (result: SanitizedImage) => void, reject: (error: unknown) => void): void {
  void stripImageMetadata(file).then(resolve, reject);
}

function failPending(): void {
  const entries = [...pending.values()];
  pending.clear();
  worker?.terminate();
  worker = null;
  for (const entry of entries) {
    window.clearTimeout(entry.timer);
    processOnMain(entry.file, entry.resolve, entry.reject);
  }
}

function imageWorker(): Worker | null {
  if (worker !== null) return worker;
  const source = document.querySelector<HTMLMetaElement>('meta[name="image-worker"]')?.content;
  if (source === undefined || source === "") return null;
  try {
    worker = new Worker(source);
  } catch {
    return null;
  }
  worker.addEventListener("message", (event: MessageEvent<WorkerReply>) => {
    const reply = event.data;
    const entry = pending.get(reply.id);
    if (entry === undefined) return;
    pending.delete(reply.id);
    window.clearTimeout(entry.timer);
    if (!reply.ok || reply.file === undefined || reply.width === undefined || reply.height === undefined) {
      entry.reject(new Error("Image processing failed"));
      return;
    }
    entry.resolve({ file: reply.file, width: reply.width, height: reply.height });
  });
  worker.addEventListener("error", () => failPending());
  worker.addEventListener("messageerror", () => failPending());
  return worker;
}

export async function sanitizeImage(file: File): Promise<SanitizedImage> {
  const target = imageWorker();
  if (target === null) return stripImageMetadata(file);
  const { promise, resolve, reject } = Promise.withResolvers<SanitizedImage>();
  const id = ++sequence;
  const timer = window.setTimeout(() => {
    if (!pending.delete(id)) return;
    processOnMain(file, resolve, reject);
  }, WORKER_TIMEOUT);
  pending.set(id, { file, resolve, reject, timer });
  const request: WorkerRequest = { id, file };
  try {
    target.postMessage(request);
  } catch {
    pending.delete(id);
    window.clearTimeout(timer);
    processOnMain(file, resolve, reject);
  }
  return promise;
}
