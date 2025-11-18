import feedData from "@/lib/data/feed-data.json";
import Image from "next/image";
import FeedList from "./feed-list";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-4 mb-2">
            <Image
              src="/logo.svg"
              alt="Feed Grammar Logo"
              width={48}
              height={48}
              className="dark:invert"
            />
            <h1 className="text-3xl font-bold">Feed Grammar</h1>
          </div>
          <p className="text-muted-foreground mt-2">
            英語の発音とリスニングを学ぼう
          </p>
        </div>
      </header>
      <main className="container mx-auto px-4 py-8">
        <FeedList items={feedData} />
      </main>
    </div>
  );
}
