import feedData from "@/lib/data/feed-data.json";
import Image from "next/image";
import Link from "next/link";
import FeedList from "./feed-list";
import NinjaAdMax from "@/components/ninja-admax";

export default function Home() {
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
                <h1 className="text-xl md:text-3xl font-bold">Feed Grammar</h1>
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
        {/* 忍者AdMax 広告 */}
        <NinjaAdMax adSpotId="143d07eee51fc057088eb62107bae0a3" />
        
        <FeedList items={feedData} />
      </main>
    </div>
  );
}
