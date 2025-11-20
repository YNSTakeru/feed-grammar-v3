import { ArticleContent } from "@/app/article/[id]/article-content";
import { Button } from "@/components/ui/button";
import feedData from "@/lib/data/feed-data.json";
import { ArticleData, FeedItem, Thumbnail } from "@/types";
import { ArrowLeft } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

const typedFeedData = feedData as FeedItem[];

interface ArticlePageProps {
  params: Promise<{
    id: string;
  }>;
}

export function generateStaticParams() {
  return typedFeedData.map((item) => ({
    id: item.id.toString(),
  }));
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const resolvedParams = await params;

  const item = typedFeedData.find(
    (item) => item.id === parseInt(resolvedParams.id)
  );

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
  } catch (error) {
    console.error("Failed to parse article_text:", error);
    console.error("Article ID:", item.id);
    console.error("Raw article_text:", item.article_text?.substring(0, 1000));
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
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&]+)/
  );
  const videoId = videoIdMatch ? videoIdMatch[1] : "";

  // Find next and previous article IDs
  const currentIndex = typedFeedData.findIndex((i) => i.id === item.id);
  const prevId = currentIndex > 0 ? typedFeedData[currentIndex - 1].id : null;
  const nextId =
    currentIndex < typedFeedData.length - 1
      ? typedFeedData[currentIndex + 1].id
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
        <ArticleContent
          videoId={videoId}
          startTime={parseInt(item.start_time)}
          endTime={parseInt(item.end_time)}
          question={item.question}
          questionKatakana={item.question_katakana}
          youtubeUrl={youtubeUrl}
          article={article}
          category={item.category}
          currentId={item.id}
          prevId={prevId}
          nextId={nextId}
        />
      </article>
    </div>
  );
}
