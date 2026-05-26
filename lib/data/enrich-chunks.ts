import { normalizePronunciationText } from "../text/normalize-pronunciation";
import { ChunkTimestamp } from "@/types";

const ENRICHABLE_FIELDS = ["ipa_connected", "katakana", "reduction_type"] as const;
type EnrichableField = (typeof ENRICHABLE_FIELDS)[number];

// Validated against the first feed-data article with 6/6 matches and two straddle cases.
const ENRICH_CHUNKS_EPSILON_MS = 50;

type ChunkWithMs = {
  chunk: ChunkTimestamp;
  startMs: number;
  endMs: number;
};

type OverlapCandidate = ChunkWithMs & {
  overlapMs: number;
};

function toMs(value: number): number {
  return Math.round(value * 1000);
}

function overlapMs(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

function isDevMode(): boolean {
  return process.env.NODE_ENV !== "production";
}

function warn(message: string): void {
  if (isDevMode()) {
    console.warn(message);
  }
}

function hasFieldValue(value: string | undefined | null): value is string {
  return value != null && value.length > 0;
}

function mergeFieldValues(
  chunks: ChunkTimestamp[],
  field: EnrichableField,
): string | undefined {
  const values = chunks
    .map((chunk) => chunk[field])
    .filter(hasFieldValue);

  if (!values.length) return undefined;
  return Array.from(new Set(values)).join(" ");
}

function applyField(
  baseChunk: ChunkTimestamp,
  field: EnrichableField,
  incomingValue: string | undefined,
): ChunkTimestamp {
  if (!hasFieldValue(incomingValue)) return baseChunk;

  const currentValue = baseChunk[field];
  if (currentValue == null) {
    return {
      ...baseChunk,
      [field]: incomingValue,
    };
  }

  if (currentValue !== incomingValue) {
    warn(`[enrich-chunks] field conflict on: ${baseChunk.text} — keeping existing value`);
  }

  return baseChunk;
}

function pickMaxOverlap(candidates: OverlapCandidate[]): OverlapCandidate | undefined {
  if (!candidates.length) return undefined;
  return [...candidates].sort((a, b) => {
    if (b.overlapMs !== a.overlapMs) return b.overlapMs - a.overlapMs;
    return a.startMs - b.startMs;
  })[0];
}

function findFallbackByText(
  itemChunk: ChunkTimestamp,
  sortedArticleChunks: ChunkTimestamp[],
): ChunkTimestamp | undefined {
  const normalizedItem = normalizePronunciationText(itemChunk.text);
  return sortedArticleChunks.find((candidate) =>
    normalizePronunciationText(candidate.text).includes(normalizedItem),
  );
}

export function enrichChunkSections(
  itemChunks: ChunkTimestamp[] | null | undefined,
  articleChunks: ChunkTimestamp[] | null | undefined,
): ChunkTimestamp[] {
  if (!itemChunks?.length) return [];

  if (!articleChunks?.length) {
    warn("[enrich-chunks] no article chunks — IPA fields will be absent");
    return itemChunks.map((chunk) => ({ ...chunk }));
  }

  const sortedArticleChunks = [...articleChunks]
    .map<ChunkWithMs>((chunk) => ({
      chunk,
      startMs: toMs(chunk.start_time),
      endMs: toMs(chunk.end_time),
    }))
    .sort((a, b) => a.startMs - b.startMs);

  const sortedItems = itemChunks
    .map((chunk, index) => ({
      index,
      chunk,
      startMs: toMs(chunk.start_time),
      endMs: toMs(chunk.end_time),
    }))
    .sort((a, b) => a.startMs - b.startMs);

  const enrichedByIndex: ChunkTimestamp[] = new Array(itemChunks.length);
  let articlePointer = 0;

  for (const item of sortedItems) {
    while (
      articlePointer < sortedArticleChunks.length &&
      sortedArticleChunks[articlePointer].endMs < item.startMs - ENRICH_CHUNKS_EPSILON_MS
    ) {
      articlePointer += 1;
    }

    const overlaps: OverlapCandidate[] = [];
    for (
      let cursor = articlePointer;
      cursor < sortedArticleChunks.length &&
      sortedArticleChunks[cursor].startMs <= item.endMs + ENRICH_CHUNKS_EPSILON_MS;
      cursor += 1
    ) {
      const candidate = sortedArticleChunks[cursor];
      const intersectsWithEpsilon =
        candidate.endMs >= item.startMs - ENRICH_CHUNKS_EPSILON_MS &&
        candidate.startMs <= item.endMs + ENRICH_CHUNKS_EPSILON_MS;

      if (!intersectsWithEpsilon) continue;

      overlaps.push({
        ...candidate,
        overlapMs: overlapMs(item.startMs, item.endMs, candidate.startMs, candidate.endMs),
      });
    }

    let enriched = { ...item.chunk };
    const containment = overlaps.filter(
      (candidate) =>
        candidate.startMs <= item.startMs + ENRICH_CHUNKS_EPSILON_MS &&
        candidate.endMs >= item.endMs - ENRICH_CHUNKS_EPSILON_MS,
    );

    const positiveOverlaps = overlaps.filter((candidate) => candidate.overlapMs > 0);
    const shouldMergeStraddling = containment.length === 0 && positiveOverlaps.length > 1;

    if (shouldMergeStraddling) {
      for (const field of ENRICHABLE_FIELDS) {
        enriched = applyField(enriched, field, mergeFieldValues(positiveOverlaps.map((o) => o.chunk), field));
      }
      warn(`[enrich-chunks] straddling merge for: ${item.chunk.text}`);
      enrichedByIndex[item.index] = enriched;
      continue;
    }

    let chosen: ChunkTimestamp | undefined;
    if (containment.length > 0) {
      chosen = pickMaxOverlap(containment)?.chunk;
    } else {
      const startInsideCandidates = overlaps.filter(
        (candidate) =>
          item.startMs >= candidate.startMs - ENRICH_CHUNKS_EPSILON_MS &&
          item.startMs <= candidate.endMs + ENRICH_CHUNKS_EPSILON_MS,
      );
      chosen =
        pickMaxOverlap(startInsideCandidates)?.chunk ??
        pickMaxOverlap(overlaps)?.chunk ??
        findFallbackByText(item.chunk, sortedArticleChunks.map((candidate) => candidate.chunk));
    }

    if (!chosen) {
      warn(`[enrich-chunks] no match for: ${item.chunk.text}`);
      enrichedByIndex[item.index] = enriched;
      continue;
    }

    for (const field of ENRICHABLE_FIELDS) {
      enriched = applyField(enriched, field, chosen[field]);
    }

    if (
      enriched.ipa_connected == null &&
      enriched.katakana == null &&
      enriched.reduction_type == null
    ) {
      const textFallback = findFallbackByText(item.chunk, sortedArticleChunks.map((candidate) => candidate.chunk));
      if (textFallback) {
        for (const field of ENRICHABLE_FIELDS) {
          enriched = applyField(enriched, field, textFallback[field]);
        }
      } else {
        warn(`[enrich-chunks] no match for: ${item.chunk.text}`);
      }
    }

    enrichedByIndex[item.index] = enriched;
  }

  return enrichedByIndex;
}

export { ENRICH_CHUNKS_EPSILON_MS };
