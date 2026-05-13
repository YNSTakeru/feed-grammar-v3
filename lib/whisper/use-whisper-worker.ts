// use-whisper-worker.ts
"use client";

import { IDBModelCache } from "./idb-model-cache";
import {
  acquireWorker,
  createWhisperWorker,
  destroyWorker,
  detectWhisperWorkerPlatform,
  getOrCreateWorker,
  releaseWorker,
  type WhisperWorkerPlatform,
} from "./whisper-worker-factory";
import {
  GGUF_BASE_MODEL_KEY,
  GGUF_MODELS,
  detectRuntimeCaps,
  getGgufUrl,
  isMediumOrLargerModel,
  resolveGgufModel,
  type GgufModelKey,
} from "./whisper-model-selection";
import type {
  TranscriptionChunk,
  WhisperDiagnostics,
  WorkerInboundMessage,
  WorkerOutboundMessage,
} from "./whisper-worker-protocol";
import { useCallback, useEffect, useRef } from "react";

type ErrCategory =
  | "timeout"
  | "oom"
  | "runtime"
  | "aborted"
  | "empty"
  | "network";

type ProgressStage = "initializing-wasm" | "loading-model" | "transcribing";

const MODEL_CONSENT_KEY = "whisper-model-consent";
const BLUR_STATE_KEY = "whisper-blur-state";

type WorkerError = Error & { category: ErrCategory };

interface BlurState {
  modelKey?: GgufModelKey;
  workerAlive: boolean;
}

export type RunResult =
  | { ok: true; chunks: TranscriptionChunk[]; diagnostics: WhisperDiagnostics }
  | { ok: false; error: string; category: ErrCategory };

export interface UseWhisperWorkerOptions {
  model?: { modelId: string; quantize: "fp32" | "q4" };
  readyTimeoutMs?: number;
  loadTimeoutMs?: number;
  transcribeTimeoutMs?: number;
  onProgress?: (stage: ProgressStage, percent: number) => void;
  workerFactory?: () => Worker;
}

function makeErr(message: string, category: ErrCategory): WorkerError {
  const e = new Error(message) as WorkerError;
  e.category = category;
  return e;
}

function toErrCategory(category: "oom" | "abort" | "runtime" | "network") {
  return category === "abort" ? "aborted" : category;
}

function sendWorkerControl(worker: Worker, type: "abort" | "dispose" | "reset") {
  try {
    worker.postMessage({ type } satisfies WorkerInboundMessage);
  } catch {
    // worker already gone
  }
}

function terminateWorker(worker: Worker) {
  try {
    worker.terminate();
  } catch {
    // noop
  }
}

function cleanupWorker(worker: Worker, finalMsg: "dispose" | "abort") {
  sendWorkerControl(worker, finalMsg);
  terminateWorker(worker);
}

