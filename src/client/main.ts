import { startChat } from "./chat.ts";

const page = document.body.dataset["page"] ?? "";

if (page === "chat") {
  startChat();
}
