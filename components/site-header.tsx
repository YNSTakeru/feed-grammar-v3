import Image from "next/image";
import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b bg-background sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4 md:py-6">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 md:gap-4 hover:opacity-80 transition-opacity"
          >
            <Image
              src="/logo.svg"
              alt="Feed Grammar Logo"
              width={40}
              height={40}
              className="dark:invert md:w-12 md:h-12"
            />
            <div className="flex flex-col">
              <h1 className="text-xl md:text-2xl font-bold">Feed Grammar</h1>
              <p className="text-xs md:text-sm text-muted-foreground">
                YouTubeで学ぶ英語リスニング講座
              </p>
            </div>
          </Link>
          <nav className="flex items-center gap-3 md:gap-4 text-xs md:text-sm">
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
              プライバシーポリシー
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
}
