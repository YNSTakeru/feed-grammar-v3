export interface ReplayChunkLike {
  start_time: number;
  end_time: number;
}

export const CHUNK_REPLAY_PAD_S = 0.4;

// rAF fires every ~16ms at 60fps. Subtract one frame from the next chunk's start
// so the rAF-based stop always fires at or before the next word begins.
const RAF_FRAME_S = 0.016;

export function computeChunkReplayEnd(
  chunk: ReplayChunkLike,
  nextChunk?: ReplayChunkLike,
  padSeconds = CHUNK_REPLAY_PAD_S,
): number {
  const safePad = Number.isFinite(padSeconds) && padSeconds >= 0 ? padSeconds : 0;
  const replayEnd = chunk.end_time + safePad;

  if (!nextChunk || nextChunk.start_time <= chunk.end_time) {
    return replayEnd;
  }

  return Math.min(replayEnd, nextChunk.start_time - RAF_FRAME_S);
}
