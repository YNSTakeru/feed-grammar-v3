import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "プライバシーポリシー - Feed Grammar",
  description: "Feed Grammarのプライバシーポリシーページです。",
};

export default function PrivacyPage() {
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
        <h1 className="text-4xl font-bold mb-8">プライバシーポリシー</h1>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6">
          <section>
            <h2 className="text-2xl font-bold mb-4">1. はじめに</h2>
            <p>
              Feed
              Grammar（以下「当サイト」といいます）は、ユーザーのプライバシーを尊重し、個人情報の保護に努めています。本プライバシーポリシーでは、当サイトにおける個人情報の取り扱いについて説明します。
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">2. 収集する情報</h2>
            <h3 className="text-xl font-semibold mb-3">
              2.1 自動的に収集される情報
            </h3>
            <p>当サイトでは、以下の情報を自動的に収集する場合があります：</p>
            <ul className="list-disc ml-6 space-y-2">
              <li>IPアドレス</li>
              <li>ブラウザの種類とバージョン</li>
              <li>オペレーティングシステム</li>
              <li>アクセス日時</li>
              <li>閲覧ページ</li>
              <li>参照元URL</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">3. Cookieの使用</h2>
            <p>
              当サイトでは、サービスの向上およびユーザー体験の最適化のため、Cookieを使用しています。Cookieとは、Webサイトがユーザーのコンピュータに保存する小さなテキストファイルです。
            </p>
            <p className="mt-4">
              ブラウザの設定により、Cookieの受け入れを拒否することができますが、その場合、当サイトの一部機能が正常に動作しない可能性があります。
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">
              4. Google Analyticsの使用
            </h2>
            <p>
              当サイトでは、Googleによるアクセス解析ツール「Google
              Analytics」を使用しています。Google
              Analyticsはデータの収集のためにCookieを使用しています。このデータは匿名で収集されており、個人を特定するものではありません。
            </p>
            <p className="mt-4">
              Google Analyticsの詳細については、
              <a
                href="https://policies.google.com/technologies/partner-sites"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline hover:text-primary/80"
              >
                Googleのサイト
              </a>
              をご覧ください。
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">5. 広告配信について</h2>
            <h3 className="text-xl font-semibold mb-3">5.1 忍者AdMax</h3>
            <p>
              当サイトでは、広告配信サービス「忍者AdMax」を利用しています。忍者AdMaxは、ユーザーの興味・関心に応じた広告を表示するため、Cookieを使用して情報を収集しています。
            </p>
            <p className="mt-4">
              収集される情報には個人を特定できる情報は含まれません。また、忍者AdMaxのプライバシーポリシーについては、
              <a
                href="https://www.ninja.co.jp/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline hover:text-primary/80"
              >
                こちら
              </a>
              をご確認ください。
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">
              6. 外部サービスの埋め込み
            </h2>
            <h3 className="text-xl font-semibold mb-3">6.1 YouTube</h3>
            <p>
              当サイトでは、動画コンテンツの提供のためにYouTubeの埋め込み機能を使用しています。YouTubeの動画を視聴する際、YouTubeのプライバシーポリシーが適用されます。
            </p>
            <p className="mt-4">
              YouTubeのプライバシーポリシーについては、
              <a
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline hover:text-primary/80"
              >
                こちら
              </a>
              をご確認ください。
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">7. 個人情報の管理</h2>
            <p>
              当サイトは、ユーザーの個人情報を適切に管理し、以下の場合を除き第三者に開示することはありません：
            </p>
            <ul className="list-disc ml-6 space-y-2">
              <li>ユーザーの同意がある場合</li>
              <li>法令に基づき開示が必要な場合</li>
              <li>人の生命、身体または財産の保護のために必要がある場合</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">
              8. プライバシーポリシーの変更
            </h2>
            <p>
              当サイトは、必要に応じて本プライバシーポリシーの内容を変更することがあります。変更後のプライバシーポリシーは、当サイトに掲載した時点で効力を生じるものとします。
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">9. お問い合わせ</h2>
            <p>
              本プライバシーポリシーに関するお問い合わせは、
              <a
                href="https://docs.google.com/forms/d/e/1FAIpQLScp4BT5_Av0x-tYYaE8-c91KfOXo87zfTkA68Fiaen_vpeTSA/viewform"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline hover:text-primary/80"
              >
                お問い合わせフォーム
              </a>
              よりご連絡ください。
            </p>
          </section>

          <section className="mt-8 pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              制定日：2025年11月22日
            </p>
          </section>
        </div>
      </article>
    </div>
  );
}
