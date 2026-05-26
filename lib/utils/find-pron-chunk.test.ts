import { describe, expect, it } from "vitest";

import { findPronChunk } from "./find-pron-chunk";

describe("findPronChunk", () => {
  it("matches exact chunk text after pronunciation normalization", () => {
    const pronChunks = [
      {
        en: "I don't",
        ipa_citation: "",
        ipa_connected: "aɪ doʊnt",
        kana: "",
      },
    ];

    const matched = findPronChunk({ text: "I don’t" }, pronChunks);
    expect(matched?.ipa_connected).toBe("aɪ doʊnt");
  });

  it("merges consecutive pron chunks when display chunk spans words", () => {
    const pronChunks = [
      {
        en: "want",
        ipa_citation: "wɑːnt",
        ipa_connected: "wɑn",
        kana: "ワン",
        reduction_type: "t-flap",
      },
      {
        en: "to",
        ipa_citation: "tuː",
        ipa_connected: "tə",
        kana: "トゥ",
      },
    ];

    const matched = findPronChunk({ text: "want to" }, pronChunks);
    expect(matched).not.toBeNull();
    expect(matched?.en).toBe("want to");
    expect(matched?.ipa_connected).toBe("wɑn tə");
    expect(matched?.reduction_type).toBe("t-flap");
  });

  it("returns null when no candidate matches", () => {
    const pronChunks = [
      {
        en: "hello",
        ipa_citation: "",
        ipa_connected: "həˈloʊ",
        kana: "",
      },
    ];

    expect(findPronChunk({ text: "goodbye" }, pronChunks)).toBeNull();
  });
});
