# ブラウザランタイム非対称性 — 「テスト緑なのに実機で壊れる」を事前に殺す

**抽象化:** 2026-04-22 (`task_56/59 device-testing-readiness` + `ux-overhaul 8 バグ報告`) + 2026-04-23 (`ux-overhaul-v2` 計画フェーズで新発軸 5 を統合)
**適用範囲:** ブラウザで動く SPA / PWA / モバイル Web アプリ全般 (React / Vue / Svelte 等フレームワーク非依存)
**目的:** **jsdom/component テストが緑** でも **実機ブラウザで必ず壊れる** 5 つの非対称軸を事前に潰し、PARTIAL のまま実機テストに持ち込む負債を遮断する
**改訂:** v1.1 (2026-04-23) — 軸 5 (DOM 構造・スタイル定義の非対称) を追加。v2 計画フェーズで新発見した「DOM sibling は touch event を bubble しない」「CSS touch-action と JS inline touchAction の競合」を統合
**改訂:** v1.2 (2026-04-26) — ゲート D (PARTIAL 完了の証跡記録) を追加。ゲート A の対節として実機テスト **後** の証跡固定化を運用層に降ろす。詳細は [`2026-04-26_meta-task-graph-execution-discipline.md §ゲート 3 (Evidence Gate)`](./2026-04-26_meta-task-graph-execution-discipline.md) を参照
**改訂:** v1.3 (2026-04-27) — task_65 グローバルシークバー実装で発覚した 3 点を統合: (a) 軸 6 (iOS 固有 OS レイヤ UI 副作用 = callout / text-selection / 二重タップズーム) を新規追加、(b) 軸 2 に「video/audio の native 状態 (`timeupdate`) を表示 SSoT にしない」サブ項目を追加、(c) 軸 4 のセルフチェックが **checkbox メンタルチェック止まり** で実装値と乖離する故障モードを「grep 検証可能な形に書け」原則として独立節化
**改訂:** v1.4 (2026-05-02) — 2026-04-29 swipe 削除アニメ **5 回失敗** 事案 (`2026-04-29_swipe-animation-root-cause-investigation.md`) を統合。3 点追加: (a) 軸 5 サブ C「**同一操作の処理経路が複数 (React 合成イベント vs native overlay listener) ある場合、全経路に対称的な state 更新が必要**」を新設 — TelopOverlay span 経路だけ削除フラグを set して swipeOverlay native 経路で set 漏れ → 4 回失敗の根本原因。(b) 軸 2 サブ D「**描画/タイミング系バグで 1 回目の修正が外れたら、2 回目の実装前に必ず計測ログ (console.log で state 値・タイミング・DOM 状態) を取る — 推測ベースの反復は BLOCK**」を独立節化 — 4 回失敗の唯一の共通項は「計測なしで OS バグや WAAPI バグを疑い始めた」。(c) 既往事例に「BLOCK 化原則の二重風化」(原則は v1.3 で書いたが強制機構は無かった) を追加
**改訂:** v1.5 (2026-05-08) — 2026-05-04〜05-08 の 4 件 (split-segment swipe 表示バグ / swipe boundary t=0 / export button 配置 / iOS IME 4 連鎖バグ) を統合。4 点追加: (a) **軸 1 サブ B「Guard return より前の副作用は block されない」** を新設 — `if (snap zone) return;` で `selectSegment` を防いだのに `return` の上で `setCurrentTime(time)` を呼んでいたため経路 2 (`currentTime` → `findActiveSegment`) が素通り → 分割セグメント swipe 後にテロップ表示が更新されない (commit `c66f01f`)。(b) **軸 5 サブ D「複数の独立した *表示決定* 経路 — `?? fallback` の null/undefined 限定発火罠」** を新設 — v1.4 サブ C は「state を *書く* 経路の対称性」を扱ったが、**「state を *読む* 経路 (`activeByTime ?? activeSegmentId`)」が複数あるケースが未カバー**だった。`??` は null/undefined にしか fallback しないので、wrong-non-null (B1 を返す) 場合は永遠に救われない。(c) **軸 6 サブ B「React controlled input ↔ iOS IME composition セッションの根本競合」** を新設 — `<textarea value={value}>` の reconciliation は毎 render で `el.value = value prop` を無条件代入し、進行中の compositionstart を破壊する。`defaultValue` + `useLayoutEffect([value])` 手動同期 + `isComposingRef` guard が必須。さらに iOS は **変換中バックスペースで `compositionend` を skip** するため、`compositionend` でしか ref を reset しないと stuck する → `onChange` 経路でも ref reset 必須。(d) 既往事例にケース 6 (split-segment 2 経路) / ケース 7 (IME 4 連鎖) を追加。**メタ教訓: v1.4 サブ C を書いた時点で「対称性」の対象が write 経路に偏り、read 経路を含めなかったため、5 日後に同根の bug が再発した。サブ項目を追加する時は「同根のバリアント (read/write, sync/async, 子/親) を網羅したか」を必ず自問する。**

---

## 🧬 前提 — 「テスト緑 = 実機緑」は大嘘

プロジェクトが信頼している "テスト緑" には 3 段階ある:

| テスト層 | 環境 | 再現できないもの (= ここでは検出不可能) |
| -- | -- | -- |
| 単体 (Jest/Vitest + jsdom) | Node.js + jsdom | rAF 順序 / paint / passive listener / native video API / touch |
| コンポーネント (RTL) | 同上 + React DOM | play() pending / AbortError / onplay event 実発火 / スクロール最適化 |
| E2E (Playwright headless) | 実ブラウザだが headless | iOS Safari 固有のパッシブ既定 / キーボード占有 / safe-area |

**実機 iOS Safari でのみ露呈する 5 つの非対称軸** を閉じ込めるのが本書の目的。

既往事例の実測 (両方同じプロジェクトの別タスクで発火):

| ケース | テスト緑 | 実機現象 | 非対称軸 |
| -- | -- | -- | -- |
| `ux-overhaul` 8 バグ | ✅ 全 unit test passing | iPhone Safari で 8 件同時崩壊 (スワイプ/ドラッグ/タップ/分割/シーク/音声/書き出し/ボタンサイズ) | 4 軸全てに分散 |
| `task_56` ループプレビュー | ✅ component test passing | `play()` pending 中に `currentTime` 書き換え → AbortError (silently suppressed) → 無音・無反応 | 軸 2 |
| `task_59` スワイプ | ✅ `preventDefault` 呼ばれてる | React 合成イベントのため iOS では無視、ページスクロール | 軸 3 |
| `task_56` rAF guard | ✅ ロジック上は正しい | useEffect が rAF より先に走り guard 永続化 → `onPreviewTimeChange` 呼ばれず | 軸 1 |
| `ux-overhaul-v2` swipe | ✅ component test では swipe callback が発火 | テロップテキストの上からタッチすると swipe 不発 (sibling の overlay に bubble しない) | 軸 5 (sub A) |
| `ux-overhaul-v2` touch-action | ✅ CSS で `touch-action: none` 明記 | 実機でページが縦スクロールする (JS 側 inline style が `manipulation` で上書き) | 軸 5 (sub B) |
| `task_65` seekbar 反応断続 | ✅ jsdom 緑 (touch event 発火) | container 32px 内の 4px track 帯のみで `touchstart` 反応、ハンドル上下端で発火せず | 軸 4 (チェック乖離) |
| `task_65` seekbar 長押し | ✅ jsdom 緑 (callout 概念無し) | 長押しで Safari の callout (コピー / 検索 / 調べる) が UI を覆う | 軸 6 (新規) |
| `task_65` seekbar もっさり | ✅ unit test で currentTime 同期反映 | 指追従が 100〜250ms 遅延 (`timeupdate` ~4Hz が描画 SSoT になっていた) | 軸 2 (sub C) |

