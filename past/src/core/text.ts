const ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/gu, (char) => ENTITIES[char] ?? char);
}

export function htmlFromText(text: string): string | null {
  return text.includes("\n") ? escapeHtml(text).replace(/\n/gu, "<br>") : null;
}

const SPLIT = /[^\p{L}\p{N}]+/u;

/** The search index of one message: folded words, no duplicates. */
export function tokens(text: string): string[] {
  const folded = text
    .normalize("NFKC")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
  const words = folded.split(SPLIT).filter((word) => word.length > 0);
  return [...new Set(words)];
}

/** A recovery key arrives in groups of four with spaces, or without them at all. */
export function compactKey(input: string): string {
  return input.replace(/[\s\u200b-\u200d\ufeff]/gu, "");
}
