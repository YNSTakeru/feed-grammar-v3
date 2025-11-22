import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "Feed Grammar - 英語の発音とリスニング学習",
  description:
    "YouTubeから学ぶ英語の発音とリスニング。ネイティブの自然な発音変化を理解して、リスニング力を向上させましょう。",
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {gaId && <GoogleAnalytics gaId={gaId} />}
        {children}
      </body>
    </html>
  );
}
