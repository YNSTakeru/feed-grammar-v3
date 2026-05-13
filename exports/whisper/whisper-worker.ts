//whisper-worker.ts

/**
 * Whisper STT Web Worker
 * whisper.cpp WASM (@transcribe/shout) を使用してブラウザ内で音声認識を実行
 *
 * iOS Safari OOM 根本対策:
 *   Before: onnxruntime-web → WASM ヒープ 1.88GB → タブクラッシュ
 *   After:  whisper.cpp WASM → ピーク ~200-250MB → 通常動作
 *
 * ランタイム切替の理由:
 *   onnxruntime-web の C++ WASM アロケータは session_options から制御不能な
 *   1.88GB のヒープを事前割当する (GitHub issue #22776, 2023年以降 open)。
 *   whisper.cpp は同じ Whisper モデルを ~150MB で動作させる。
 */

import createModule from "@transcribe/shout";
import { IDBModelCache } from "./idb-model-cache";
import type {
  TranscriptionChunk,
  WhisperDiagnostics,
  WhisperErrorCategory,
  WorkerInboundMessage,
  WorkerOutboundMessage,
} from "./whisper-worker-protocol";
import { classifyPrintErr, toErrorCategory } from "./whisper-worker-utils";

// ──────────────────────────────────────────────────────────────────
// Emscripten pthread サブワーカー検出
//
// @transcribe/shout の WASM モジュールは Emscripten pthreads を使用する。
// メインの whisper-worker バンドルが pthread サブワーカーとして再ロードされた場合
// (Worker name が "em-pthread" で始まる)、Emscripten が onmessage を管理するため
// このモジュールの onmessage ハンドラを設定しない。
// ──────────────────────────────────────────────────────────────────
const IS_PTHREAD =
  typeof globalThis.self !== "undefined" &&
  (globalThis.self as unknown as { name?: string }).name?.startsWith(
    "em-pthread",
  ) === true;

// iOS 検出（Worker 内で再判定）
const IS_IOS = /iPhone|iPad/i.test(navigator.userAgent);

// ──────────────────────────────────────────────────────────────────
// GGUF モデル定義
// HuggingFace: ggerganov/whisper.cpp (公式 whisper.cpp リポジトリ)
// q5_1: 5-bit 量子化、多言語対応、iOS メモリ予算に適合
// ──────────────────────────────────────────────────────────────────
const GGUF_BASE_URL =
  "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/";

const GGUF_MODELS = {
  "ggml-tiny-q5_1": { sizeMB: 32 },
  "ggml-base-q5_1": { sizeMB: 56 },
  "ggml-small-q5_1": { sizeMB: 181 },
} as const;

type GgufModelKey = keyof typeof GGUF_MODELS;

function getGgufUrl(key: GgufModelKey): string {
  return `${GGUF_BASE_URL}${key}.bin`;
}

/**
 * 受信した modelId (ONNX 形式 or GGUF 形式 or undefined) を GGUF モデルキーに変換する。
 */
function resolveGgufModel(modelIdOverride?: string): GgufModelKey {
  if (modelIdOverride) {
    if (modelIdOverride in GGUF_MODELS) {
      return modelIdOverride as GgufModelKey;
    }
    if (modelIdOverride.includes("small")) return "ggml-small-q5_1";
    if (modelIdOverride.includes("base")) return "ggml-base-q5_1";
    if (modelIdOverride.includes("tiny")) return "ggml-tiny-q5_1";
  }
  return autoSelectGgufModel();
}

function autoSelectGgufModel(): GgufModelKey {
  if (IS_IOS) return "ggml-tiny-q5_1";
  if (/iPhone|iPad|Android/i.test(navigator.userAgent)) return "ggml-tiny-q5_1";

  const memory = (navigator as { deviceMemory?: number }).deviceMemory;
  if (memory !== undefined) {
    if (memory >= 8) return "ggml-small-q5_1";
    if (memory >= 4) return "ggml-base-q5_1";
    return "ggml-tiny-q5_1";
  }

  const cores = navigator.hardwareConcurrency || 4;
  if (cores >= 8) return "ggml-base-q5_1";
  return "ggml-tiny-q5_1";
}

/**
 * 推論スレッド数の上限を返す。
 * Safari は hardwareConcurrency = 8 を返すが実質 2 スレッドが安全。
 */
