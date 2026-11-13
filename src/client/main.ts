import { readAccount } from "./account.ts";
import { startChat } from "./chat.ts";

const page = document.body.dataset["page"] ?? "";

/** The loader decides once, then leaves: no session goes to the server form, a session to the chat. */
if (page === "router") {
  location.replace(readAccount() === null ? "server/" : "chat/");
}

if (page === "chat") startChat();
