const TECHNICAL_PATTERNS = [
  /firebase/i,
  /firestore/i,
  /google/i,
  /studio/i,
  /mozflix-e39cc/i,
  /\bauth\//i,
  /\bstorage\//i,
  /\bfunctions\//i,
  /permission/i,
  /insufficient/i,
  /missing or/i,
  /offline/i,
  /network/i,
  /failed to fetch/i,
  /cors/i,
  /quota/i,
  /unavailable/i,
  /deadline/i,
  /\binternal\b/i,
  /invalid-argument/i,
  /not-found/i,
  /already-exists/i,
  /unauthenticated/i,
  /unauthorized/i,
  /indexeddb/i,
  /syntaxerror/i,
  /typeerror/i,
  /referenceerror/i,
  /\bjson\b/i,
];

/**
 * Processa erros técnicos em segundo plano sem jamais expor termos internos
 * (ex: Firebase, Firestore, SDK codes) na interface do utilizador.
 */
export function sanitizeUserError(err: unknown, fallback: string): string {
  if (typeof console !== 'undefined' && console.error) {
    console.error('[MozFlix Background]', err);
  }

  if (!err) return fallback;
  const raw = err instanceof Error ? err.message : String(err);
  const cleaned = raw.trim();
  if (!cleaned) return fallback;

  for (const pattern of TECHNICAL_PATTERNS) {
    if (pattern.test(cleaned)) {
      return fallback;
    }
  }

  return cleaned;
}

export function reportBackgroundError(err: unknown): void {
  if (typeof console !== 'undefined' && console.error) {
    console.error('[MozFlix Background]', err);
  }
}