function getMaxThreads(): number {
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  if (isSafari) return 2;
  return Math.min(navigator.hardwareConcurrency || 2, 8);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ShoutModule = Record<string, any>;

// Worker レベルの状態
let whisperModule: ShoutModule | null = null;
let currentModelKey: GgufModelKey | null = null;
let activeModelId = "";
// Defense-in-depth: Hook 側の overlap guard に加え、Worker 内でも排他する。
// 2 件目の transcribe が届いて whisperModule.onTranscribed を上書きすると
// 1 件目の Promise が永久 pending になるため。
let isBusy = false;
const idbCache = new IDBModelCache();

// SharedArrayBuffer 前提 (pthreads) — COOP/COEP が未設定だとシングルスレッド動作で
// 推論速度が数倍悪化する。起動時に一度だけ警告。
if (
  !IS_PTHREAD &&
  typeof crossOriginIsolated !== "undefined" &&
  !crossOriginIsolated
) {
  console.warn(
    "[whisper-worker] crossOriginIsolated=false: " +
      "Set COOP=same-origin and COEP=require-corp or credentialless to enable pthreads.",
  );
}

function postResponse(response: WorkerOutboundMessage) {
  self.postMessage(response);
}

// Worker 内未捕捉エラーを必ずメインスレッドへ通知する。
// iOS Safari の pthread 子 Worker OS-kill 時は ErrorEvent.message が空
// あるいは ErrorEvent オブジェクト自身が再送されるケースがあり、
// 単純な文字列連結では診断不能 (`[object ErrorEvent]`) になる。
// 全フィールドを型安全に拾って文字列化する。
if (!IS_PTHREAD) {
  const describeEvent = (ev: Event): string => {
    const ee = ev as Partial<ErrorEvent> & {
      error?: { message?: string; stack?: string; name?: string };
    };
    const parts: string[] = [];
    if (typeof ee.message === "string" && ee.message.length > 0) {
      parts.push(`message=${ee.message}`);
    } else if (ee.message != null) {
      // message が object/null 以外 → 可能な限り文字列化
      try {
        parts.push(`message<${typeof ee.message}>=${JSON.stringify(ee.message)}`);
      } catch {
        parts.push(`message<non-serializable>`);
      }
    }
    if (ee.filename) parts.push(`at=${ee.filename}:${ee.lineno}:${ee.colno}`);
    if (ee.error) {
      if (ee.error.name) parts.push(`error.name=${ee.error.name}`);
      if (ee.error.message) parts.push(`error.message=${ee.error.message}`);
      if (ee.error.stack) parts.push(`error.stack=${ee.error.stack.slice(0, 400)}`);
    }
    // type も添付 (error / messageerror / unhandledrejection のどれか)
    parts.push(`type=${ev.type}`);
    return parts.join(" | ") || "unknown-error-event";
  };

  self.addEventListener("error", (ev) => {
    const detail = describeEvent(ev);
    try {
      reportError(
        `worker uncaught: ${detail}`,
        /memory|allocat|OOM/i.test(detail) ? "oom" : "runtime",
      );
    } catch {
      // postMessage failed — worker likely dying
    }
  });
  self.addEventListener("messageerror", (ev) => {
    try {
      reportError(`worker messageerror: ${describeEvent(ev)}`, "runtime");
    } catch {
      // ignore
    }
  });
  self.addEventListener("unhandledrejection", (ev) => {
    const reason = (ev as PromiseRejectionEvent).reason;
    let msg: string;
    if (reason instanceof Error) {
      msg = `${reason.name}: ${reason.message}\n${reason.stack ?? ""}`;
    } else {
      try {
        msg = typeof reason === "string" ? reason : JSON.stringify(reason);
      } catch {
        msg = `<non-serializable ${typeof reason}>`;
      }
    }
    try {
      reportError(
        `worker unhandledrejection: ${msg}`,
        /memory|allocat|OOM/i.test(msg) ? "oom" : "runtime",
      );
    } catch {
      // ignore
    }
  });
}

function reportError(message: string, category: WhisperErrorCategory) {
  postResponse({ type: "error", message, category });
}

// ──────────────────────────────────────────────────────────────────
// メッセージハンドラ
// pthread サブワーカーでは設定しない (Emscripten が管理)
// ──────────────────────────────────────────────────────────────────
if (!IS_PTHREAD) {
  self.onmessage = async (event: MessageEvent<WorkerInboundMessage>) => {
    const msg = event.data;

    // abort / dispose / ping は割り込み可。load-model / transcribe は排他。
    if (msg.type === "ping") {
      postResponse({ type: "pong" });
      return;
    }
    if (msg.type === "abort") {
      if (whisperModule?.cancel) {
        try {
          whisperModule.cancel();
        } catch {
          // ignore
        }
      }
      return;
    }
    if (msg.type === "dispose") {
      disposeModel();
      return;
    }

    if (isBusy) {
      reportError("前の処理が実行中です", "runtime");
      return;
    }

    isBusy = true;
    try {
      if (msg.type === "load-model") {
        await loadModel(msg.modelId);
      } else if (msg.type === "transcribe") {
        await transcribe(msg.audioData, msg.sampleRate, msg.language);
      }
    } finally {
      isBusy = false;
    }
  };
}

// ──────────────────────────────────────────────────────────────────
// disposeModel — WASM heap を解放して iOS の ~800MB タブ上限から離脱
// ──────────────────────────────────────────────────────────────────
function disposeModel() {
  if (whisperModule) {
    try {
      whisperModule.free?.();
    } catch {
      // ignore
    }
    try {
      whisperModule.FS_unlink?.("model.bin");
    } catch {
      // ファイルが存在しない場合は無視
    }
    whisperModule = null;
    currentModelKey = null;
  }
  (self as unknown as { gc?: () => void }).gc?.();
}

// ──────────────────────────────────────────────────────────────────
// loadModel
// ──────────────────────────────────────────────────────────────────
async function loadModel(modelIdOverride?: string) {
  const modelKey = resolveGgufModel(modelIdOverride);
  activeModelId = modelKey;

  // 同一モデルが既にロード済みの場合は再利用
  if (whisperModule && currentModelKey === modelKey) {
    postResponse({ type: "model-loaded", progress: 100 });
    return;
  }

  const url = getGgufUrl(modelKey);
  const { sizeMB } = GGUF_MODELS[modelKey];

  try {
    postResponse({ type: "model-progress", progress: 0 });

    // ── IDB キャッシュ確認 ──
    let modelData: Uint8Array | null;
    const cached = await idbCache.match(url);

    if (cached) {
      postResponse({ type: "model-progress", progress: 72 });
      modelData = new Uint8Array(await cached.arrayBuffer());
    } else {
      // ── ストリーミングフェッチ（進捗付き） ──
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`モデルダウンロード失敗: HTTP ${response.status}`);
      }

      const contentLength = parseInt(
        response.headers.get("content-length") || "0",
        10,
      );
      const reader = response.body!.getReader();
      const chunks: Uint8Array[] = [];
      let downloaded = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        downloaded += value.length;
        const pct =
          contentLength > 0
            ? Math.round((downloaded / contentLength) * 65)
            : 20;
        postResponse({ type: "model-progress", progress: pct });
      }

      const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
      modelData = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        modelData.set(chunk, offset);
        offset += chunk.length;
      }

      postResponse({ type: "model-progress", progress: 70 });
      // IDB QuotaExceeded 等で書き込み失敗しても今回の推論は続行する。
      try {
        await idbCache.put(
          url,
          new Response(modelData.buffer.slice(0) as ArrayBuffer, {
            status: 200,
            statusText: "OK",
            headers: { "content-type": "application/octet-stream" },
          }),
        );
      } catch (cacheErr) {
        console.warn("[whisper-worker] IDB cache put failed:", cacheErr);
      }
    }
    // sizeMB は将来のプログレスバー表示用メタデータ（ログ抑制中）
    void sizeMB;

    // ── WASM ランタイム初期化 ──
    postResponse({ type: "model-progress", progress: 75 });

    // iOS: WASM コンパイル中の stall 対策として定期的に progress を送る
    const keepalive = IS_IOS
      ? setInterval(() => {
          postResponse({ type: "model-progress", progress: 78 });
        }, 30000)
      : null;

    let Module: ShoutModule;
    try {
      // mainScriptUrlOrBlob は **渡さない**。
      // webpack (Next.js) は Emscripten pthread 用に専用の classic 版
      // em-pthread チャンク (em-pthread.*.js) を別ファイルで emit しており、
      // shout の fallback 経路で `new Worker(URL, {type:void 0, name:"em-pthread"})`
      // として使われる想定。ここに self.location.href (我々の module 親チャンク)
      // を渡すと shout は `{type:"module"}` 経路で親チャンクを em-pthread 子に
      // 再ロードし、module strict 内で webpack の `importScripts()` チャンクローダが
      // 死ぬ (iOS Safari で顕在化、Chrome は寛容に動くが仕様違反)。
      // 未指定にすることで webpack の classic em-pthread チャンクが自動採用され、
      // importScripts が合法になる。
      // INITIAL_MEMORY: shout の WASM は memory import で `initial` page 数を
      // 宣言しているため JS 側で縮小不能 (LinkError)。shout 既定 512MB に従う。
      // Step A 診断: shout em-pthread の callHandler dispatcher が
      // 我々の Module オブジェクトに無いプロパティを参照した瞬間、
      // その key 名を親→メインへ通知する。
      //   shout 内部: "callHandler"===Q ? A[C.handler](...C.args) : ...
      //   既知の filter: ["onExit","onAbort","print","printErr"]
      // 4 key 以外の未知 handler が来ているのか、それとも 4 key 内で
      // 何らかの理由で欠落判定されるのかを確定させる。
      //
      // Proxy で get をフックする。関数として呼ばれるアクセスだけでなく、
      // Emscripten/shout 側の `A[key]?.(...)` や `in A` チェックも拾える。
      // createModule は moduleArg を内部で `Module=moduleArg` して全面的に
      // 書き換える (プロパティ追加) ため、set も素通しする必要がある。
      const handlerTarget = {
        print: () => {
          /* whisper.cpp stdout を抑制 */
        },
        printErr: (raw: string) => {
          const cls = classifyPrintErr(raw);
          if (!cls.shouldForward) return;
          reportError(
            `whisper-wasm[${cls.category}]: ${raw}`,
            toErrorCategory(cls.category),
          );
        },
        onExit: (code: number) => {
          if (code !== 0) {
            reportError(`whisper-wasm[exit]: code=${code}`, "runtime");
          }
        },
        onAbort: (what: unknown) => {
          const detail =
            typeof what === "string" ? what : String(what ?? "unknown");
          reportError(
            `whisper-wasm[abort]: ${detail}`,
            /memory|allocat|OOM/i.test(detail) ? "oom" : "runtime",
          );
        },
        // whisper.cpp / Embind がセグメント通知のため Module.onNewSegment を
        // 読みに来る。shout の "load" msg filter には含まれないが、WASM 側
        // (embind __emval_get_module_property) が独自に参照しており、
        // 未定義だと `A[C.handler] is not a function` でクラッシュする。
        // 実装は transcribe() の onProgress / onTranscribed と同じく runtime で
        // 上書きされる想定。ここでは no-op stub で穴を塞ぐだけ。
        onNewSegment: () => {
          /* no-op — ロギング/アプリ側フックが必要な場合は transcribe() で上書き */
        },
      } as Record<PropertyKey, unknown>;
      // 観測戦略 (非致死版):
      // 前回 reportError で通知したら hook 側が terminal 扱いして即デモ
      // fallback になり、Emscripten の合法 probe (INITIAL_MEMORY 等) で
      // 自滅した。今回は console.warn のみで shout を走らせ続け、
      //   (a) 実際に callHandler 経路で A[name] が使われた瞬間に
      //       wrappedCall で handler 名をログする
      //   (b) 未知 key への読みは probe 一覧として warn するだけに留める
      // 本物の `A[C.handler] is not a function` が再発したら、直前に
      // warn されていた未知 key のどれかが犯人。
      const wrap = <T extends (...args: unknown[]) => unknown>(
        name: string,
        fn: T,
      ): T =>
        ((...args: Parameters<T>) => {
          console.warn(`[whisper-worker][proxy] called: "${name}"`);
          return fn(...args);
        }) as T;
      for (const key of Object.keys(handlerTarget)) {
        const fn = handlerTarget[key];
        if (typeof fn === "function") {
          handlerTarget[key] = wrap(key, fn as (...a: unknown[]) => unknown);
        }
      }
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
            console.warn(`[whisper-worker][proxy] missing: "${prop}"`);
          }
          return value;
        },
      });
      Module = await createModule(
        handlerProxy as unknown as Record<string, unknown>,
      );
    } finally {
      if (keepalive) clearInterval(keepalive);
    }

    // ── モデルを WASM FS に書き込む ──
    postResponse({ type: "model-progress", progress: 88 });

    try {
      Module.FS_unlink("model.bin");
    } catch {
      // ファイルが存在しない場合は正常
    }
    Module.FS_createDataFile("/", "model.bin", modelData!, true, true);

    // iOS ~800MB タブ予算対策: WASM FS にコピー済み → JS 側の参照を即解放。
    // small (181MB) で 362MB → 181MB にピークが半減する。
    modelData = null;
    (self as unknown as { gc?: () => void }).gc?.();

    // ── whisper コンテキスト初期化 ──
    postResponse({ type: "model-progress", progress: 95 });
    Module.init("model.bin", ""); // "" = DTW alignment なし

    whisperModule = Module;
    currentModelKey = modelKey;

    postResponse({ type: "model-loaded", progress: 100 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const category: WhisperErrorCategory = /モデルダウンロード失敗: HTTP \d+|NetworkError|Failed to fetch|fetch/i.test(
      message,
    )
      ? "network"
      : /out of memory|allocation|Memory/i.test(message)
        ? "oom"
        : "runtime";
    reportError(
      `モデル読み込みエラー: ${message}`,
      category,
    );
  }
}

