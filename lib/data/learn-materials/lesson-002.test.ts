import { describe, expect, it } from "vitest";

import { lesson002, normalizeIpaChunks, parseImageLearnSections } from "./lesson-002";

describe("parseImageLearnSections (lesson-002)", () => {
  it("returns all image sections when image_learn contains a valid array", () => {
    const sections = parseImageLearnSections(
      '[{"label":"and me","time":"10","url":"TWEET_ID:1"},{"label":"and you","time":"11","url":"TWEET_ID:2"}]',
    );

    expect(sections).toEqual([
      {
        label: "and me",
        time: "10",
        url: "TWEET_ID:1",
      },
      {
        label: "and you",
        time: "11",
        url: "TWEET_ID:2",
      },
    ]);
  });

  it("returns null when image_learn is malformed or missing required fields", () => {
    expect(parseImageLearnSections("[")).toBeNull();
    expect(parseImageLearnSections('[{"label":"x"}]')).toBeNull();
    expect(parseImageLearnSections("[]")).toBeNull();
    expect(parseImageLearnSections(undefined)).toBeNull();
  });
});

describe("normalizeIpaChunks (lesson-002)", () => {
  it("returns empty array for missing or empty IPA chunk data", () => {
    expect(normalizeIpaChunks(undefined)).toEqual([]);
    expect(normalizeIpaChunks([])).toEqual([]);
  });

  it("passes through defined IPA chunks without forcing offsets", () => {
    const chunks = [
      { text: "and", ipa: "/ænd/" },
      { text: "I", ipa: "/aɪ/", startOffset: 4, endOffset: 5 },
    ];

    expect(normalizeIpaChunks(chunks)).toBe(chunks);
  });
});

describe("lesson002 template", () => {
  it("creates lesson-002 with a single scaffold sentence", () => {
    expect(lesson002.id).toBe("lesson-002");
    expect(lesson002.sentences).toHaveLength(1);

    const first = lesson002.sentences[0];
    expect(first.id).toBe("lesson-002-1");
    expect(first.english.length).toBeGreaterThan(0);
    expect(first.katakana.length).toBeGreaterThan(0);
    expect(first.url.length).toBeGreaterThan(0);
    expect(first.startTime).toBeLessThan(first.endTime);
    expect(first.choices.correct).toBe(first.english);
  });
});
