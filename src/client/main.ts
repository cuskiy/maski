import { readAccount } from "./account.ts";
import { rememberLocale, pathOf, resolveLocale } from "./locale.ts";
import { startChat } from "./chat.ts";
import { startAuth } from "./auth.ts";

const page = document.body.dataset["page"] ?? "";

/**
 * The loader decides once, then leaves: the language comes from a stored choice or the browser,
 * and the destination from whether an account is remembered.
 */
if (page === "router") {
  const destination = readAccount() === null ? "server/" : "chat/";
  location.replace(`${pathOf(resolveLocale())}${destination}`);
}

if (page === "chat") startChat();
else if (page !== "") startAuth();

/** Choosing a language is a decision the loader must not undo on the next visit. */
document.addEventListener("click", (event) => {
  const link = event.target instanceof Element ? event.target.closest("a[hreflang]") : null;
  const lang = link?.getAttribute("hreflang") ?? "";
  if (lang.length > 0) rememberLocale(lang);
});
