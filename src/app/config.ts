const locales = ["en", "zh-CN"] as const;

export type Locale = (typeof locales)[number];
export type RouterMode = "hash" | "history";

export interface AppConfig {
  app: {
    name: string;
    version: string;
    defaultHomeserver: string;
    locales: readonly Locale[];
    defaultLocale: Locale;
    fallbackLocale: Locale;
    routerMode: RouterMode;
    basePath: string;
    origin: string;
    links: { source: string };
  };
  routes: {
    home: string;
    room: string;
    login: string;
    register: string;
  };
  dialogs: {
    settings: string;
    search: string;
    newMessage: string;
    join: string;
    create: string;
    roomSettings: string;
  };
  limits: {
    timelineWindow: number;
    timelinePage: number;
    loadedMax: number;
    searchLimit: number;
    mediaCacheBytes: number;
    outboxPerRoom: number;
  };
  media: { avatarSizes: number[] };
}

export const config: AppConfig = {
  app: {
    name: "maski",
    version: "0.1.0",
    defaultHomeserver: "matrix.org",
    locales,
    defaultLocale: "en",
    fallbackLocale: "en",
    routerMode: "hash",
    basePath: "/",
    origin: "https://maski.example",
    links: {
      source: "https://github.com/maski/maski",
    },
  },
  routes: {
    home: "/",
    room: "/room/:roomId",
    login: "/login",
    register: "/register",
  },
  dialogs: {
    settings: "settings",
    search: "search",
    newMessage: "new-message",
    join: "join",
    create: "create",
    roomSettings: "room-settings",
  },
  limits: {
    timelineWindow: 300,
    timelinePage: 50,
    loadedMax: 2000,
    searchLimit: 50,
    mediaCacheBytes: 200 * 1024 * 1024,
    outboxPerRoom: 3,
  },
  media: {
    avatarSizes: [48, 96],
  },
};

export const localeList: readonly Locale[] = config.app.locales;
