import { ConsentProvider } from "@/components/consent-provider";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "react-tweet/theme.css";
import "./globals.css";
import { GoogleAnalytics } from "./google-analytics";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Feed Grammar | YouTubeで学ぶ英語リスニング講座",
  description:
    "YouTubeの実際の会話シーンで学ぶ英語リスニング講座。ネイティブの自然な発音変化を理解して、リスニング力を向上させる教育メディアです。各レッスンで丁寧に解説します。",
  icons: {
    icon: "/logo.svg",
  },
  other: {
    "google-adsense-account": "ca-pub-XXXXXXXXXXXXXXXX", // 必要に応じて更新
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const gaId = process.env.NEXT_PUBLIC_GA_ID;

  return (
    <html lang="ja">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased flex flex-col min-h-screen`}
      >
        {gaId && <GoogleAnalytics gaId={gaId} />}
        <SiteHeader />
        <ConsentProvider>
          <main className="flex-1">{children}</main>
        </ConsentProvider>
        <SiteFooter />
      </body>
    </html>
  );
}
