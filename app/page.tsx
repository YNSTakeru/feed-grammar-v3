import NinjaAdMax from "@/components/ninja-admax";
import feedData from "@/lib/data/feed-data.json";
import { FeedItem } from "@/types";
import fs from "fs";
import Image from "next/image";
import Link from "next/link";
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
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 md:py-6">
          <div className="flex flex-col gap-3 md:gap-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 md:gap-4">
                <Image
                  src="/logo.svg"
                  alt="Feed Grammar Logo"
                  width={40}
                  height={40}
                  className="dark:invert md:w-12 md:h-12"
                />
                <div className="flex flex-col">
                  <h1 className="text-xl md:text-3xl font-bold">Feed Grammar</h1>
                  <p className="text-xs md:text-sm text-muted-foreground">
                    YouTubeで学ぶ英語リスニング講座
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 md:gap-4 text-xs md:text-sm">
                <Link
                  href="https://docs.google.com/forms/d/e/1FAIpQLScp4BT5_Av0x-tYYaE8-c91KfOXo87zfTkA68Fiaen_vpeTSA/viewform"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
                >
                  お問い合わせ
                </Link>
                <Link
                  href="/privacy"
                  className="text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
                >
                  ポリシー
                </Link>
              </div>
            </div>
            <p className="text-sm md:text-base text-muted-foreground">
              英語の発音とリスニングを学ぼう
            </p>
          </div>
        </div>
      </header>
      <main className="container mx-auto px-4 py-8">
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
      </main>
    </div>
  );
}
