import { describe, expect, it } from "vitest";

import {
  advanceAfterReveal,
  revealExposureCard,
  revealHeardCard,
  revealMissedCard,
  type DrillCard,
} from "./drill-flow";

type TestItem = {
  id: number;
  question: string;
};

function card(id: number, streak = 0): DrillCard<TestItem> {
  return {
    item: { id, question: `question ${id}` },
    streak,
  };
}

describe("similar drill flow", () => {
  it("reveals a first-loop exposure without changing streak or stats", () => {
    const result = revealExposureCard([card(1), card(2)], []);

    expect(result.revealedCard).toEqual(card(1));
    expect(result.activeQueue).toEqual([card(2)]);
    expect(result.nextQueue).toEqual([card(1)]);
  });

  it("keeps consuming the first-loop queue until the current loop is empty", () => {
    const result = advanceAfterReveal({
      activeQueue: [card(2)],
      nextQueue: [card(1)],
      loopCount: 1,
    });

    expect(result).toEqual({
      activeQueue: [card(2)],
      nextQueue: [card(1)],
      loopCount: 1,
      isDone: false,
    });
  });

  it("starts loop 2 with all first-loop exposure cards active again", () => {
    const result = advanceAfterReveal({
      activeQueue: [],
      nextQueue: [card(1), card(2)],
      loopCount: 1,
    });

    expect(result).toEqual({
      activeQueue: [card(1), card(2)],
      nextQueue: [],
      loopCount: 2,
      isDone: false,
    });
  });

  it("graduates a heard card after two correct confirmations", () => {
    const result = revealHeardCard([card(1, 1), card(2)], []);

    expect(result.revealedCard).toEqual(card(1, 2));
    expect(result.activeQueue).toEqual([card(2)]);
    expect(result.nextQueue).toEqual([]);
    expect(result.graduatedId).toBe(1);
  });

  it("front-loads a missed card in the next loop", () => {
    const result = revealMissedCard([card(1, 1), card(2)], [card(3)]);

    expect(result.revealedCard).toEqual(card(1, 0));
    expect(result.activeQueue).toEqual([card(2)]);
    expect(result.nextQueue).toEqual([card(1), card(3)]);
    expect(result.missedId).toBe(1);
  });
});