---

## 🚨 非対称 5 軸 — これが全ての "実機だけで壊れる" の正体

### 軸 1: イベントループ順序 (rAF vs useEffect vs microtask)

#### 発火パターン
「状態リセットを `requestAnimationFrame` で遅延したら、useEffect がそれより先に走って guard が永続化する」

#### 観測可能な事実
React の実行順序:
```
render → commit phase → flushSync useLayoutEffect → browser paint → rAF → useEffect (async)
                                                                ↑ここで resetRef を書いても
                                                                  既に useEffect 判定は完了
```

`rAF` は paint 後、`useEffect` は commit 後の async schedule。書き込みタイミングを読み違えると **ロジックは正しいのに永遠に発火しない** 状態が作れる。

#### テストで捕まらない理由
jsdom は rAF を setTimeout 0 にフォールバックしており、**順序が本物と違う**。Jest fake timer を使うとさらにズレる。

#### 解毒手順
- 状態リセットは **同期** で行う (`setState` / `ref.current = ...` を event handler 内で即座に)
- 「rAF で遅延」という最適化は、**遅延しても useEffect 判定に影響しない** ことを確認してからのみ採用
- 「なぜ rAF が必要か」を言語化できなければ rAF を書かない

#### サブ B: Guard `return` より前の副作用は block されない (v1.5 で追加)

> **2026-05-04 split-segment swipe 表示バグ事案で発覚** (`knowledges/2026-05-04_split-segment-swipe-telop-display-bug.md`). `onTimeUpdate` で `postSeekTargetIdRef` のスナップゾーン guard を追加し `selectSegment` の誤発火は防いだが、guard の `return` の **2 行上**で `setCurrentTime(time)` を無条件実行していた。結果、`selectedSegmentId` 経路は守られたが `currentTime` 経路 (`findActiveSegment(currentTime)`) は素通りし、テロップ表示が前のセグメントのまま固まった。

##### 原則

`if (条件) return;` の guard を追加した時、**`return` より前にある全ての副作用 (`setState` / `ref.current = ...` / `setCurrentTime` 等) は guard をすり抜けている**。guard コメントに「この guard が block する全ての副作用」を列挙し、副作用は guard より **下** に移動する。

##### 強制機構

- guard を書いた時、`return` より上にある `set*` / `*Ref.current =` 行を声に出して読み上げ、「この副作用も block 対象か?」を 1 つずつ判定する
- code review チェックリストに追加: **「新規 guard の `return` の上に副作用があれば、その副作用も guard 内に入れる必要がないか確認」**
- spec のセルフチェックに「[ ] guard で block するもの全てが return より下に置かれている (`rg -B5 "return;" components/<新規>` で確認)」

##### シグナル

- 「片方の経路は直ったがもう片方が動かない」
- 「`selectSegment` の呼び出しは止まったが、`currentTime` / DOM の見た目は変わらない」
- guard の説明コメントが 1 つの副作用しか言及していない (`selectSegment` の保護のみ等)

---

### 軸 2: 非同期状態の「同期真偽」誤認

#### 発火パターン
「`isPlaying` が true だから `play()` 中だと思って guard したのに、実際には `setIsPlaying(true)` が `onplay` イベントでしか呼ばれず、`play()` pending 中は false のまま → guard を素通りして `currentTime` を上書き → AbortError」

#### 観測可能な事実
React state には 2 種類の書き込み source がある:

| source | 同期/非同期 | 例 |
| -- | -- | -- |
| ユーザーコード内 `setState(...)` | **同期** (commit 後に確定) | handler 内で直接呼ぶ |
| ブラウザイベントハンドラ内 `setState(...)` | **非同期** (イベント発火後にのみ) | `videoEl.onplay = () => setIsPlaying(true)` |

後者を前者と混同して guard に使うと、**呼び出した瞬間には false** なので素通りする。

iOS Safari 固有:
- `videoEl.play()` は Promise を返し、連続で `currentTime` を書くと `AbortError` を投げる
- この AbortError は `.catch(() => {})` で **silently suppress** されがち

#### テストで捕まらない理由
jsdom の `HTMLMediaElement` は no-op。`play()` が即 resolve し、`onplay` も即発火するため、**本物の pending 状態** が存在しない。

#### 解毒手順
- 非同期イベント駆動の state を guard に使う前に、**同期の真偽源** (例: `videoEl.paused`) を直接参照する
- state flag の意味論を spec に明記: 「これは onplay でのみ true になる。play() 呼び出し直後は false」
- 連続呼び出し防止は **DOM の直接プロパティ** (`.paused`, `.readyState`, `.seeking`) を一次情報として扱う

#### サブ C: video/audio の native 状態 (`timeupdate`) を **表示 SSoT にしない**

> v1.3 (2026-04-27) で追加。task_65 グローバルシークバーで「ドラッグ中の指追従が 100〜250ms 遅延 (もっさり)」が発覚。原因は表示 progress を `currentTime` (timeupdate 駆動 state) だけに依存していたこと。

##### 観測可能な事実
- iOS Safari の `<video>.timeupdate` イベントは **~4Hz (250ms 間隔)** でしか発火しない (仕様上は 4〜66Hz の幅、実装依存)
- `touchmove` は 60Hz
- 「ユーザー入力 → DOM 書込 → native event → state → 再描画」の経路で **常に 100ms+ 遅延**
- さらに `videoEl.currentTime` を 60Hz 連発すると内部 seek が間引かれる (前 seek 完了前に上書き)

##### 解毒手順
- ドラッグ / スクラブ系 UI では **ローカル state 先取り**:
  ```typescript
  const [dragProgress, setDragProgress] = useState<number | null>(null)
  // touchmove で:
  setDragProgress(p)         // 表示は即座に更新
  videoEl.currentTime = p * dur  // 同期書込は維持 (軸 1 / 軸 2 ガード適用)
  // 表示は dragProgress ?? playedProgress
  // touchend で setDragProgress(null) → 通常モード復帰
  ```
- video / audio 由来の state を「表示の唯一情報源」にしてはならない (= input 由来の予測値で先取り)
- 表示と内部状態は **別の SSoT を持って良い** (drag 中はローカル predict、終了後に native 状態に戻る二段構成)

##### シグナル
- スクロール / ドラッグ / スクラブ UI が「もっさり」「指から遅れる」
- 表示用 progress / position が `currentTime` などの media-event 由来 state だけで計算されている
- `requestAnimationFrame` で fps を上げようとしているが、そもそも入力の元データが 4Hz

#### サブ D: 描画/タイミング系バグの計測ファースト原則 (v1.4 で追加)

> **2026-04-29 swipe 削除アニメ 5 回失敗事案で発覚.** 4 回連続で「iOS Safari の WAAPI バグ」「React 19 concurrent cleanup」「will-change の欠落」「stale DOM ref」を仮説立てて修正したが全て外れ。5 回目で `console.log("[swipe] start, deletedIds:", deletedIds.size)` 1 行を入れて即座に「set されていない」が判明。**4 回分のデバッグ時間 (推定 90 分) は計測 1 行で 1 分に圧縮できた**。