function readConsentMap(): Record<string, true> {
  try {
    const raw = window.localStorage.getItem(MODEL_CONSENT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, true>;
  } catch {
    return {};
  }
}

function writeConsentMap(next: Record<string, true>) {
  try {
    window.localStorage.setItem(MODEL_CONSENT_KEY, JSON.stringify(next));
  } catch {
    // ignore storage write errors
  }
}

function readBlurState(): BlurState | null {
  try {
    const raw = window.localStorage.getItem(BLUR_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BlurState>;
    return {
      modelKey: parsed.modelKey,
      workerAlive: parsed.workerAlive === true,
    };
  } catch {
    return null;
  }
}

async function hasModelInCache(cache: IDBModelCache, modelKey: GgufModelKey) {
  const cached = await cache.match(getGgufUrl(modelKey));
  return Boolean(cached);
}

function buildTimings(
  t0: number,
  tPong: number,
  tModel: number,
  tInference: number,
) {
  return {
    workerInitMs: Math.max(0, Math.round(tPong - t0)),
    modelLoadMs: Math.max(0, Math.round(tModel - tPong)),
    inferenceMs: Math.max(0, Math.round(tInference - tModel)),
    totalMs: Math.max(0, Math.round(tInference - t0)),
  };
}

function withTimings(
  diagnostics: WhisperDiagnostics,
  timings: WhisperDiagnostics["timings"],
  modelId: string,
): WhisperDiagnostics {
  return {
    ...diagnostics,
    modelId,
    timings,
  };
}

export function useWhisperWorker(opts: UseWhisperWorkerOptions = {}) {
  const workerRef = useRef<Worker | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const isRunningRef = useRef(false);
  const hasPersistentLeaseRef = useRef(false);
  const platformRef = useRef<WhisperWorkerPlatform | null>(null);
  const loadedModelRef = useRef<GgufModelKey | null>(null);
  const modelCacheRef = useRef<IDBModelCache | null>(null);

  const {
    model,
    readyTimeoutMs = 10_000,
    loadTimeoutMs = 60_000,
    transcribeTimeoutMs = 5 * 60_000,
    onProgress,
    workerFactory,
  } = opts;

  const onProgressRef = useRef(onProgress);
  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);

  const modelRef = useRef(model);
  useEffect(() => {
    modelRef.current = model;
  }, [model]);

  const getPlatform = useCallback(() => {
    if (!platformRef.current) {
      platformRef.current = detectWhisperWorkerPlatform();
    }
    return platformRef.current;
  }, []);

  const isPersistentPlatform = useCallback(
    () => !workerFactory && getPlatform() === "pc",
    [getPlatform, workerFactory],
  );

  const getModelCache = useCallback(() => {
    if (!modelCacheRef.current) {
      modelCacheRef.current = new IDBModelCache();
    }
    return modelCacheRef.current;
  }, []);

  const ensureModelConsent = useCallback(
    async (modelKey: GgufModelKey) => {
      if (!isMediumOrLargerModel(modelKey)) return modelKey;

      const cache = getModelCache();
      if (await hasModelInCache(cache, modelKey)) {
        return modelKey;
      }

      const consentMap = readConsentMap();
      if (consentMap[modelKey]) {
        return modelKey;
      }

      const accepted = window.confirm(
        `高精度モデル (${GGUF_MODELS[modelKey].sizeMB}MB) をダウンロードしますか？`,
      );
      if (!accepted) {
        return GGUF_BASE_MODEL_KEY;
      }

      writeConsentMap({ ...consentMap, [modelKey]: true });
      return modelKey;
    },
    [getModelCache],
  );

  const run = useCallback(
    async (
      audioOwned: Float32Array,
      language: string,
      modelOverride?: UseWhisperWorkerOptions["model"],
    ): Promise<RunResult> => {
      if (isRunningRef.current) {
        return {
          ok: false,
          error: "another run is in progress",
          category: "runtime",
        };
      }

      if (audioOwned.length === 0) {
        return {
          ok: false,
          error: "audio buffer is empty or already detached",
          category: "runtime",
        };
      }

      // モデル解決と同意ダイアログを isRunningRef.current = true の前に実行する。
      // window.confirm() 表示中に visibilitychange: "hidden" が発火すると
      // abortRef が abort され、同意後の sendLoadModel/sendTranscribe が即失敗する
      // (Bug #1)。isRunning 前に resolve することで abort を回避する。
      const requestedModel = modelOverride ?? modelRef.current;
      const runtimeCaps = detectRuntimeCaps(
        navigator as Navigator & { deviceMemory?: number; gpu?: unknown },
      );
      const resolvedModelKey = resolveGgufModel(
        requestedModel?.modelId,
        runtimeCaps,
      );
      const quantize = requestedModel?.quantize ?? "q4";
      let activeModelKey = await ensureModelConsent(resolvedModelKey);

      // consent await 後に再チェック: 並行 run が開始していた場合は諦める。
      if (isRunningRef.current) {
        return {
          ok: false,
          error: "another run is in progress",
          category: "runtime",
        };
      }

      isRunningRef.current = true;
      const ac = new AbortController();
      abortRef.current = ac;

      const persistentPath = isPersistentPlatform();
      const platform = getPlatform();
      let worker: Worker;
      if (persistentPath) {
        if (!hasPersistentLeaseRef.current) {
          worker = acquireWorker(platform);
          hasPersistentLeaseRef.current = true;
        } else {
          worker = getOrCreateWorker(platform);
        }
      } else {
        worker = (workerFactory ?? createWhisperWorker)();
      }
      workerRef.current = worker;

      const emitProgress: NonNullable<UseWhisperWorkerOptions["onProgress"]> = (
        stage,
        percent,
      ) => onProgressRef.current?.(stage, percent);

      let t0 = performance.now();
      let tPong = t0;
      let tModel = t0;
      let tInference = t0;

      try {
        try {
          await waitForPong(worker, readyTimeoutMs, ac.signal);
        } catch (err) {
          if (!persistentPath) throw err;
          destroyWorker(platform);
          worker = getOrCreateWorker(platform);
          workerRef.current = worker;
          t0 = performance.now();
          await waitForPong(worker, 2_000, ac.signal);
        }
        tPong = performance.now();
        console.log(`[whisper] ⚡ pong ${Math.round(tPong - t0)}ms | model: ${activeModelKey} | persistent: ${persistentPath}`);
        const loadActiveModel = async (modelKey: GgufModelKey) => {
          const timeout = isMediumOrLargerModel(modelKey)
            ? Math.max(loadTimeoutMs, 120_000)
            : loadTimeoutMs;
          await sendLoadModel(
            worker,
            { modelId: modelKey, quantize },
            emitProgress,
            timeout,
            ac.signal,
          );
        };

        try {
          await loadActiveModel(activeModelKey);
        } catch (err) {
          if (!isMediumOrLargerModel(activeModelKey)) throw err;
          console.error("[whisper] high-capacity model failed; fallback to base", err);
          activeModelKey = GGUF_BASE_MODEL_KEY;
          await loadActiveModel(activeModelKey);
        }
        loadedModelRef.current = activeModelKey;
        tModel = performance.now();
        console.log(
          `[whisper] 📦 model ${Math.round(tModel - tPong)}ms | ${activeModelKey} | 🧠 transcription starting (timeout: ${transcribeTimeoutMs}ms)`,
        );

        const result = await sendTranscribe(
          worker,
          audioOwned,
          language,
          emitProgress,
          transcribeTimeoutMs,
          ac.signal,
        );
        tInference = performance.now();

        if (result.data.length === 0) {
          return {
            ok: false,
            error: "no transcription chunks",
            category: "empty",
          };
        }

        const timings = buildTimings(t0, tPong, tModel, tInference);
        console.table(timings);

        return {
          ok: true,
          chunks: result.data,
          diagnostics: withTimings(
            result.diagnostics,
            timings,
            activeModelKey,
          ),
        };
      } catch (err) {
        const e = err as Partial<WorkerError>;
        const tNow = performance.now();
        console.table(buildTimings(t0, tPong, tModel, tNow));
        console.warn(`[whisper] ❌ ${e.category ?? "runtime"}: ${e.message ?? String(err)}`);
        return {
          ok: false,
          error: e.message ?? String(err),
          category: e.category ?? "runtime",
        };
      } finally {
        if (!ac.signal.aborted) ac.abort();
        if (persistentPath) {
          sendWorkerControl(worker, "reset");
        } else {
          cleanupWorker(worker, "dispose");
          if (workerRef.current === worker) workerRef.current = null;
        }
        if (abortRef.current === ac) abortRef.current = null;
        isRunningRef.current = false;
      }
    },
    [
      ensureModelConsent,
      getPlatform,
      isPersistentPlatform,
      loadTimeoutMs,
      readyTimeoutMs,
      transcribeTimeoutMs,
      workerFactory,
    ],
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();

    const worker = workerRef.current;
    if (!worker) return;

    sendWorkerControl(worker, "abort");
    if (!isPersistentPlatform()) {
      cleanupWorker(worker, "abort");
      workerRef.current = null;
    }
    abortRef.current = null;
    isRunningRef.current = false;
  }, [isPersistentPlatform]);

  useEffect(() => () => abort(), [abort]);

  useEffect(() => {
    if (!isPersistentPlatform()) return;

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        try {
          const payload: BlurState = {
            modelKey: loadedModelRef.current ?? undefined,
            workerAlive: workerRef.current !== null,
          };
          window.localStorage.setItem(BLUR_STATE_KEY, JSON.stringify(payload));
        } catch (err) {
          console.error("[whisper] failed to save blur state", err);
        }
        if (isRunningRef.current) {
          abortRef.current?.abort();
          const worker = workerRef.current;
          if (worker) sendWorkerControl(worker, "abort");
        }
        return;
      }

      if (document.visibilityState !== "visible") return;
      if (isRunningRef.current) return;

      const restore = async () => {
        const state = readBlurState();
        if (!state?.workerAlive) return;

        const platform = getPlatform();
        let worker = workerRef.current ?? getOrCreateWorker(platform);
        workerRef.current = worker;
        const restoreAbort = new AbortController();
        try {
          await waitForPong(worker, 2_000, restoreAbort.signal);
        } catch {
          destroyWorker(platform);
          worker = getOrCreateWorker(platform);
          workerRef.current = worker;
          await waitForPong(worker, 2_000, restoreAbort.signal);
          if (state.modelKey) {
            await sendLoadModel(
              worker,
              {
                modelId: state.modelKey,
                quantize: modelRef.current?.quantize ?? "q4",
              },
              (stage, percent) => onProgressRef.current?.(stage, percent),
              Math.max(loadTimeoutMs, 120_000),
              restoreAbort.signal,
            );
            loadedModelRef.current = state.modelKey;
          }
        } finally {
          if (!restoreAbort.signal.aborted) restoreAbort.abort();
        }
      };

      restore().catch((err) => {
        console.error("[whisper] failed to restore worker after focus", err);
      });
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [getPlatform, isPersistentPlatform, loadTimeoutMs]);

  useEffect(() => {
    return () => {
      if (!hasPersistentLeaseRef.current) return;
      const platform = getPlatform();
      releaseWorker(platform);
      hasPersistentLeaseRef.current = false;
      workerRef.current = null;
    };
  }, [getPlatform]);

  return { run, abort };
}

