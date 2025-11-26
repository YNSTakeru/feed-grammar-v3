import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FeedItem, Thumbnail } from "@/types";
import { BookOpen, Headphones } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

interface FeedCardProps {
  item: FeedItem;
}

export function FeedCard({ item }: FeedCardProps) {
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

  return (
    <Card className="hover:shadow-lg transition-shadow h-full">
      <CardHeader className="p-4">
        <div className="relative w-full aspect-video mb-3 rounded-md overflow-hidden bg-muted">
          <Image
            src={thumbnail.medium}
            alt={item.question}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        </div>
        <div className="flex flex-wrap gap-2 mb-2">
          <Badge variant="secondary" className="text-xs">
            {item.category}
          </Badge>
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
