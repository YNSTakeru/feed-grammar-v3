import type { ChunkTimestamp, PronChunk } from "../../types";
import { normalizePronunciationText } from "../text/normalize-pronunciation";

function mergePronChunks(chunks: PronChunk[]): PronChunk {
  return {
    en: chunks.map((chunk) => chunk.en).join(" "),
    ipa_citation: chunks.map((chunk) => chunk.ipa_citation).filter(Boolean).join(" ") || "",
    ipa_connected: chunks.map((chunk) => chunk.ipa_connected).filter(Boolean).join(" ") || "",
    kana: chunks.map((chunk) => chunk.kana).filter(Boolean).join(" ") || "",
    reduction_type: chunks.find((chunk) => chunk.reduction_type)?.reduction_type,
  };
}

export function findPronChunk(
  chunk: Pick<ChunkTimestamp, "text">,
  pronChunks: PronChunk[],
): PronChunk | null {
  if (!pronChunks.length) return null;
  const chunkText = normalizePronunciationText(chunk.text);
  const exact = pronChunks.find((pronChunk) =>
    normalizePronunciationText(pronChunk.en).includes(chunkText),
  );
  if (exact) return exact;

  const words = chunkText.split(/\s+/).filter(Boolean);
  let best: PronChunk | null = null;
  let bestScore = 0;
  for (const pronChunk of pronChunks) {
    const pronChunkText = normalizePronunciationText(pronChunk.en);
    const score = words.filter((word) => pronChunkText.includes(word)).length;
    if (score > bestScore) {
      bestScore = score;
      best = pronChunk;
    }
  }

  for (let windowSize = 2; windowSize <= Math.min(3, pronChunks.length); windowSize++) {
    for (let i = 0; i <= pronChunks.length - windowSize; i++) {
      const window = pronChunks.slice(i, i + windowSize);
      const combined = normalizePronunciationText(window.map((current) => current.en).join(" "));
      if (combined === chunkText) {
        return mergePronChunks(window);
      }
    }
  }

  return bestScore > 0 ? best : null;
}
