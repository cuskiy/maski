import type { App } from "../../app/app.ts";
import { t } from "../../i18n/index.ts";
import { activeRoom } from "../../store/select.ts";
import { state } from "../../store/state.ts";
import { el } from "../dom.ts";
import { button, openDialogFrame } from "../dialog-kit.ts";
import { avatar } from "../media.ts";
import { copyText } from "../overlay.ts";

export function profileDialog(app: App, userId: string): void {
  const session = state.session;
  const room = activeRoom();
  if (!userId) return;
  void app.local.members(room?.roomId ?? "").then((members) => {
    const member = members.find((entry) => entry.userId === userId) ?? null;
    const name = member?.name ?? userId;
    const body = el("div", { class: "profile-dialog" }, [
      avatar(member?.avatar ?? null, name, 72),
      el("h2", { class: "profile-name", text: name }),
      el("button", {
        class: "link-button mono",
        attrs: { type: "button" },
        on: { click: () => void copyText(userId, t("toast.copied")) },
      }, [el("span", { text: userId })]),
      member && member.power >= 100 ? el("span", { class: "tag", text: t("profile.admin") }) : member && member.power >= 50 ? el("span", { class: "tag", text: t("profile.moderator") }) : null,
      userId !== session?.userId
        ? el("div", { class: "dialog-actions" }, [
            button(t("profile.message"), () => {
              void app.worker.send<{ roomId: string }>({ type: "direct", userId }).then((result) => {
                app.openRoom(result.roomId);
              });
            }, true),
            button(t("profile.copyId"), () => void copyText(userId, t("toast.copied"))),
          ])
        : null,
    ]);
    openDialogFrame(app, t("profile.title"), body);
  });
}
