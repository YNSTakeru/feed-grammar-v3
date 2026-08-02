# CLAUDE.md

本プロジェクト専用の常設方針。毎タスクで必要となる判断軸をここに圧縮する。
`souls/` は**このファイルの裏付け資料**。再読せず判断すること。

---

## 1. プロジェクト概要

**英語発音・リスニング学習サイト** (Next.js 16 + React 19 + TypeScript)。

北極星: 「半年後、画面に英語しか出てなくて初めて自分の成長に気づく」
— 補助輪 (カタカナ読み) が音もなく消えていたという**自己発見**が UX の頂点。

コア機能:
- YouTube 動画 + フレーズ表示 + カタカナ読み (既実装)
- リスニングクイズ (既実装)
- Learn Session: カタカナ → IPA → 英綴り の段階 morph + Whisper ASR 計測 (開発中)

主要ユーザー: 自分 (yanaseson) — 1日10分 × 半年 → CEFR A2 達成が目標。
スタック: Next.js 16 / React 19 / TypeScript / Tailwind CSS v4 / shadcn/ui / Vitest。

## 2. 実装方針 (feed-grammar-v3 固有)

### AudioContext / 音声録音

- **RULE A-1**: `AudioContext.resume()` / `AudioContext.start()` は**必ず直接のユーザージェスチャー (onClick)** で呼ぶこと。非同期コールバックから呼ぶのは iOS Safari で無音になるため BLOCK。
- **RULE A-2**: whisper.cpp WASM は**必ず専用 Web Worker 内で実行**。メインスレッド実行は BLOCK。低スペックデバイス向けにグレースフル劣化 (音声短縮 / モデル省略) を必ず実装。
- **RULE A-3**: `AudioContext` は**1インスタンスを使い回す**。複数回 `new AudioContext()` すると Safari でメモリ問題が起きる。
- **RULE A-4**: Safari はバックグラウンドで Web Worker を停止する。**onBlur でセッション状態を localStorage に保存し、onFocus で復元**する save-on-blur / restore-on-focus パターンを必ず実装。
- **RULE A-5**: whisper.cpp が `SharedArrayBuffer` を使う場合、COOP (`Cross-Origin-Opener-Policy: same-origin`) と COEP (`Cross-Origin-Embedder-Policy: require-corp`) ヘッダーが必要。`crossOriginIsolated === true` を実行時に検証し、false なら fallback モードを提供。`next.config.ts` の `headers()` に追加すること。

### YouTube IFrame API (埋め込みプレイヤー使用時のみ)

- **RULE Y-1**: `player.getCurrentTime()` を表示・transcript sync の SSoT にするのは BLOCK。iOS Safari の IFrame event loop は不定遅延がある。表示タイミングは `requestAnimationFrame` ベースのポーリングラッパーを使い offset correction を入れること。
- **RULE Y-2**: Autoplay を前提にするな。動画切り替え後の再生は必ずユーザージェスチャーと紐付けること。
- **RULE Y-3**: `seekTo()` はミリ秒精度を保証しない。バッファを前提にした UX 設計にすること (具体的な許容誤差は spec/ で定義)。

### Transcript / データ構造

- **RULE D-1**: transcript の JSON スキーマは**不変**。各 segment は `{ start: number, end: number, text: string, katakana: string, phonetic_reduction_type?: string }` を必ず持つこと。型定義なしでフィールドを追加するのは BLOCK。
- **RULE D-2**: morph state machine のステージ。**v0 (現在)**: 2-stage のみ実装 — `0`=カタカナのみ / `4`=英綴りのみ。**v1 target**: `0`=カタカナのみ / `1`=カタカナ+IPA / `2`=IPAのみ / `3`=IPA+英綴り / `4`=英綴りのみ の5段階。ステージをスキップするのは BLOCK。v0 でも段階番号を `4` で統一し、v1 拡張時にデータ移行不要な設計にすること。進行トリガーは ASR 類似度閾値の連続達成 (具体的な閾値は spec/ で定義)。ステージ状態は segment ごと・セッションごとに永続化する。

## 3. メタ注意点 (souls 由来)

souls/ の裏付けファイル:
- `ai-advisor-calibration.md` — AI の助言を鵜呑みにするな
- `debugging-when-stuck.md` — 計測なしで2回目の修正に入るな
- `browser-runtime-asymmetry.md` — jsdom の緑は Safari の緑ではない

---

