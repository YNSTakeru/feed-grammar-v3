export function normalizePronunciationText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\u2018\u2019\u0060]/g, "'")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[＜＞<>【】〈〉]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
