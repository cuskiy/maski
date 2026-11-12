export function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .normalize("NFC");
}

export function tokenize(value: string): string[] {
  const normalized = normalizeText(value);
  if (!normalized.trim()) return [];
  const segmenter = new Intl.Segmenter(undefined, { granularity: "word" });
  const tokens = new Set<string>();
  for (const segment of segmenter.segment(normalized)) {
    if (!segment.isWordLike) continue;
    const token = segment.segment.trim();
    if (token.length > 0) tokens.add(token);
  }
  return [...tokens].slice(0, 64);
}

export function searchTokens(query: string): string[] {
  return tokenize(query);
}

export function matchesTokens(tokens: readonly string[], query: readonly string[]): boolean {
  if (query.length === 0) return true;
  return query.every((token) => tokens.some((candidate) => candidate.startsWith(token)));
}
