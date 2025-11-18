# Feed Grammar - 英語発音学習サイト

YouTubeから学ぶ英語の発音とリスニング。ネイティブの自然な発音変化を理解して、リスニング力を向上させるための静的サイトです。

## 特徴

- 📚 **静的サイト**: `output.json` のデータを使用した完全な静的サイト
- 🎨 **モダンUI**: shadcn/ui を使用した美しいコンポーネント
- 🔍 **検索・フィルター**: フレーズやテーマでの検索、カテゴリーフィルター機能
- 📱 **レスポンシブ**: モバイルからデスクトップまで対応
- ⚡ **Next.js 16**: App Router と Static Generation を使用

## 技術スタック

- **Next.js 16** - React フレームワーク
- **TypeScript** - 型安全性
- **Tailwind CSS v4** - スタイリング
- **shadcn/ui** - UIコンポーネント
- **Lucide React** - アイコン

## 開発環境のセットアップ

```bash
# 依存関係のインストール
npm install

# 開発サーバーの起動
npm run dev
```

ブラウザで [http://localhost:3000](http://localhost:3000) を開いて確認できます。

## プロジェクト構造

```
feed-grammar-v3/
├── app/
│   ├── article/[id]/
│   │   └── page.tsx          # 記事詳細ページ
│   ├── feed-list.tsx          # フィードリストコンポーネント
│   ├── globals.css            # グローバルスタイル
│   ├── layout.tsx             # ルートレイアウト
│   └── page.tsx               # トップページ
├── components/
│   ├── ui/                    # shadcn/ui コンポーネント
│   ├── feed-card.tsx          # フィードカード
│   ├── filter-tabs.tsx        # カテゴリーフィルター
│   └── search-bar.tsx         # 検索バー
├── types/
│   └── index.ts               # 型定義
├── output.json                # データソース
└── package.json
```

## 主な機能

### トップページ
- 全フレーズの一覧表示
- リアルタイム検索
- カテゴリーフィルター
- レスポンシブグリッドレイアウト

### 記事詳細ページ
- YouTube動画への直接リンク（タイムスタンプ付き）
- フレーズとカタカナ表記
- 詳細な解説記事
- キーワードタグ

## ビルドとデプロイ

```bash
# 本番ビルド
npm run build

# 本番サーバーの起動
npm start
```

静的サイトとしてエクスポートする場合：

```bash
# next.config.ts に output: 'export' を追加してから
npm run build
```

## データ構造

`output.json` には以下の形式でデータが格納されています：

- **id**: 記事ID
- **question**: 英語フレーズ
- **question_katakana**: カタカナ表記
- **article_text**: 記事本文（JSON形式）
- **category**: カテゴリー
- **theme**: テーマ
- **thumbnail**: YouTube サムネイル
- **url**: YouTube URL
- **start_time / end_time**: 動画の開始・終了時間

## ライセンス

Private


## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
