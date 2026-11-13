import type { App } from "../../app/app.ts";
import { t, timeOfDay } from "../../i18n/index.ts";
import { state } from "../../store/state.ts";
import type { Message } from "../../core/types.ts";
import { el } from "../dom.ts";
import { button, openDialogFrame, row, textField } from "../dialog-kit.ts";
import { toast } from "../overlay.ts";

export function searchDialog(app: App): void {
  const input = el("input", { class: "field", attrs: { type: "search", placeholder: t("search.placeholder"), "aria-label": t("search.title") } });
  const results = el("div", { class: "search-results" }, [el("p", { class: "dialog-note", text: t("search.empty") })]);
  let timer = 0;
  input.addEventListener("input", () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void run(input.value.trim()), 160);
  });
  const run = async (query: string): Promise<void> => {
    if (!query) {
      results.replaceChildren(el("p", { class: "dialog-note", text: t("search.empty") }));
      return;
    }
    const result = await app.worker.send<{ hits: { roomId: string; message: Message }[] }>({ type: "search", query, roomId: null });
    const hits = result.hits;
    if (hits.length === 0) {
      results.replaceChildren(el("p", { class: "dialog-note", text: t("search.noResults") }));
      return;
    }
    results.replaceChildren(
      el("p", { class: "dialog-note", text: t("search.results", { n: hits.length }) }),
      ...hits.map((hit) =>
        el("button", {
          class: "search-row",
          attrs: { type: "button" },
          on: {
            click: () => {
              app.openRoom(hit.roomId, hit.message.id);
            },
          },
        }, [
          el("span", { class: "search-room", text: `${state.rooms.get(hit.roomId)?.name ?? hit.roomId} · ${timeOfDay(hit.message.ts)}` }),
          el("span", { class: "search-text", text: hit.message.body }),
        ]),
      ),
    );
  };
  openDialogFrame(app, t("search.title"), el("div", { class: "dialog-sections" }, [input, results]));
  requestAnimationFrame(() => input.focus());
}

export function joinDialog(app: App): void {
  const target = textField(t("join.title"), "", "text");
  target.placeholder = t("join.placeholder");
  openDialogFrame(app, t("join.title"), el("div", { class: "dialog-sections" }, [
    target,
    el("div", { class: "dialog-actions" }, [
      button(t("join.action"), () => {
        void app.worker.send<{ roomId: string }>({ type: "join", target: target.value.trim() }).then((result) => {
          app.openRoom(result.roomId);
          toast(t("toast.joined"));
        }).catch(() => toast(t("error.notFound")));
      }, true),
    ]),
  ]));
  requestAnimationFrame(() => target.focus());
}

export function createDialog(app: App): void {
  const name = textField(t("create.name"), "");
  const topic = textField(t("create.topic"), "");
  const invites = textField(t("create.invites"), "");
  const isPublic = el("input", { attrs: { type: "checkbox" } });
  const encrypted = el("input", { attrs: { type: "checkbox", checked: true } });
  openDialogFrame(app, t("create.title"), el("div", { class: "dialog-sections" }, [
    row(t("create.name"), name),
    row(t("create.topic"), topic),
    row(t("create.public"), isPublic),
    row(t("create.encrypt"), encrypted),
    el("p", { class: "dialog-note", text: t("create.encryptHint") }),
    row(t("create.invites"), invites),
    el("div", { class: "dialog-actions" }, [
      button(t("create.action"), () => {
        void app.worker.send<{ roomId: string }>({
          type: "create",
          name: name.value.trim(),
          topic: topic.value.trim(),
          isPublic: isPublic.checked,
          encrypted: encrypted.checked,
          invites: invites.value.split(",").map((entry) => entry.trim()).filter(Boolean),
        }).then((result) => {
          app.openRoom(result.roomId);
          toast(t("toast.created"));
        }).catch(() => toast(t("error.forbidden")));
      }, true),
    ]),
  ]));
  requestAnimationFrame(() => name.focus());
}

export function newMessageDialog(app: App): void {
  const userId = textField(t("newMessage.placeholder"), "@user:server");
  openDialogFrame(app, t("newMessage.title"), el("div", { class: "dialog-sections" }, [
    userId,
    el("div", { class: "dialog-actions" }, [
      button(t("newMessage.action"), () => {
        void app.worker.send<{ roomId: string }>({ type: "direct", userId: userId.value.trim() }).then((result) => {
          app.openRoom(result.roomId);
        }).catch(() => toast(t("error.unknown")));
      }, true),
    ]),
  ]));
  requestAnimationFrame(() => userId.focus());
}