- **jsdom の緑は Safari の緑ではない** (`browser-runtime-asymmetry.md`)。AudioContext / Web Worker / IFrame event loop は実機でのみ検証できる。
- **描画/タイミング系バグで1回目の修正が外れたのに計測ログなしで2回目の実装に入るな** (`debugging-when-stuck.md`)。`console.log` で state 値・タイミング・DOM 状態を計測してから仮説を立てる。推測ベースの反復は BLOCK。
- **「A or B」で解決した感覚を疑え**。`useRef` vs `useState` は併用が正解なケースが多い (ref=最新値 accessor / state=render trigger)。
- **spec のセルフチェックは grep 検証可能な形で書け**。「RULE A-1 準拠」の抽象表現は checkbox 偽装で素通りする。`rg "onClick.*AudioContext\|AudioContext.*onClick"` で検証できる形で書くこと。
- **CRUD を書く前に必ず grep で既存 specific API を列挙**。既存の型・関数・スキーマを見逃すと破壊的変更になる。
- **依存元タスクの完遂を着手前 grep**。依存の commit・実装ファイルが実在するか確認してから着手。
- **削除タスクは代替機能の完了が前提**。代替が commit 済み・動作確認済みでなければ着手しない。
- **PARTIAL は実機証跡 (日付・端末・観察) を knowledges/ に残すまで完了扱いしない**。

## 4. 継続規律 (personal tool)

実装の質 (§2 / §3) と直交する**継続行動層**の規律。

- **RULE C-1 (主要 KPI)**: 「今日の10分セッションを完了した + 明日また自発的にやりたくなった」が唯一の進捗指標。機能完備・見た目の完成度ではない。
- **RULE C-2 (アンチゴール)**: 「もう一機能だけ」を考えた瞬間に `open-questions.md` に降格。v0 が「10分セッションを自分が最後まで回せる」ことを実証するまで機能追加は BLOCK。
- **RULE C-3 (技術判断の先送り)**: v0 で決める必要がない判断 (反射化トリガー精度 / web-llm モデル選定 / SRS アルゴリズム) は `open-questions.md` に降格して v0 実装を止めない。
- **RULE C-4 (v0 完了条件・検証可能な形)**:
  - [ ] 自分の iPhone Safari で v0 が起動する
  - [ ] 10分以内に1セッション最後まで完了できる
  - [ ] セッション内で5文以上が stage4 (英綴りのみ) に到達した
  - [ ] 翌日も自発的にもう1セッションやりたくなった

## 5. プロンプト作法 (forHumans 由来)

- **1 タスク = 1 セッション**。完了 → commit → セッション終了。タスク間は会話ではなく git で繋ぐ。
- **読ませるファイルは 3〜5 個**。ディレクトリ全読み (`souls/` 丸ごと等) 禁止。
- **レビューループは最大 1〜2 ラウンド固定**。「反証がなくなるまで」「指摘がなくなるまで」は禁句。
- **完了条件は検証可能な形で書く** (`pnpm test` 通過 / `pnpm build` 通過 / 特定ファイルの特定変更 / commit 済み)。
- **横断的集約タスクを末尾に置かない**。`knowledges/` への総括は別セッションで git log 起点に合成。
- **新セッション冒頭で依存タスクの commit と実装ファイル実在を grep 確認してから着手** (forHumans/claude-code-prompt-writing.md v1.2)。
- 禁句: 「反証がなくなるまで」「全部やって」「souls/ を全部読んで」「良い感じに」「必要があれば」。

## 5.5. Copilot Pro+ 運用規律 (souls/meta-copilot-operation 由来)

実装の質 (§2 / §3) と継続規律 (§4) と直交する **資源管理層** の規律。$39/月 = 3,900 AI Credits/月 (6/1〜) を 1 ヶ月持たせるため、以下を機械的に守る。

### モデル選択マトリクス (タスク種別 → モデル固定)

| タスク種別                                  | 推奨モデル               | 備考                                  |
| ------------------------------------------- | ------------------------ | ------------------------------------- |
| 仕様策定 / 設計レビュー / 難デバッグ        | **Sonnet 4.6 HIGH**      | 思考深さ/コスト比が最良               |
| 実装 / 差分生成 / リファクタ (複数ファイル) | **GPT-5.4** (`/codex -m gpt-5.4`) | 停止条件必須 (罠 C3)            |
| 実装 / バグ修正 (単一ファイル)              | **GPT-5.4-mini** (`/codex -m gpt-5.4-mini`) | 軽量・高速               |
| 軽い質問 / 補完 / 要約 / コミットメッセージ | **GPT-4.1 / GPT-5 mini** | paid plan で premium request 消費なし |
| souls 更新 / 全体効率化 / メタ判断          | **Opus 4.7**             | 横断推論時のみ。終了後即 `/clear`     |
| 制限近接時                                  | **Auto**                 | 軽量モデル自動逃避 + 10% 割引         |

### 強制機構 1: `/clear` 発火 4 条件 (いずれか満たした瞬間に即発火)

1. **タスク完了 (`git commit` 直後)**
2. **モデル切替 (Sonnet → Codex / Opus → 他、いずれの方向でも)**
3. **セッション内ターン数 20 超**
4. **話題が当初目的から逸れた瞬間**

