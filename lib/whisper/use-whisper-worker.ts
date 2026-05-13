// use-whisper-worker.ts
"use client";

import { createWhisperWorker } from "./whisper-worker-factory";
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

export type RunResult =
  | { ok: true; chunks: TranscriptionChunk[]; diagnostics: WhisperDiagnostics }
  | { ok: false; error: string; category: ErrCategory };

export interface UseWhisperWorkerOptions {
  model?: { modelId: string; quantize: "fp32" | "q4" };
  readyTimeoutMs?: number;
  loadTimeoutMs?: number;
  transcribeTimeoutMs?: number;
  onProgress?: (stage: "loading-model" | "processing", percent: number) => void;
  workerFactory?: () => Worker;
}

type WorkerError = Error & { category: ErrCategory };

function makeErr(message: string, category: ErrCategory): WorkerError {
  const e = new Error(message) as WorkerError;
  e.category = category;
  return e;
}

function toErrCategory(category: "oom" | "abort" | "runtime" | "network") {
  return category === "abort" ? "aborted" : category;
}

export function useWhisperWorker(opts: UseWhisperWorkerOptions = {}) {
  const workerRef = useRef<Worker | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const {
    model,
    readyTimeoutMs = 10_000,
    loadTimeoutMs = 60_000,
    transcribeTimeoutMs = 5 * 60_000,
    onProgress,
    workerFactory,
  } = opts;

  // Latest-ref pattern: keep `run` identity stable even when the caller
  // passes an inline onProgress. The ref is read only inside helper
  // callbacks, so `run` does not need to depend on it.
  const onProgressRef = useRef(onProgress);
  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);

  const run = useCallback(
    async (
      audioOwned: Float32Array,
      language: string,
      modelOverride?: UseWhisperWorkerOptions["model"],
    ): Promise<RunResult> => {
      // Overlap guard — one run at a time, no workerRef stomping.
      if (workerRef.current) {
        return {
          ok: false,
          error: "another run is in progress",
          category: "runtime",
        };
      }

      // Detached / empty buffer guard — accidental reuse of a previously
      // transferred Float32Array yields length 0 and would silently pass.
      if (audioOwned.length === 0) {
        return {
          ok: false,
          error: "audio buffer is empty or already detached",
          category: "runtime",
        };
      }

      const ac = new AbortController();
      const worker = (workerFactory ?? createWhisperWorker)();
      workerRef.current = worker;
      abortRef.current = ac;

      const emitProgress: NonNullable<UseWhisperWorkerOptions["onProgress"]> = (
        stage,
        percent,
      ) => onProgressRef.current?.(stage, percent);

      try {
        await waitForPong(worker, readyTimeoutMs, ac.signal);
        await sendLoadModel(
          worker,
          modelOverride ?? model,
          emitProgress,
          loadTimeoutMs,
          ac.signal,
        );
        const result = await sendTranscribe(
          worker,
          audioOwned,
          language,
          emitProgress,
          transcribeTimeoutMs,
          ac.signal,
        );

        if (result.data.length === 0) {
          return {
            ok: false,
            error: "no transcription chunks",
            category: "empty",
          };
        }
        return {
          ok: true,
          chunks: result.data,
          diagnostics: result.diagnostics,
        };
      } catch (err) {
        const e = err as Partial<WorkerError>;
        return {
          ok: false,
          error: e.message ?? String(err),
          category: e.category ?? "runtime",
        };
      } finally {
        // Defensive: any helper still pending must settle via signal.
        if (!ac.signal.aborted) ac.abort();
        cleanupWorker(worker, "dispose");
        // Ownership check — do not stomp a newer run's refs.
        if (workerRef.current === worker) workerRef.current = null;
        if (abortRef.current === ac) abortRef.current = null;
      }
    },
    [
      model?.modelId,
      model?.quantize,
      readyTimeoutMs,
      loadTimeoutMs,
      transcribeTimeoutMs,
      workerFactory,
    ],
  );

  const abort = useCallback(() => {
    // Signal first so any pending await rejects; then tear down the worker.
    abortRef.current?.abort();
    const w = workerRef.current;
    if (w) cleanupWorker(w, "abort");
    workerRef.current = null;
    abortRef.current = null;
  }, []);

  useEffect(() => () => abort(), [abort]);

  return { run, abort };
}

function cleanupWorker(worker: Worker, finalMsg: "dispose" | "abort") {
  try {
    worker.postMessage({ type: finalMsg } satisfies WorkerInboundMessage);
  } catch {
    // worker already gone
  }
  try {
    worker.terminate();
  } catch {
    // noop
  }
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
    let timer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
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
      // iOS Safari の ErrorEvent は .message が空/未定義のことがあるため、
      // filename/lineno/error.message まで拾って診断情報を最大化する。
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

    timer = setTimeout(() => {
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
        onProgress?.("loading-model", data.progress);
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
        onProgress?.("processing", data.progress);
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