##### 原則

描画系・タイミング系・state 系のバグで **1 回目の修正が外れたら、2 回目の実装に進む前に必ず計測ログを取る**:

```typescript
// 状態の値:
console.log("[bug-name] state at trigger:", { x, y, isXxx, deletedIds: Array.from(deletedIds) });
// タイミング:
console.log("[bug-name] phase:", performance.now(), "event:", e.type);
// DOM の実体:
console.log("[bug-name] dom:", el.style.opacity, getComputedStyle(el).transform);
```

「OS バグ」「ブラウザバグ」「ライブラリバグ」を疑うのは、**自分のコードの計測が緑になってから**。計測なしで外部要因に飛ぶのは BLOCK。

##### 強制機構

- 同じバグに対する 2 回目の修正を計測ログなしで実装したら BLOCK (タスクを差し戻す)
- 5 回失敗事案では「3 種類以上の異なる仮説を立てて全て外した瞬間に **手を止めて計測**」が決定的なターニングポイント

---

### 軸 3: パッシブリスナーのグローバル伝染

#### 発火パターン
「React 合成イベントの `onTouchStart={(e) => e.preventDefault()}` を書いたがページがスクロールする」
「native `{ passive: false }` listener を足したのに、別の useEffect で passive:true の listener も同要素に付けており、スクロール最適化から外れて 50-100ms のレイテンシ発生」

#### 観測可能な事実
- iOS Safari は `touchstart/move/wheel` を **デフォルト passive:true** として扱う (パフォーマンス理由)
- React 合成イベントは内部で passive listener として登録されるため、`preventDefault()` は **無視される**
- 同一要素に passive:true と passive:false が混在すると、ブラウザはその要素全体を **scroll blocker 候補** として扱い、**全リスナーのスケジュールが遅延**

#### テストで捕まらない理由
jsdom は passive オプションを無視し、`preventDefault()` は常に有効。component test では常に "スクロール止まってる風" に見える。

#### 解毒手順
- `preventDefault()` が必要な touch/wheel は **必ず native `addEventListener` + `{ passive: false }`**
- 同一要素に `passive:true` と `passive:false` を **絶対に混在させない** (一方に統合する)
- `touch-action: none` を CSS で併用 (ただし長押しテキスト選択も止まるため UX 要件と照合)
- `touch-action: manipulation` は panning を許可するため **スクロール防止には不十分**

---

### 軸 4: 物理制約 (キーボード / safe-area / タッチ幾何)

#### 発火パターン
「デスクトップで綺麗に見えるレイアウトが、iPhone でキーボードを出すと下部 UI が全部消える」
「safe-area 対応したつもりが `env(safe-area-inset-*)` が 0 を返す」
「44px 未満のボタンが誤タップを誘発する」

#### 観測可能な事実
- iOS システムキーボードは画面の **40〜50%** を強制占有 (これは物理法則、設計ではない)
- `env(safe-area-inset-*)` は **`viewport-fit=cover` 必須**、なければ常に 0
- iOS Safari の Web Vitals 推奨タッチターゲット: **44×44 px 以上**

#### テストで捕まらない理由
jsdom/RTL はビューポートサイズを任意に設定できるが、**キーボード出現のレイアウト変更** は再現しない。CSS `env()` も 0 として扱われる。

#### 解毒手順
- `<meta name="viewport" ... viewport-fit=cover>` を最初に設定
- レイアウトは **flex + object-fit** で残り空間に追従、px 固定高さ禁止
- タッチターゲット 44px は **CSS 書きながら即確認** (MEDIUM 以上の警告とする)
- プロジェクトに **"物理制約" 参照ドキュメント** を用意 (本プロジェクトでは `director.md §3`)

#### サブ Z: spec のセルフチェックは **grep 検証可能な形** に書け

> v1.3 (2026-04-27) で追加。task_65 で軸 4 セルフチェック「[x] ハンドルのタッチターゲットは 44px 以上」がチェック済みだったにもかかわらず、CSS の `seekbarContainer { height: 32px }` と矛盾していた。**チェックリストにマークしただけで実装値と照合されていなかった**。

##### 故障モード
- 「[x] タッチターゲット 44px 確保」のような **抽象表現** のチェックは、人間 (or AI) が「気持ち的に確認した」だけで checkbox が埋まる
- 実装値 (`height: 32px`) と矛盾していても誰も気付かない
- 既存軸 4 で「44px 必須」と原則化していたのに **再発** したのは、原則の存在ではなく**強制機構の不在**が原因

##### 解毒手順
- spec のセルフチェック項目は「**実装定数を grep で機械検証可能**」な形で書く:
  - ❌ `[ ] ハンドルのタッチターゲットは 44px 以上に拡張`
  - ✅ `[ ] seekbarContainer の height: 44px が CSS に存在する (rg "seekbarContainer\s*\{[^}]*height:\s*44px")`
- 同様に grep 検証できる原則:
  - `viewport-fit=cover` が `app/layout.tsx` に存在
  - `touch-action` の重複定義 (CSS / JSX) が無い
  - `passive: false` を要求する箇所で `passive: true` が混在しない
  - callout 抑制 (`-webkit-touch-callout: none`) がタッチ可能要素に存在
- セルフチェック完了時は **そのチェック項目に書かれた grep コマンドを実際に走らせて結果を knowledges に貼る** (チェックボックス埋めるだけは禁止)

##### シグナル
- spec のセルフチェック項目が「〜以上」「〜禁止」「〜確保」など **動詞・形容詞** で終わっていて、grep する対象が無い
- 「軸 X はチェック済み」と申告された後の実機で軸 X 起因の不具合が出る
- 同じ原則違反が異なるタスクで反復

---

### 軸 5: DOM 構造・スタイル定義の非対称性 (sibling bubble / CSS vs inline style)

> **v1.1 で追加 (2026-04-23).** `ux-overhaul-v2` 計画フェーズで新発。テスト環境 (RTL) ではコンポーネント props 経由でイベントが届くが、実機 DOM では **DOM 親子関係とスタイル優先順位** が別のルールで動いている。

#### 軸 5-A: DOM sibling は touch/pointer event を bubble しない

##### 発火パターン
「スワイプ検出の overlay ref に `onTouchStart` を登録したのに、その上に重ねている別コンポーネント (テロップ文字レイヤ等) の上をタッチしても overlay のハンドラが呼ばれない」

##### 観測可能な事実
- DOM event の bubble は **祖先方向 (parent-child)** にしか伝播しない
- 視覚的に重なっていても DOM tree 上で **sibling** の場合、`element.addEventListener('touchstart', ...)` は **イベントを一切受け取らない**
- 「z-index で上」「視覚的に重なっている」は event propagation に **一切関係しない**
- `pointer-events: none` / `pointer-events: auto` は hit-testing を変えるが、sibling 間の bubble は作らない

##### テストで捕まらない理由
Component test は多くの場合、子コンポーネントの prop callback を直接呼ぶか、テスト対象の要素に直接 `fireEvent.touchStart` する。**DOM tree 構造 + hit-testing + bubble 経路** の組み合わせを再現しない。

