export interface ReplayChunkLike {
  start_time: number;
  end_time: number;
}

export const CHUNK_REPLAY_PAD_S = 0.4;

// Total stop lead: 16ms (rAF polling) + 20ms (pauseVideo postMessage to iframe) + 4ms margin.
// Subtracting this from nextChunk.start_time guarantees the audio stops before the next word.
const CHUNK_STOP_LEAD_S = 0.040;

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

  return Math.min(replayEnd, nextChunk.start_time - CHUNK_STOP_LEAD_S);
}