検証方法: タスク完了 commit と次セッションの commit が **同一 session 内に連続して** いないこと (`/clear` で session が切れている)。

### 強制機構 2: 出力末尾 `/model` 誘導テンプレ (全タスク完了出力に必須)

```
---
次タスク推奨モデル: <Sonnet 4.6 HIGH | GPT-5.4 (複数ファイル実装) | GPT-5.4-mini (単一ファイル実装) | Opus 4.7 | GPT-4.1>
理由: <仕様策定 / 実装 / souls 更新 / 軽作業>
推奨手順: /clear → /model <model> → 次タスク開始
```

検証方法: `rg "次タスク推奨モデル"` で完了報告に必ずヒットすること。

### Copilot 5 罠 (詳細は souls 参照)

- **C1**: 「とりあえず賢いモデル」癖 — 軽作業に Sonnet/Opus 投入
- **C2**: コンテキスト無限積み上げ — `/clear` 不発で 1 セッション肥大
- **C3**: エージェント自走の野放し — 探索回数 / 対象 / 停止条件を切らずに XHIGH 放流
- **C4**: 同じ前提を毎セッション貼り直す — CLAUDE.md / souls 全文添付癖
- **C5**: モデル切替忘れ — Opus で起動して全部 Opus、または Codex のまま souls 触る

### 月次 / 週次差分

- **〜2026-05-31 (週制限期)**: Opus は souls 更新 / 全体効率化のみ。使用ゼロ目標
- **2026-06-01〜 (AI Credits 制)**: 月初に **自動追加課金 OFF を確認** (青天井リスク)。週あたり 900 credits 以内目安、残 500 で Opus 完全停止 + Auto 強制

## 5.6. スキル起動規律 (souls/meta-skill-invocation-calibration 由来)

実装の質 (§2 / §3) と継続規律 (§4) と資源管理 (§5.5) と直交する **スキル起動レイヤ** の規律。

### 強制機構 1: 変更サイズ三本ノック (新ユーザー要求受領時、スキル起動前必須)

要求を読んだ直後、スキル起動前に **30 秒以内** で以下を行う:

1. **grep 1 発**: 変更したい挙動の起点シンボルを検索 (例: `MobilePositionEditPanel` の呼び出し箇所)
2. **view 1 発**: 該当ファイルの該当ブロックだけ読む
3. **見積もり宣言**: `S(1〜3 行) / M(1 ファイル数十行) / L(複数ファイル / 新規モジュール)` のいずれかを **明示的に出力する**

検証方法: 新ユーザー要求への最初の応答に `スコープ:S | M | L` の行が含まれること。欠落していたら BLOCK。

### 強制機構 2: スコープ別ルーティング表 (Skill routing より優先)

| スコープ | 起動するスキル                                                         | 禁止                                                                 |
| -------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **S**    | スキル起動禁止 / 直接実装 (または `/tdd` を **対象 1 ファイル限定で**) | `/plan-eng-review` `/plan-design-review` `/autoplan` `/office-hours` |
| **M**    | `/tdd` + 必要なら `/code-review`                                       | outside voice / cross-model tension                                  |
| **L**    | `/plan-eng-review` + outside voice **1 ラウンド固定**                  | スキル連鎖の自動チェイン                                             |

CLAUDE.md 末尾の `## Skill routing` 表は **L スコープでのみ参照する**。S/M ではキーワード一致しても起動禁止。

### 強制機構 3: スキル内ループのハードラウンド上限

- **AskUser 連打: 最大 5 ラウンド** (超えたら現在の決定で確定)
- **outside voice: 1 ラウンド固定** (L スコープのみ起動可)
- **cross-model tension: L スコープのみ** 起動可
- 「指摘がなくなるまで」「反証がなくなるまで」をスキル内で口走った瞬間 BLOCK

### 強制機構 4: サブエージェント実装の「直前要求 1 件のみスコープ」

- `/tdd` を含むサブエージェント実装スキルは **直前のユーザー要求 1 件のみ** をスコープにする
- plan.md 全項目を実装したい場合は **項目を 1 件ずつ別セッションに分離** してから起動
- サブエージェントへのプロンプトに **「plan.md の §X 項目だけ実装し、他項目には触れない」** を必ず含める
- セッション完了時 `git status --short | wc -l` が見積もりサイズ ± 30% を超えていたら BLOCK

### スキル起動 5 罠 (詳細は souls 参照)

- **S1**: スコープ盲目ルーティング — キーワード反射で大型スキル起動
- **S2**: スキル内ループの停止条件不在 — D1〜D18 連打 / outside voice 5 risks 全消化
- **S3**: サブエージェント実装の過剰スコープ — plan.md 全項目を一括実装し worktree 汚染
- **S4**: スキル連鎖の自動チェイン — 末尾「次は ○○ 起動?」に反射 Yes
- **S5**: 計画機構を実装ブロッカーに偽装 — launch-procrastination 罠 P1 のスキル版

