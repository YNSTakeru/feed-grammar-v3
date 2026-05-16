import { ArticleContent } from "@/app/article/[id]/article-content";
import NinjaAdMax from "@/components/ninja-admax";
import { Button } from "@/components/ui/button";
import feedData from "@/lib/data/feed-data.json";
import { ArticleData, ChunkTimestamp, FeedItem, Thumbnail } from "@/types";
import fs from "fs";
import { ArrowLeft } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import path from "path";
import { Suspense } from "react";

const typedFeedData = feedData as unknown as FeedItem[];

interface ArticlePageProps {
  params: Promise<{
    id: string;
  }>;
}

export function generateStaticParams() {
  const allIds = new Set<number>();

  // メインのfeed-dataからIDを追加
  typedFeedData.forEach((item) => {
    allIds.add(item.id);
  });

  // similarフォルダ内のすべてのJSONファイルからIDを追加
  try {
    const similarDir = path.join(process.cwd(), "lib", "data", "similar");
    if (fs.existsSync(similarDir)) {
      const files = fs.readdirSync(similarDir);
      files.forEach((file) => {
        if (file.endsWith(".json")) {
          const filePath = path.join(similarDir, file);
          const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
          if (Array.isArray(content)) {
            content.forEach((item: FeedItem) => {
              allIds.add(item.id);
            });
          }
        }
      });
    }
  } catch (error) {
    console.error("Failed to read similar folder:", error);
  }

  return Array.from(allIds).map((id) => ({
    id: id.toString(),
  }));
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const resolvedParams = await params;
  const requestedId = parseInt(resolvedParams.id);

  // メインのfeed-dataから記事を検索
  let item = typedFeedData.find((item) => item.id === requestedId);

  // feed-dataに見つからない場合、similarフォルダ内を検索
  if (!item) {
    try {
      const similarDir = path.join(process.cwd(), "lib", "data", "similar");
      if (fs.existsSync(similarDir)) {
        const files = fs.readdirSync(similarDir);
        for (const file of files) {
          if (file.endsWith(".json")) {
            const filePath = path.join(similarDir, file);
            const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
            if (Array.isArray(content)) {
              const foundItem = content.find(
                (i: FeedItem) => i.id === requestedId,
              );
              if (foundItem) {
                item = foundItem;
                break;
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("Failed to search similar folder:", error);
    }
  }

  if (!item) {
    notFound();
  }

  // Function to fix malformed JSON escape sequences
  function fixJsonEscaping(jsonString: string): string {
    // Replace instances of \" that are not properly escaped
    // This handles cases like: "...\"text\"..." inside a JSON string value
    // We need to find \" that appears inside string values and escape them properly

    // First, let's try a different approach: manually fix common patterns
    let fixed = jsonString;

    // Replace \\\\ with \\ (unescape doubled backslashes first)
    // Then properly escape quotes inside string values

    // Try to fix the specific pattern: \\\"text\\\" should become \\\\\"text\\\\\"
    fixed = fixed.replace(/\\\\\"/g, '\\\\\\"');

    return fixed;
  }

  // Parse article_text on the server side
  let article: ArticleData;
  try {
    if (typeof item.article_text === "string") {
      let articleText = item.article_text;

      // Try to fix common escaping issues
      try {
        article = JSON.parse(articleText) as ArticleData;
      } catch (firstError) {
        console.log("First parse failed, attempting to fix escaping...");
        articleText = fixJsonEscaping(articleText);
        article = JSON.parse(articleText) as ArticleData;
      }
    } else {
      article = item.article_text as ArticleData;
    }

    // Merge image_sections: combine article_text.image_sections with item.image_sections
    if (article.image_sections && item.image_sections) {
      // Merge by matching label
      article.image_sections = article.image_sections.map((articleSection) => {
        const itemSection = item.image_sections?.find(
          (s) => s.label === articleSection.label,
        );
        return {
          ...articleSection,
          url: itemSection?.url || articleSection.url,
        };
      });
    } else if (item.image_sections) {
      article.image_sections = item.image_sections;
    }
  } catch (error) {
    console.error("Failed to parse article_text:", error);
    console.error("Article ID:", item.id);
    console.error(
      "Raw article_text:",
      typeof item.article_text === "string"
        ? item.article_text.substring(0, 1000)
        : JSON.stringify(item.article_text).substring(0, 1000),
    );
    notFound();
  }

  let thumbnail: Thumbnail;

  try {
    thumbnail =
      typeof item.thumbnail === "string"
        ? JSON.parse(item.thumbnail)
        : item.thumbnail;
  } catch {
    thumbnail = {
      default: "",
      medium: "",
      high: "",
      standard: "",
      maxres: "",
    };
  }

  // YouTube URL with time parameters
  const youtubeUrl = `${item.url}&t=${item.start_time}s`;

  // Extract video ID from YouTube URL
  const videoIdMatch = item.url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&]+)/,
  );
  const videoId = videoIdMatch ? videoIdMatch[1] : "";

  // Validate YouTube video ID
  if (!videoId || videoId.length !== 11) {
    console.error(`Invalid YouTube URL for article ID ${item.id}: ${item.url}`);
    console.error(
      `Video ID: ${videoId} (length: ${videoId.length}, expected: 11)`,
    );
    notFound();
  }

  // 類似問題を取得（themeが存在する場合）
  let similarItems: FeedItem[] = [];
  let allSimilarItems: FeedItem[] = []; // 現在の記事を含む全ての類似問題
  if (item.theme) {
    try {
      // themeからファイル名を生成（スペースをアンダースコアに変換）
      const similarFileName = item.theme.replace(/\s+/g, "_") + ".json";
      const similarFilePath = path.join(
        process.cwd(),
        "lib",
        "data",
        "similar",
        similarFileName,
      );

      // ファイルが存在するかチェック
      if (fs.existsSync(similarFilePath)) {
        const similarData = JSON.parse(
          fs.readFileSync(similarFilePath, "utf-8"),
        );
        allSimilarItems = similarData as FeedItem[];
        // 現在の記事以外の類似問題を取得
        similarItems = allSimilarItems.filter(
          (similar) => similar.id !== item.id,
        );
        console.log(
          `Found ${similarItems.length} similar items for theme: ${item.theme}`,
        );
      }
    } catch (error) {
      console.error("Failed to load similar items:", error);
    }
  }

  // Find next and previous article IDs
  let prevId: number | null = null;
  let nextId: number | null = null;
  let parentArticleId: number | null = null; // 類似問題の場合の元記事ID

  if (item.is_similar === 1 && allSimilarItems.length > 0) {
    // 類似問題の場合は、同じテーマの類似問題内でナビゲーション
    const currentIndex = allSimilarItems.findIndex((i) => i.id === item.id);
    prevId = currentIndex > 0 ? allSimilarItems[currentIndex - 1].id : null;
    nextId =
      currentIndex < allSimilarItems.length - 1
        ? allSimilarItems[currentIndex + 1].id
        : null;

    // 元の記事（is_similar === 0でthemeが同じ記事）を探す
    if (item.theme) {
      const parentArticle = typedFeedData.find(
        (article) => article.is_similar === 0 && article.theme === item.theme,
      );
      if (parentArticle) {
        parentArticleId = parentArticle.id;
      }
    }
  } else {
    // 通常の記事の場合は、is_similarが0の記事のみでナビゲーション
    const navigableItems = typedFeedData.filter(
      (item) => item.is_similar === 0,
    );
    const currentIndex = navigableItems.findIndex((i) => i.id === item.id);
    prevId = currentIndex > 0 ? navigableItems[currentIndex - 1].id : null;
    nextId =
      currentIndex < navigableItems.length - 1
        ? navigableItems[currentIndex + 1].id
        : null;
  }

  // 忍者AdMaxの広告スポットIDを環境変数から取得
  const adSpotId = process.env.NEXT_PUBLIC_ADMAX_SPOT_ID;

  // chunk_timestampsが存在する場合、カラオケ表示用のチャンクデータを準備
  const chunkTimestamps: ChunkTimestamp[] | null =
    item.chunk_timestamps != null &&
    item.chunk_sections &&
    item.chunk_sections.length > 0
      ? item.chunk_sections
      : null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link href="/">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                戻る
              </Button>
            </Link>
            <Link href="/" className="flex items-center gap-2">
              <Image
                src="/logo.svg"
                alt="Feed Grammar Logo"
                width={32}
                height={32}
                className="dark:invert"
              />
              <span className="font-bold text-lg">Feed Grammar</span>
            </Link>
          </div>
        </div>
      </header>

      <article className="container mx-auto px-4 py-8 max-w-4xl">
        {/* 記事上部の広告 */}
        {adSpotId && <NinjaAdMax adSpotId={adSpotId} />}

        <Suspense
          fallback={<div className="text-center py-8">読み込み中...</div>}
        >
          <ArticleContent
            videoId={videoId}
            startTime={parseFloat(item.start_time)}
            endTime={parseFloat(item.end_time)}
            question={item.question}
            questionKatakana={item.question_katakana}
            youtubeUrl={youtubeUrl}
            article={article}
            category={item.category}
            currentId={item.id}
            prevId={prevId}
            nextId={nextId}
            kugiriEng={
              item.kugiri_eng ||
              ((article as unknown as Record<string, unknown>).kugiri_eng as string) ||
              ""
            }
            kugiriJp={
              item.kugiri_jp ||
              ((article as unknown as Record<string, unknown>).kugiri_jp as string) ||
              ""
            }
            similarItems={similarItems}
            theme={item.theme}
            isSimilar={item.is_similar}
            parentArticleId={parentArticleId}
            chunkTimestamps={chunkTimestamps}
            pronChunks={article.pron_chunks ?? null}
          />
        </Suspense>

        {/* 記事下部の広告 */}
        {adSpotId && <NinjaAdMax adSpotId={adSpotId} />}
      </article>
    </div>
  );
}
