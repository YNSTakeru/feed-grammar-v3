import { describe, expect, it } from "vitest";

import type { FeedItem } from "../types";
import {
  DEFAULT_GAP_THRESHOLD_SECONDS,
  DEFAULT_MAX_MERGED_WORDS,
  mergeTightGaps,
  transformFeedItems,
} from "./merge-tight-gap-chunks";

function createFeedItem(id: number, chunkTimestamps: string | null): FeedItem {
  return {
    id,
    url: `https://example.com/${id}`,
    start_time: "0",
    end_time: "1",
    updated_at: "2026-01-01T00:00:00.000Z",
    question: "q",
    question_katakana: "q",
    article_text: JSON.stringify({ text: "article" }),
    category: "cat",
    thumbnail: "thumb",
    theme: "theme",
    noIndex: 0,
    is_similar: 0,
    chunk_timestamps: chunkTimestamps,
  };
}

describe("mergeTightGaps", () => {
  it("merges think + back to our for a 10ms gap", () => {
    const result = mergeTightGaps([
      { text: "Some of us", start_time: 8, end_time: 8.69 },
      { text: "don’t", start_time: 8.7, end_time: 9.01 },
      { text: "want to", start_time: 9.1, end_time: 9.39 },
      { text: "think", start_time: 9.4, end_time: 9.59 },
      { text: "back to our", start_time: 9.6, end_time: 9.9 },
      { text: "childhoods", start_time: 9.91, end_time: 11 },
    ]);

    const mergedTexts = result.chunks.map((chunk) => chunk.text);
    expect(result.mergeCount).toBeGreaterThanOrEqual(1);
    expect(mergedTexts).toContain("think back to our");
    expect(mergedTexts).not.toContain("want to think");
  });

  it("does not merge when gap exceeds threshold", () => {
    const result = mergeTightGaps(
      [
        { text: "hello", start_time: 1, end_time: 1.2, katakana: "ハロー" },
        { text: "world", start_time: 1.41, end_time: 1.8 },
      ],
      { gapThresholdSeconds: DEFAULT_GAP_THRESHOLD_SECONDS },
    );

    expect(result.mergeCount).toBe(0);
    expect(result.chunks).toEqual([
      { text: "hello", start_time: 1, end_time: 1.2, katakana: "ハロー" },
      { text: "world", start_time: 1.41, end_time: 1.8 },
    ]);
  });

  it("preserves optional metadata when two chunks are merged", () => {
    const result = mergeTightGaps([
      {
        text: "think",
        start_time: 9.4,
        end_time: 9.59,
        katakana: "スィンク",
        ipa_connected: "θɪŋk",
        linking: [{ type: "linking", description: "k links to b" }],
      },
      {
        text: "back",
        start_time: 9.6,
        end_time: 9.9,
        katakana: "バック",
        ipa_connected: "bæk",
        linking: [{ type: "linking", description: "b starts next chunk" }],
      },
    ]);

    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0]).toMatchObject({
      text: "think back",
      katakana: "スィンク バック",
      ipa_connected: "θɪŋk bæk",
    });
    expect(result.chunks[0].linking).toHaveLength(2);
  });

  it("bounds cascade merges by max merged words", () => {
    const result = mergeTightGaps(
      [
        { text: "one", start_time: 0, end_time: 0.1 },
        { text: "two", start_time: 0.11, end_time: 0.2 },
        { text: "three", start_time: 0.21, end_time: 0.3 },
        { text: "four", start_time: 0.31, end_time: 0.4 },
        { text: "five", start_time: 0.41, end_time: 0.5 },
      ],
      { maxMergedWords: DEFAULT_MAX_MERGED_WORDS, gapThresholdSeconds: 0.15 },
    );

    expect(result.mergeCount).toBe(3);
    expect(result.chunks).toHaveLength(2);
    for (const chunk of result.chunks) {
      expect(chunk.text.split(/\s+/u).length).toBeLessThanOrEqual(
        DEFAULT_MAX_MERGED_WORDS,
      );
    }
  });
});

describe("transformFeedItems", () => {
  it("rewrites embedded JSON string and is idempotent", () => {
    const items: FeedItem[] = [
      createFeedItem(
        1,
        JSON.stringify([
          { text: "think", start_time: 9.4, end_time: 9.59 },
          { text: "back to our", start_time: 9.6, end_time: 9.9 },
        ]),
      ),
      createFeedItem(2, null),
    ];

    const first = transformFeedItems(items);
    const second = transformFeedItems(first.items);

    expect(first.summary.eligibleArticles).toBe(1);
    expect(first.summary.articlesChanged).toBe(1);
    expect(first.summary.merges).toBe(1);
    expect(second.summary.articlesChanged).toBe(0);
    expect(second.summary.merges).toBe(0);

    const rewritten = first.items[0].chunk_timestamps;
    expect(typeof rewritten).toBe("string");
    expect(JSON.parse(rewritten as string)).toEqual([
      { text: "think back to our", start_time: 9.4, end_time: 9.9 },
    ]);
  });
});
