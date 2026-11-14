import { en } from "../catalogs/en.ts";

export type Catalog = Record<keyof typeof en, string>;
export type CatalogKey = keyof Catalog;

export function t(catalog: Catalog, key: CatalogKey, params?: Readonly<Record<string, string>>): string {
  const template = catalog[key];
  if (params === undefined) return template;
  return template.replace(/\{(\w+)\}/gu, (_match, name: string) => params[name] ?? `{${name}}`);
}