##### 解毒手順
- **子コンポーネント側に callback prop を渡す** パターンに統一 (e.g., `<TelopOverlay onSwipe={handleSwipe} />`)
- 兄弟要素での event 共有を **DOM event bubble に期待しない**
- 「視覚的に重なっている = event が届く」と思ったら即疑う
- どうしても DOM 上で受けたい場合: 兄弟をやめて **共通祖先** に listener を登録する (ただし hit-testing 範囲が広がるため要件再検証)

##### シグナル
- `stopPropagation()` / `preventDefault()` を呼んでいるのに **そもそもハンドラが走っていない**
- `e.currentTarget !== e.target` パターンで両者が別ツリーに居る
- DOM inspector で確認すると「上に乗っている要素」が swipe overlay の **子孫ではない**

---

#### 軸 5-B: CSS と JS inline style の同一プロパティ競合

##### 発火パターン
「CSS module に `touch-action: none` を書いたのに実機でスクロールが止まらない。原因は同コンポーネントの JS 側で `style={{ touchAction: 'manipulation' }}` が後から当たっていた」

##### 観測可能な事実
- inline `style=""` は CSS 宣言 (module / external) より **優先度が高い** (`!important` なしでは勝てない)
- 対象プロパティ: `touchAction`, `transform`, `pointerEvents`, `userSelect`, `overflow`, `position` 等 — **同じ DOM プロパティに**両側から書くと必ず inline 側が勝つ
- 特に `touch-action` は "none" / "manipulation" / "pan-y" 等で微妙な動作差があり、意図と逆が上書きされやすい

##### テストで捕まらない理由
`getComputedStyle` は JSDOM でも取れるが、inline style の上書きによる **意図逆転**は「設定した side」だけ見て確認したときに気付けない。人間の目視確認で「CSS 書いたからOK」と止まりがち。

##### 解毒手順
- 同一プロパティを CSS 側と JS 側の両方から書かない (片方に統一)
- レイアウト / 触覚系 (`touch-action`, `pointer-events`, `user-select`, `overflow`) は **CSS 側に寄せる**
- 動的に切り替える必要があるなら CSS variable 経由 (`style={{ '--touch-action': 'none' }}`) + CSS 側で `touch-action: var(--touch-action)` を使う
- spec レビュー時の grep 儀式に追加:
  ```bash
  # 同じプロパティが CSS module と JSX inline style で両方定義されていないか
  rg -n "touch-action|touchAction" components/ lib/ app/
  rg -n "pointer-events|pointerEvents" components/ lib/ app/
  rg -n "user-select|userSelect" components/ lib/ app/
  ```

##### シグナル
- CSS に書いたプロパティが実機で反映されていない
- JSX の `style={{ ... }}` に触覚系プロパティが混ざっている
- `getComputedStyle(el).touchAction` が CSS と違う値を返す

#### サブ C: 同一操作の処理経路が複数あるときの対称性検証 (v1.4 で追加)

> **2026-04-29 swipe 削除アニメ 5 回失敗事案で発覚.** swipe による削除には 2 つの処理経路が共存していた: (A) TelopOverlay の各セグメント span に付いた React 合成イベント (`onTouchStart` / `onTouchMove` / `onTouchEnd`)、(B) 全画面 swipeOverlay に native `addEventListener('touchmove', ..., {passive: false})` で付いた handler。削除確定時に (A) のハンドラだけ `setDeletedIds(prev => prev.add(id))` を実行し、(B) は同じ削除フラグを set していなかった。実機では **(B) の native handler が React 合成イベントより先に発火** するため、deletedIds が空のまま (B) のフェードアウト DOM 操作が走り、視覚的には「アニメせず瞬間消滅」して見えた。

##### 原則

同一の UI 操作 (swipe / tap / drag) に対して **複数の処理経路** が存在する場合 (React 合成 vs native listener / 子要素 vs オーバーレイ / 複数の useEffect で別々に register された listener) は、**全経路で同一の state 更新を行うことを grep で検証** する。

```bash
# 例: swipe 削除フラグの set が全経路に存在するか
rg -n "setDeletedIds|deletedIds\.add" components/

# native listener と React 合成イベントが両方触る state は一覧化
rg -n "addEventListener.*touchstart|onTouchStart" components/
```

##### 強制機構

- 「listener (A) で対症療法」より「DOM 構造で経路を分離」(B > A) が原則 (`task_65` で確立)。経路を分離できない場合は **必ず両経路で対称な state 更新** をペアで書く。
- 新しい native listener を追加したら、同じ要素・同じ祖先・同じ子孫に対する React 合成イベントハンドラを必ず grep で列挙し、共通の state 更新があるべきか確認する。
- spec のセルフチェックに「[ ] 経路 A/B/C 全てで <state> を更新している (`rg -n "setXxx" components/` で N 件ヒット)」のように **grep 検証可能な形** で書く (軸 4 サブ Z と同じ強制機構)。

##### シグナル

- 「アニメーションが効かない」「state が更新されない」「片方の経路だけ動く」
- `addEventListener` と `onXxx` が同じ要素 (または親子関係) に共存している
- 5 回連続で OS / ブラウザバグを疑ったが全て外れた → **DOM 経路の非対称を疑う**

#### サブ D: 複数の独立した *表示決定* 経路 — `?? fallback` の null/undefined 限定発火罠 (v1.5 で追加)

> **2026-05-04 split-segment swipe 表示バグ事案で発覚** (`knowledges/2026-05-04_split-segment-swipe-telop-display-bug.md`). v1.4 サブ C は同一操作の **書き込み経路** (event handler) の対称性を扱った。v1.5 サブ D は同一表示の **読み取り経路** が複数あるときの罠。

##### 原則

ある UI 表示が「経路 1: 明示的 state (`selectedSegmentId`) / 経路 2: 派生計算 (`findActiveSegment(currentTime)`)」のように **複数経路から決定される** とき、**片方を直しても他方が独立に間違った値を返し続ける**。

`activeByTime ?? selectedSegmentId` のような `??` 記法は **null/undefined のときだけ fallback する**。経路 2 が **wrong-non-null** (B1 を返してしまう) ケースでは fallback バイパスとなり永遠に救われない。

##### 強制機構

- 表示経路が複数あると気づいたら **どちらか一方を SSoT (Single Source of Truth) に統一する**。`?? fallback` で誤魔化さない
- 統一できない場合 (動画 SSoT の制約等) は **両経路を同期する補正レイヤ** を `seeked` などのイベントで挟み、補正後の値を **target 値 (`target.startTime`) で計算** する (経路 2 が参照する `currentTime` は iOS keyframe snap で B1 側に着地するため使用不可)
- spec のセルフチェックに「[ ] この表示を決める経路を全て列挙: __, __ / [ ] それぞれの経路に同じ修正/補正が入っている (`rg -n "findActive|selectedSegment|currentSegment" components/`)」

##### シグナル

- 「`selectSegment(B2)` を呼んだのに UI は B1 のまま」「`?? fallback` を入れたが直らない」
- ある分岐 (例: 分割境界、キーフレーム重なり) でだけ表示が固まる
- grep で同じ表示概念を返す関数/変数が 2 つ以上ある (`getCurrentTelop`, `findActiveSegment`, `displaySegment` 等)

##### v1.4 サブ C との違い (メタ教訓)

v1.4 サブ C は **「state を *書く* 経路」** (`onTouchEnd` / overlay listener) の対称性。v1.5 サブ D は **「state を *読む* 経路」** (`selectedSegmentId` 直読 / `findActiveSegment` 派生) の対称性。**対称性の対象が write/read の二系統あることに v1.4 時点で気づかず、5 日後に同根の bug を再発させた**。サブ項目を新設する時は **「同根のバリアント (read/write, sync/async, 子/親, 主動/受動) を網羅したか」を必ず自問する**。

