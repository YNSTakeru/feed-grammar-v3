# WebGPU Whisper 移行ログ

- **日付**: 2026-05-13
- **端末**: MacBook (32GB RAM / 8GB VRAM) + Chrome
- **ステータス**: DONE_WITH_CONCERNS（実機推論バグ修正済み。実机動作確認は次セッション）

---

## 1. なぜ WebGPU に移行したのか

### WASM の実測値

| モデル | workerInitMs | modelLoadMs | inferenceMs | totalMs |
|--------|-------------|-------------|-------------|---------|
| ggml-small-q5_1 | 85ms | 1380ms | **84,022ms** | 85,487ms |
| ggml-base-q5_1 | 80ms | 5,844ms | **21,110ms** | 27,035ms |
| ggml-base-q5_1 (2回目) | 0ms | 0ms | **21,933ms** | 21,934ms |

**2回目でもモデルロードはゼロになるが、推論が21秒かかる。**  
原因: `@transcribe/shout` v1.0.7 の WASM は CPU のみ。SIMD 最適化も V8 Turbofan ウォームアップも効果なし。

### V8 Turbofan ウォームアップ仮説が間違いだった

> 「1回ダミー推論すれば JIT が温まって2回目が速くなるはず」

→ **間違い。** warmUp を実装して検証したが、warm 後も cold と同じ ~72秒かかった。  
V8 は WASM の関数を Liftoff→Turbofan と段階的にコンパイルするが、whisper.cpp の WASM は  
**計算量がボトルネック**であり JIT ティアが問題ではない。→ ウォームアップ実装を削除した。

### WebGPU で期待できる改善

- GPU シェーダーで行列演算を並列実行 → **2〜5秒/発話** が現実的な目標
- `@huggingface/transformers` が WebGPU バックエンドを提供（ONNX ランタイム）
- large-v3-turbo（547MB）でも 8GB VRAM なら十分収まる

---

## 2. 実装した WebGPU アーキテクチャ

```
use-whisper-worker.ts
  └─ whisper-worker-factory.ts
       ├─ hasWebGpu() → true (navigator.gpu != null)
       │    └─ new Worker("whisper-worker-webgpu.ts")
       └─ hasWebGpu() → false (iOS Safari / 古いブラウザ)
            └─ new Worker("whisper-worker.ts")  ← WASM フォールバック

whisper-worker-webgpu.ts
  ├─ @huggingface/transformers pipeline("automatic-speech-recognition", ...)
  ├─ device: "webgpu"
  ├─ dtype: DataType | Record<string, DataType>
  └─ GgufModelKey → HF_MODEL_MAP でHF ONNX モデルIDに変換

whisper-model-selection.ts
  autoSelectGgufModel()
    ├─ WebGPU + cores≥4 → ggml-large-v3-turbo-q5_0  (HF: onnx-community/whisper-large-v3-turbo)
    ├─ WASM + cores≥4   → ggml-base-q5_1            (WASM ceiling)
    └─ mobile / low-mem → ggml-tiny-q5_1
```

### GGUF キー → HF ONNX マッピング

| GgufModelKey | HF Model ID | dtype |
|---|---|---|
| ggml-large-v3-turbo-q5_0 | onnx-community/whisper-large-v3-turbo | `{encoder_model: "fp16", decoder_model_merged: "q4"}` |
| ggml-medium-q5_0 | onnx-community/whisper-medium | `{encoder_model: "fp16", decoder_model_merged: "q4"}` |
| ggml-small-q5_1 | onnx-community/whisper-small | `"q8"` |
| ggml-base-q5_1 | onnx-community/whisper-base | `"q8"` |
| ggml-tiny-q5_1 | onnx-community/whisper-tiny | `"q8"` |

---

## 3. バグ1: Emscripten コールバック未登録 → `A[C.handler] is not a function`

### 症状

```
Uncaught TypeError: A[C.handler] is not a function
  at I.onmessage (whisper-worker-bundle.js:1:...)
```

WASM パス (`whisper-worker.ts`) で発生。推論開始直後にクラッシュ。

### 原因

`whisper.cpp` Emscripten ビルドが内部で `Module.onProgress()` を呼ぶ。  
これが未登録（`undefined`）だと `A["onProgress"]()` → `TypeError`。

コードのどこかで `whisperModule.transcribe(...)` を呼ぶ前に必ず:

```typescript
// even a no-op is required
mod.onProgress = (_: number) => {};
```

を設定しなければならない。設定順序を守らなかったことが原因。

