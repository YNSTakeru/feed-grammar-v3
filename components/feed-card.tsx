import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FeedItem, Thumbnail } from "@/types";
import { BookOpen, Headphones, Lock } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

interface FeedCardProps {
  item: FeedItem;
  isCompleted?: boolean;
  needsReview?: boolean;
}

export function FeedCard({
  item,
  isCompleted = false,
  needsReview = false,
}: FeedCardProps) {
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

  // 未完了の場合はロック表示
  if (!isCompleted) {
    return (
      <Link href={`/article/${item.id}?mode=article`} className="block">
        <Card className="hover:shadow-lg transition-shadow h-full opacity-75 cursor-pointer">
          <CardHeader className="p-4">
            <div className="relative w-full aspect-video mb-3 rounded-md overflow-hidden bg-muted">
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                <Lock className="h-12 w-12 text-white" />
              </div>
              <Image
                src={thumbnail.medium}
                alt="Locked content"
                fill
                className="object-cover blur-sm"
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              />
            </div>
            <div className="flex flex-wrap gap-2 mb-2">
              <Badge variant="secondary" className="text-xs">
                {item.category}
              </Badge>
              {item.is_similar === 1 && (
                <Badge
                  variant="outline"
                  className="text-xs bg-purple-50 dark:bg-purple-950 border-purple-300 dark:border-purple-700"
                >
                  📚 類題
                </Badge>
              )}
            </div>
            <CardTitle className="text-lg line-clamp-2 text-muted-foreground">
              問題 #{item.id}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-3">
            <div className="w-full py-2 px-4 rounded-md bg-muted text-muted-foreground text-sm text-center flex items-center justify-center gap-2">
              <Lock className="h-4 w-4" />
              クリックして新しいフレーズを入手！
            </div>
          </CardContent>
        </Card>
      </Link>
    );
  }

  // 完了済みの場合は通常表示
  return (
    <Card className="hover:shadow-lg transition-shadow h-full">
      <CardHeader className="p-4">
        <Link href={`/article/${item.id}?mode=article`} className="block">
          <div className="relative w-full aspect-video mb-3 rounded-md overflow-hidden bg-muted cursor-pointer hover:opacity-90 transition-opacity">
            <Image
              src={thumbnail.medium}
              alt={item.question}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            />
          </div>
        </Link>
        <div className="flex flex-wrap gap-2 mb-2">
          <Badge variant="secondary" className="text-xs">
            {item.category}
          </Badge>
          {item.is_similar === 1 && (
            <Badge
              variant="outline"
              className="text-xs bg-purple-50 dark:bg-purple-950 border-purple-300 dark:border-purple-700"
            >
              📚 類題
            </Badge>
          )}
          {needsReview && (
            <Badge variant="destructive" className="text-xs">
              🔄 復習が必要
            </Badge>
          )}
        </div>
        <CardTitle className="text-lg line-clamp-2">
          {typeof item.article_text === "object" && item.article_text?.title
            ? item.article_text.title
            : "このフレーズの発音を学ぶ"}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-3">
        <p className="text-sm text-muted-foreground line-clamp-2">
          {item.question}
        </p>
        <div className="flex flex-col gap-2">
          <Link href={`/article/${item.id}?mode=article`} className="w-full">
            <Button variant="outline" className="w-full gap-2" size="sm">
              <BookOpen className="h-4 w-4" />
              解説を観る
            </Button>
          </Link>
          <Link href={`/article/${item.id}?mode=quiz`} className="w-full">
            <Button className="w-full gap-2" size="sm">
              <Headphones className="h-4 w-4" />
              リスニングに挑戦
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
