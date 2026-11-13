import type { SectionId } from "../core/types.ts";

export const config = {
  app: {
    name: "maski",
    version: "0.1.0",
    tagline: "A fast, local-first Matrix client",
    sourceUrl: "https://github.com/cuskiy/maski",
  },
  homeserver: { defaultBaseUrl: "https://matrix.org" },
  locales: [
    { id: "en", label: "English", path: "/" },
    { id: "zh-CN", label: "简体中文", path: "/zh-CN/" },
  ],
  limits: {
    timeline: 80,
    timelineMax: 800,
    members: 200,
    search: 50,
    upload: 100 * 1024 * 1024,
    recentPacks: 24,
  },
  sections: ["invites", "favorites", "direct", "rooms", "low"] as SectionId[],
  links: {
    matrix: "https://matrix.org",
    sdk: "https://github.com/matrix-org/matrix-js-sdk",
    spec: "https://spec.matrix.org/latest/client-server-api/",
  },
} as const;
