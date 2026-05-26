import { describe, expect, it } from "vitest";

import {
  blindLoopCount,
  buildChoiceOptions,
  buildDictationChoices,
  evaluateDictationAttempt,
  extractYouTubeVideoId,
  getDictationMode,
} from "./dictation";

const SENTENCES = [
  { id: "s1", english: "Some of us don't want to think back", theme: "want to" },
  { id: "s2", english: "You have to harness them into work", theme: "have to" },
  { id: "s3", english: "We just can't wait to follow", theme: "can't wait to" },
  { id: "s4", english: "We want to live the lives we say", theme: "want to" },
] as const;

const POOL = [
  { english: "I don't want to miss the bus", theme: "want to" },
  { english: "Do you want to try this now", theme: "want to" },
  { english: "You have to move quickly", theme: "have to" },
] as const;

describe("getDictationMode", () => {
  it("returns free-text for very short sentences", () => {
    expect(getDictationMode("How about")).toBe("free-text");
  });

  it("returns multiple-choice for three or more words", () => {
    expect(getDictationMode("Some of us")).toBe("multiple-choice");
  });
});

describe("blindLoopCount", () => {
  it("returns one loop for short sentences", () => {
    expect(blindLoopCount("How are you today")).toBe(1);
  });

  it("returns two loops for mid-length sentences", () => {
    expect(blindLoopCount("I think this should take a little longer now")).toBe(2);
  });

  it("returns three loops for long sentences", () => {
    expect(
      blindLoopCount("I know this sentence has enough words to require three full blind loops"),
    ).toBe(3);
  });
});

describe("extractYouTubeVideoId", () => {
  it("extracts an id from a standard watch URL", () => {
    expect(extractYouTubeVideoId("https://www.youtube.com/watch?v=Ij1o5zGDCeE")).toBe(
      "Ij1o5zGDCeE",
    );
  });

  it("returns null for unsupported URLs", () => {
    expect(extractYouTubeVideoId("https://example.com/video")).toBeNull();
  });
});

describe("buildDictationChoices", () => {
  it("builds distractors from adjacent and pool sentences", () => {
    const choices = buildDictationChoices({
      sentences: [...SENTENCES],
      index: 0,
      pool: [...POOL],
    });

    expect(choices.correct).toBe(SENTENCES[0].english);
    expect(choices.distractors).toHaveLength(3);
    expect(choices.distractors).not.toContain(SENTENCES[0].english);
    expect(["adjacent_segment", "pool"]).toContain(choices.generatedBy);
  });

  it("falls back to adjacent generation when pool doesn't match", () => {
    const choices = buildDictationChoices({
      sentences: [...SENTENCES],
      index: 1,
      pool: [{ english: "Unrelated sentence", theme: "other" }],
    });

    expect(choices.correct).toBe(SENTENCES[1].english);
    expect(choices.generatedBy).toBe("adjacent_segment");
  });
});

describe("buildChoiceOptions", () => {
  it("returns a stable shuffled set for the same seed", () => {
    const choices = buildDictationChoices({
      sentences: [...SENTENCES],
      index: 0,
      pool: [...POOL],
    });

    const first = buildChoiceOptions(choices, "seed-1");
    const second = buildChoiceOptions(choices, "seed-1");

    expect(first).toEqual(second);
    expect(first).toContain(choices.correct);
  });
});

describe("evaluateDictationAttempt", () => {
  it("marks correct answers without increasing attempts", () => {
    const result = evaluateDictationAttempt({
      isCorrect: true,
      currentAttempts: 1,
    });

    expect(result).toEqual({
      state: "correct",
      nextAttempts: 1,
    });
  });

  it("moves to incorrect before reveal limit", () => {
    const result = evaluateDictationAttempt({
      isCorrect: false,
      currentAttempts: 0,
      maxWrongAttempts: 2,
    });

    expect(result).toEqual({
      state: "incorrect",
      nextAttempts: 1,
    });
  });

  it("reveals after max wrong attempts", () => {
    const result = evaluateDictationAttempt({
      isCorrect: false,
      currentAttempts: 1,
      maxWrongAttempts: 2,
    });

    expect(result).toEqual({
      state: "revealed",
      nextAttempts: 2,
    });
  });
});
