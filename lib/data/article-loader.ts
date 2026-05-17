import { ArticleData, ChunkTimestamp, FeedItem } from "../../types";
import feedData from "./feed-data.json";
import { enrichChunkSections } from "./enrich-chunks";
import fs from "fs";
import path from "path";

type ArticleDataWithChunks = ArticleData & {
  chunk_sections?: ChunkTimestamp[] | null;
};

const typedFeedData = feedData as unknown as FeedItem[];

export type EnrichedFeedItem = FeedItem & {
  chunk_sections: ChunkTimestamp[];
};

function fixJsonEscaping(jsonString: string): string {
  return jsonString.replace(/\\\\\"/g, '\\\\\\"');
}

function normalizeArticleData(
  article: ArticleDataWithChunks,
  item: FeedItem,
): ArticleDataWithChunks {
  const normalized: ArticleDataWithChunks = { ...article };

  // chunks（Step1出力）が存在してpron_chunksがない場合はフォールバック
  if (!normalized.pron_chunks && Array.isArray(normalized.chunks)) {
    normalized.pron_chunks = normalized.chunks;
  }

  // Legacy schema: tsukkomi/translated may live at item top-level.
  if (normalized.tsukkomi == null && item.tsukkomi != null) {
    normalized.tsukkomi = item.tsukkomi;
  }
  if (normalized.translated == null && item.translated != null) {
    normalized.translated = item.translated;
  }

  return normalized;
}

function parseArticleText(item: FeedItem): ArticleDataWithChunks | null {
  if (typeof item.article_text !== "string") {
    return normalizeArticleData(item.article_text as ArticleDataWithChunks, item);
  }

  try {
    const parsed = JSON.parse(item.article_text) as ArticleDataWithChunks;
    return normalizeArticleData(parsed, item);
  } catch {
    try {
      const parsed = JSON.parse(fixJsonEscaping(item.article_text)) as ArticleDataWithChunks;
      return normalizeArticleData(parsed, item);
    } catch (error) {
      console.error("Failed to parse article_text:", error);
      console.error("Article ID:", item.id);
      return null;
    }
  }
}

function findItemInMainData(id: number): FeedItem | undefined {
  return typedFeedData.find((item) => item.id === id);
}

function findItemInSimilarData(id: number): FeedItem | undefined {
  const similarDir = path.join(process.cwd(), "lib", "data", "similar");
  if (!fs.existsSync(similarDir)) return undefined;

  const files = fs.readdirSync(similarDir);
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const filePath = path.join(similarDir, file);
      const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      if (!Array.isArray(content)) continue;

      const foundItem = (content as FeedItem[]).find((item) => item.id === id);
      if (foundItem) return foundItem;
    } catch (error) {
      console.error(`Failed to parse similar data file: ${file}`, error);
    }
  }

  return undefined;
}

export async function loadArticle(id: string): Promise<{
  item: EnrichedFeedItem;
  article: ArticleData;
} | null> {
  const requestedId = Number.parseInt(id, 10);
  if (Number.isNaN(requestedId)) return null;

  const item = findItemInMainData(requestedId) ?? findItemInSimilarData(requestedId);
  if (!item) return null;

  const article = parseArticleText(item);
  if (!article) return null;

  let chunkSections = enrichChunkSections(
    item.chunk_sections ?? [],
    article.chunk_sections ?? null,
  );

  if (!chunkSections.length && item.chunk_timestamps) {
    try {
      const parsed = JSON.parse(item.chunk_timestamps) as ChunkTimestamp[];
      if (parsed.length > 0) {
        chunkSections = parsed.map((c) => ({
          text: c.text,
          start_time: c.start_time,
          end_time: c.end_time,
        }));
      }
    } catch {
      // malformed chunk_timestamps JSON — chunkSections stays []
    }
  }

  const enrichedItem: EnrichedFeedItem = {
    ...item,
    chunk_sections: chunkSections,
  };

  return {
    item: enrichedItem,
    article,
  };
}
