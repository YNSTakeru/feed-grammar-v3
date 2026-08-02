import { describe, expect, it } from "vitest";

import { maskThemeInText } from "./mask-text";

describe("maskThemeInText — and theme", () => {
  it("masks 'and' in a basic sentence", () => {
    expect(maskThemeInText("bread and butter", "and")).toBe("bread ████ butter");
  });

  it("masks uppercase AND", () => {
    expect(maskThemeInText("fish AND chips", "and")).toBe("fish ████ chips");
  });

  it("masks mixed case And", () => {
    expect(maskThemeInText("And we left", "and")).toBe("████ we left");
  });

  it("does NOT mask 'and' inside larger words (band, sand, land)", () => {
    expect(maskThemeInText("band sand land", "and")).toBe("band sand land");
  });

  it("masks standalone 'and' but leaves embedded occurrences untouched", () => {
    expect(maskThemeInText("band and land", "and")).toBe("band ████ land");
  });

  it("returns empty string unchanged", () => {
    expect(maskThemeInText("", "and")).toBe("");
  });
});

describe("maskThemeInText — want_to theme", () => {
  it("masks 'want to' in a sentence", () => {
    expect(maskThemeInText("I want to go home", "want_to")).toBe("I ████ go home");
  });

  it("masks 'wanna' case-insensitively", () => {
    expect(maskThemeInText("I WANNA leave now", "want_to")).toBe("I ████ leave now");
  });

  it("masks 'want  to' with extra whitespace", () => {
    expect(maskThemeInText("I want  to sleep", "want_to")).toBe("I ████ sleep");
  });

  it("returns empty string unchanged", () => {
    expect(maskThemeInText("", "want_to")).toBe("");
  });
});
