import { describe, expect, it } from "vitest";

import { getActiveChunkIndex } from "./karaoke-learn-text";

describe("getActiveChunkIndex", () => {
  const chunks = [
    { start_time: 1, end_time: 2 },
    { start_time: 2, end_time: 3.5 },
    { start_time: 3.5, end_time: 5 },
  ];

  it("uses inclusive start and exclusive end boundaries", () => {
    expect(getActiveChunkIndex(chunks, 1)).toBe(0);
    expect(getActiveChunkIndex(chunks, 2)).toBe(1);
    expect(getActiveChunkIndex(chunks, 3.5)).toBe(2);
  });

  it("returns -1 when time is outside all ranges", () => {
    expect(getActiveChunkIndex(chunks, 0.5)).toBe(-1);
    expect(getActiveChunkIndex(chunks, 5)).toBe(-1);
  });
});
