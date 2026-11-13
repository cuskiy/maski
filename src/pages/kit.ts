import type { Assets } from "../lib/assets.ts";
import type { Html } from "../lib/html.ts";
import type { Locale } from "../catalogs/index.ts";

export interface Alternate {
  readonly lang: string;
  readonly label: string;
  readonly href: string;
}

export interface PageContext {
  readonly locale: Locale;
  readonly assets: Assets;
  /** The address of this page, locale prefix included: `/zh-CN/login/`. */
  readonly path: string;
  /** The locale root: `/` or `/zh-CN/`. */
  readonly localePath: string;
  readonly alternates: readonly Alternate[];
}

export interface PageView {
  readonly title: string;
  readonly description?: string;
  readonly body: Html;
}
