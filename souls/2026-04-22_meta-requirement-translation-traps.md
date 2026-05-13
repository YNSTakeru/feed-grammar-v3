# ユーザー要求を実装に翻訳する時の 5 つの罠

**抽象化:** 2026-04-22 (テロップエディタ UX 抜本改善プランニングでサブエージェントが検出した CRITICAL 4 件の構造分析) + 2026-04-23 (`ux-overhaul-v2` 計画で発覚した「デフォルト値の二重責務」罠 ε を追加統合)
**適用範囲:** ユーザーの要求から実装方針を導出する全フェーズ (要件定義・設計・コーディング・レビュー)
**目的:** ユーザーの言葉を素直に受け取ると必ずハマる 5 種類の罠を、要求を聞いた瞬間に事前検知する
**改訂:** v1.1 (2026-04-23) — 罠 ε (デフォルト値の二重責務: UX preview 用と output 用の SSoT 分離) を追加
**改訂:** v1.2 (2026-05-02) — 2 件統合: (a) `2026-05-02_whisper-timing-offset-fix.md` から罠 γ に **「データ変換関数が捨てた量を返さないと下流で復元不可能」** サブ項目、罠 ε に **「cross-cutting state 補正は全 consumer に対称適用必須」** サブ項目を追加 (`trimSilence` が `removedDurationSec` を返さず、segments と rawSttChunks の両方への補正が要求されるケース)。(b) `2026-04-29-addSegment-manual-telop.md` から罠 γ に **「FSM の TRANSITIONS 定義を grep せずに汎用 action を呼ぶと意図しない state へ遷移」** サブ項目を追加 (`tapTelop` action が `EDIT` state 中は `ACTION_MODAL` へ遷移する仕様を見落として手動テロップが編集モードで開かない事案)
**改訂:** v1.3 (2026-05-08) — 4 件統合: (a) `2026-05-06_export-button-relocation-design-retrospective.md` から罠 α に **サブ α-1「『〜に置いて / 〜に追加して』形式の配置依頼は字義翻訳の前にスコープ (segment scope vs document scope) を確認**」を追加 — 「テロップメニューに入れて」を `TelopActionModal` (segment scope) に字義翻訳すると document スコープの export 機能との不整合が発生。深層意図は「動画プレビューを大きく戻したい」だった。(b) `2026-05-05_swipe-boundary-t0-seek-design.md` から罠 α に **サブ α-2「方向ボキャブラリ (左/右/前/次/戻る) は座標系で再定義してから実装**」を追加 — ユーザー語「左スワイプで戻る」を `direction === "left"` と素直翻訳すると `dx > 0` (right) で発火する実装と座標系不一致 → t=0 シーク失敗。(c) `2026-05-06_export-button-relocation-design-retrospective.md` から罠 ε に **サブ ε-2「『常時表示』ルールは例外状態リスト (`isFullscreen` / `isTelopListOpen` / `isBottomSplitOpen` 等) とセットで初めて完成**」を追加 — 「常時 baseOpsBar 露出」だけでは modal/overlay と競合し配置議論が再発。(d) `2026-05-07_post-split-vad-boundary-correction.md` から罠 ε に **サブ ε-3「適応的閾値は『常に超えられる上限』をキャップで保証**」を追加 — `noiseFloor * k` だけだと全フレーム高ピーク時に「どのフレームも超えない」退化を起こす (`Math.min(noiseFloor * k, maxPeak * 0.8)` で防御)。**メタ教訓: v1.0 罠 α は「機能名 → UI 構造」の字義翻訳のみ扱ったが、「配置依頼 → スコープ確認」「方向語 → 座標系」のバリアントが未カバーで再発した。サブ項目を新設する時は罠 α のバリアント (機能名 / 配置 / 方向 / 順序 / 数量) を網羅したか自問する**

---

## 🧬 前提 — 要求翻訳が失敗する構造

ユーザーが発した言葉は二層構造を持つ:

| 層 | 内容 | 例 |
| -- | -- | -- |
| **表層語彙** | ユーザーが口にした単語・機能名 | 「校閲モード」「レイアウトモード」「位置を保存」 |
| **深層意図** | その語彙を生み出した根源的な欲求 | 「迷わず直感的に編集したい」「設定が勝手に消えないでほしい」 |

