import type { Assets } from "../lib/assets.ts";
import type { Html } from "../lib/html.ts";
import type { Locale } from "../catalogs/index.ts";
import type { LocaleId } from "../core/locales.ts";

export interface Alternate {
  readonly lang: LocaleId;
  readonly href: string;
}

export interface PageContext {
  readonly locale: Locale;
  readonly assets: Assets;
  readonly path: string;
  readonly localePath: string;
  readonly alternates: readonly Alternate[];
}

export interface PageView {
  readonly title: string;
  readonly description?: string;
  readonly body: Html;
}
