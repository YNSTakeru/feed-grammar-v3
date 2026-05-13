# souls — 開発の魂 (Development Souls)

`tasks/` や `spec/` が **「何を作ったか」** を記録するのに対し、
このフォルダは **「戦いの中で得た魂 (soul) = 再現不可能な知見」** を記録する。

## 収録する内容

- 数日〜数週間かけてやっと掘り当てた**根本原因**の記録
- コードを読んでも絶対に分からない**暗黙の落とし穴**
- 公式ドキュメント/AI のアドバイスが**間違っていた**事例と、そこから学んだ教訓
- 「あの時これを知っていれば 3 日節約できた」と言える**核心的な知識**

## 収録しない内容

- 実装の How-to (これは `spec/` に書く)
- タスクの進捗記録 (これは `tasks/` に書く)
- セッションの流れ (これは `SESSION_STATE.md`)

## ファイル命名

`YYYY-MM-DD_<短いキーワード>.md` 形式。日付は発見した日。
汎用化された知見は `meta-` プレフィックスをつける。

## 現在の収録

### メタ知見 (技術非依存)
- [`2026-04-19_meta-debugging-when-stuck.md`](./2026-04-19_meta-debugging-when-stuck.md) — 詰まったデバッグを突破する 10 技法
- [`2026-04-19_meta-ai-advisor-calibration.md`](./2026-04-19_meta-ai-advisor-calibration.md) — AI アドバイザーの毒抜き手順 (対話ランタイム編)
- [`2026-04-20_meta-spec-phase-hallucination.md`](./2026-04-20_meta-spec-phase-hallucination.md) — AI が書いた spec/plan に潜む架空の型・API を commit 前に狩る
- [`2026-04-22_meta-requirement-translation-traps.md`](./2026-04-22_meta-requirement-translation-traps.md) — ユーザー語彙を実装に翻訳する時の 5 つの罠 (字義的実装 / 二択思考 / 汎用 API / 後追い spec / デフォルト値の二重責務) *v1.3 2026-05-08 (α-1 配置依頼スコープ確認 / α-2 方向ボキャブラリ座標系再定義 / ε-2 常時表示 + 例外状態リスト / ε-3 適応的閾値の上限キャップ を追加)*
- [`2026-04-22_meta-browser-runtime-asymmetry.md`](./2026-04-22_meta-browser-runtime-asymmetry.md) — 「テスト緑なのに実機で壊れる」6 軸 (イベントループ+guard 前副作用 / 非同期状態+video timeupdate+計測ファースト+IME composition skip / パッシブ / 物理制約+grep検証 / DOM・スタイル+複数経路対称性 (write+read) / iOS OS レベル UI 副作用+IME controlled input 競合) と PARTIAL ゲート *v1.5 2026-05-08 (軸 1 サブ B Guard 前副作用 / 軸 5 サブ D 複数表示 read 経路の `?? fallback` 罠 / 軸 6 サブ B IME ↔ controlled input 競合 を追加 + ケース 6/7)*
- [`2026-04-26_meta-task-graph-execution-discipline.md`](./2026-04-26_meta-task-graph-execution-discipline.md) — タスク **間** の運用ゲート 5 種 (依存 / 削除 / 分割 a/b/c / cleanup テンプレ / PARTIAL 証跡)。タスク内の品質ゲートを全て通しても運用層が空なら成果物は壊れる
- [`2026-04-27_meta-launch-procrastination.md`](./2026-04-27_meta-launch-procrastination.md) — Launch 先送り 6 罠 (技術偽装 / もう一機能だけ / 打席数不足 / 期日コミット欠落 / 既存資産盲点 / **P6 ペイン不在を打席不足で説明する逆罠**)。実装の質を保証する原則と直交する launch 行動層 *v1.1 2026-05-08 (罠 P6 + チェックリスト F + B2B 6 社返信ゼロケース を追加)*
- [`2026-05-01_meta-copilot-operation.md`](./2026-05-01_meta-copilot-operation.md) — Copilot Pro+ 運用 5 罠 (C1 賢いモデル癖 / C2 コンテキスト肥大 / C3 エージェント野放し / C4 全文ペースト / C5 モデル切替忘れ) + 強制機構 2 点 (`/clear` 発火 4 条件 / 出力末尾 `/model` 誘導テンプレ)。実装の質 / launch 行動と直交する **資源管理層**
- [`2026-05-02_meta-cold-outreach-message-design.md`](./2026-05-02_meta-cold-outreach-message-design.md) — コールドアウトリーチ 6 罠 (O1 フィールド制約未確認 Pain フレーム / O2 DIY 構造 CTA / O3 観察非接続テンプレ / O4 カスケード放置 / O5 AI 確定削除喪失 / O6 翻案権コンプラ違反) + Pain Bridge 4 行 + 3 行ブリッジ DFY 構造 + 認知負荷ゼロ CTA。実装の質 / launch 行動 / 資源管理と直交する **顧客接点層**
- [`2026-05-09_meta-skill-invocation-calibration.md`](./2026-05-09_meta-skill-invocation-calibration.md) — スキル起動 5 罠 (S1 スコープ盲目ルーティング / S2 スキル内ループ停止条件不在 / S3 サブエージェント過剰スコープ / S4 スキル連鎖自動チェイン / S5 計画機構を実装ブロッカーに偽装) + **変更サイズ三本ノック** (grep+view+S/M/L 宣言) + スコープ別ルーティング表 + ハードラウンド上限。実装の質 / launch 行動 / 資源管理 / 顧客接点と直交する **スキル起動レイヤ**

