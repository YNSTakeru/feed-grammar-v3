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

function parseArticleText(item: FeedItem): ArticleDataWithChunks | null {
  if (typeof item.article_text !== "string") {
    return item.article_text as ArticleDataWithChunks;
  }

  try {
    const parsed = JSON.parse(item.article_text) as ArticleDataWithChunks;
    // chunks（Step1出力）が存在してpron_chunksがない場合はフォールバック
    if (parsed && !parsed.pron_chunks && Array.isArray(parsed.chunks)) {
      parsed.pron_chunks = parsed.chunks;
    }
    return parsed;
  } catch {
    try {
      const parsed = JSON.parse(fixJsonEscaping(item.article_text)) as ArticleDataWithChunks;
      if (parsed && !parsed.pron_chunks && Array.isArray(parsed.chunks)) {
        parsed.pron_chunks = parsed.chunks;
      }
      return parsed;
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

  const enrichedItem: EnrichedFeedItem = {
    ...item,
    chunk_sections: enrichChunkSections(
      item.chunk_sections ?? [],
      article.chunk_sections ?? null,
    ),
  };

  return {
    item: enrichedItem,
    article,
  };
}
