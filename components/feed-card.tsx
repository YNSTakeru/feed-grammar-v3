import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FeedItem, Thumbnail } from "@/types";
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
    <Link href={`/article/${item.id}`}>
      <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
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
            このフレーズの発音を学ぶ
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <p className="text-sm text-muted-foreground">
            クリックして詳細を見る
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
