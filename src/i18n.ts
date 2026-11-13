import { en } from "./catalogs/en.ts";

type Key = keyof typeof en;

let catalog: Record<string, string> = en;

export function useCatalog(next: Record<string, string>): void {
  catalog = next;
}

/** The catalog of the document the reader is on; the generator already chose the language. */
export function t(key: Key): string {
  return catalog[key] ?? en[key];
}
