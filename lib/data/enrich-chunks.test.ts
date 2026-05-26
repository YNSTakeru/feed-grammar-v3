import { afterEach, describe, expect, it, vi } from "vitest";

import { enrichChunkSections } from "./enrich-chunks";

describe("enrichChunkSections", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("copies IPA for curly apostrophe text", () => {
    const result = enrichChunkSections(
      [{ text: "don’t", start_time: 8.7, end_time: 9.01 }],
      [
        {
          text: "don't want to think back",
          start_time: 8.6,
          end_time: 9.72,
          ipa_connected: "/doʊnt wɑnə θɪŋk bæk/",
        },
      ],
    );

    expect(result[0].ipa_connected).toBe("/doʊnt wɑnə θɪŋk bæk/");
  });

  it("copies IPA for bracket annotation text via normalized fallback", () => {
    const result = enrichChunkSections(
      [{ text: "<to>", start_time: 25, end_time: 25.2 }],
      [
        {
          text: "to our childhoods",
          start_time: 9.72,
          end_time: 11,
          ipa_connected: "/ər ˈtʃaɪldhʊdz/",
        },
      ],
    );

    expect(result[0].ipa_connected).toBe("/ər ˈtʃaɪldhʊdz/");
  });

  it("returns [] for empty item chunks", () => {
    expect(
      enrichChunkSections([], [
        {
          text: "anything",
          start_time: 0,
          end_time: 1,
          ipa_connected: "/ˈɛniθɪŋ/",
        },
      ]),
    ).toEqual([]);
  });

  it("returns item chunks unchanged and warns when article chunks are null", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const itemChunks = [{ text: "think", start_time: 9.4, end_time: 9.59 }];

    const result = enrichChunkSections(itemChunks, null);

    expect(result).toEqual(itemChunks);
    expect(warnSpy).toHaveBeenCalledWith(
      "[enrich-chunks] no article chunks — IPA fields will be absent",
    );
  });

  it("keeps existing chunk fields on conflict and warns", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = enrichChunkSections(
      [
        {
          text: "don't",
          start_time: 8.7,
          end_time: 9.01,
          ipa_connected: "/keep-existing/",
        },
      ],
      [
        {
          text: "don't want to think back",
          start_time: 8.6,
          end_time: 9.72,
          ipa_connected: "/replace-me/",
        },
      ],
    );

    expect(result[0].ipa_connected).toBe("/keep-existing/");
    expect(warnSpy).toHaveBeenCalledWith(
      "[enrich-chunks] field conflict on: don't — keeping existing value",
    );
  });

  it("returns unchanged and warns when no match is found", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const itemChunk = { text: "totally unmatched", start_time: 100, end_time: 101 };

    const result = enrichChunkSections([itemChunk], [
      {
        text: "some other phrase",
        start_time: 8,
        end_time: 9,
        ipa_connected: "/sʌm ʌðər freɪz/",
      },
    ]);

    expect(result[0]).toEqual(itemChunk);
    expect(warnSpy).toHaveBeenCalledWith(
      "[enrich-chunks] no match for: totally unmatched",
    );
  });

  it("merges straddling chunks across interval boundaries and warns", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = enrichChunkSections(
      [{ text: "back to our", start_time: 9.6, end_time: 9.9 }],
      [
        {
          text: "don't want to think back",
          start_time: 8.6,
          end_time: 9.72,
          ipa_connected: "/doʊnt wɑnə θɪŋk bæk/",
          katakana: "【ドン】 【モア】 【スィンク】 【バック】",
          reduction_type: "Mixed",
        },
        {
          text: "to our childhoods",
          start_time: 9.72,
          end_time: 11,
          ipa_connected: "/ər ˈtʃaɪldhʊdz/",
          katakana: "〈ワ〉 【チャイルドウッズ】",
          reduction_type: "Elision",
        },
      ],
    );

    expect(result[0].ipa_connected).toBe("/doʊnt wɑnə θɪŋk bæk/ /ər ˈtʃaɪldhʊdz/");
    expect(result[0].katakana).toBe(
      "【ドン】 【モア】 【スィンク】 【バック】 〈ワ〉 【チャイルドウッズ】",
    );
    expect(result[0].reduction_type).toBe("Mixed Elision");
    expect(warnSpy).toHaveBeenCalledWith(
      "[enrich-chunks] straddling merge for: back to our",
    );
  });
});
