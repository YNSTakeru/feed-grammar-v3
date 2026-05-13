# Whisper STT — コピペ移植パッケージ

ブラウザ内で動作する Whisper 音声認識 (whisper.cpp WASM) の自己完結バンドル。
Next.js + TypeScript プロジェクトへフォルダを丸ごとコピーして使える。

## なぜ onnxruntime-web でなく whisper.cpp か

`onnxruntime-web` は WASM ヒープを **1.88GB** 事前確保する (GitHub issue #22776)。
iOS Safari の タブ上限 (~800MB) を大幅に超えるため即クラッシュ。
`@transcribe/shout` (whisper.cpp WASM) はピーク **~200-250MB** で安定動作する。

## 事前依存

- `@transcribe/shout` ^1.0.7 — whisper.cpp の WASM バインディング
- **モデルファイルは実行時に自動ダウンロード** (初回のみ数十秒)
  - tiny: `ggerganov/whisper.cpp` — `ggml-tiny-q5_1.bin` (32MB)
  - base: `ggml-base-q5_1.bin` (56MB)
  - small: `ggml-small-q5_1.bin` (181MB)
  - ダウンロード後は IndexedDB にキャッシュされ、2回目以降はオフラインでも動作する
  - **初回はオンライン環境が必要**

## セットアップ

### 1. npm パッケージを追加

```bash
pnpm add @transcribe/shout
# または
npm install @transcribe/shout
```

### 2. next.config.ts に COEP/COOP ヘッダーを追加

SharedArrayBuffer (whisper.cpp の pthreads が必須) のために `crossOriginIsolated`
を有効化する。`credentialless` は iOS Safari 非対応のため `require-corp` を使うこと。

```ts
// next.config.ts
const nextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
    ];
  },
};
export default nextConfig;
```

> **注意**: `COEP: require-corp` を設定すると外部リソース (Google Fonts、CDN 画像等) は
> `crossorigin` 属性または `Cross-Origin-Resource-Policy` ヘッダーが必要になる。
> 外部リソースが多い場合は影響を事前に確認すること。

### 3. フォルダをコピー

```bash
cp -r exports/whisper/ <your-project>/lib/whisper/
```

### 4. 使い方

```tsx
"use client";
import { useWhisperWorker } from "@/lib/whisper/use-whisper-worker";

function MyComponent() {
  const { run, abort } = useWhisperWorker({
    onProgress: (stage, percent) => console.log(stage, percent),
  });

  async function handleAudio(audioBuffer: AudioBuffer) {
    // 16kHz にリサンプリングして Float32Array を渡す
    const float32 = audioBuffer.getChannelData(0);
    const result = await run(float32, "ja");

    if (result.ok) {
      console.log(result.chunks);      // TranscriptionChunk[]
      console.log(result.diagnostics); // WhisperDiagnostics
    } else {
      console.error(result.error, result.category);
      // category: "timeout" | "oom" | "runtime" | "aborted" | "empty" | "network"
    }
  }

  return <button onClick={abort}>Abort</button>;
}
```

## API

### `useWhisperWorker(opts?)`

| オプション | 型 | デフォルト | 説明 |
|---|---|---|---|
| `model` | `{ modelId: string; quantize: "fp32" \| "q4" }` | 自動選択 | モデルを固定したい場合 |
| `readyTimeoutMs` | `number` | `10_000` | Worker 起動待ちタイムアウト |
| `loadTimeoutMs` | `number` | `60_000` | モデルロードタイムアウト |
| `transcribeTimeoutMs` | `number` | `300_000` | 音声認識タイムアウト |
| `onProgress` | `(stage, percent) => void` | — | 進捗コールバック |
| `workerFactory` | `() => Worker` | 内部実装 | Worker 生成をカスタマイズ |

戻り値: `{ run, abort }`

- `run(audioOwned: Float32Array, language: string, modelOverride?): Promise<RunResult>`
  - `audioOwned` は **Transferable** として Worker に移譲される。呼び出し後は参照しないこと
  - `language`: ISO 639-1 コード (`"ja"`, `"en"` 等)
- `abort()`: 実行中の認識を中断し Worker を終了する

### `RunResult`

```ts
type RunResult =
  | { ok: true; chunks: TranscriptionChunk[]; diagnostics: WhisperDiagnostics }
  | { ok: false; error: string; category: "timeout" | "oom" | "runtime" | "aborted" | "empty" | "network" };
```

## ファイル構成

| ファイル | 役割 |
|---|---|
| `use-whisper-worker.ts` | React hook (公開 API) |
| `whisper-worker-factory.ts` | Worker 生成 (`{ type: "module" }` 必須) |
| `whisper-worker.ts` | Web Worker 本体 (whisper.cpp WASM) |
| `whisper-worker-protocol.ts` | Worker↔Hook 間の型定義 |
| `whisper-worker-utils.ts` | WASM stderr 分類ユーティリティ |
| `idb-model-cache.ts` | IndexedDB モデルキャッシュ |

## 既知の制約

- **同時実行不可**: `workerRef` 使用中に `run()` を呼ぶと `{ ok: false, category: "runtime" }` が返る
- **Worker type は `"module"` 必須**: iOS Safari (JSC) は classic+pthreads を拒絶する
- **COEP require-corp が必要**: `credentialless` は iOS Safari 非対応のため `crossOriginIsolated=false` になり pthreads が無効化されて推論速度が数倍悪化する
- **入力は 16kHz Float32Array のみ**: 他サンプルレートは `unsupported sampleRate` エラーになる
- **OOM 時は `category: "oom"`**: iOS Safari 上では 200-250MB 以内に収まるが、重い small モデルはデバイスによってはクラッシュする可能性がある