---

### 軸 6: iOS 固有の OS レイヤ UI 副作用 (callout / text-selection / 二重タップズーム)

> **v1.3 で追加 (2026-04-27).** task_65 グローバルシークバーで「ハンドルを長押しすると Safari の callout (コピー / 検索 / 調べる) が UI を覆う」が発覚。CSS の `-webkit-touch-callout: none` / `-webkit-user-select: none` / `user-select: none` がプロジェクト全体で **一切指定されていなかった**。

#### 発火パターン
- ボタン / スライダー / ドラッグハンドルを長押し → コピー / 検索 / 調べる の callout menu
- テロップ文字を長押し → text selection が起動して編集を妨害
- ボタンをダブルタップ → 画面ズーム
- ドラッグ中に意図せず text selection が広がって UI を覆う

#### 観測可能な事実
- iOS Safari は touch-and-hold で **text selection / callout を即発火する仕様** (Web 標準ではなく iOS UA レベル)
- `-webkit-touch-callout: none` / `-webkit-user-select: none` / `user-select: none` の **3 行 全て必要** (一つでも欠けると挙動が変わる)
- ダブルタップズームは `<meta name="viewport">` の `user-scalable=no` だけでは不十分。`touch-action: manipulation` 以上の指定が要素レベルで必要
- これらは Android Chrome / PC Safari / Chrome では **再現しない** ため、開発機 + jsdom の組合せで完全に見落とされる

#### テストで捕まらない理由
- jsdom には callout / text-selection の概念が無い (no-op)
- Playwright headless でも iOS UI 副作用は再現しない
- Playwright iOS device emulation も完全模倣ではない (実機 or BrowserStack/Saucelabs 必須)
- 開発時の Mac Chrome では「Web 標準で動くから OK」のメンタルモデルで通過する

#### 解毒手順
- **タッチ可能 UI** (button / slider / drag handle / overlay) には全てに 3 行追加:
  ```css
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
  ```
- 「タッチ可能要素にだけ局所適用」原則を保つ (`body` 全体に当てると textarea や読み取り可能テキストにも影響)
- ダブルタップズーム抑制は要素単位で `touch-action: manipulation` (pan も止めるなら `none`)
- ユーティリティクラス化 (`.no-callout { ... }` を `globals.css` に置く) で 3 行貼り付けの反復を回避
  - ただし「全体適用」を意味しない命名 (`.touchable-no-callout` 等) にする
- spec のセルフチェック項目に追加 (grep 検証可能な形で):
  - `[ ] 新規タッチ可能要素に -webkit-touch-callout: none を含む CSS class が当たっている`
  - `rg "webkit-touch-callout" components/<新規>/`

#### シグナル
- 実機で長押しすると textbox の context menu が出る
- 指 2 本以上で意図せずズームする
- text selection の青い highlight が UI を覆う
- 「Web 標準で動くだろう」「browser default で OK」というメンタルモデルが脳内で鳴る
- `globals.css` / module css のいずれにも `-webkit-touch-callout` / `user-select: none` の grep ヒットが **ゼロ** で新機能を実装中

#### 軸 4 との違い
| 軸 | 対象 | 例 |
| -- | -- | -- |
| 軸 4 | レイアウト / 物理サイズ (キーボード / safe-area / 44px) | タッチターゲット / safe-area / 縦横比 |
| 軸 6 | iOS の **OS レベル UI 副作用** (callout / selection / zoom) | 長押し menu / ダブルタップ zoom / text 選択 |

軸 4 は「指で押せるか」、軸 6 は「指で押した時に **想定外の OS UI が出てこないか**」。

#### サブ B: React controlled input ↔ iOS IME composition の根本競合 (v1.5 で追加)

> **2026-05-08 IME 4 連鎖バグ事案で発覚** (`knowledges/2026-05-08_ios-ime-mobile-text-editor-investigation.md`). controlled `<textarea value={value} onChange={...}>` パターンは iOS Safari + Google 日本語入力で **無音失敗** する。

##### 観測可能な事実

1. React は毎 render で `el.value = value prop` を **無条件代入** する (差分があれば DOM 同期)
2. iOS の compositionstart は **DOM 直接書き換えで進行中**。React の `el.value =` 代入はそれを破壊する
3. iOS は **変換中バックスペースで `compositionend` を skip** し、再度 `compositionstart` を発火する → `compositionend` でしか ref を reset しないと stuck
4. desktop Safari と iOS Safari で挙動が違う (desktop は `compositionend` が必ず発火)

##### 解毒手順

- IME を扱う `<textarea>` / `<input>` は **uncontrolled (`defaultValue`)** にする
- 値同期は `useLayoutEffect([value])` で行う (`useEffect` は paint 後実行で flash する)
- `isComposingRef` (sync 判定用) と `isComposing` state (UI 反映用) を **両方** 用意し、必ずペアで更新する
- `compositionend` だけでなく `onChange` 経路でも **`isComposingRef.current = false` を実行** (iOS skip 対策)
- 親側 `onChange` でも `el.value` を読み出して reconciliation 経路を経由しない (`(e) => onChange(e.currentTarget.value)`)

##### 強制機構

- 新規 `<textarea>` / `<input>` を追加する時、`value=` (controlled) なら **赤フラグ**。即 `defaultValue` + `useLayoutEffect` パターンに置換するか、IME を扱わないことを spec で明示
- spec のセルフチェックに「[ ] IME を扱う input は uncontrolled (`rg -n "value=\\{" components/<対象>` で `value=` がヒットしない)」「[ ] `compositionend` と `onChange` の両方で `isComposingRef.current = false` を実行 (`rg -n "isComposingRef.current = false"` で 2 ヒット以上)」

##### シグナル

- 「文字を打ったら入力欄に表示されるが、変換確定するとカーソル位置に空白が残る」
- 「変換中バックスペースが効かない」「変換確定が無音で消える」
- desktop で動くが iOS Safari で動かない / Google 日本語入力でだけ壊れる
- `compositionend` 内で setState しているが、ログを取ると **発火していない**

##### v1.4 サブ D との接続 (計測ファースト原則の成功例)

本事案は v1.4 サブ D「描画/タイミング系バグの計測ファースト原則」が **初めて自然に発火し** 即解決した稀有な事例。`compositionstart`/`compositionend`/`onChange`/`isComposingRef.current` を console.log した瞬間「`compositionend` がそもそも発火していない」「ref が前操作の `true` で stuck」が即見えた。**推測ベース反復 (OS バグ → 入力モード → React state) を繰り返さず、計測 1 回で根本到達**。サブ D の強制機構は機能している。

---

## 🛡️ 実機テスト前ゲート — "PARTIAL" を実機に持ち込まない

既往事例の共通失敗は **「テスト緑のまま実機確認フェーズに進み、実機で複数バグが同時発覚して原因切り分けが困難化」**。これを防ぐゲート:

### ゲート A: PARTIAL タスクは実機テスト対象外

- タスクに `PARTIAL` / `TODO` / `実機で確認` 等の **未解消マーカー** が 1 つでも残っている間は実機テスト不可
- 未解消項目は **計画段階で観測可能な事実まで落とし切る** (サブエージェント反証ループ)
- 実機テストは「想定通り動くか」の確認であって「うまく動くか試す」ではない

