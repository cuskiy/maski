import { restoreSections } from "./sections.ts";

const page = document.body.dataset["page"] ?? "";
if (page === "chat") restoreSections();