### 教訓

> Emscripten の `Module` オブジェクトに生えているコールバックプロパティは、  
> WASM が呼び出せるかどうか実行時にチェックしない。**呼び出す前に必ずセットすること。**

---

## 4. バグ2: TypeScript ビルドエラー — `dtype: string` が `DataType` に非互換

### 症状

```
pnpm build → Failed to compile
./lib/whisper/whisper-worker-webgpu.ts:130:7
Type error: Type 'string | Record<string, string>' is not assignable to type
'"fp32" | "q4" | "fp16" | "q8" | "auto" | ... | Record<string, that_union> | undefined'
```

### 原因

`HfModelConfig.dtype` を `string | Record<string, string>` と定義していた。  
`@huggingface/transformers` の `pipeline()` は `DataType | Record<string, DataType>` を要求する。  
`DataType` は `"fp32" | "q4" | "fp16" | ...` の文字列リテラル Union 型。  
TypeScript は `string` を `"fp32" | ...` に代入不可と判定する。

### 修正

```typescript
// Before
interface HfModelConfig {
  hfId: string;
  dtype: string | Record<string, string>;  // ← 広すぎる
}

// After
import { pipeline, type DataType } from "@huggingface/transformers";
interface HfModelConfig {
  hfId: string;
  dtype: DataType | Record<string, DataType>;  // ← 正確な型
}
```

`DataType` は `@huggingface/transformers` からエクスポートされている（`types/transformers.d.ts`）。  
`as any` キャストを使わずに解決できた。

### 教訓

> `@huggingface/transformers` は `DataType` をトップレベルからエクスポートしている。  
> `node_modules/@huggingface/transformers/types/transformers.d.ts` を確認すること。  
> 独自の文字列リテラル型を定義する前に型定義を grep で確認する。

---

## 5. バグ3: `e.subarray is not a function` — 音声入力フォーマットの誤り

### 症状

```
[whisper] inferenceMs: 2ms  ← モデルロード成功後、推論が2msで即死
[whisper] ❌ runtime: e.subarray is not a function
```

### 原因

`@huggingface/transformers` の ASR pipeline の `AudioInput` 型:

```typescript
// src/pipelines/_base.js
type AudioInput = string | URL | Float32Array | Float64Array;
```

**`{ data: Float32Array, sampling_rate: number }` という形式は存在しない。**

Worker の実装:

```typescript
// ❌ 誤り — plain object を渡している
const result = await transcriber(
  { data: audioData, sampling_rate: 16000 },  // ← AudioInput に非互換
  { language, task: "transcribe", ... }
);
```

`prepareAudios()` は string/URL/Float64Array 以外を「そのまま返す」。  
plain object がそのまま渡り、内部で `.subarray()` が呼ばれる → TypeError。

### 修正

```typescript
// ✅ 正しい — Float32Array を直接渡す
const result = await transcriber(
  audioData,  // Float32Array (既に resampleTo16k() で 16kHz 済み)
  { language, task: "transcribe", return_timestamps: true, chunk_length_s: 30 }
);
```

`audioData` は `use-whisper-worker.ts` → `resampleTo16k()` で 16kHz に変換済み。  
pipeline の feature extractor も内部で 16kHz を期待しており整合している。

### 教訓

> `@huggingface/transformers` の AudioInput は **Float32Array そのもの** を渡す。  
> 他のライブラリ（Web Audio API の AudioBuffer など）が `{ data, sampleRate }` 形式を  
> 使うため混同しやすい。ドキュメントより型定義を読むこと。

---

## 6. COEP / COOP と crossOriginIsolated

### 必須設定

WebGPU (`@huggingface/transformers`) も WASM pthreads (`@transcribe/shout`) も  
`SharedArrayBuffer` を使う。これには `crossOriginIsolated === true` が必要。

`next.config.ts` に設定済み:

```typescript
headers() {
  return [{
    source: "/(.*)",
    headers: [
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
    ],
  }];
}
```

### リスク: HuggingFace CDN の CORS

`COEP: require-corp` の下では、クロスオリジンリソース（HF CDN の ONNX ファイル）が  
`Cross-Origin-Resource-Policy: cross-origin` ヘッダーを返さないとロード失敗する。  
**HuggingFace CDN は 2026-05 時点でこのヘッダーを返す**が、変わった場合は  
`COEP: credentialless` に切り替えることで回避できる（iOS は `require-corp` が必要）。

### iOS Safari の注意点

