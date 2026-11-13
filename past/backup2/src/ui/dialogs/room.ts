import type { App } from "../../app/app.ts";
import type { Member } from "../../core/types.ts";
import { t } from "../../i18n/index.ts";
import { activeRoom, canModerate } from "../../store/select.ts";
import { state } from "../../store/state.ts";
import { button, openDialogFrame, row, textField, uploadButton } from "../dialog-kit.ts";
import { el, icon, ICON } from "../dom.ts";
import { avatar } from "../media.ts";
import { iconButton, openMenu, toast } from "../overlay.ts";

export function roomSettingsDialog(app: App, roomId: string): void {
  const room = state.rooms.get(roomId) ?? activeRoom();
  if (!room) return;
  const nameInput = textField(t("roomSettings.name"), room.name);
  const topicInput = textField(t("roomSettings.topic"), room.topic);
  const members = el("div", { class: "member-list" }, [el("p", { class: "dialog-note", text: t("common.loading") })]);
  const canEdit = room.membership === "join" && room.myPower >= 50;
  const reload = (): void => {
    void app.worker.send<{ members: Member[] }>({ type: "members", roomId }).then((result) => {
      const sorted = result.members.toSorted((a, b) => b.power - a.power || a.name.localeCompare(b.name));
      const self = state.session?.userId ?? "";
      members.replaceChildren(
        ...sorted.map((member) => {
          const banned = member.membership === "ban";
          const moderatable = canModerate(room, member, self);
          return el("div", { class: "member-row" }, [
            avatar(member.avatar, member.name, 32),
            el("span", { class: "member-name", text: member.name }),
            banned ? el("span", { class: "tag", text: t("roomSettings.banned") }) : null,
            member.power >= 100 ? el("span", { class: "tag", text: t("profile.admin") }) : member.power >= 50 ? el("span", { class: "tag", text: t("profile.moderator") }) : null,
            banned && moderatable
              ? iconButton(ICON.chevron, t("roomSettings.unban"), () => void moderate("unban", member.userId))
              : moderatable
                ? el("button", {
                    class: "icon-button",
                    attrs: { type: "button", "aria-label": t("roomSettings.moderate") },
                    on: {
                      click: (event) => {
                        const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
                        openMenu(box.left, box.bottom, [
                          { label: t("roomSettings.kick"), action: () => moderate("kick", member.userId) },
                          { label: t("roomSettings.ban"), danger: true, action: () => moderate("ban", member.userId) },
                        ]);
                      },
                    },
                  }, [icon(ICON.more, 18)])
                : null,
          ]);
        }),
      );
    }).catch(() => {
      members.replaceChildren(el("p", { class: "dialog-note", text: t("error.network") }));
    });
  };
  const moderate = (action: "kick" | "ban" | "unban", userId: string): Promise<void> =>
    app.worker
      .send({ type: "moderate", roomId, userId, action })
      .then(() => {
        toast(action === "kick" ? t("toast.kicked") : action === "ban" ? t("toast.banned") : t("toast.unbanned"));
        reload();
      })
      .catch(() => toast(t("error.forbidden")));
  reload();

  const inviteField = textField(t("roomSettings.invite"), "@user:server");
  const body = el("div", { class: "dialog-sections" }, [
    el("section", { class: "section" }, [
      el("h2", { class: "section-title", text: t("roomSettings.general") }),
      row(t("roomSettings.avatar"), el("div", { class: "setting-value" }, [
        avatar(room.avatar, room.name, 40),
        canEdit
          ? uploadButton(t("settings.changeAvatar"), async (file) => {
              const data = await file.arrayBuffer();
              await app.worker.send({ type: "uploadRoomAvatar", roomId, data, mime: file.type || "image/png" });
              toast(t("toast.saved"));
            })
          : el("span"),
      ])),
      canEdit ? row(t("roomSettings.name"), nameInput) : row(t("roomSettings.name"), el("span", { class: "status-text", text: room.name })),
      canEdit ? row(t("roomSettings.topic"), topicInput) : row(t("roomSettings.topic"), el("span", { class: "status-text", text: room.topic || "—" })),
      canEdit
        ? el("div", { class: "dialog-actions" }, [
            button(t("common.save"), () => {
              void app.worker.send({ type: "setRoomState", roomId, name: nameInput.value, topic: topicInput.value }).then(() => toast(t("toast.saved")));
            }, true),
          ])
        : el("p", { class: "dialog-note", text: t("roomSettings.noPermission") }),
    ]),
    el("section", { class: "section" }, [
      el("h2", { class: "section-title", text: t("roomSettings.encryption") }),
      el("p", { class: "dialog-note", text: room.encrypted ? t("roomSettings.encryptionOn") : t("roomSettings.encryptionOff") }),
    ]),
    el("section", { class: "section" }, [
      el("h2", { class: "section-title", text: t("roomSettings.members") }),
      el("div", { class: "inline-form" }, [
        inviteField,
        button(t("roomSettings.inviteAction"), () => {
          const userId = inviteField.value.trim();
          if (!userId) return;
          void app.worker.send({ type: "invite", roomId, userId }).then(() => toast(t("toast.invited")));
        }),
      ]),
      members,
    ]),
    el("section", { class: "section" }, [
      el("h2", { class: "section-title", text: t("roomSettings.notifications") }),
      row(t("menu.mute"), button(room.muted ? t("menu.unmute") : t("menu.mute"), () => {
        void app.worker.send({ type: "mute", roomId, on: !room.muted });
      })),
    ]),
    el("section", { class: "section" }, [
      el("h2", { class: "section-title", text: t("roomSettings.leave") }),
      el("p", { class: "dialog-note", text: t("roomSettings.leaveConfirm") }),
      el("div", { class: "dialog-actions" }, [
        button(t("roomSettings.leave"), () => {
          void app.worker.send({ type: "leave", roomId }).then(() => {
            app.closeDialog();
            app.openRoom("");
            toast(t("toast.left"));
          });
        }),
      ]),
    ]),
  ]);
  openDialogFrame(app, t("roomSettings.title"), body);
}
