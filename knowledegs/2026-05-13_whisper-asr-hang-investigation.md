# Whisper ASR ハング調査ログ

- **日付**: 2026-05-13
- **端末**: iPhone Safari (本人端末) + ローカル開発環境
- **症状**: learnページで発話後、Whisperが「音を確認中」で止まり2分後にリセット。発音フィードバックが一切見えない。
- **ステータス**: DONE_WITH_CONCERNS（UX 修正済み。WASM推論速度は未改善）

---

## 1. 何が起きていたか

ユーザーが「押して話す」ボタンをタップして発話すると、2種類の失敗が連鎖していた。

### 失敗パターン A: 短いタップ → 「音を確認できました。もう1回！」

1. タップが短すぎる → `MediaRecorder` の `ondataavailable` が `size=0` のチャンクを返す
2. フィルタ `if (event.data.size > 0)` で除外 → `chunksRef.current = []`
3. `finishRecording()` が空の Blob を `decodeAudioData()` に渡す
4. `decodeAudioData(emptyBuffer)` が DOMException を throw
5. `catch` ブロックが発火 → **「音を確認できました。もう1回！」** という誤解を招くメッセージ

**なぜ誤解を招くか**: "確認できました"（音の存在を確認した）と読めるが、実際は `decodeAudioData` の例外処理であり音は0バイト。メッセージと実態が逆。

### 失敗パターン B: 実際に発話 → 2分ハング

1. `chunksRef.current` にデータあり → `decodeAudioBlob()` 成功
2. `resampleTo16k()` 成功
3. `run(resampled, "en")` 内で `sendTranscribe()` が Worker に音声データを転送
4. Worker 側で `whisperModule.transcribe()` （WASM推論）が開始
5. **iOS Safari では pthreads が低速 or 実質シングルスレッド**になるため、tiny モデルでも推論に数十秒〜数分かかる
6. `transcribeTimeoutMs = 5 * 60_000`（5分）なのでタイムアウトが来ない
7. ユーザーが2分待ってページを離れる → UI がリセット

---

## 2. コードを追った経路

```
ボタン onPointerDown
  └─ startRecording()
       └─ recorder.start()      ← ondataavailable はここで登録

ボタン onPointerUp
  └─ stopRecording()
       └─ recorder.stop()
            ├─ ondataavailable (size > 0 なら push)
            └─ onstop → finishRecording()
                 ├─ decodeAudioBlob(audioBlob)        ← AudioContext を毎回 new（RULE A-3 違反）
                 ├─ resampleTo16k(monoAudio, rate)    ← OfflineAudioContext、問題なし
                 └─ run(resampled, "en")
                      └─ useWhisperWorker.run()
                           ├─ waitForPong(10s)
                           ├─ sendLoadModel(60s)      ← IDB キャッシュあれば即完了
                           └─ sendTranscribe(5min)    ← ここでハング
                                └─ Worker: whisperModule.transcribe()
                                     └─ @transcribe/shout WASM (whisper.cpp)
                                          └─ onTranscribed callback で resolve
```

### useWhisperWorker の run() は絶対に throw しない

`run()` は全エラーを `{ ok: false, category: ... }` で返す設計。つまり `finishRecording()` の `catch` ブロックは **`decodeAudioBlob` か `resampleTo16k` の例外にしか反応しない**。これが「Whisper のエラー」と「音声デコードのエラー」が同じメッセージになっていた原因。

---

## 3. 根本原因まとめ

| # | 場所 | 原因 | 重大度 |
|---|------|------|--------|
| 1 | `finishRecording()` 冒頭 | 空チャンクのガードなし → `decodeAudioData` が throw | 高（UX 破壊） |
| 2 | `use-whisper-worker.ts:54` | `transcribeTimeoutMs = 5 * 60_000` が長すぎる | 高（無言でハング） |
| 3 | `decodeAudioBlob()` | `new AudioContext()` を毎呼び出しで生成（RULE A-3 違反） | 中（Safari メモリ） |
| 4 | `finishRecording()` catch | エラーメッセージ「音を確認できました」が状況と逆 | 中（UX 誤解） |
| 5 | フィードバック表示 | `asrText`（Whisper が認識したテキスト）を表示していない | 高（学習できない） |

---

## 4. なぜその方針にしたのか

### WASM を Web Worker 内で実行する（RULE A-2）

`@transcribe/shout` は whisper.cpp の Emscripten ビルド。WASM 推論はメインスレッドで実行すると UI がフリーズするため、**専用 Worker 内で実行**する方針は正しい。Worker 内で `whisperModule.transcribe()` を呼ぶと、Emscripten pthreads が「サブワーカー」を複数立てて並列推論しようとする。

### COOP/COEP ヘッダーを全ルートに設定する（RULE A-5）

pthreads には `SharedArrayBuffer` が必要で、そのためには `crossOriginIsolated === true` が必要。`next.config.ts` で COOP (`same-origin`) + COEP (`require-corp`) を設定済み。これは正しい。

### Proxy 経由でコールバックを渡す設計（whisper-worker.ts）

