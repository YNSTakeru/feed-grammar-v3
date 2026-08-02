import { describe, expect, it } from "vitest";

import { loadSimilarItems } from "./similar-loader";

describe("loadSimilarItems", () => {
  it('returns a non-empty "and" dataset with the expected shape', () => {
    const items = loadSimilarItems("and");

    expect(items.length).toBeGreaterThan(0);

    const first = items[0];
    expect(first).toBeDefined();
    expect(first.theme).toBe("and");
    expect(first.is_similar).toBe(1);
    expect(typeof first.id).toBe("number");
    expect(typeof first.url).toBe("string");
    expect(typeof first.start_time).toBe("string");
    expect(typeof first.end_time).toBe("string");
    expect(typeof first.question).toBe("string");
    expect(typeof first.question_katakana).toBe("string");
  });

  it('returns a non-empty "want_to" dataset with the expected shape', () => {
    const items = loadSimilarItems("want_to");

    expect(items.length).toBeGreaterThan(0);

    const first = items[0];
    expect(first).toBeDefined();
    expect(first.theme).toBe("want to");
    expect(typeof first.id).toBe("number");
    expect(typeof first.url).toBe("string");
    expect(typeof first.question).toBe("string");
  });

  it("returns a fresh copy each call (no shared reference)", () => {
    const a = loadSimilarItems("and");
    const b = loadSimilarItems("and");
    expect(a).not.toBe(b);
  });
});