実装フェーズに下ろす時、表層だけをそのままコンポーネント名・state 名・API 呼び出しに変換すると、深層を裏切るコードが生まれる。さらに、既存アーキテクチャ原則・既存 API の **地図を持たない** まま進むと、同じコードベース内に劣化コピーが増殖する。

本書が扱う 5 つの罠:

| # | 罠 | 一言で言うと |
| -- | -- | -- |
| α | **ユーザー語彙の字義的実装** | 「モードに分けたい」を `editorMode` state + タブ UI にする |
| β | **二択思考 (A or B)** | 「useRef で解決」で止まり、useRef **and** useState が必要な事例を落とす |
| γ | **汎用 API の安易選択** | `updateX` を呼んだら `updateXStyle` という specific 版があり副作用を起こす |
| δ | **ドキュメント先行原則の崩壊** | 実装を先に通して後から spec を書く ─ SSoT が失われる |
| ε | **デフォルト値の二重責務** | `defaultStyle` が UX preview と export output の両方のデフォルトを兼ね、片方を最適化するともう片方が壊れる |

---

## 罠 α: 「ユーザーの言葉」を UI 構造にしてはいけない

### 症状 (本事例)

ユーザー: 「校閲モードとレイアウトモードに分けたい」
→ 素直な実装: `editorMode: "proofread" | "layout"` state + 上部にタブ UI 追加

### 実体

プロジェクトのアーキテクチャ原則 (本事例では `design_mock/docs/director.md §6 W-05`):

> **W-05: モードトグルボタンを明示的に設けること** — 文脈 (キーボードの出入り / ジェスチャーの種類) で自動変形する。ユーザーに「モードを意識させない」のが原則

素直なタブ UI 実装は原則に **真っ向から違反**。正解は gesture-based implicit mode (タップ → テキスト編集、ドラッグ → 位置調整) で、ユーザー語彙「モード」を **UI 上から完全に消す**。

### 構造的な原因

- ユーザーの語彙 = 自然言語ラベル
- 実装候補 = UI 構造
- 両者を **区別せずに「単語 → コンポーネント」変換** を脳内で自動実行してしまう
- 特に AI は「ユーザーが使った単語を実装名にする」ことを "妥当" として生成する

### 解毒手順

1. ユーザーが新しい概念名 (モード / タブ / ビュー 等) を使った瞬間、**実装方針決定を一度保留**
2. プロジェクトの **アーキテクチャ最終裁定ドキュメント** を開く
   - 本事例: `design_mock/docs/director.md`
   - 他プロジェクトで類似: `docs/ARCHITECTURE.md` / `PRINCIPLES.md` / `README.md` の「設計原則」節
3. 「提案中の構造は、この原則と矛盾しないか?」を照合 (特に禁止パターン表があれば全件確認)
4. 矛盾する場合、**ユーザーの深層意図** を再抽出:
   - 「モード分離したい」 → なぜ? → 「操作で迷いたくない」「誤爆したくない」
5. 深層意図を満たし、かつ原則と整合する設計を **別途生成**
   - 本事例: implicit mode (gesture で暗黙に切替)

### シグナル

- ユーザー発話の単語が、そのまま UI コンポーネント名 / state のキー名になりそうな設計
- アーキテクチャ文書を開かないまま実装方針を決めた自覚
- 「でもユーザーがこう言ったから」という自己正当化が脳内で鳴る瞬間
- サブエージェントレビューで「アーキテクチャ原則 §XX 違反」と指摘される

### サブ項目 α-1: 「〜に置いて / 〜に追加して」配置依頼はスコープ確認後に翻訳 (v1.3 で追加)

> **2026-05-06 export button relocation 事案で発覚** (`knowledges/2026-05-06_export-button-relocation-design-retrospective.md`).

#### 原則

「export ボタンをテロップメニューに入れて」のような **配置依頼** は、置く先の **スコープ (segment scope / document scope / app scope)** が機能のスコープと一致するかを確認してから翻訳する。

- `TelopActionModal` = segment scope (1 セグメント単位の操作: 削除 / 分割 / スタイル)
- `baseOpsBar` = document scope (動画全体の操作: undo / redo / export)
- `headerActions` = app scope (アプリ全体: 設定 / ヘルプ)

機能スコープと配置先スコープが食い違う依頼は **深層意図** を再抽出する。「テロップメニューに入れて」の本意は「ヘッダーから消して動画プレビューを大きく戻したい」(画面占有率の問題) だった。