`createModule(handlerProxy)` に渡した Proxy が `Module` として保持される（Emscripten の `var Module = moduleArg` パターン）。`whisperModule.onTranscribed = fn` で Proxy の `set` トラップ経由 → `handlerTarget.onTranscribed = fn`。WASM が `Module.onTranscribed(result)` を呼ぶと `get` トラップ → `handlerTarget.onTranscribed` = 登録済みコールバック が呼ばれる。この機構は正しく動作している（ハングは Proxy の問題ではない）。

---

## 5. なぜ動かなかったのか（深掘り）

### iOS で pthreads が遅い理由

iOS Safari は Web Worker のスレッド優先度を積極的に下げる。Emscripten pthreads は Worker-of-Workers で並列化するが、iOS では実質シングルスレッドに近い速度になる。`ggml-tiny-q5_1`（32MB）でも短い音声の推論に 30〜90 秒かかるケースがある。

### `transcribeTimeoutMs = 5 min` では長すぎる理由

推論が終わらないのではなく「遅い」ケースでは、十分な時間を与えれば結果は返る。だが5分は学習アプリとしては現実的でない。ユーザーが諦める前に明確なフィードバックを出す必要がある。90秒に短縮することで：
- 推論が間に合えば → 正常に結果を表示
- 推論が遅すぎれば → 「処理が長すぎました。もう1回！」を表示

### `decodeAudioData` が空バッファで throw する理由

`AudioContext.decodeAudioData()` の仕様上、空または無効な ArrayBuffer は `EncodingError` (DOMException) を投げる。0バイトの WebM ヘッダだけのバイト列も同様。

---

## 6. 施した修正（commit 2c34fe0）

### `components/learn-session.tsx`

```
変更 1: Feedback 型に asrText?: string を追加
  → hit / try-again フィードバックに認識テキストを持たせる

変更 2: audioContextRef 追加（RULE A-3 準拠）
  → new AudioContext() を毎回呼ぶのをやめ、useRef で1インスタンス使い回す
  → コンポーネントアンマウント時に audioContextRef.current?.close()

変更 3: transcribeTimeoutMs: 90_000 を useWhisperWorker に渡す
  → 5分 → 90秒

変更 4: finishRecording() 冒頭に空チャンクガード
  if (chunksRef.current.length === 0) {
    setFeedback({ kind: "try-again", message: "もう少し長めに押しながら話してください。" });
    return;
  }

変更 5: audioBlob.size === 0 のダブルチェック

変更 6: AudioContext の reuse ロジック
  if (!audioContextRef.current || audioContextRef.current.state === "closed") {
    audioContextRef.current = new AudioContextCtor();
  }
  await audioContextRef.current.decodeAudioData(arrayBuffer);

変更 7: result.ok === false 時のカテゴリ別メッセージ
  timeout  → 「処理が長すぎました。もう1回！」
  empty    → 「音が短かったかも。もう1回！」
  その他   → 「うまく聞き取れませんでした。もう1回！」

変更 8: asrText を hit / miss の setFeedback に含める

変更 9: フィードバック表示に「聞こえた:「{asrText}」」を追加

変更 10: decodeAudioBlob() 関数を削除（インライン化したため不要）
```

---

## 7. 残課題と今後の観察ポイント

### WASM 推論速度（未解決）

90秒タイムアウトで「処理が長すぎました」が頻発するようなら、以下を検討：

1. **モデルダウングレード**: `ggml-tiny-q5_1`（32MB）は既に最小。もし `base` を使っていたら `tiny` に切り替える
2. **録音時間制限**: 発話が長すぎると推論が遅くなる。UI で「3〜5秒以内で話す」よう誘導する
3. **単語数制限**: `whisper.cpp` の `max_len` パラメータで出力トークン数を制限できる（現在 `0 = 無制限`）
4. **進捗バーの改善**: `onProgress` で0→5% のジャンプしか来ない場合は推論中の進捗が取れていない。ポーリングで経過時間を表示するか「あと〜秒」の目安を出す

### 実機検証チェックリスト（PARTIAL 完了条件）

- [ ] iPhone Safari で 90秒以内に推論が完了する
- [ ] 短いタップに「もう少し長めに押しながら話してください。」が表示される
- [ ] 発話後に「聞こえた:「...」」が正しい内容で表示される
- [ ] タイムアウト発生時に「処理が長すぎました。もう1回！」が表示される

### save-on-blur / restore-on-focus（未実装）

RULE A-4 に従い、Safari バックグラウンドで Worker が停止した場合の対策が未実装。`useWhisperWorker` に Worker の再起動ロジックを追加する必要がある（別タスク）。

---

## 8. ファイル早見表

| ファイル | 役割 | 主な変更点 |
|----------|------|-----------|
| `components/learn-session.tsx` | UI・録音・フィードバック | 空ガード・AudioContext reuse・asrText 表示 |
| `lib/whisper/use-whisper-worker.ts` | Worker ライフサイクル | transcribeTimeoutMs デフォルト 5min（呼び出し側で 90s に上書き） |
| `lib/whisper/whisper-worker.ts` | WASM 推論 Worker | 変更なし（Proxy 機構は正しく動作） |
| `lib/whisper/whisper-worker-protocol.ts` | メッセージ型定義 | 変更なし |
| `next.config.ts` | COOP/COEP ヘッダー | 変更なし（正しく設定済み） |
