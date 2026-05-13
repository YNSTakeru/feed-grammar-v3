# 詰まったデバッグを突破するメタ技法

**抽象化:** 2026-04-19 (Whisper × iOS Safari の戦いから)
**適用範囲:** 言語・フレームワーク非依存。3 日以上詰まっている時に効く

エラーメッセージが不親切で、ググっても出てこず、AI に聞いても「もう撤退」と言われる状況。
過去の戦いから抽出した、そういう場面で**実際に効いた技法**だけをまとめる。

---

## 1. 「観測が無い」を「観測を増やす」で解く (Proxy / 計装パターン)

**発生する場面:**
- エラーメッセージに情報が無い (`[object ErrorEvent]`, `X is not a function`)
- minified コードで変数名が `A` `B` `C`、どれが何か分からない
- 動的なプロパティアクセス (reflection, Embind, Proxy) で grep が効かない

**解法:** **ランタイムに計装を入れて観測を増やす**。

### 1a. Proxy で全アクセスをログ (JavaScript)

```ts
const target = { /* 本物の実装 */ };
const seen = new Set<string>();
const instrumented = new Proxy(target, {
  get(t, prop, r) {
    const v = Reflect.get(t, prop, r);
    if (v === undefined && typeof prop === "string" && !(prop in t) && !seen.has(prop)) {
      seen.add(prop);
      console.warn(`[observe] missing: "${prop}"`);
    }
    return v;
  },
});
```

### 1b. 関数を wrapper で包んで called ログ

```ts
const wrap = (name, fn) => (...args) => {
  console.warn(`[observe] called: "${name}"`);
  return fn(...args);
};
```

### 1c. 他言語の等価手法
- **Python:** `__getattr__` / `logging.Logger` を instrumented proxy に差し替え
- **Go:** interface 実装を logging decorator で wrap
- **Rust:** `#[derive(Debug)]` + `dbg!()` / tracing crate
- **C/C++:** `LD_PRELOAD` / `DYLD_INSERT_LIBRARIES` で syscall/libc 関数を hook

## 2. 致死的ロギングを避ける — 観測と停止を分離

**落とし穴:** 観測のつもりで書いたログが**プロセスを落とす**。

- `reportError`/`throw`/`panic` を観測に使うと、その先の情報が取れない
- エラー path が terminal 扱いされる系 (Promise reject, hook fallback) に気をつける

**原則:** **観測は `console.warn` / `log.debug` / `eprintln!` 等の非致死チャネルで**。
本物のエラーが出るまで走らせ続ける。

## 3. 相関 100% のログペアを犯人とみなす

**パターン:** クラッシュ直前の最後の観測ログが、毎回同じ識別子なら、それが犯人。

```
[observe] called: "foo"
[observe] called: "bar"
[observe] missing: "baz"   ← 毎回これがクラッシュ直前
💥 TypeError: X is not a function
```

相関 = 100% (3 回以上再現) なら因果と扱って仮説検証に進んでよい。
厳密な因果証明に時間を使うより、**仮説修正 → 1 行追加 → 再現消失**で答え合わせする方が速い。

## 4. 「もうダメ」仮説は証拠で殺す

AI (or 自分) が「〇〇が根本的に壊れているから詰み」と言い出した時、
**観測可能な反証が存在しないか**を 30 秒だけ確認する:

- 「Webpack が mangle してる」→ `called: X` が出ている = mangle されていない
- 「pthread スコープで介入不可」→ Proxy が発火している = 介入できている
- 「メモリが足りない」→ `performance.memory.usedJSHeapSize` を見る

反証が出たら諦め仮説は**死ぬ**。観測に戻る。

## 5. エラーの階層を剥がす覚悟を持つ

1 つ直すと次のエラーが出るのは**進歩**。停滞ではない。

```
_N_E is not defined             → type:"module" 化
→ importScripts in module       → mainScriptUrlOrBlob 削除
→ A[C.handler] is not a function → handler stub 追加
→ 🎉 動作
```

