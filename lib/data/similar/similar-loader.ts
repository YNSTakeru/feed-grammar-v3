import type { FeedItem, PronChunk } from "@/types";

import andItems from "./and.json";
import wantToItems from "./want_to.json";

export type SimilarTheme = "and" | "want_to";

export interface SimilarItem extends FeedItem {
  pron_memo?: string;
  chunks?: PronChunk[] | null;
}

const similarItemsByTheme: Record<SimilarTheme, SimilarItem[]> = {
  and: andItems as unknown as SimilarItem[],
  want_to: wantToItems as unknown as SimilarItem[],
};

export function loadSimilarItems(theme: SimilarTheme): SimilarItem[] {
  return [...similarItemsByTheme[theme]];
}
