//whisper-worker-factory.ts
export function createWhisperWorker(): Worker {
  // type: "module" が必須。
  // Emscripten pthread (shout 内部) は em-pthread 子 Worker を常に
  // `{ type: "module" }` で生成する (shout.wasm.js: new Worker(pthreadMainJs,{type:"module"}))。
  // 親 Worker を classic で起動すると webpack は classic 用チャンクローダ
  // (importScripts) を注入するが、同一チャンクが em-pthread (module) で
  // 再実行された瞬間 Safari が仕様通り `importScripts cannot be used if
  // worker type is "module"` で拒絶し Worker ごとクラッシュする。
  // Chrome (V8) は寛容で動くが iOS Safari (JSC) は厳密。module 起動で統一。
  return new Worker(new URL("./whisper-worker.ts", import.meta.url), {
    type: "module",
  });
}
