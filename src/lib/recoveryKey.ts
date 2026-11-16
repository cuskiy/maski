const INVISIBLE = /[\s\p{Cf}\p{Cc}\u00ad]/gu;

/**
 * Recovery keys are copied from chat clients, clipboards and screenshots, which
 * can add spaces, line breaks, bidi marks, zero-width characters or soft hyphens.
 * The key itself is base58; keep only the visible key characters.
 */
export function normalizeRecoveryKey(value: string): string {
  return value.normalize("NFKC").replace(INVISIBLE, "");
}