**各段階で「いや、もう全部捨てて書き直そう」と思う誘惑**が来る。
**誘惑を退けた回数だけ真因に近づく。**

## 6. プラットフォーム間の「厳密さ」差を利用する

同じコードが Chrome で動き Safari で落ちる場合、Safari の方が仕様に**厳密**。
Chrome は寛容すぎて真のバグを隠してしまう。

- 厳密ランタイム (JSC, Python strict mode, Rust, TypeScript strict) で先に走らせる
- 落ちた方が情報が多い (仕様的な違反名でエラーが出る)
- 「Chrome で動くから OK」は**偽の安心**

等価原則:
- TypeScript `strict: true` / Python `mypy --strict` / Rust borrow checker を**早期**に通す
- linter の warning を error に昇格
- CI は本番の最小公約数ではなく**最も厳しい環境**で走らせる

## 7. 静的解析の盲点 — grep が無力な 4 つのケース

コードにその文字列が出てこないから「存在しない」は**誤り**。

| 盲点 | 例 | 対策 |
|---|---|---|
| 動的プロパティ名 | `obj[name]`, `getattr(o, name)` | Proxy / `__getattr__` で観測 |
| コンパイル済みバイナリ | WASM, JNI, .so | ランタイム計装、`nm`/`strings`、debug symbol |
| テンプレート/マクロ生成 | C++ templates, Rust macros, Embind | 展開後のソース (`-E`, `cargo expand`) |
| minified / obfuscated | production bundle | source map、runtime Proxy |

「grep で出ない = 無い」という推論は**本番コードでは成立しない**。

## 8. 進捗の定義を計測可能にする

3 日詰まると「進んでるのか分からない」状態になる。対処:

**エラー末尾の識別子を記録する。**

```
day 1: _N_E is not defined
day 2: importScripts cannot be used
day 3: A[C.handler] is not a function
```

エラー文字列が**変わっている** = 層を剥がしている = 進捗あり。
同じエラーで 2 日以上止まっているなら**別アプローチ**を試す合図。

## 9. 修正の「最小性」を信じる

バグの 80% は 1 行で直る。
「これは全体を書き直さないと無理」と感じた時ほど、
**まず 1 行の修正で試す**。動かなくても情報が取れる。
動いたら本当にそれだけだったと分かる。

「書き直した方が早い」が正解のケースは**例外**で、
**デフォルトは 1 行修正の試行**。

## 10. 撤退基準をあらかじめ決める

無限に粘るのも悪。撤退ラインを事前に引く:

- **時間:** N 時間使っても犯人が絞れなければ撤退 (N = 4〜8 が現実的)
- **情報:** 新しいログ情報が 1 時間取れなければ撤退
- **撤退先:** 代替実装 / 外部サービス / 手動回避策の**具体名**を持っておく

撤退先が決まっていれば、安心して深く潜れる (引き返せる)。
Whisper の場合は custom whisper.cpp build + public/ 配置が撤退先だった。
結局使わずに済んだが、**撤退先があることで深く潜れた**。

---

## チェックリスト (詰まった時に開く)

```
□ エラーメッセージから情報が取れない → Proxy/計装で観測を増やした
□ 観測コードが致死的になっていないか確認 (console.warn のみ)
□ クラッシュ直前の最後のログに繰り返し出る識別子を特定した
□ 「根本的に不可能」仮説に対し観測可能な反証を探した
□ 現在のエラーは 24 時間前のエラーと異なる (進捗している)
□ 1 行修正で直るか先に試した
□ 撤退ラインと代替案を決めている
```

---

## 関連

- `souls/2026-04-19_meta-ai-advisor-calibration.md` — AI アドバイザーとの付き合い方
- `souls/2026-04-19_emscripten-handler-stubs-trap.md` — 本技法を適用した具体事例