### 具体事例
- [`2026-04-19_emscripten-handler-stubs-trap.md`](./2026-04-19_emscripten-handler-stubs-trap.md) — Emscripten Module handler stub の罠
- [`2026-04-19_ios-safari-pthread-gauntlet.md`](./2026-04-19_ios-safari-pthread-gauntlet.md) — iOS Safari pthread WASM 5 関門

## 読む順番のおすすめ

- **詰まった時**: `meta-debugging` → `meta-ai-advisor-calibration` → 類似の具体事例
- **ユーザー要求を聞いた直後**: `meta-requirement-translation-traps` (5 罠をチェック) → `meta-spec-phase-hallucination`
- **新機能の spec / plan を書く前・レビュー前**: `meta-spec-phase-hallucination` (架空の型/API を commit 前に狩る)
- **実機テストに出す直前**: `meta-browser-runtime-asymmetry` (6 軸セルフチェック + PARTIAL ゲート / セルフチェックは grep 検証可能な形で)
- **新セッション開始時 (Wave / 削除 / 分割)**: `meta-task-graph-execution-discipline` (依存 / 削除 / 分割 / cleanup / 証跡 5 ゲート)
- **「launch まだ?」と感じた / 技術判断が決まらず止まっている時**: `meta-launch-procrastination` (P1〜P5 罠 + launch 行動チェックリスト)
- **新セッション開始時 (モデル選択 / `/clear` 判断) / Copilot credits が減ってきた時**: `meta-copilot-operation` (C1〜C5 罠 + 強制機構 2 点 + モデル選択マトリクス)
- **コールドアウトリーチ送信前 / デモ動画台本作成前 / AI レビューループに入る前**: `meta-cold-outreach-message-design` (O1〜O6 罠 + Pain Bridge 4 行 + 3 行ブリッジ DFY + 認知負荷ゼロ CTA + 確定削除対照)
- **新ユーザー要求受領直後 / スキル起動を考えた瞬間**: `meta-skill-invocation-calibration` (変更サイズ三本ノック + スコープ別ルーティング表 + ハードラウンド上限。S スコープではスキル起動禁止)
- **spec ができた後の実装フェーズ**: 具体事例を辞書引き

メタ技法で道具を揃えてから具体例を読むと転用しやすい。「実装の質」系 (browser-runtime-asymmetry / requirement-translation-traps / spec-phase-hallucination / task-graph-execution-discipline) と「launch 行動」系 (launch-procrastination) と「資源管理」系 (copilot-operation) と「顧客接点」系 (cold-outreach-message-design) と「スキル起動レイヤ」系 (skill-invocation-calibration) は **直交 5 軸**。5 つすべてを回すこと。