#### 解毒手順

- 配置依頼を聞いたら **「この機能のスコープ (segment / document / app)」と「置き先のスコープ」が一致するか** を即確認
- 一致しない場合は **「なぜそこに置きたいのか」を 1 回逆質問** (画面占有 / 視線移動 / 親指動線等の深層意図)
- 真因が判明したら **配置依頼の字義を捨てて深層意図に応える** 設計案を出す (例: ヘッダーから移動 + baseOpsBar 右端アイコンで常時露出)

#### シグナル

- 「X を Y に入れて」「Y に追加して」という配置/格納依頼
- 配置先のコンポーネントが扱う対象の粒度 (segment vs document) と機能の粒度がズレている
- 既存仕様 (CLAUDE.md §2 等) に「Y は ○○ scope」と明記されている

### サブ項目 α-2: 方向ボキャブラリは座標系で再定義してから実装 (v1.3 で追加)

> **2026-05-05 swipe boundary t=0 seek 事案で発覚** (`knowledges/2026-05-05_swipe-boundary-t0-seek-design.md`).

#### 原則

ユーザー語の方向 (左 / 右 / 前 / 次 / 戻る / 進む) は **画面座標系 / 時系列 / index 順序** のいずれかで再定義してから実装する。同じ「左」でもユーザー視点と実装視点で意味が反転することがある。

例: 「左スワイプで前のセグメントに戻る」
- ユーザー視点: 左スワイプ = 過去を表示 = 「戻る」
- 実装視点: 左スワイプ = `dx < 0` = `direction === "left"`
- だが「次のセグメントに進む」は実装上 `dx > 0 = "right"` でも、UI の動きは「セグメントが左に流れる」(現在のセグメントが左に消えて次が右から来る) ため、ユーザー語の「右」とは一致しない

#### 解毒手順

- 方向語が出たら **「画面座標 (dx > 0 / dx < 0)」「時系列 (前 / 次)」「index (i-1 / i+1)」のどれを意味するか** を 1 回確認
- spec に **座標系 + 時系列 + UI 動作** を併記する (例: 「左スワイプ (dx < 0) = 次のセグメント (i+1) を表示 = UI は現セグメントが左に流れる」)
- 実装の `direction === "left/right"` リテラルが座標系か時系列か **コメント明記**

#### シグナル

- 「左 / 右 / 前 / 次 / 戻る / 進む」のいずれかが要求文に含まれる
- swipe / scroll / arrow-key 系の UI を扱っている
- すでに実装したコードで `direction === "left"` / `dx > 0` のどちらが使われているか分からなくなる瞬間

---

## 罠 β: 「A or B」が既知パターンの時こそ「A and B」を疑え

### 症状 (本事例)

「handler 内で最新値を参照したい → `useRef` を使う」という既知パターンを適用した結果、JSX 再描画が走らず UI が凍結した (loop preview 機能で `isLoopPreviewing` を ref のみで管理)。

### 実体

| 要件 | `useRef` 単独 | `useState` 単独 | 併用 (正解) |
| -- | -- | -- | -- |
| handler 内で最新値参照 | ✅ | ❌ (stale closure) | ✅ |
| JSX 再描画トリガー | ❌ (凍結) | ✅ | ✅ |

**正解: 両方使う二重管理** (ref は latest 値 accessor、state は render trigger、set 時に両方更新)。

### 構造的な原因

- 技術的な既知パターンは「A **または** B のどちらか」という択一の形で記憶される
- 実際の問題が **両方の性質が必要** な時、既知パターンの自動適用は `A or B` の境界で止まる
- 「A でも B でもない、A **and** B」という第 3 選択肢が視野から落ちる
- 「A で解決した、B は捨てる」という自己確信で探索が終わる

### 他領域での発火例 (汎化)

| 領域 | A or B に見えるが A and B が正解 |
| -- | -- |
| React state | `useRef` vs `useState` (本事例) |
| Store 設計 | local state vs global store (derived + source of truth) |
| 同期処理 | sync vs async (sync で書いて async wrapper を足す) |
| Merge 戦略 | shallow vs deep (field 単位で使い分け) |
| 認証 | session vs token (session で UI state、token で API 呼び出し) |

### 解毒手順

