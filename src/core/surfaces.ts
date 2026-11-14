import type { CatalogKey } from "../lib/catalog.ts";
import { SURFACE } from "./regions.ts";

export type SurfaceKind = "modal" | "floating";
export type SurfacePopover = "auto" | "manual";

export interface SurfaceDefinition {
  readonly id: string;
  readonly titleKey: CatalogKey;
  readonly kind: SurfaceKind;
  readonly popover?: SurfacePopover;
}

/** The one chat surface list: markup, tests and overlay behavior derive from it. */
export const CHAT_SURFACES: readonly SurfaceDefinition[] = [
  { id: SURFACE.search, titleKey: "surface.search", kind: "modal" },
  { id: SURFACE.newMessage, titleKey: "surface.newMessage", kind: "modal" },
  { id: SURFACE.invite, titleKey: "surface.invite", kind: "modal" },
  { id: SURFACE.join, titleKey: "surface.join", kind: "modal" },
  { id: SURFACE.create, titleKey: "surface.create", kind: "modal" },
  { id: SURFACE.settings, titleKey: "surface.settings", kind: "modal" },
  { id: SURFACE.roomSettings, titleKey: "surface.roomSettings", kind: "modal" },
  { id: SURFACE.viewer, titleKey: "surface.viewer", kind: "modal" },
  { id: SURFACE.roomMenu, titleKey: "surface.roomMenu", kind: "floating", popover: "manual" },
  { id: SURFACE.messageMenu, titleKey: "surface.messageMenu", kind: "floating", popover: "manual" },
  { id: SURFACE.profile, titleKey: "surface.profile", kind: "modal" },
  { id: SURFACE.confirm, titleKey: "confirm.title", kind: "modal" },
  { id: SURFACE.attach, titleKey: "surface.attach", kind: "floating" },
  { id: SURFACE.sticker, titleKey: "surface.sticker", kind: "floating" },
  { id: SURFACE.emoji, titleKey: "surface.emoji", kind: "floating" },
  { id: SURFACE.sendMenu, titleKey: "surface.sendMenu", kind: "floating", popover: "manual" },
];
