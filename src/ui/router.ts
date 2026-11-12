import { config, type Locale } from "../app/config";
import { isLocale, localeFromPath, setLocale as setI18nLocale, stripLocale } from "../i18n";

export interface RouteState {
  locale: Locale;
  path: string;
  dialog: string | null;
}

export interface NavigateOptions {
  replace?: boolean;
  dialog?: string | null;
  searchQuery?: string | null;
}

export class Router {
  private current: RouteState;
  private readonly listeners = new Set<(route: RouteState) => void>();
  private readonly base = config.app.basePath.endsWith("/") ? config.app.basePath : `${config.app.basePath}/`;

  constructor() {
    this.current = this.parse();
    const onChange = (): void => {
      this.current = this.parse();
      for (const listener of this.listeners) listener(this.current);
    };
    window.addEventListener("popstate", onChange);
    window.addEventListener("hashchange", onChange);
  }

  get route(): RouteState {
    return this.current;
  }

  subscribe(listener: (route: RouteState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  navigate(path: string, options: NavigateOptions = {}): void {
    const url = new URL(window.location.href);
    url.pathname = this.localeRoot(this.current.locale);
    url.hash = path || "/";
    const query = new URLSearchParams(window.location.search);
    if (options.dialog !== undefined) {
      if (options.dialog) query.set("dialog", options.dialog);
      else query.delete("dialog");
    }
    url.search = query.toString();
    if (options.replace) window.history.replaceState(null, "", url);
    else window.history.pushState(null, "", url);
    this.current = this.parse();
    for (const listener of this.listeners) listener(this.current);
  }

  openDialog(dialog: string): void {
    this.navigate(this.current.path, { dialog });
  }

  closeDialog(): void {
    this.navigate(this.current.path, { dialog: null, replace: true });
  }

  setLocale(locale: Locale): void {
    const url = new URL(window.location.href);
    url.pathname = this.localeRoot(locale);
    setI18nLocale(locale);
    window.history.pushState(null, "", url);
    this.current = this.parse();
    for (const listener of this.listeners) listener(this.current);
  }

  roomPath(roomId: string): string {
    return `/room/${encodeURIComponent(roomId)}`;
  }

  roomId(): string | null {
    const match = /^\/room\/(.+)$/.exec(this.current.path);
    if (!match) return null;
    try {
      return decodeURIComponent(match[1] ?? "");
    } catch {
      return null;
    }
  }

  isRoomRoute(): boolean {
    return this.roomId() !== null;
  }

  private parse(): RouteState {
    const pathname = this.stripBase(window.location.pathname);
    const locale = localeFromPath(pathname) ?? config.app.defaultLocale;
    setI18nLocale(locale);
    const path = window.location.hash.startsWith("#") ? window.location.hash.slice(1) || "/" : "/";
    const search = new URLSearchParams(window.location.search);
    return { locale, path, dialog: search.get("dialog") };
  }

  private localeRoot(locale: Locale): string {
    if (locale === config.app.defaultLocale) return this.base;
    return `${this.base}${locale}/`;
  }

  private stripBase(pathname: string): string {
    if (pathname.startsWith(this.base)) return pathname.slice(this.base.length) || "/";
    if (this.base === "/") return pathname;
    return stripLocale(pathname);
  }

  isLocale(value: string): value is Locale {
    return isLocale(value);
  }
}