- iOS 17+ は `navigator.gpu` を持つが WebGPU はまだ実験的
- `hasWebGpu()` が true を返しても実際の推論が失敗することがある
- iOS は `ggml-tiny-q5_1` → WASM Worker にフォールバックする設計が安全

---

## 7. モデル選択の方針

```typescript
// whisper-model-selection.ts
export function autoSelectGgufModel(caps: RuntimeCaps): GgufModelKey {
  const { hasWebGPU, hardwareConcurrency, deviceMemoryGb, isIOS } = caps;

  if (isIOS) return "ggml-tiny-q5_1";          // iOS: WASM tiny のみ
  if (!hasWebGPU) return "ggml-base-q5_1";     // WASM ceiling: base
  if (hardwareConcurrency >= 4) {
    return "ggml-large-v3-turbo-q5_0";         // WebGPU: large-v3-turbo
  }
  return "ggml-base-q5_1";                     // WebGPU but low core: base
}
```

large-v3-turbo は 547MB。初回ダウンロード時に同意ダイアログが出る（`use-whisper-worker.ts` の consent gate）。

---

## 8. 改善するためにやること

### ① 実機検証（最優先）

- [ ] `pnpm dev --webpack` + ngrok で Chrome on Mac に繋ぐ
- [ ] 「押して話す」→ 発話 → `inferenceMs` が 2,000〜5,000ms 台に収まることを確認
- [ ] 認識テキストが正しく表示されることを確認
- [ ] 2回目以降に `modelLoadMs: 0` になることを確認（persistent worker）

### ② iOS Safari 検証

- [ ] iPhone で `navigator.gpu` の有無を確認
- [ ] WASM フォールバックが正常に動くことを確認
- [ ] 90秒以内に tiny モデルで推論できることを確認（or タイムアウトエラーが出ること）

### ③ フォールバック強化

現在: WebGPU ワーカーでモデルロード失敗 → `error` 型メッセージを返す → UI がエラー表示  
理想: 自動で WASM フォールバックに切り替え

```typescript
// whisper-worker-factory.ts に追加する方針
if (hasWebGpu() && loadFails) {
  return createWasmWorker();
}
```

ただし v0 完了条件（RULE C-4）の実証前に複雑にしない。エラーを明示的に出す現状で十分。

### ④ WASM パスの Emscripten コールバック完全一覧

現在 `onProgress` のみ確認済み。他に:
- `onTranscribed` — 推論完了コールバック（登録済み）
- `print` / `printErr` — Emscripten ログ出力（proxy 経由で転送済み）

`@transcribe/shout` のソースで他のコールバックが追加されていないか確認すること。

### ⑤ WASM inference 28秒問題の根本解決（中期）

base モデルで 21 秒は学習アプリとして重い。根本解決のオプション:
1. **WebGPU パスで large-v3-turbo** → 2〜5秒（本セッションで実装済み）
2. **whisper-turbo WASM** — より新しい量子化モデルへの切り替え（調査が必要）
3. **音声長の制限** — UI で「3秒以内で話す」誘導し、WASM でも 5〜8秒以内で完了させる

---

## 9. commit 一覧（2026-05-13 WebGPU 移行分）

| commit | 内容 |
|--------|------|
| `a4407ba` | feat(whisper): add WebGPU inference path via @huggingface/transformers |
| `2ae2f44` | fix(whisper): fix HfModelConfig dtype type to match @huggingface/transformers |
| `70fc8d9` | fix(whisper): pass Float32Array directly to HF pipeline, not {data,sampling_rate} |

---

## 10. ファイル早見表

| ファイル | 役割 |
|----------|------|
| `lib/whisper/whisper-worker-webgpu.ts` | WebGPU Worker 本体（@huggingface/transformers） |
| `lib/whisper/whisper-worker-factory.ts` | hasWebGpu() + Worker ルーティング |
| `lib/whisper/whisper-model-selection.ts` | autoSelectGgufModel()、WebGPU/WASM 分岐 |
| `lib/whisper/whisper-worker-protocol.ts` | 共通メッセージ型（device: "wasm"\|"webgpu"） |
| `lib/whisper/whisper-worker.ts` | WASM Worker（@transcribe/shout） |
| `lib/whisper/use-whisper-worker.ts` | Worker ライフサイクル Hook |
| `lib/audio/resample.ts` | OfflineAudioContext で 16kHz にリサンプリング |
| `next.config.ts` | COOP/COEP ヘッダー、serverExternalPackages |
