/** The ids the generator writes and the client looks up; both import this module. */
export const REGION = {
  shell: "region-shell",
  nav: "region-nav",
  menu: "region-menu",
  sections: "region-sections",
  content: "region-content",
  header: "region-header",
  timeline: "region-timeline",
  composer: "region-composer",
  tray: "region-tray",
} as const;

export const SURFACE = {
  search: "surface-search",
  newMessage: "surface-new-message",
  invite: "surface-invite",
  join: "surface-join",
  create: "surface-create",
  settings: "surface-settings",
  attach: "surface-attach",
  sticker: "surface-sticker",
  emoji: "surface-emoji",
} as const;