### ゲート D: PARTIAL 完了の証跡記録 (実機テスト **後**) — ゲート A の対節

> v1.2 (2026-04-26) で追加。ゲート A は実機テスト **前** の搬入禁止だが、本ゲートは実機で確認した **後** の証跡管理を扱う。両者で PARTIAL の前後を閉じる。
> 詳細・解毒手順は [`2026-04-26_meta-task-graph-execution-discipline.md §ゲート 3 (Evidence Gate)`](./2026-04-26_meta-task-graph-execution-discipline.md) を参照。

- ゲート A は「PARTIAL を実機に出さない」までしかカバーしない。実機で確認した結果が `knowledges/` に残らないと、後セッションで「これ実機で動いてた?」が再現不能になる (task_66 スワイプ / task_71c 長押し D&D で実発生)
- PARTIAL タスクを完了扱いに昇格させるには、`knowledges/` に **実機確認セクション (日付 / 端末 / 観察)** を必ず残す
- 完了報告 commit より前に実機確認 commit を入れる順序を計画する
- 「実機で動いた、覚えてる」という人間の記憶は 1 週間で蒸発する前提で運用する

| ゲート | タイミング | 役割 |
| -- | -- | -- |
| ゲート A (本書) | 実機テスト **前** | PARTIAL を実機に持ち込むのを禁止 |
| ゲート D (対節) | 実機テスト **後** | 実機で確認したことを証跡として固定化 |

### ゲート B: 6 軸セルフチェック (実機に持ち込む前)

> v1.3 で軸 6 + 軸 2 サブ C + 軸 4 サブ Z (grep 検証) を追加。**全項目は grep / 実装値での機械検証が可能な形** で書くこと (チェックボックス埋めるだけは禁止 / 軸 4 サブ Z 適用)。

- [ ] **軸 1**: 非同期 API (`play`, `seek`, `load`) を呼ぶコードで、state/ref の更新順序を紙に書いた
- [ ] **軸 1**: `rAF` を使っているなら、なぜ必要か言語化できる
- [ ] **軸 1 (サブ B / v1.5)**: 新規 guard `if (...) return;` の `return` より上に `set*` / `*Ref.current =` / `setCurrentTime` 等の副作用がないか (`rg -B5 "return;" components/<新規>` で確認)。あれば guard 内に移動する
- [ ] **軸 2**: guard に使っている state が、同期真偽か非同期駆動かを確認した
- [ ] **軸 2**: DOM 直接プロパティ (`.paused`, `.seeking`, `.readyState`) で確認できるものはそちらを使用
- [ ] **軸 2 (サブ C)**: ドラッグ / スクラブ系 UI の表示が `timeupdate` 由来 state だけに依存していないか (ローカル state 先取り `dragX ?? nativeX` パターン適用済み)
- [ ] **軸 2 (サブ D)**: 描画/タイミング系バグで 1 回目の修正が外れた時、2 回目の実装前に **計測ログ (state 値・タイミング・DOM 状態)** を取った
- [ ] **軸 3**: `preventDefault()` が必要な touch/wheel はすべて native `{ passive: false }`
- [ ] **軸 3**: 同一要素に passive:true と passive:false が混在していない
- [ ] **軸 4**: `viewport-fit=cover` が設定されている
- [ ] **軸 4**: キーボード出現時のレイアウトを紙に書いた
- [ ] **軸 4**: タッチターゲット 44px 以上を CSS で目視確認済み
- [ ] **軸 4 (サブ Z)**: 上記 4 項目はすべて **実装定数を grep で検証可能** な形で spec に書かれており、grep 結果を knowledges に貼った
- [ ] **軸 5-A**: 視覚的に重なる要素間で event を共有する箇所は、DOM tree で祖先-子孫関係にあるか確認 (sibling なら callback prop 化)
- [ ] **軸 5-B**: `touch-action` / `pointer-events` / `user-select` / `overflow` が CSS module と JSX inline style で重複指定されていないか grep 確認した
- [ ] **軸 5 (サブ C)**: 同一操作の処理経路が複数あるとき、全経路の **state 書き込み** が対称になっている (`rg -n "setDeletedIds|deletedIds\.add|onTouchStart|addEventListener.*touch" components/`)
- [ ] **軸 5 (サブ D / v1.5)**: 同一表示を決める **読み取り経路** が複数あるとき、SSoT に統一するか両経路に同期補正を入れた (`rg -n "findActive|selectedSegment|displaySegment|currentSegment" components/`)。`?? fallback` で誤魔化していない (wrong-non-null では発動しない)
- [ ] **軸 6**: 新規タッチ可能要素 (button / slider / drag handle / overlay) すべてに `-webkit-touch-callout: none` + `-webkit-user-select: none` + `user-select: none` の 3 行が当たっている (`rg -l "webkit-touch-callout" components/<新規>/` で検証)
- [ ] **軸 6**: ダブルタップズーム抑制が必要な要素に `touch-action: manipulation` (or `none`) が指定されている
- [ ] **軸 6 (サブ B / v1.5)**: IME を扱う `<textarea>` / `<input>` は uncontrolled (`defaultValue` + `useLayoutEffect`)。`compositionend` と `onChange` の両方で `isComposingRef.current = false` を実行 (`rg -n "isComposingRef.current = false"` で 2 ヒット以上)

### ゲート C: AbortError / 無音 silent failure の可視化

- `.catch(() => {})` を本番コードから **原則削除** (せめて `console.warn(err)` で可視化)
- `play()` / `seek()` 周りは `try/catch` で err.name を判定し、AbortError なら **意図的に許容** とコメント明記

---

## 🔍 既往事例: なぜ防げなかったのか (done 分析)

### ケース 1: `ux-overhaul` 8 バグ (2026-04-22 done)

**構造:** 仕様書なし・タスクなし・テストなし・実機確認なし → 実機で 8 件同時崩壊

**なぜ防げなかったか:**
1. **テスト層の選択ミス**: unit test に偏重し、E2E/実機ゲートが存在しなかった
2. **物理制約ドキュメント不在** (director.md 作成前): 軸 4 の原則を参照する先が無かった
3. **AI 実装の "文法的緑"**: AI は TS コンパイル緑を「動いた」と報告するが、実機は別の条件を要求する

**教訓:**
- 新機能実装の最後のゲートは **必ず実機確認**
- そのゲートは "unit test が緑" で代替してはならない
- プロジェクト初期に軸 4 (物理制約) の裁定ドキュメントを整備する

### ケース 2: `task_56/59` PARTIAL 持ち越し (2026-04-22 done)

**構造:** 計画段階では PARTIAL と自覚していたが、実機テストに進もうとした → 反証ループ 2 周で軸 1/2/3 の複数バグが発覚

**なぜ防げなかったか (防ぎかけたが不十分だった):**
1. **軸 1 (rAF タイミング)**: "非同期で遅らせれば安全" という直感が誤り。反証ループで捕獲
2. **軸 2 (isPlaying 非同期)**: `use-audio-preview.ts` の `setIsPlaying` 呼び出し位置を **grep で読めば即分かる** が、「state 名から意味を推測」して読まなかった
3. **軸 3 (passive 混在)**: 2 つの useEffect で `touchstart` を別々に登録、統合していなかった

