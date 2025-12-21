import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t mt-auto bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-center md:text-left">
            <p className="text-sm font-semibold mb-1">Feed Grammar</p>
            <p className="text-xs text-muted-foreground">
              YouTubeで学ぶ英語リスニング講座
            </p>
          </div>
          <nav className="flex flex-wrap justify-center gap-4 md:gap-6 text-sm">
            <Link
              href="/"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              ホーム
            </Link>
            <Link
              href="/privacy"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              プライバシーポリシー
            </Link>
            <Link
              href="https://docs.google.com/forms/d/e/1FAIpQLScp4BT5_Av0x-tYYaE8-c91KfOXo87zfTkA68Fiaen_vpeTSA/viewform"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              お問い合わせ
            </Link>
          </nav>
        </div>
        <div className="mt-6 pt-6 border-t text-center text-xs text-muted-foreground">
          <p>
            &copy; {new Date().getFullYear()} Feed Grammar. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
