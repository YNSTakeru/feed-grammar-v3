import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

import type { ChunkTimestamp, FeedItem } from "../types";

export const DEFAULT_GAP_THRESHOLD_SECONDS = 0.15;
export const DEFAULT_MAX_MERGED_WORDS = 4;

export type MergeOptions = {
  gapThresholdSeconds?: number;
  maxMergedWords?: number;
};

export type MergeLog = {
  leftText: string;
  rightText: string;
  mergedText: string;
  gapSeconds: number;
};

export type MergeResult = {
  chunks: ChunkTimestamp[];
  mergeCount: number;
  skippedByWordCap: number;
  logs: MergeLog[];
};

export type MergeSummary = {
  totalArticles: number;
  eligibleArticles: number;
  articlesChanged: number;
  articlesSkippedNoChunks: number;
  parseErrors: number;
  merges: number;
  skippedByWordCap: number;
};

export type TransformResult = {
  items: FeedItem[];
  summary: MergeSummary;
};

type ScriptArgs = {
  write: boolean;
};

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/u)
    .filter((part) => part.length > 0).length;
}

function normalizeMergedText(left: string, right: string): string {
  return `${left} ${right}`.replace(/\s+/gu, " ").trim();
}

function mergeOptionalText(left?: string, right?: string): string | undefined {
  if (!left && !right) return undefined;
  const merged = normalizeMergedText(left ?? "", right ?? "");
  return merged.length > 0 ? merged : undefined;
}

function mergeChunkMetadata(
  left: ChunkTimestamp,
  right: ChunkTimestamp,
  mergedText: string,
): ChunkTimestamp {
  const merged: ChunkTimestamp = {
    text: mergedText,
    start_time: left.start_time,
    end_time: right.end_time,
  };

  const mergedKatakana = mergeOptionalText(left.katakana, right.katakana);
  if (mergedKatakana) {
    merged.katakana = mergedKatakana;
  }

  const mergedIpa = mergeOptionalText(left.ipa_connected, right.ipa_connected);
  if (mergedIpa) {
    merged.ipa_connected = mergedIpa;
  }

  if (left.reduction_type && right.reduction_type && left.reduction_type === right.reduction_type) {
    merged.reduction_type = left.reduction_type;
  }

  if ((left.linking?.length ?? 0) + (right.linking?.length ?? 0) > 0) {
    merged.linking = [...(left.linking ?? []), ...(right.linking ?? [])];
  }

  return merged;
}

function isTightGap(left: ChunkTimestamp, right: ChunkTimestamp, threshold: number): boolean {
  return right.start_time - left.end_time < threshold;
}

function canMergeByWordCap(
  left: ChunkTimestamp,
  right: ChunkTimestamp,
  maxMergedWords: number,
): boolean {
  return countWords(left.text) + countWords(right.text) <= maxMergedWords;
}

export function mergeTightGaps(
  chunks: ChunkTimestamp[],
  options: MergeOptions = {},
): MergeResult {
  const gapThresholdSeconds =
    options.gapThresholdSeconds ?? DEFAULT_GAP_THRESHOLD_SECONDS;
  const maxMergedWords = options.maxMergedWords ?? DEFAULT_MAX_MERGED_WORDS;
  const mergedChunks = chunks.map((chunk) => ({ ...chunk }));

  let mergeCount = 0;
  let skippedByWordCap = 0;
  const logs: MergeLog[] = [];
  let i = 0;

  while (i < mergedChunks.length - 1) {
    const current = mergedChunks[i];
    const next = mergedChunks[i + 1];
    const gapSeconds = next.start_time - current.end_time;

    if (isTightGap(current, next, gapThresholdSeconds)) {
      const shouldPreferRightMerge =
        countWords(current.text) > 1 &&
        i + 2 < mergedChunks.length &&
        isTightGap(next, mergedChunks[i + 2], gapThresholdSeconds) &&
        canMergeByWordCap(next, mergedChunks[i + 2], maxMergedWords);
      if (shouldPreferRightMerge) {
        i += 1;
        continue;
      }

      if (canMergeByWordCap(current, next, maxMergedWords)) {
        const mergedText = normalizeMergedText(current.text, next.text);
        mergedChunks.splice(i, 2, mergeChunkMetadata(current, next, mergedText));
        mergeCount += 1;
        logs.push({
          leftText: current.text,
          rightText: next.text,
          mergedText,
          gapSeconds,
        });
        continue;
      }
      skippedByWordCap += 1;
    }

    i += 1;
  }

  return {
    chunks: mergedChunks,
    mergeCount,
    skippedByWordCap,
    logs,
  };
}

export function transformFeedItems(
  items: FeedItem[],
  options: MergeOptions = {},
): TransformResult {
  const summary: MergeSummary = {
    totalArticles: items.length,
    eligibleArticles: 0,
    articlesChanged: 0,
    articlesSkippedNoChunks: 0,
    parseErrors: 0,
    merges: 0,
    skippedByWordCap: 0,
  };

  const nextItems = items.map((item) => {
    if (typeof item.chunk_timestamps !== "string") {
      summary.articlesSkippedNoChunks += 1;
      return item;
    }

    summary.eligibleArticles += 1;

    let parsed: ChunkTimestamp[];
    try {
      parsed = JSON.parse(item.chunk_timestamps) as ChunkTimestamp[];
      if (!Array.isArray(parsed)) {
        throw new Error("chunk_timestamps is not an array");
      }
    } catch {
      summary.parseErrors += 1;
      return item;
    }

    const merged = mergeTightGaps(parsed, options);
    summary.merges += merged.mergeCount;
    summary.skippedByWordCap += merged.skippedByWordCap;

    if (merged.mergeCount === 0) {
      return item;
    }

    summary.articlesChanged += 1;

    return {
      ...item,
      chunk_timestamps: JSON.stringify(merged.chunks),
    };
  });

  return {
    items: nextItems,
    summary,
  };
}

function parseArgs(argv: string[]): ScriptArgs {
  let write = false;
  for (const arg of argv) {
    if (arg === "--write") {
      write = true;
      continue;
    }
    if (arg === "--dry-run") {
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return { write };
}

function run(): void {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const targetFile = path.join(root, "lib", "data", "feed-data.json");
  const raw = fs.readFileSync(targetFile, "utf-8");
  const items = JSON.parse(raw) as FeedItem[];
  if (!Array.isArray(items)) {
    throw new Error(`Expected array JSON: ${targetFile}`);
  }

  const result = transformFeedItems(items);

  if (args.write && result.summary.articlesChanged > 0) {
    fs.writeFileSync(targetFile, `${JSON.stringify(result.items, null, 2)}\n`, "utf-8");
  }

  console.log(
    JSON.stringify(
      {
        mode: args.write ? "write" : "dry-run",
        targetFile: path.relative(root, targetFile),
        ...result.summary,
      },
      null,
      2,
    ),
  );
}

const isMainModule =
  process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  run();
}
