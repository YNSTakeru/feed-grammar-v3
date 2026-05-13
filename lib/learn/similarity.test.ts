import { describe, expect, it } from "vitest";

import { normalizedSimilarity } from "./similarity";

describe("normalizedSimilarity", () => {
  it("returns 1 for identical text", () => {
    expect(normalizedSimilarity("hello world", "hello world")).toBe(1);
  });

  it("ignores lowercase differences", () => {
    expect(normalizedSimilarity("Hello World", "hello world")).toBe(1);
  });

  it("ignores punctuation differences", () => {
    expect(normalizedSimilarity("Hello, world!", "hello world")).toBe(1);
  });

  it("normalizes curly apostrophes", () => {
    expect(normalizedSimilarity("don’t stop", "don't stop")).toBe(1);
  });

  it("returns less than 1 when a single word is missing", () => {
    expect(normalizedSimilarity("hello", "hello world")).toBeLessThan(1);
  });

  it("returns 0 for empty ASR text", () => {
    expect(normalizedSimilarity("", "hello world")).toBe(0);
  });

  it("returns a low score for totally different text", () => {
    expect(normalizedSimilarity("apple banana", "hello world")).toBe(0);
  });
});
