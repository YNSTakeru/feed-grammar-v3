import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "運営者情報 | Feed Grammar",
  description:
    "Feed Grammarの運営者情報・サイトコンセプトについてご紹介します。YouTubeで学ぶ英語リスニング講座として、実際の会話シーンから英語学習をサポートします。",
};

export default function AboutPage() {
  return (
    <div className="container mx-auto px-4 py-8 md:py-12 max-w-4xl">
      <h1 className="text-3xl md:text-4xl font-bold mb-8 text-center">
        運営者情報
      </h1>

      {/* サイト概要 */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4 border-b-2 border-primary pb-2">
          サイト概要
        </h2>
        <div className="space-y-3 text-muted-foreground">
          <div className="flex flex-col sm:flex-row sm:gap-2">
            <span className="font-semibold text-foreground min-w-[120px]">
              サイト名：
            </span>
            <span>Feed Grammar - YouTubeで学ぶ英語リスニング講座</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:gap-2">
            <span className="font-semibold text-foreground min-w-[120px]">
              URL：
            </span>
            <span>https://feedgrammar.com/</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:gap-2">
            <span className="font-semibold text-foreground min-w-[120px]">
              運営者：
            </span>
            <span>Feed Grammar 運営チーム</span>
          </div>
        </div>
      </section>

      {/* サイトのコンセプト */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4 border-b-2 border-primary pb-2">
          サイトのコンセプト
        </h2>
        <div className="space-y-4 text-muted-foreground leading-relaxed">
          <p>
            Feed
            Grammarは、YouTubeの実際の会話シーンを教材として、英語のリスニング力を向上させることを目的とした教育メディアです。
          </p>
          <p>
            従来の教科書的な英語学習ではなく、ネイティブスピーカーが実際に使う自然な英語表現や発音変化にフォーカスし、「聞き取れない理由」を理解することで、実践的なリスニングスキルを身につけることができます。
          </p>
          <p>
            動画と連動した詳細な解説により、音声変化のパターンや文法のポイントを視覚的に学ぶことで、効果的な英語学習をサポートします。
          </p>
        </div>
      </section>

      {/* 提供コンテンツ */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4 border-b-2 border-primary pb-2">
          提供コンテンツ
        </h2>
        <div className="space-y-6">
          <div className="p-6 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950 rounded-lg">
            <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
              <span className="text-2xl">🎥</span>
              動画連動レッスン
            </h3>
            <p className="text-muted-foreground leading-relaxed">
              YouTubeの実際の会話シーンと連動し、フレーズごとに音声変化や文法ポイントを詳しく解説します。動画を見ながら、リアルな英語表現を学べます。
            </p>
          </div>

          <div className="p-6 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950 rounded-lg">
            <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
              <span className="text-2xl">✍️</span>
              リスニングクイズ
            </h3>
            <p className="text-muted-foreground leading-relaxed">
              学習した内容を確認できるインタラクティブなクイズ機能を提供。自分の理解度をチェックしながら、効果的に学習を進められます。
            </p>
          </div>

          <div className="p-6 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950 dark:to-pink-950 rounded-lg">
            <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
              <span className="text-2xl">📝</span>
              詳細な解説記事
            </h3>
            <p className="text-muted-foreground leading-relaxed">
              各フレーズの音声変化パターン、文法の解説、ネイティブの発音のコツなど、テキストで詳しく説明。復習や深い理解に役立ちます。
            </p>
          </div>
        </div>
      </section>

      {/* こんな方におすすめ */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4 border-b-2 border-primary pb-2">
          こんな方におすすめ
        </h2>
        <ul className="space-y-3">
          <li className="flex items-start gap-3">
            <span className="text-primary font-bold text-xl shrink-0">✓</span>
            <span className="text-muted-foreground leading-relaxed">
              ネイティブの英語が聞き取れないと感じている方
            </span>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-primary font-bold text-xl shrink-0">✓</span>
            <span className="text-muted-foreground leading-relaxed">
              リスニング力を向上させたい英語学習者
            </span>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-primary font-bold text-xl shrink-0">✓</span>
            <span className="text-muted-foreground leading-relaxed">
              実際の会話で使われる自然な英語表現を学びたい方
            </span>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-primary font-bold text-xl shrink-0">✓</span>
            <span className="text-muted-foreground leading-relaxed">
              動画を使った効果的な英語学習方法を探している方
            </span>
          </li>
        </ul>
      </section>

      {/* お問い合わせ */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4 border-b-2 border-primary pb-2">
          お問い合わせ
        </h2>
        <p className="text-muted-foreground leading-relaxed mb-4">
          サイトに関するご質問、ご意見、ご要望などがございましたら、お気軽にお問い合わせください。
        </p>
        <Link
          href="https://docs.google.com/forms/d/e/1FAIpQLScp4BT5_Av0x-tYYaE8-c91KfOXo87zfTkA68Fiaen_vpeTSA/viewform"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity font-semibold"
        >
          お問い合わせフォームへ
          <span className="text-lg">→</span>
        </Link>
      </section>

      {/* 関連情報 */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4 border-b-2 border-primary pb-2">
          関連情報
        </h2>
        <div className="space-y-2">
          <Link
            href="/privacy"
            className="inline-flex items-center gap-2 text-primary hover:underline"
          >
            <span>プライバシーポリシー</span>
            <span>→</span>
          </Link>
        </div>
      </section>

      {/* 免責事項 */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4 border-b-2 border-primary pb-2">
          免責事項
        </h2>
        <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            当サイトのコンテンツは、英語学習の補助を目的として提供されています。学習効果には個人差があり、成果を保証するものではありません。
          </p>
          <p>
            当サイトで紹介するYouTube動画は、各権利者が公開しているものであり、当サイトはそれらの権利を侵害する意図はございません。
          </p>
          <p>
            当サイトの情報は正確性を期していますが、予告なく変更される場合があります。当サイトの利用により生じた損害について、一切の責任を負いかねますのでご了承ください。
          </p>
        </div>
      </section>
    </div>
  );
}
