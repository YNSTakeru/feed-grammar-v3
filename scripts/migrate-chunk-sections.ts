import fs from "fs";
import path from "path";

import { enrichChunkSections } from "../lib/data/enrich-chunks";
import { ArticleData, ChunkTimestamp, FeedItem } from "../types";

type ArticleDataWithChunks = ArticleData & {
  chunk_sections?: ChunkTimestamp[] | null;
};

type MigrationMetrics = {
  files: number;
  items: number;
  updatedItems: number;
  matchedChunks: number;
  missingChunks: number;
  straddlingLikeChunks: number;
  parseErrors: number;
};

function fixJsonEscaping(jsonString: string): string {
  return jsonString.replace(/\\\\\"/g, '\\\\\\"');
}

function parseArticleText(item: FeedItem): ArticleDataWithChunks | null {
  if (typeof item.article_text !== "string") {
    return item.article_text as ArticleDataWithChunks;
  }

  try {
    return JSON.parse(item.article_text) as ArticleDataWithChunks;
  } catch {
    try {
      return JSON.parse(fixJsonEscaping(item.article_text)) as ArticleDataWithChunks;
    } catch {
      return null;
    }
  }
}

function isChunkEnriched(chunk: ChunkTimestamp): boolean {
  return (
    chunk.ipa_connected != null ||
    chunk.katakana != null ||
    chunk.reduction_type != null
  );
}

function countStraddlingLikeChunks(chunks: ChunkTimestamp[]): number {
  return chunks.filter((chunk) => {
    const value = chunk.ipa_connected ?? "";
    return value.includes(" /");
  }).length;
}

function migrateItem(item: FeedItem, metrics: MigrationMetrics): FeedItem {
  const parsedArticle = parseArticleText(item);
  if (!parsedArticle) {
    metrics.parseErrors += 1;
    return item;
  }

  const beforeChunks = item.chunk_sections ?? [];
  const enrichedChunks = enrichChunkSections(
    beforeChunks,
    parsedArticle.chunk_sections ?? null,
  );

  const afterEnrichedCount = enrichedChunks.filter(isChunkEnriched).length;
  metrics.matchedChunks += afterEnrichedCount;
  metrics.missingChunks += Math.max(0, enrichedChunks.length - afterEnrichedCount);
  metrics.straddlingLikeChunks += countStraddlingLikeChunks(enrichedChunks);

  const changed =
    JSON.stringify(beforeChunks) !== JSON.stringify(enrichedChunks) ||
    typeof item.article_text === "string";

  if (!changed) return item;
  metrics.updatedItems += 1;

  return {
    ...item,
    chunk_sections: enrichedChunks,
    article_text: parsedArticle,
  };
}

function migrateFile(
  filePath: string,
  dryRun: boolean,
  metrics: MigrationMetrics,
): void {
  const raw = fs.readFileSync(filePath, "utf-8");
  const content = JSON.parse(raw) as FeedItem[];
  if (!Array.isArray(content)) {
    throw new Error(`Expected array JSON: ${filePath}`);
  }

  metrics.files += 1;
  metrics.items += content.length;

  const migrated = content.map((item) => migrateItem(item, metrics));
  const changed = JSON.stringify(content) !== JSON.stringify(migrated);
  if (!changed || dryRun) return;

  if (path.basename(filePath) === "feed-data.json") {
    const backupPath = `${filePath}.bak`;
    if (!fs.existsSync(backupPath)) {
      fs.writeFileSync(backupPath, raw, "utf-8");
    }
  }

  fs.writeFileSync(filePath, JSON.stringify(migrated, null, 2) + "\n", "utf-8");
}

function run(): void {
  const dryRun = process.argv.includes("--dry-run");
  const root = process.cwd();

  const targets = [
    path.join(root, "lib", "data", "feed-data.json"),
    ...fs
      .readdirSync(path.join(root, "lib", "data", "similar"))
      .filter((file) => file.endsWith(".json"))
      .map((file) => path.join(root, "lib", "data", "similar", file)),
  ];

  const metrics: MigrationMetrics = {
    files: 0,
    items: 0,
    updatedItems: 0,
    matchedChunks: 0,
    missingChunks: 0,
    straddlingLikeChunks: 0,
    parseErrors: 0,
  };

  for (const filePath of targets) {
    migrateFile(filePath, dryRun, metrics);
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        ...metrics,
      },
      null,
      2,
    ),
  );
}

run();