## 6. 検証コマンド

- `npm run dev` — 開発サーバー (Next.js)
- `npm run build` — 本番ビルド
- `npm run test` — 単体テスト (Vitest)
- `npm run lint` — ESLint

## 7. やってはいけないこと

- **他タスクへの波及修正** (依頼範囲外のファイルを触らない)。
- **`souls/` の全読み** (本ファイルで判断できる設計にしてある)。
- **サブエージェントの再帰呼び出し** (1〜2 ラウンドで打ち切り。終了条件は「ラウンド数」)。
- **spec なしで実装コミット** (順序違反は罠の温床)。
- **実機確認なしで「完了」報告** (テスト緑は実機緑を保証しない)。
- **証跡なしで PARTIAL 完了報告** (knowledges/ に日付・端末・観察セクションが無いまま完了は BLOCK)。
- **依存元タスク未完で着手** (依存の commit・実装ファイル grep 確認なしで子タスクを始めるのは BLOCK)。
- **spec のセルフチェックを抽象表現で書いて checkbox を埋める** (grep 検証可能な形に書き直すまで BLOCK)。
- **`AudioContext` を非ユーザージェスチャーで開始する** (RULE A-1)。onClick 以外から呼ぶのは BLOCK。
- **whisper.cpp をメインスレッドで実行する** (RULE A-2)。
- **`player.getCurrentTime()` を表示・transcript sync の SSoT にする** (RULE Y-1)。`rAF` ポーリングラッパーを使うこと。
- **Autoplay を前提にする** (RULE Y-2)。再生は必ずユーザージェスチャーと紐付けること。
- **transcript schema に型定義なしでフィールドを追加する** (RULE D-1)。
- **morph stage をスキップする** (RULE D-2)。0→4 は直接ジャンプ禁止。
- **save-on-blur / restore-on-focus なしで Web Worker を使う** (RULE A-4)。
- **v0 の「10分セッション完了」実証なしに新機能を追加する** (RULE C-2)。
- **軽作業 (typo / 1 行追加 / コミットメッセージ) を Sonnet/Opus で処理** (罠 C1 / §5.5)。GPT-4.1 / GPT-5 mini で十分。
- **`/clear` 発火 4 条件のいずれかが該当しているのに `/clear` を打たない** (罠 C2 / §5.5 強制機構 1)。タスク完了 / モデル切替 / 20 ターン超 / 話題逸脱は即発火。
- **Codex / Agent モードで対象範囲・停止条件を切らずに起動** (罠 C3 / §5.5)。対象ディレクトリ / 探索回数上限 / 成功条件 / 失敗時停止条件を明示しないなら BLOCK。
- **CLAUDE.md / souls / spec の全文ペースト** (罠 C4 / §5.5)。ファイル名 + セクション番号で参照。
- **タスク完了出力に「次タスク推奨モデル」3 行が無い** (罠 C5 / §5.5 強制機構 2)。`rg "次タスク推奨モデル"` でヒットしないなら BLOCK。
- **6/1 以降に自動追加課金を ON のまま運用** (青天井リスク / §5.5)。OFF 確認まで実装作業は止める。
- **新ユーザー要求受領時に変更サイズ三本ノック (grep + view + S/M/L 宣言) を行わずにスキル起動** (罠 S1 / §5.6 強制機構 1)。`スコープ:S | M | L` の宣言が応答に無いまま `/plan-eng-review` `/plan-design-review` `/autoplan` `/office-hours` `/tdd` を起動するのは BLOCK。
- **S スコープでスキル起動** (罠 S1 / §5.6 強制機構 2)。1〜3 行修正レベルの要求に大型スキルを起動するのは BLOCK。直接実装するか `/tdd` を対象 1 ファイル限定で。
- **スキル内ループでハードラウンド上限を超える** (罠 S2 / §5.6 強制機構 3)。AskUser 5 ラウンド超 / outside voice 2 ラウンド以上 / S・M スコープでの cross-model tension 起動は BLOCK。
- **サブエージェント実装で plan.md 全項目を一括実装** (罠 S3 / §5.6 強制機構 4)。`/tdd` 等のサブエージェント実装は **直前要求 1 件のみ** スコープ。
- **スキル末尾の「次は ○○ 起動?」に反射 Yes でチェイン起動** (罠 S4 / §5.6)。S/M スコープではデフォルト No。

## Skill routing

**この表は §5.6 強制機構 2 で L スコープと判定された場合のみ参照する**。S/M スコープではキーワード一致しても起動禁止。新ユーザー要求受領時はまず §5.6 強制機構 1 (変更サイズ三本ノック) を実行すること。

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:

- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
