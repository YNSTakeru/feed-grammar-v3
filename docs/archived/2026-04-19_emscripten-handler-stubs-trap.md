# Emscripten Module ハンドラ stub の罠 — iOS Safari で 3 日潰した話

**発見日:** 2026-04-19
**戦場:** @transcribe/shout (whisper.cpp WASM) × Emscripten pthreads × iOS Safari × Next.js Webpack
**犠牲:** 3 日間、~6000 行のログ解析、3 回の「Bundler が悪い」誤診
**結論:** コードに**たった 1 行**足りなかっただけ

---

## 🎯 核心 — 忘れないで欲しいこと

> Emscripten で C++ → JS コールバックを使う WASM モジュール (whisper.cpp, onnxruntime, tfjs など) を使う時、
> `Module` オブジェクトに**すべての想定コールバック名の実装を stub として最初から渡しておけ**。
> 1 つ欠けただけで `TypeError: A[C.handler] is not a function` で pthread Worker が即死する。
> エラーメッセージには**どの handler 名が欠けているか表示されない**。

---

## 🕳️ 罠の全体像

`@transcribe/shout` v1.0.7 (whisper.cpp v1.7.x 相当) を iOS Safari で動かした時の事象:

```
[Warning] [processing] → demo via category=runtime:
  worker uncaught: TypeError: A[C.handler] is not a function.
  (In 'A[C.handler](...C.args)', 'A[C.handler]' is undefined)
  at 4bd21e55.xxxxx.js:1:1456995
```

- `A` は minified で、何のことか分からない
- `C.handler` は runtime のプロパティ名で、`error.message` にも入らない
- Chrome は同じコードが寛容に動く (エラーすら投げないことも)
- iOS Safari だけが厳密に死ぬ
- **どのハンドラ名が無いのかエラーから分からない** — これが最悪

## 🕵️ 真因

shout 内部の em-pthread (Emscripten pthread) 子 Worker → 親 Worker の
メッセージ転送は、静的な 4 ハンドラフィルタで動作している:

```js
// shout.wasm.js の child → parent 転送設定
var knownHandlers = ["onExit", "onAbort", "print", "printErr"];
for (var handler of knownHandlers) {
  if (Module.propertyIsEnumerable(handler)) {
    handlers.push(handler);
  }
}
worker.postMessage({ cmd: "load", handlers, wasmMemory, wasmModule });
```

**しかし。** 上記フィルタに含まれない別のコールバックがもう 1 つ存在する:

```js
// whisper.cpp WASM が Embind 経由で独自に参照するハンドラ
Module.onNewSegment(...)   // ← shout ソースには文字列として一切現れない
```

`onNewSegment` は whisper.cpp C++ 側が `__emval_get_module_property("onNewSegment")` で
**動的に** parent の `Module` から取りに来る。shout の JS ソースを `grep` しても
1 ヶ所も出てこないため、静的解析だけでは絶対に発見できない。

親の `Module.onNewSegment` が未定義 → Embind 経由で C++ 側に undefined が返る →
C++ が何らかの callHandler 経路で undefined を呼び出そうとする →
parent の dispatcher `Module[d.handler](...d.args)` で爆発。

## 💡 修正

whisper-worker.ts の `createModule({...})` 呼び出しで**全ハンドラ名に stub を供給**:

```ts
Module = await createModule({
  print: () => { /* stdout 抑制 */ },
  printErr: (raw) => { /* 構造化エラー抽出 */ },
  onExit: (code) => { /* exit notify */ },
  onAbort: (what) => { /* abort notify */ },
  onNewSegment: () => { /* ← これが無いと死ぬ */ },
});
```

この 1 行 (`onNewSegment: () => {}`) で base/tiny 両モデルが iOS Safari で動くようになった。

## 🧭 診断の決め手 — Proxy インストルメント

エラーメッセージから handler 名が取れないため、**Proxy でハンドラアクセスを全部ログ**:

```ts
const handlerTarget = { print, printErr, onExit, onAbort };
const seenMissing = new Set<string>();
const handlerProxy = new Proxy(handlerTarget, {
  get(target, prop, receiver) {
    const value = Reflect.get(target, prop, receiver);
    if (
      value === undefined &&
      typeof prop === "string" &&
      !(prop in target) &&
      !seenMissing.has(prop)
    ) {
      seenMissing.add(prop);
      console.warn(`[proxy] missing: "${prop}"`);  // ← これが犯人を指した
    }
    return value;
  },
});
Module = await createModule(handlerProxy);
```

**ポイント 1: `reportError` で報告してはいけない**
Hook 側で `{type:"error"}` は terminal 扱いで demo fallback する。
Emscripten は `INITIAL_MEMORY`, `wasmBinary` 等の**設定値を undefined 前提で probe**
しに来るため、これを error として扱うと worker が起動前に死ぬ。
→ `console.warn` にとどめて shout を走らせ続けるのが正解。

**ポイント 2: 呼ばれた handler もログする**
4 stub を wrapper で包んで `called: X` を出力。これにより
「Proxy が本当に生きているか」「callHandler 経路が動いているか」が一目で分かる。

**ポイント 3: クラッシュ直前の最後の `missing:` が犯人**
Proxy を仕込んで再現すれば、`missing: "onNewSegment"` の**直後**にクラッシュする。
相関 100%。そこに stub を足すだけ。

## 🤖 AI レビューの反省

このデバッグ中、Gemini (別 AI) は 3 回連続で**誤った診断**をした:

1. 「Webpack AST mangle で `A` が破壊されている」 → `A` は普通に存在しログで確認可
2. 「pthread スコープ分離により介入不可能」 → Proxy の `called: print` × 32 で反証
3. 「NPM エコシステム + Webpack では iOS マルチスレッド WASM 不可能」 → 1 行 stub で解決

**教訓:** 「もうダメ、全面撤退」と AI が叫んでも、**ログが反証している間は続けろ**。
「Webpack が悪い」「Bundler の限界」は**仮説ではなく諦めの修辞**になりがち。
観測可能な証拠 (Proxy logs) > 権威ある推測。

## 🚪 一緒に覚えておきたい罠

同じカテゴリで過去に踏んだ/回避した罠:

| 罠 | 症状 | 根治 |
|---|---|---|
| `_N_E is not defined` | Worker が dev mode で起動失敗 | production build で回避、または `type:"module"` を外す |
| `importScripts cannot be used if worker type is "module"` | iOS Safari で em-pthread 子が死ぬ | 親 Worker `type:"module"` に統一、webpack 自動生成の classic em-pthread chunk に任せる |
| `mainScriptUrlOrBlob: self.location.href` | em-pthread が親モジュールを module 再ロードしてクラッシュ | **渡すな**。webpack が emit する classic em-pthread chunk を使わせる |
| **`A[C.handler] is not a function` ← 今回** | **pthread 子 → 親の callHandler で未定義 handler 呼び出し** | **`Module` に全 handler stub を供給** |
| `crossOriginIsolated = false` | pthread 起動失敗 (SharedArrayBuffer 不可) | COOP=same-origin + COEP=require-corp **+ Secure Context (HTTPS)**。`http://192.168.x.x` は不可 |

## 📚 参考

- shout.wasm.js v1.0.7: `node_modules/@transcribe/shout/src/shout/shout.wasm.js`
- Emscripten pthread 仕様: https://emscripten.org/docs/porting/pthreads.html
- Embind `val::module_property`: https://emscripten.org/docs/api_reference/val.h.html
- 本修正の commit: whisper-worker.ts の `onNewSegment` stub 追加
