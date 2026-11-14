export type Key = keyof typeof import("../catalogs/en.ts")["en"];

export type Catalog = Readonly<Record<string, string>>;

export type Params = Readonly<Record<string, string | number>>;

/** A translated sentence with its placeholders filled; a missing placeholder is a programming error. */
export function t(catalog: Catalog, key: string, params?: Params): string {
  const template = catalog[key];
  if (template === undefined) throw new Error(`missing catalog entry: ${key}`);
  if (params === undefined) return template;
  return template.replace(/\{(\w+)\}/gu, (_match, name: string) => String(params[name] ?? `{${name}}`));
}
