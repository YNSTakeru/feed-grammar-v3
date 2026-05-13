const PUNCTUATION = /[\p{P}]/gu;

function normalizeText(value: string): string {
  return value.toLowerCase().replace(PUNCTUATION, " ").replace(/\s+/g, " ").trim();
}

function tokenSet(value: string): Set<string> {
  const normalized = normalizeText(value);
  if (normalized.length === 0) return new Set();
  return new Set(normalized.split(" "));
}

export function normalizedSimilarity(asr: string, expected: string): number {
  const asrTokens = tokenSet(asr);
  if (asrTokens.size === 0) return 0;

  const expectedTokens = tokenSet(expected);
  if (expectedTokens.size === 0) return 0;

  let intersection = 0;
  for (const token of asrTokens) {
    if (expectedTokens.has(token)) intersection += 1;
  }

  return intersection / Math.max(asrTokens.size, expectedTokens.size);
}