1. 「A で解決した」と思った瞬間に、**B の性質が本当に不要か** を紙に書いて確認
2. B が必要そうな兆候 (本事例なら「UI が凍結」「stale closure」) が一つでも出たら、**A and B** を検討
3. 双方に明確な責務を割り当てる:
   - 本事例: ref = "current" accessor, state = render trigger
4. 更新時は両方を synchronous に更新する **ラッパー関数** を用意 (片方だけ更新する忘れ防止)
5. 責務境界をコメント 1 行で明記 (`// ref: handler latest / state: render`)

### シグナル

- "pattern X を使えば解決" という確信が異常に強い
- "pattern X の欠点 Y は許容" と自分に言い聞かせている (実はそれがバグになる)
- 既知パターンの負の面を説明する word が設計議論で全く出てこない

---

## 罠 γ: 既存 API は「一番ふさわしい粒度」を探す

### 症状 (本事例)

「テロップの位置を更新する」→ `updateSegment(id, { offsetX, offsetY })` を呼ぶ実装方針
→ 実体: `updateSegment` は segment を **shallow merge** で上書きするため、`style.fontSize` などの他フィールドが消える。

### 実体

既存コードには **より specific な API** が存在:

| API | 挙動 | 本ケースでの影響 |
| -- | -- | -- |
| `updateSegment(id, patch)` | segment 直下を shallow merge | style 配下の全フィールドが消える |
| `updateSegmentStyle(id, patch)` | style を deep merge | 他 style フィールドを保持 |

後者を使えば副作用なし。

### 構造的な原因

これは `meta-spec-phase-hallucination.md` §形態 B (Phantom API) の **兄弟パターン**:

| 形態 | 内容 | 被害 |
| -- | -- | -- |
| B (phantom) | **存在しない** API を想像 | 劣化コピーが作られる |
| **γ (wrong-grain)** | **存在する汎用 API** を使い、より適切な specific 版を見逃す | 既存 specific API の積み上げを迂回して副作用を起こす |

両者とも根本原因は「実装前に既存 store の API 地図を grep で作らずに書き始める」こと。

### 解毒手順

1. CRUD 動作 (`update*`, `add*`, `remove*`, `set*`, `apply*`) を書こうとしたら、**まず grep で API カタログを作る**:
   ```bash
   rg -n "^\s*(add|update|remove|set|apply).*(Segment|Style|Selected|All)" lib/store.ts
   ```
2. 候補 API を **2〜3 件列挙** し、各々の実装内部 (特に `Object.assign` か spread か、shallow か deep か) を読む
3. specificity の最も高いものを選ぶ:
   - `updateSegment` (全体) < `updateSegmentStyle` (style のみ) < `setOffset` (position のみ)
4. 該当 API が無い場合のみ新設を検討 (この時は spec に file:line 参照を必ず書く)

### シグナル

- 最初に思いついた API 名が `updateFoo` のような **一般名**
- その API の実装を **読まずに** 仕様書・タスクに書いた
- `update.*(Style|Position|Color|Size)` のような specific 関数名を grep 一度もしていない
- store ファイルの API 一覧を自分で **列挙できない**

### サブ項目 γ-1: データ変換関数が「捨てた量」を返さないと下流で復元不可能 (v1.2 で追加)

> **2026-05-02 whisper timing offset 事案で発覚 (`2026-05-02_whisper-timing-offset-fix.md`).** `trimSilence(audio)` という前処理関数が**先頭の無音区間をトリムした秒数 (`removedDurationSec`) を返さなかった**。Whisper STT は trim 済み音声を受け取って `[start, end]` をトリム後座標で返すが、player は元動画の座標で再生する。結果、字幕表示が常に `removedDurationSec` 分早く表示される (例: 0.8 秒分の無音をカットすると 0.8 秒早く出る)。

#### 原則

データ変換関数 (trim / crop / normalize / filter / compress) を設計するとき、**「捨てた / 変換した量」を戻り値に含めるかは関数仕様の一部**として明示する。返さない場合は **lossy** であり、下流で逆変換できないことを呼び出し側が知っている必要がある:

```typescript
// ❌ lossy (offset を捨てる)
function trimSilence(audio: Audio): Audio { ... }

// ✅ 可逆 (offset を返す)
function trimSilence(audio: Audio): { trimmed: Audio; removedDurationSec: number } { ... }
```

#### 解毒手順