// ──────────────────────────────────────────────────────────────────
// transcribe
// ──────────────────────────────────────────────────────────────────

// ハルシネーションフィルタ: Whisper が無音入力時に生成する非音声トークンを除去。
// 日本語 YouTube 学習由来の定型フレーズ (ご視聴〜等) も別パターンで除去する。
const hallucinationPattern =
  /^\s*[\(\[（【♪]*(?:music|applause|laughter|silence|background noise|no speech|ミュージック|音楽|拍手|笑い声|沈黙|♪)[\)\]）】♪]*\s*$/i;

const japaneseBoilerplatePattern =
  /^\s*(?:ご(?:視聴|清聴)(?:ありがとう|頂き|いただき)|チャンネル登録|高評価(?:とチャンネル登録)?(?:お願い)?|最後まで(?:ご視聴|見て)|今日は[^。]{0,10}ありがとう|また(?:次回|来週|明日))/;

interface TranscriptionSegment {
  offsets: { from: number; to: number }; // ミリ秒
  text: string;
}

interface TranscriptionResult {
  transcription: TranscriptionSegment[];
}

async function transcribe(
  audioData: Float32Array,
  sampleRate: 16000,
  language: string,
) {
  if (!whisperModule) {
    reportError("モデルが読み込まれていません", "runtime");
    return;
  }
  if (sampleRate !== 16000) {
    reportError(`unsupported sampleRate: ${sampleRate}`, "runtime");
    return;
  }

  try {
    postResponse({ type: "transcription-progress", progress: 5 });

    const threads = getMaxThreads();

    whisperModule.onProgress = (p: number) => {
      postResponse({
        type: "transcription-progress",
        progress: 5 + Math.round(p * 0.9),
      });
    };

    // ===== Patent Design-Around: VoyagerX (US11763099B1) =====
    // token_timestamps: true はセグメントレベルのタイムスタンプ。
    // 単語レベルのタイムスタンプ (split_on_word + max_len) は使用しない。
    // これにより VoyagerX 特許の「単語タイムスタンプ」構成要件を回避。
    // ===========================================================
    const result = await new Promise<TranscriptionResult>((resolve, reject) => {
      whisperModule!.onTranscribed = (r: TranscriptionResult) => resolve(r);
      try {
        whisperModule!.transcribe(
          audioData,
          language,
          threads,
          false, // translate
          0, // max_len
          false, // split_on_word
          false, // suppress_non_speech
          true, // token_timestamps
        );
      } catch (err) {
        reject(err);
      }
    });

    // whisper.cpp はオフセットをミリ秒で返す → 秒に変換
    const rawChunks: TranscriptionChunk[] = result.transcription
      .map((seg) => ({
        text: seg.text.trim(),
        timestamp: [seg.offsets.from / 1000, seg.offsets.to / 1000] as [
          number,
          number,
        ],
      }))
      .filter((c) => c.text.length > 0);

    const finalChunks = rawChunks.filter(
      (c) =>
        !hallucinationPattern.test(c.text) &&
        !japaneseBoilerplatePattern.test(c.text),
    );

    const sampleRawTexts = rawChunks.slice(0, 5).map((c) => c.text);
    const diagnostics: WhisperDiagnostics = {
      device: "wasm",
      modelId: activeModelId,
      dtype: currentModelKey?.split("-").pop() ?? "unknown",
      rawChunkCount: rawChunks.length,
      filteredCount: finalChunks.length,
      removedCount: rawChunks.length - finalChunks.length,
      sampleRawTexts,
      truncatedFrom: rawChunks.length > sampleRawTexts.length ? rawChunks.length : undefined,
      // backward compatibility for old readers.
      finalChunkCount: finalChunks.length,
      sampleTexts: sampleRawTexts,
    };

    postResponse({
      type: "transcription-result",
      data: finalChunks,
      progress: 100,
      diagnostics,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    reportError(
      `音声認識エラー: ${message}`,
      /memory access out of bounds|out of memory|OOM|allocate/i.test(message)
        ? "oom"
        : "runtime",
    );
  } finally {
    (self as unknown as { gc?: () => void }).gc?.();
  }
}