/**
 * Shared cleanup discipline for a single Worker request/response phase.
 * Registers message/timeout/abort listeners and guarantees all three are
 * removed exactly once (on settle). `handle` is a pure per-message reducer
 * that calls `done`/`fail` when the phase completes or errors out.
 */
function awaitWorkerMessage<T>(
  worker: Worker,
  signal: AbortSignal,
  timeoutMs: number,
  label: string,
  handle: (
    data: WorkerOutboundMessage,
    done: (v: T) => void,
    fail: (e: WorkerError) => void,
  ) => void,
  send: () => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.removeEventListener("message", onMsg);
      worker.removeEventListener("error", onErr);
      worker.removeEventListener("messageerror", onErr);
      signal.removeEventListener("abort", onAbort);
    };

    const onMsg = (ev: MessageEvent<WorkerOutboundMessage>) => {
      if (settled) return;
      handle(
        ev.data,
        (v) => {
          cleanup();
          resolve(v);
        },
        (e) => {
          cleanup();
          reject(e);
        },
      );
    };

    const onErr = (ev: Event) => {
      if (settled) return;
      const ee = ev as Partial<ErrorEvent> & {
        error?: { message?: string; stack?: string };
      };
      const parts: string[] = [];
      if (typeof ee.message === "string" && ee.message.length > 0) {
        parts.push(ee.message);
      }
      if (ee.error?.message) parts.push(`error.message=${ee.error.message}`);
      if (ee.filename) parts.push(`at ${ee.filename}:${ee.lineno}:${ee.colno}`);
      const detail = parts.length > 0 ? parts.join(" | ") : `${ev.type} (${label})`;
      cleanup();
      reject(makeErr(`worker ${ev.type}: ${detail}`, "runtime"));
    };

    const onAbort = () => {
      cleanup();
      reject(makeErr(`${label} aborted`, "aborted"));
    };

    if (signal.aborted) {
      reject(makeErr(`${label} aborted`, "aborted"));
      return;
    }

    const timer = setTimeout(() => {
      cleanup();
      reject(makeErr(`${label} timeout (${timeoutMs}ms)`, "timeout"));
    }, timeoutMs);
    signal.addEventListener("abort", onAbort, { once: true });
    worker.addEventListener("message", onMsg);
    worker.addEventListener("error", onErr);
    worker.addEventListener("messageerror", onErr);

    try {
      send();
    } catch (e) {
      cleanup();
      reject(e);
    }
  });
}