1. 既存のデータ変換関数を呼ぶ前に **戻り値の型を必ず確認** し、「捨てた量」が返ってくるかを確認
2. 返さない場合は **どこで補正するか** (呼び出し側 / 別関数 / 諦める) を spec に書く
3. 自分で変換関数を新規作成するときは「将来下流で逆変換が必要になるか」を検討し、必要なら戻り値に offset を含める

#### シグナル

- 「動画と字幕がズレる」「画像と座標がズレる」「ファイルと位置がズレる」系のバグ
- 変換関数の戻り値型が `Foo` 単体 (offset / scale / metadata なし)
- 同じ変換を 2 回かけると 2 倍ズレる

### サブ項目 γ-2: FSM の TRANSITIONS 定義を grep せずに汎用 action を呼ぶ (v1.2 で追加)

> **2026-04-29 manual telop 追加事案で発覚 (`2026-04-29-addSegment-manual-telop.md`).** 「手動テロップ追加 → 即編集モードで開く」を実装するため、既存の `tapTelop` action を呼んだ。しかし FSM の TRANSITIONS 定義では **`EDIT` state 中の `tapTelop` は `ACTION_MODAL` (削除/コピー/スタイル変更モーダル) へ遷移する** 仕様だった。手動追加時にユーザーは編集中ではないため `IDLE` から `EDIT` に行くと期待していたが、実装の context 次第で全く違う state に飛ぶ。

#### 原則

FSM (state machine) の action を呼ぶとき、**TRANSITIONS テーブル全件を grep してから** 呼ぶ:

```bash
# action が現在 state ごとにどこへ遷移するかを列挙
rg -n "tapTelop|TAP_TELOP" lib/fsm/ store/

# 該当 action の遷移先が複数ある場合は、呼び出し時の state を確認
```

汎用 action 名 (`tap` / `select` / `confirm`) は **複数 state から呼ばれる前提** なので、特に注意。「目的の state に行く action」ではなく「**現在 state から目的 state へ最短で行く action**」を選ぶ。該当 action がなければ **新しい遷移を TRANSITIONS に追加** (spec に明記)。

#### シグナル

- 「ボタンを押したのに想定と違う UI が出る」
- FSM の action 名が動詞 (`tap` / `confirm`) で、複数の state からハンドルされている
- TRANSITIONS テーブルを grep せずに action を呼んだ

---

## 罠 δ: 「実装 → 後追い spec」は AI 協働を破壊する

### 症状 (本事例)

プランニング承認フェーズを飛ばして実装に突入 → `spec/telop-editor-v2.md` と `tasks/task_54〜63.md` が **実装完了後に** 作成された。
実装は動いているが、spec が "何を解決したか" の 記録にならず、"動いたものの事後説明" になってしまう。

### 実体

後続の AI (Codex / Copilot / 次セッションの Claude) は:

- spec を **SSoT** として信じる
- 後追いで書かれた spec は記憶・要約になっていて、**意図・制約の根拠** が薄い
- テストは「動作の固着」にしかならず「仕様の検証」にならない
- 3〜4 週間後に変更が入ると、制約の理由がわからず **デグレが直せない / 過剰防御が消せない**

### 構造的な原因

| 要因 | 機序 |
| -- | -- |
| **即時フィードバック欲** | "早く動くものを見たい" バイアスが強い |
| **spec ROI 不可視** | spec 先行の価値は 3 週間後に効き、事前には見えない |
| **AI の加速効果** | AI が実装を高速に出すので、spec 書く時間のほうが "遅い" と錯覚する |
| **承認待ちの摩擦回避** | ユーザー確認を挟むより手を動かす方が楽に感じる |

### 解毒手順

1. **順序を物理的に強制** する:
   - `spec/` ができるまで `tasks/` は作らない
   - `tasks/` ができるまで `components/` は触らない
   - 承認ゲートを明示 (「spec レビュー OK が出るまで実装コミット禁止」)
2. **ドキュメント完成ゲート** を タスクの最後ではなく **最初に** 置く
3. AI エージェントへの依頼文に「spec が無ければ実装に着手しない」を明記
4. 後追いで書かれた文書は `spec/` ではなく `knowledges/` に降格 ─ spec 扱いせず、実装の説明書として扱う (本事例もこのルール適用で `knowledges/2026-04-22_ux-overhaul-planning.md` として保存)

### シグナル