**教訓:**
- PARTIAL を残したまま実機テストに出してはならない (ゲート A)
- state flag の真偽タイミングは **grep して実装を読む** (`meta-spec-phase-hallucination` §形態 B の親戚)
- `rAF` / `passive` / `async state` は **3 点セットで疑う習慣** を持つ

### ケース 3: `ux-overhaul-v2` 計画フェーズ (2026-04-23 done)

**構造:** 2026-04-22 で B-12 (passive 混在) / B-06 (React 合成イベント) を director.md に BLOCK 化した **1 日後** のセッションで、別の sibling / inline style 問題で同等の "テスト緑・実機崩壊" が再燃

**なぜ防げなかったか (BLOCK 化したはずなのに再発した理由):**

1. **軸 5-A (DOM sibling 非伝播)**: **既存 souls に軸が無かった**。既存の軸 1〜4 は event loop / state 同期性 / passive listener / 物理制約をカバーするが、**DOM tree の構造そのもの** を扱っていなかった。視覚的な重なり (z-index) と event 伝播の不一致は **「重なっているから届く」という直感** が強く、コードレビューでも "props 経由ならOK" で止まりがち。
2. **軸 5-B (CSS vs inline style 競合)**: 同じプロパティを CSS module と JSX inline style の **両方から書いていないか** を検出する grep 儀式が無かった。片方だけ見て "設定済み" と判定して前進してしまう。
3. **B-12 自体の再発 (レガシー残留)**: `swipeOverlayRef` に passive:true と passive:false が混在する構造は `task_59` 実装時点から残っており、director.md に BLOCK 化しても **既存コードの cleanup タスクを別途立てなかった**。新機能実装者は legacy を触らないため、古い passive listener が残り続ける。

**教訓 (BLOCK 化した原則を風化させない運用):**

- **souls / director.md に BLOCK を追加した時は、必ず "既存コードの legacy 検出タスク" をペアで立てる** (grep で抵触箇所を列挙し、新規 tasks/ ファイル化する)。原則だけ追加して既存コードを放置すると、**新規実装で原則を踏むのではなく、既存コードの legacy と新規コードの相互作用で踏む**。
- 非対称軸は **1 度網羅すれば終わり** ではない。毎セッション新しい軸が見つかる前提で、"5 軸以外の実機崩壊" を発見したら必ず本書に軸を追加する (軸固定を疑う)。
- 軸 5-A (sibling / bubble) と軸 5-B (CSS vs inline style) は **「DOM 実体」と「コードで書いた内容」の乖離** という同根。軸 1〜4 が「時間軸 / 物理軸」の非対称なのに対し、軸 5 は「構造軸」の非対称。

### ケース 4: `task_65` グローバルシークバー 3 件同時発覚 (2026-04-27 done)

**構造:** 初回実装 `537dde1` 後の実機投入で 3 件同時発覚 — (a) ハンドル反応の断続、(b) 長押し callout、(c) ドラッグもっさり。

**なぜ防げなかったか (原則は存在したのに):**

1. **軸 4 (44px) は CLAUDE.md §2 に BLOCK 済み**だったが、**spec のセルフチェックを「マークするだけ」で実装値と照合していなかった**。「[x] ハンドルのタッチターゲット 44px」と書きながら CSS は `seekbarContainer { height: 32px }`。チェックリストの **形式が抽象表現** で、grep で検証できる形になっていなかった → **軸 4 サブ Z (grep 検証可能化)** を v1.3 で新設。

2. **軸 6 (callout 抑制) は既存 souls に概念ごと欠落**。`-webkit-touch-callout` も `user-select: none` も **プロジェクト全体で grep ヒット 0** の状態で新規 UI を追加していた。「Web 標準で動くだろう」のメンタルモデルで通過 → **軸 6 を v1.3 で新設**。

3. **軸 2 サブ C (video state SSoT) も明示記述が無かった**。軸 2 本体は「同期真偽 vs 非同期駆動」を扱っていたが、「`timeupdate` の発火頻度が 4Hz しかない」という **観測可能事実が独立節として存在しなかった**。`currentTime` を表示の SSoT にしてしまうのは **軸 2 の派生** だが、明示しないと再発する → **軸 2 サブ C を v1.3 で新設**。

**教訓 (BLOCK 化した原則を風化させない運用 v2):**

- 原則をマークダウンに書いただけでは強制力ゼロ。**spec のセルフチェック形式そのもの** に「grep 検証可能」を強制しなければ、BLOCK 済み原則も checkbox 偽装で素通りする。
- 5 軸 → 6 軸への拡張は、**「未知の軸が必ずある」** ことの証明。新しい実機現象に出会うたび「既存軸のサブ項目で扱える」のか「独立した新軸が必要」かを判断する習慣を持つ。今回は「OS レベル UI 副作用」が軸 4 (物理制約) の枠を超えていたので新軸化。
- 「既存原則に書いてあるから OK」は **チェック実施の代替にならない**。原則の存在 = 強制機構の存在、ではない。

### ケース 5: `swipe-animation` 削除アニメ 5 回失敗 (2026-04-29 done)

**構造:** swipe で削除した瞬間にアニメーションが効かず瞬間消滅する現象を、4 連続で「OS バグ」「WAAPI 仕様」「will-change 欠落」「React concurrent」を仮説立てて全て外し、5 回目で react-reviewer を cold read で投入 + console.log を入れたら **同一操作に 2 つの処理経路 (React 合成 vs native overlay listener) があり、片方しか deletedIds を set していない** と即判明。

**なぜ防げなかったか (BLOCK 済み原則の二重風化):**

1. **軸 5 (DOM 構造) サブ未整備 → 軸 5-C を v1.4 で新設**: 軸 5-A (sibling 非 bubble) と 5-B (CSS vs inline style) は v1.1 で整備されていたが、「同一操作に複数 listener 経路がある場合の対称性」を扱うサブ項目が欠落。`task_65` で「listener (A) より DOM 分離 (B)」原則は確立していたのに、本書には書かれていなかった。

2. **計測ファースト原則の不在 → 軸 2 サブ D を v1.4 で新設**: 既存の `meta-debugging-when-stuck.md` と本書の軸 4 (物理制約) には「grep / 実装値検証」原則はあったが、「描画/タイミング系バグで 1 回目修正が外れたら計測ログ強制」のような **2 回目以降の実装ゲート** が無かった。結果、4 回連続で推測ベースの修正を反復。

3. **「BLOCK 化原則は強制機構なしには再発する」 (`task_65` で抽出された教訓) を本書側でも踏んだ**: v1.3 で「原則の存在 ≠ 強制機構の存在」と明記したが、その後追加した原則 (sub C / sub D 相当の暗黙知) を spec のセルフチェック・CLAUDE.md §7 BLOCK 条項に紐付けなかった。**メタ原則を書いた後も自分自身の運用に強制機構を組み込まないと、メタ原則自体が風化する**。

**教訓 (BLOCK 化した原則を風化させない運用 v3):**

- 既存の暗黙知 (例: `task_65` で確立した「listener (A) より DOM 分離 (B)」) は **明示的に souls の軸サブ項目として書かないと、別のセッションでは無いものと同じ**。確立した原則は必ず souls / CLAUDE.md / spec のいずれかに **grep 可能な形** で固定する。
- 描画系バグの 2 回目修正は、計測ログなしで実装したら BLOCK にする (CLAUDE.md §7 への追加推奨)。
- AI レビューの **cold read** (会話履歴を共有しない独立レビュー) は、自分が陥った仮説の連鎖から脱出する強力な手段。3 回以上失敗したら自動的に cold read を発動するルールを検討する価値あり。