function waitForPong(
  worker: Worker,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<void> {
  return awaitWorkerMessage<void>(
    worker,
    signal,
    timeoutMs,
    "ready",
    (data, done) => {
      if (data.type === "pong") done();
    },
    () => worker.postMessage({ type: "ping" } satisfies WorkerInboundMessage),
  );
}

function sendLoadModel(
  worker: Worker,
  model: UseWhisperWorkerOptions["model"],
  onProgress: UseWhisperWorkerOptions["onProgress"],
  timeoutMs: number,
  signal: AbortSignal,
): Promise<void> {
  return awaitWorkerMessage<void>(
    worker,
    signal,
    timeoutMs,
    "load-model",
    (data, done, fail) => {
      if (data.type === "model-progress") {
        const stage =
          data.status === "initializing-wasm" ? "initializing-wasm" : "loading-model";
        onProgress?.(stage, data.progress);
      } else if (data.type === "model-loaded") {
        done();
      } else if (data.type === "error") {
        fail(makeErr(data.message, toErrCategory(data.category ?? "runtime")));
      }
    },
    () => {
      const msg: WorkerInboundMessage = { type: "load-model" };
      if (model) {
        msg.modelId = model.modelId;
        msg.quantize = model.quantize;
      }
      worker.postMessage(msg);
    },
  );
}

function sendTranscribe(
  worker: Worker,
  audioOwned: Float32Array,
  language: string,
  onProgress: UseWhisperWorkerOptions["onProgress"],
  timeoutMs: number,
  signal: AbortSignal,
): Promise<{ data: TranscriptionChunk[]; diagnostics: WhisperDiagnostics }> {
  return awaitWorkerMessage<{
    data: TranscriptionChunk[];
    diagnostics: WhisperDiagnostics;
  }>(
    worker,
    signal,
    timeoutMs,
    "transcribe",
    (data, done, fail) => {
      if (data.type === "transcription-progress") {
        onProgress?.("transcribing", data.progress);
      } else if (data.type === "transcription-result") {
        done({ data: data.data, diagnostics: data.diagnostics });
      } else if (data.type === "error") {
        fail(makeErr(data.message, toErrCategory(data.category ?? "runtime")));
      }
    },
    () =>
      worker.postMessage(
        {
          type: "transcribe",
          audioData: audioOwned,
          sampleRate: 16000,
          language,
        } satisfies WorkerInboundMessage,
        [audioOwned.buffer as ArrayBuffer],
      ),
  );
}