- プランニング中にコードを書きたい衝動
- 「先に動かしてから文書化しましょう」という発言 (自分・他者問わず)
- サブエージェントに spec レビューを依頼できない状態 (文書がまだ存在しない)
- コミットログを見ると `feat:` が先に並び `docs(spec):` が後から来る

---

## 罠 ε: 「デフォルト値」が複数の責務を黙って兼任する

> **v1.1 で追加 (2026-04-23).** `ux-overhaul-v2` 計画フェーズで、`defaultStyle.bgOpacity = 0` によりエクスポート結果のテロップ背景が完全透明になっていたことが発覚。UX 上の「未設定 = シンプル」と export 上の「未設定 = デフォルト品質」が同じ object で管理されていた。

### 症状 (本事例)

`lib/store.ts` の `defaultStyle` には `fontSize: 80` / `bgOpacity: 0` / `color: ...` 等が定義されている。この object は:

- **用途 1 (UX preview):** 新規テロップ生成時、ユーザーが触る前の初期値
- **用途 2 (export output):** ユーザーが何も触らなかったテロップをエクスポートするときの確定値

両者のデフォルト値の最適解は **全く別物**:

| 用途 | `bgOpacity` の最適値 | 理由 |
| -- | -- | -- |
| UX preview | 0 (背景無し) | プレビュー上では動画が見えないと困る |
| export output | 0.5 前後 | 書き出し時は可読性のため背景が必要 |

しかし同じ object を参照させていたため、preview を優先 → export が崩壊、export を優先 → preview で邪魔、というゼロサムが発生。

### 実体

- デフォルト値は **1 つの object で複数の consumer が取り出す** のが一般的設計
- consumer の要求が **相反する** とき、object はどちらか一方に寄せるしかない
- "デフォルトは 1 つ" という素朴な直感が、**責務を兼任していることへの疑問** を奪う

### 構造的な原因

| 要因 | 機序 |
| -- | -- |
| **SSoT 信仰の副作用** | 「デフォルトは 1 箇所にまとめるべき」という DRY 原則が過剰適用され、用途別の分離を許さない空気になる |
| **プレビュー == 出力の錯覚** | WYSIWYG 設計思想 (preview と output が同一) が前提になりすぎて、"プレビューは視認用 / 出力は完成品" という**用途差**が見えなくなる |
| **デフォルト = 未設定 の多義性** | 「ユーザーが触っていない」という事実が "UI 上のプレースホルダ" なのか "出力品質の正解" なのかが仕様上未分離 |
| **テストでは気付けない** | unit test は `defaultStyle` を mock で上書きするか、固定値で assert するので、preview と output の値が同じで良いかは検証されない |

### 他領域での発火例 (汎化)

| 領域 | 二重責務デフォルトの例 |
| -- | -- |
| フォームの初期値 | DB 投入時の "null 許容" と UI 入力時の "空文字" が同じ constant で扱われる |
| 通知設定 | "新規ユーザーの初期値" と "機能リリース時の既存ユーザー default" が同じ object |
| API response | "データ無し" のレスポンス形と "取得失敗時のフォールバック" が同じ型 |
| 環境変数 | `development` と `production` が同じ `default.json` を read してから override する (片方を直すと他方が壊れる) |
| テーマ | light / dark の "未指定時のデフォルト" が同一 |

### 解毒手順

1. デフォルト値を書く前に **consumer を全て列挙** する (e.g., `editor-preview`, `timeline-thumb`, `export-renderer`)
2. 各 consumer に対して「この値が最適か」を表で書く
3. 表が **全 consumer 同一** のときだけ単一 object を許可。**1 件でも相反する** なら:
   - **用途別 default を分離** する (`defaultStyleForEditor` / `defaultStyleForExport`)
   - あるいは **"未設定" を明示的に null / undefined で表現** し、consumer 側で用途別 fallback を書く (`style.bgOpacity ?? EXPORT_FALLBACK_BG_OPACITY`)
4. Store 設計レビューでは「この default は何の consumer のために最適化されているか」を 1 行コメントで明記 (`// export 最適化 / preview 用は EDITOR_DEFAULT を使う`)
5. 新しい consumer が増えたら、既存 default が新 consumer にも最適か **必ず再検証** (増やすたびに責務兼任が深化する)

### シグナル

- 「デフォルト値を変えたら別の機能が壊れた」という修正履歴
- `defaultX` / `INITIAL_X` / `DEFAULT_X` が **3 箇所以上** で import されている
- Consumer によって "デフォルトの意味" が変わる (編集中 = 未設定、出力時 = 推奨値) のに同じ object を使っている
- 「プレビューと出力が違う」バグを report された直後に、"デフォルト値を変えると別ビューが崩れる" で膠着している