### ケース 6: `split-segment-swipe-telop-display-bug` 表示固定 (2026-05-04 done)

**構造:** スワイプで隣接セグメントに切り替え後、`selectedSegmentId` は B2 に更新されるのに **テロップ表示が B1 のまま固まる**。`onSeeked` で `selectSegment(targetId)` を呼んだのに `currentTime` 経路の `findActiveSegment(currentTime)` が iOS の keyframe snap で B1 を返し続けていた。3 層防御 (`isSwipeSeekingRef` / `postSeekTargetIdRef` / `displayTime` 補正) で解決 (commit `c66f01f`)。

**なぜ防げなかったか (v1.4 サブ C の対称性概念が write 経路に偏った):**

1. **軸 5 サブ C は「書き込み経路」の対称性のみ扱った → サブ D を v1.5 で新設**: v1.4 サブ C は event handler の write 対称性 (TelopOverlay span vs swipeOverlay native) を扱ったが、**「同一表示を決める *読み取り経路* が複数」というバリアント** をカバーしていなかった。本ケースでは `selectedSegmentId` を直読する経路と `findActiveSegment(currentTime)` で派生する経路が **独立に間違った値を返す** ことが盲点。

2. **`?? fallback` の null/undefined 限定発火を見落とす**: `activeByTime ?? selectedSegmentId` は wrong-non-null (B1 を返す) では発動しない。fallback = 安全ネット という素朴な期待が裏切られる。

3. **軸 1 サブ B (Guard 前副作用) も同時発火**: `if (snap zone) return;` を書いたが `return` の 2 行上で `setCurrentTime(time)` を実行 → 経路 2 への副作用が guard を素通り。

**教訓 (v1.5 で固定化):**

- サブ項目を新設する時は **「同根のバリアント (read/write, sync/async, 子/親, 主動/受動) を網羅したか」を必ず自問する** (v1.4 サブ C の write 偏重が 5 日後に re-bug を誘発した直接原因)
- `?? fallback` は null/undefined にしか発動しない。wrong-non-null のケースは **SSoT 統一か補正レイヤ (`onSeeked` で target.startTime 基準に再計算)** が必要
- `if (...) return;` の guard を書いた時、`return` より前の副作用を 1 つずつ「これも block 対象か?」と判定する (軸 1 サブ B)

### ケース 7: `ios-ime-mobile-text-editor-investigation` IME 4 連鎖バグ (2026-05-08 done)

**構造:** モバイル textbox で iOS IME (Google 日本語入力) が変換確定で空白挿入 / 変換中バックスペース無効 / 文字消滅 / カーソル位置ずれ の 4 連鎖。`<textarea value={value} onChange={...}>` controlled パターンで毎 render `el.value = value prop` 代入が compositionstart を破壊。`defaultValue` + `useLayoutEffect` + `isComposingRef` 3 点セット + iOS の `compositionend` skip 対策 (`onChange` でも ref reset) で解決。

**なぜ防げたか (計測ファースト原則 v1.4 サブ D の成功例):**

1. **`compositionstart`/`compositionend`/`onChange`/`isComposingRef.current` を console.log した瞬間に「`compositionend` がそもそも発火していない」「ref が前操作の `true` で stuck」が即見えた**
2. ケース 5 (swipe 5 回失敗) で抽出した「2 回目の修正前に計測ログ強制」原則が **初めて自然に発火し**、推測ベース反復 (OS バグ → 入力モード → React state) を回避
3. v1.4 で本書に明示固定化した強制機構が機能した稀有な事例 (ケース 5 → ケース 7 で 1 周期で原則が定着)

**教訓 (v1.5 で固定化):**

- IME を扱う `<textarea>` / `<input>` は **uncontrolled (`defaultValue` + `useLayoutEffect`)** が必須 (軸 6 サブ B)
- iOS の `compositionend` は変換中バックスペースで skip するため、**`onChange` 経路でも `isComposingRef.current = false` を実行** (`compositionend` のみ依存は無音失敗)
- `useLayoutEffect` (`useEffect` だと paint 後実行で flash) と `defaultValue` (controlled だと毎 render 上書き) の **両方** 必要 — 「A or B」ではなく「A and B」のパターン (罠 β = 「A or B 解決感の罠」と同根)
- **計測ファースト原則 (軸 2 サブ D) が機能した = 強制機構の存在が実機検証された** → 今後も BLOCK 化を維持

### 共通根本原因

5 ケースとも:

> **「テスト層 (jsdom/RTL) が再現できない非対称軸を、テスト緑で代替できると錯覚した」**
> **「原則を BLOCK 化しても、既存コードの legacy を残したまま新規機能を重ねると再発する」**
> **「原則を書いても spec のセルフチェック形式が抽象表現だと checkbox 偽装で素通りする」** (v1.3 追加)

これを断ち切るには:
- **テスト緑は実機緑を保証しない** と明文化 (本書)
- 実機テスト前に **6 軸セルフチェック** を強制
- セルフチェック項目は **grep / 実装値検証可能な形** で書く (軸 4 サブ Z)
- PARTIAL タスクは実機に出さない (ゲート A)
- **原則追加と legacy cleanup はペアで計画する** (原則だけ足して既存コードを放置しない)
- **新しい実機現象を 1 件発見したら、既存軸のサブで吸収するか新軸を立てるかを判断**して本書を更新する (軸固定を疑う / v1.4 までで 5 → 6 軸 + 各軸サブ拡張)
- **描画/タイミング系バグの 2 回目修正は計測ログ必須** (軸 2 サブ D) — 推測ベースの反復禁止
- **同一操作に複数処理経路がある場合は全経路の state 更新を grep で対称性検証** (軸 5 サブ C)
- **暗黙知化した原則 (別タスクで確立したベストプラクティス) は明示的に souls に書かないと別セッションで再発する** — 確立した原則は必ず本書 / CLAUDE.md / spec のいずれかに grep 可能な形で固定

---

## 🎯 1 行サマリ

> **「jsdom の緑は iOS Safari の緑ではない。イベントループ / 非同期状態 (video timeupdate 含む) / パッシブ / 物理制約 / DOM・スタイル構造 (write 経路 + read 経路の対称性) / iOS OS レベル UI 副作用 (callout + IME composition) の 6 軸を閉じてから実機に出せ。セルフチェックは grep 検証可能な形で書け。サブ項目を新設したら同根バリアント (read/write, sync/async, A and B) を網羅したか自問しろ。原則を追加したら既存コードの legacy cleanup タスクを必ずペアで立てろ。」**

---

## 関連 souls

- [`2026-04-19_ios-safari-pthread-gauntlet.md`](./2026-04-19_ios-safari-pthread-gauntlet.md) — iOS Safari pthread WASM 固有の落とし穴 (軸 4 の具体事例)
- [`2026-04-19_meta-debugging-when-stuck.md`](./2026-04-19_meta-debugging-when-stuck.md) — 実機で壊れた後の突破技法
- [`2026-04-20_meta-spec-phase-hallucination.md`](./2026-04-20_meta-spec-phase-hallucination.md) — 軸 2 の "grep して実装を読む" の兄弟原則
- [`2026-04-22_meta-requirement-translation-traps.md`](./2026-04-22_meta-requirement-translation-traps.md) — 罠 β (A or B 思考) は軸 2 で再発火する
