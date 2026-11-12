import {
  errorInfo,
  isAck,
  isClientToWorker,
  isCommandRequest,
  isUiaAnswer,
  isUiaCancel,
  type CommandReply,
  type WorkerToClient,
} from "../protocol";
import { Runtime } from "./runtime";

const send = (event: WorkerToClient | CommandReply): void => {
  globalThis.postMessage(event);
};

const runtime = new Runtime(send);

globalThis.addEventListener("message", (message: MessageEvent<unknown>): void => {
  const data = message.data;
  if (!isClientToWorker(data)) {
    send({ type: "log", level: "warn", message: "Ignored malformed worker message" });
    return;
  }
  if (isAck(data)) return;
  if (isUiaAnswer(data)) {
    runtime.answerUia(data.requestId, data.auth);
    return;
  }
  if (isUiaCancel(data)) {
    runtime.cancelUia(data.requestId);
    return;
  }
  if (!isCommandRequest(data)) return;
  void runtime
    .handle(data)
    .then((result) => {
      const reply: CommandReply = { id: data.id, ok: true, data: result };
      send(reply);
    })
    .catch((error: unknown) => {
      const info = errorInfo(error);
      const reply: CommandReply = { id: data.id, ok: false, error: info };
      send(reply);
    });
});
