//whisper-worker-factory.ts
import {
  isAndroidUserAgent,
  isIOSUserAgent,
} from "./whisper-model-selection";

export type WhisperWorkerPlatform = "pc" | "ios" | "android";

let pcWorker: Worker | null = null;
let pcRefCount = 0;

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

function destroyPcWorker() {
  if (!pcWorker) return;
  try {
    pcWorker.terminate();
  } catch {
    // ignore
  }
  pcWorker = null;
}

export function detectWhisperWorkerPlatform(
  userAgent: string = navigator.userAgent,
): WhisperWorkerPlatform {
  if (isIOSUserAgent(userAgent)) return "ios";
  if (isAndroidUserAgent(userAgent)) return "android";
  return "pc";
}

export function getOrCreateWorker(platform: WhisperWorkerPlatform): Worker {
  if (platform !== "pc") {
    return createWhisperWorker();
  }
  if (!pcWorker) {
    pcWorker = createWhisperWorker();
  }
  return pcWorker;
}

export function acquireWorker(platform: WhisperWorkerPlatform): Worker {
  if (platform !== "pc") {
    return createWhisperWorker();
  }
  pcRefCount += 1;
  return getOrCreateWorker(platform);
}

export function releaseWorker(platform: WhisperWorkerPlatform) {
  if (platform !== "pc") return;
  pcRefCount = Math.max(0, pcRefCount - 1);
  if (pcRefCount === 0) {
    destroyPcWorker();
  }
}

export function destroyWorker(platform: WhisperWorkerPlatform) {
  if (platform !== "pc") return;
  destroyPcWorker();
}

export function destroyWorkerForTesting() {
  pcRefCount = 0;
  destroyPcWorker();
}
