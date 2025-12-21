import NinjaAdMax from "@/components/ninja-admax";
import feedData from "@/lib/data/feed-data.json";
import { FeedItem } from "@/types";
import fs from "fs";
import path from "path";
import FeedList from "./feed-list";

export default function Home() {
  const typedFeedData = feedData as unknown as FeedItem[];

  // similarフォルダから類似問題も読み込む
  let allItems: FeedItem[] = [...typedFeedData];

  try {
    const similarDir = path.join(process.cwd(), "lib", "data", "similar");
    if (fs.existsSync(similarDir)) {
      const files = fs.readdirSync(similarDir);
      files.forEach((file) => {
        if (file.endsWith(".json")) {
          const filePath = path.join(similarDir, file);
          const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
          if (Array.isArray(content)) {
            allItems = [...allItems, ...content];
          }
        }
      });
    }
  } catch (error) {
    console.error("Failed to read similar folder:", error);
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* 講座紹介セクション */}
      <div className="mb-8 p-6 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 rounded-lg border-2 border-blue-200 dark:border-blue-800">
        <h2 className="text-2xl md:text-3xl font-bold text-blue-900 dark:text-blue-100 mb-3">
          📚 YouTubeで学ぶ英語リスニング講座
        </h2>
        <p className="text-base md:text-lg text-gray-700 dark:text-gray-200 mb-2">
          ネイティブの自然な発音変化を動画で学び、リスニング力を向上させる教育サイトです。
        </p>
        <p className="text-sm md:text-base text-gray-600 dark:text-gray-300">
          各レッスンでは、YouTubeの実際の会話シーンを題材に、発音のコツやフレーズの使い方を丁寧に解説しています。
        </p>
      </div>

      {/* 忍者AdMax 広告 */}
      <NinjaAdMax adSpotId="143d07eee51fc057088eb62107bae0a3" />

      <FeedList items={allItems} />
    </div>
  );
}