### 罠 γ との違い

| 罠 | 対象 | 問題 |
| -- | -- | -- |
| γ (wrong-grain API) | **書き込み API** の粒度 | `updateSegment` で style が破壊される |
| ε (shared default) | **読み取りデフォルト** の責務 | 同じデフォルトを複数 consumer が使う |

両者とも「既存 API / 既存値を grep で地図化していない」が根本だが、γ は write 側、ε は read 側 (初期値供給側) の違い。

### サブ項目 ε-1: cross-cutting state 補正は全 consumer に対称適用必須 (v1.2 で追加)

> **2026-05-02 whisper timing offset 事案 (`2026-05-02_whisper-timing-offset-fix.md`) の続編.** `removedDurationSec` を全 segment 時刻に補正する修正を入れたが、**`rawSttChunks` (再分割で使う元データ) には補正をかけ忘れた**。結果、初期表示は正しいが「セグメント分割」UI で再分割すると、再分割後のセグメントだけ再びズレた。「補正済みの世界」と「補正前の世界」が同一プロジェクト内に共存する状態。

#### 原則

cross-cutting な state 補正 (時刻オフセット / 座標変換 / スケール調整) は、**その state を読む全 consumer に対称適用** しなければならない。「片方だけ補正」は **罠 ε の派生** で、デフォルト値の二重責務と同じ症状を引き起こす。

```bash
# 例: removedDurationSec で補正すべき箇所を全て列挙
rg -n "\.startTime|\.endTime|\.start\b|\.end\b" lib/ components/

# 各ヒット箇所で「補正済みデータか / 生データか」を分類し、生データなら補正を追加
```

#### 解毒手順

1. 補正前 / 補正後の **データ境界を spec に明示** する (例: 「`rawSttChunks` は補正前」「`segments` は補正後」)
2. 新しく補正済みデータを使う consumer を追加するときは、その consumer が **どちらの世界のデータを期待しているか** を確認
3. 再分割 / 再計算系の機能を実装するときは、**元データ (raw) と派生データ (derived) のどちらをソースにするか** を決め、両方に補正が必要かを確認

#### シグナル

- 「最初は正しいが特定の操作後にズレる」「再計算するとズレる」
- 補正系の関数を呼んでいる箇所が **1 箇所しか無い** のに、補正対象データが複数の consumer に渡っている
- spec に「補正前 vs 補正後」のデータ境界が書かれていない

### サブ項目 ε-2: 「常時表示」ルールは例外状態リストとセットで初めて完成 (v1.3 で追加)

> **2026-05-06 export button relocation 事案で発覚** (`knowledges/2026-05-06_export-button-relocation-design-retrospective.md`).

#### 原則

「X を常時表示する」「Y を常に露出する」のような **常時ルール** は、必ず **例外状態リスト** とセットで定義しないと、modal / overlay / fullscreen との競合が後で必ず議論を再発させる。

例: 「baseOpsBar を常時露出」だけでは不完全。
- 完全形: 「baseOpsBar を常時露出。ただし `isFullscreen` / `isTelopListOpen` / `isBottomSplitOpen` の全画面状態では非表示を許容する」
- 例外リストが書かれていないと、新しい modal が追加されるたびに「baseOpsBar をどうするか」議論が再発する

#### 解毒手順

- 「常時 / 常に / どこでも」という言葉が出たら、**例外条件を即列挙する** (フルスクリーン / モーダル / オーバーレイ / キーボード表示中 等)
- 例外リストを spec / CLAUDE.md に **state 名で grep 可能な形** で書く (`rg -n "isFullscreen|isTelopListOpen|isBottomSplitOpen" components/`)
- 後で modal を追加する人が「baseOpsBar 例外リストに追加するか?」を判断できるようにする

#### シグナル

- 「常時 / 常に / どこでも / どの画面でも」という要求語
- 既に modal / overlay / fullscreen state が存在するアプリへの常時ルール追加
- 過去に同じコンポーネントの配置議論が複数回再発した履歴

### サブ項目 ε-3: 適応的閾値は「常に超えられる上限」をキャップで保証 (v1.3 で追加)

