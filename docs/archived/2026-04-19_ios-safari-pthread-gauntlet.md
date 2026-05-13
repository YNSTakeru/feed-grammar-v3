# iOS Safari で Emscripten pthread WASM を動かすための 5 連関門

**発見日:** 2026-04-19
**戦場:** Next.js 16 (Turbopack/Webpack) × @transcribe/shout × iOS Safari 17+
**結論:** すべての関門を全部クリアして**初めて** pthread WASM が動く

iOS Safari で Emscripten pthread ベースの WASM (whisper.cpp など) を動かすには、
**順序依存で 5 つの関門**をすべて通過する必要がある。1 つでも欠けると沈黙する or 動かない。

---

## 関門 1: Secure Context (HTTPS or localhost)

**必須条件:** `window.isSecureContext === true` かつ `crossOriginIsolated === true`

- `http://192.168.x.x:3000` **は不可** (localhost でも無い単なる LAN IP は Secure Context ではない)
- `http://localhost:3000` は Secure Context 扱い
- 実機 iPhone からの LAN アクセスでテストする場合は **ngrok などで HTTPS トンネル必須**

**確認方法:**
```js
console.log({ isSecureContext, crossOriginIsolated });
// { isSecureContext: true, crossOriginIsolated: true } でなければ NG
```

---

## 関門 2: COOP + COEP ヘッダ

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

- `credentialless` は iOS WebKit で未サポート (2026-04 時点)
- `require-corp` 必須 → 3rd party スクリプト (広告 SDK 等) が CORP ヘッダを返さないと全部ブロック

**確認方法:**
```bash
curl -I https://your-domain.com/ | grep -i cross-origin
```

---

## 関門 3: Worker は `type: "module"` で統一

Emscripten pthread (shout 内部) は em-pthread 子 Worker を**常に** `{ type: "module" }` で生成する:

```js
// shout.wasm.js 内部
new Worker(pthreadMainJs, { type: "module", name: "em-pthread" });
```

親 Worker を classic (`type: undefined`) にすると webpack は classic 用チャンクローダ
(`importScripts`) を注入するが、同一チャンクが em-pthread 子 (module) で再実行された瞬間、
iOS Safari (JSC) は**仕様通り厳密**に:

```
TypeError: importScripts cannot be used if worker type is "module"
```

で拒絶する。Chrome (V8) は寛容で動いてしまうため見逃される。

**正解:**
```ts
return new Worker(new URL("../workers/whisper-worker.ts", import.meta.url), {
  type: "module",
});
```

---

## 関門 4: `mainScriptUrlOrBlob` を渡すな

Emscripten の設定値として `Module.mainScriptUrlOrBlob` を渡すと、shout は
親チャンクの URL を em-pthread 子の module ローダに渡し、module strict 内で
webpack の `importScripts` を起動しようとしてクラッシュする。

Webpack は Next.js ビルド時に**専用の classic 版 em-pthread チャンク** (`em-pthread.*.js`)
を自動生成しており、shout の fallback 経路で `new Worker(URL, {type: undefined})` として
使われる想定。ここに `self.location.href` を渡すと全部壊れる。

**正解:**
```ts
Module = await createModule({
  print: () => {},
  printErr: (raw) => { /* ... */ },
  // mainScriptUrlOrBlob は指定しない!
});
```

---

## 関門 5: 全ハンドラ stub を最初から供給する

これが **3 日潰した関門** (詳細は `2026-04-19_emscripten-handler-stubs-trap.md`)。

`createModule()` 呼び出し時に Module オブジェクトに渡すコールバック:

```ts
Module = await createModule({
  print: () => {},
  printErr: (raw) => { /* classify & forward */ },
  onExit: (code) => { /* exit notify */ },
  onAbort: (what) => { /* abort notify */ },
  onNewSegment: () => {},  // ← whisper.cpp が Embind 経由で独自参照
});
```

shout の `knownHandlers` filter は 4 つ (`onExit`, `onAbort`, `print`, `printErr`) だけだが、
whisper.cpp WASM バイナリは `__emval_get_module_property("onNewSegment")` で**別経路**で
参照してくる。エラーメッセージには handler 名が出ず、診断には Proxy 観測が必要。

---

## チェックリスト (実機テスト前)

```
□ HTTPS (or localhost) で提供している
□ curl でレスポンスヘッダに COOP/COEP 確認済み
□ iPhone で console.log(crossOriginIsolated) → true を確認
□ whisper-worker-factory.ts が type:"module" を指定している
□ createModule() に mainScriptUrlOrBlob を渡していない
□ createModule() の引数に onNewSegment stub を含めた
□ Chrome (V8) だけでなく iOS Safari (JSC) で実機テストした
```

全部 ✅ になれば whisper-tiny/base の STT が iOS Safari で動く。

---

## 関連ドキュメント

- `souls/2026-04-19_emscripten-handler-stubs-trap.md` — 関門 5 の詳細
- `spec/fix-worker-module-strict-mode.md` — 関門 3 の詳細
- `spec/fix_shout_static_import.md` — 関連する webpack チャンク分離
- `spec/iphone-chrome-whisper-stt.md` — iOS メモリ対策全体像
