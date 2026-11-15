import { workerScope } from "../lib/workerScope.ts";
import { stripImageMetadata } from "./imageSanitizer.ts";

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

const scope = workerScope<WorkerRequest, WorkerReply>();

scope.onmessage = async (event) => {
  const { id, file } = event.data;
  try {
    const result = await stripImageMetadata(file);
    scope.postMessage({ id, ok: true, file: result.file, width: result.width, height: result.height });
  } catch {
    scope.postMessage({ id, ok: false });
  }
};
