import type { App } from "../app/app.ts";
import { setState } from "../store/state.ts";
import { closeDialogFrame } from "./dialog-kit.ts";
import { searchDialog, joinDialog, createDialog, newMessageDialog } from "./dialogs/actions.ts";
import { profileDialog } from "./dialogs/person.ts";
import { roomSettingsDialog } from "./dialogs/room.ts";
import { settingsDialog } from "./dialogs/settings.ts";

const DIALOGS = new Set(["settings", "room-settings", "profile", "search", "join", "create", "new-message"]);

export function closeDialog(): void {
  closeDialogFrame();
}

export function showDialog(app: App, name: string, arg?: string): void {
  if (!DIALOGS.has(name)) return;
  setState({ dialog: name });
  switch (name) {
    case "settings":
      settingsDialog(app);
      return;
    case "room-settings":
      roomSettingsDialog(app, arg ?? app.activeRoom()?.roomId ?? "");
      return;
    case "profile":
      profileDialog(app, arg ?? "");
      return;
    case "search":
      searchDialog(app);
      return;
    case "join":
      joinDialog(app);
      return;
    case "create":
      createDialog(app);
      return;
    case "new-message":
      newMessageDialog(app);
      return;
    default:
      return;
  }
}