> **2026-05-07 post-split VAD boundary correction 事案で発覚** (`knowledges/2026-05-07_post-split-vad-boundary-correction.md`).

#### 原則

`noiseFloor * k` のような **適応的閾値** は、入力分布全体が高ピーク (e.g. 全フレーム話声) のとき閾値も連動して高くなり「**どのフレームも閾値を超えない**」退化を起こす。`Math.min(adaptive, maxPeak * c)` のような **上限キャップ** で「常に少なくとも 1 つは超えるフレームがある」を保証する。

例 (VAD):
- 退化形: `threshold = noiseFloor * 3.0`
- 完全形: `threshold = Math.min(noiseFloor * 3.0, maxPeak * 0.8)` — 全フレーム高ピーク時も `maxPeak * 0.8` でキャップされ、最大ピーク含む 20% 程度のフレームは必ず超える

#### 解毒手順

- 適応的閾値を書いたら、**「入力分布が均一に高い / 均一に低い」極端ケースで閾値が機能不全にならないか** を必ず検証
- 上限 (`Math.min(adaptive, peak * c)`) と下限 (`Math.max(adaptive, floor)`) の両方を検討
- ユニットテストに「全フレーム高音量」「全フレーム無音」のフィクスチャを入れる

#### シグナル

- ピーク / RMS / パーセンタイルから閾値を派生させている
- 「テストでは動くが特定の音源で全く検出されない」
- 適応的アルゴリズムを書いた直後に「キャップ / フロアは要らないだろう」と思った瞬間

---

## 🛡️ 総合チェックリスト — 設計ミーティング開始前に全件回す

- [ ] ユーザーの語彙に出てきた新概念を、そのまま UI 構造にしようとしていないか (**α**)
- [ ] アーキテクチャ最終裁定ドキュメント (`director.md` 等) を開いて禁止パターン表を全件照合したか (**α**)
- [ ] 既知パターンを "A or B" で適用した時、**A and B** の可能性を検討したか (**β**)
- [ ] パターン選択が A 単独の欠点を許容する自己正当化に陥っていないか (**β**)
- [ ] CRUD 動作を書く前に `rg` で既存 specific API を列挙したか (**γ**)
- [ ] 選んだ API の内部実装 (shallow vs deep merge, 副作用範囲) を読んだか (**γ**)
- [ ] spec → tasks → 実装 の順序を守れているか (**δ**)
- [ ] 実装済み機能について文書を書く場合、それは `spec/` ではなく `knowledges/` に入れているか (**δ**)
- [ ] デフォルト値 (`defaultX`/`INITIAL_X`) を触る時、全 consumer を列挙してそれぞれにとって最適か表で確認したか (**ε**)
- [ ] 1 つの default object が **preview 用と output/production 用** を兼任していないか (**ε**)
- [ ] 配置依頼 (「X を Y に入れて」) の機能スコープと配置先スコープが一致しているか確認したか (**α-1**)
- [ ] 方向ボキャブラリ (左/右/前/次/戻る) を座標系で再定義してから実装したか (**α-2**)
- [ ] 「常時表示」ルールを書いた時、例外状態リスト (fullscreen / modal 等) もセットで明文化したか (**ε-2**)
- [ ] 適応的閾値に上限キャップ (`Math.min(adaptive, peak * c)`) を入れたか (**ε-3**)

---

## 🎯 1 行サマリ

> **「ユーザーは語彙をくれる、コードはくれない。語彙 (機能名 / 配置 / 方向 / 順序) を原則と既存資産に照合してから実装方針を導け。デフォルト値は SSoT ではなく consumer の数だけ候補がある。常時ルールは例外リストとセット、適応的閾値はキャップとセット。」**

---

## 関連 souls

- [`2026-04-19_meta-ai-advisor-calibration.md`](./2026-04-19_meta-ai-advisor-calibration.md) — AI 助言側の毒抜き (本書は **人間の要求翻訳** 側を扱う)
- [`2026-04-20_meta-spec-phase-hallucination.md`](./2026-04-20_meta-spec-phase-hallucination.md) — spec 段階の **架空型/API** 検出 (本書 **罠 γ** の兄弟パターン ─ あちらは phantom、こちらは wrong-grain)
- [`2026-04-19_meta-debugging-when-stuck.md`](./2026-04-19_meta-debugging-when-stuck.md) — 詰まった時の突破技法 (罠に落ちた後の復旧に)
