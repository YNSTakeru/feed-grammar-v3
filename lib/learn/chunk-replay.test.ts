import { describe, expect, it } from "vitest";

import { CHUNK_REPLAY_PAD_S, computeChunkReplayEnd } from "./chunk-replay";

// One rAF frame at 60fps — must match RAF_FRAME_S in chunk-replay.ts
const RAF_FRAME_S = 0.016;

describe("computeChunkReplayEnd", () => {
  it("adds tail padding when there is no next chunk", () => {
    expect(computeChunkReplayEnd({ start_time: 1, end_time: 2 })).toBe(2 + CHUNK_REPLAY_PAD_S);
  });

  it("caps replay one rAF frame before the next chunk start when gap is smaller than the padding", () => {
    expect(
      computeChunkReplayEnd(
        { start_time: 1, end_time: 2 },
        { start_time: 2.25, end_time: 2.8 },
      ),
    ).toBe(2.25 - RAF_FRAME_S);
  });

  it("caps at one rAF frame before next chunk for tight-gap chunks (real-world: 'want to' / 'think')", () => {
    // "want to" end=9.39, "think" start=9.4 → gap=10ms
    // rAF fires 0–16ms after endSeconds; subtracting RAF_FRAME_S guarantees
    // the stop fires at or before 9.4, preventing bleed into "think"
    expect(
      computeChunkReplayEnd(
        { start_time: 9.1, end_time: 9.39 },
        { start_time: 9.4, end_time: 9.59 },
      ),
    ).toBeCloseTo(9.4 - RAF_FRAME_S, 10);
  });

  it("does not cap when chunks overlap", () => {
    expect(
      computeChunkReplayEnd(
        { start_time: 1, end_time: 2 },
        { start_time: 1.9, end_time: 2.3 },
      ),
    ).toBe(2 + CHUNK_REPLAY_PAD_S);
  });

  it("falls back to no extra padding if pad value is invalid", () => {
    expect(
      computeChunkReplayEnd(
        { start_time: 1, end_time: 2 },
        undefined,
        Number.NaN,
      ),
    ).toBe(2);
  });
});
