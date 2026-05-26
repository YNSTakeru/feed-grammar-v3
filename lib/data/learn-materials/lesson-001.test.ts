import { describe, expect, it } from "vitest";

import { lesson001, normalizeIpaChunks, parseImageLearnSections } from "./lesson-001";

describe("parseImageLearnSections", () => {
  it("returns all image sections when image_learn contains a valid array", () => {
    const sections = parseImageLearnSections(
      '[{"label":"some of us","time":"8","url":"TWEET_ID:1996959664760869004"},{"label":"other","time":"9","url":"TWEET_ID:2"}]',
    );

    expect(sections).toEqual([
      {
        label: "some of us",
        time: "8",
        url: "TWEET_ID:1996959664760869004",
      },
      {
        label: "other",
        time: "9",
        url: "TWEET_ID:2",
      },
    ]);
  });

  it("returns null when image_learn is malformed JSON", () => {
    expect(parseImageLearnSections("[")).toBeNull();
  });

  it("returns null when image_learn does not contain required fields", () => {
    expect(parseImageLearnSections('[{"label":"x"}]')).toBeNull();
    expect(parseImageLearnSections("[]")).toBeNull();
    expect(parseImageLearnSections(undefined)).toBeNull();
  });
});

describe("normalizeIpaChunks", () => {
  it("returns empty array for missing or empty IPA chunk data", () => {
    expect(normalizeIpaChunks(undefined)).toEqual([]);
    expect(normalizeIpaChunks([])).toEqual([]);
  });

  it("passes through defined IPA chunks without forcing offsets", () => {
    const chunks = [
      { text: "thank you", ipa: "/θæŋk juː/" },
      { text: "for your", ipa: "/fɔːr jʊr/", startOffset: 10, endOffset: 18 },
    ];

    expect(normalizeIpaChunks(chunks)).toBe(chunks);
  });
});

describe("lesson001 sentence mapping", () => {
  it("maps feed-linked optional fields for learn-session rendering", () => {
    const first = lesson001.sentences[0];

    expect(first.feedId).toBe(1);
    expect(first.translated).toBeTypeOf("string");
    expect(first.articleIntroduction).toBeTypeOf("string");
    expect(first.tsukkomi?.length).toBeGreaterThan(0);
  });

  it("normalizes empty tsukkomi arrays to undefined", () => {
    const sentence = lesson001.sentences.find((entry) => entry.feedId === 11);

    expect(sentence).toBeDefined();
    expect(sentence?.tsukkomi).toBeUndefined();
  });
});
