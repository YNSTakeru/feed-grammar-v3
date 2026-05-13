// whisper-worker-webgpu.ts
// WebGPU-backed Whisper inference via @huggingface/transformers
// Speaks the same WorkerInboundMessage/WorkerOutboundMessage protocol as whisper-worker.ts

import { pipeline, type DataType } from "@huggingface/transformers";
import type {
  TranscriptionChunk,
  WhisperDiagnostics,
  WhisperErrorCategory,
  WorkerInboundMessage,
  WorkerOutboundMessage,
} from "./whisper-worker-protocol";
import {
  detectRuntimeCaps,
  resolveGgufModel,
  type GgufModelKey,
} from "./whisper-model-selection";

// Map GGUF model keys → HuggingFace ONNX model IDs + quantization dtypes
interface HfModelConfig {
  hfId: string;
  dtype: DataType | Record<string, DataType>;
}

const HF_MODEL_MAP: Partial<Record<GgufModelKey, HfModelConfig>> = {
  "ggml-large-v3-turbo-q5_0": {
    hfId: "onnx-community/whisper-large-v3-turbo",
    dtype: { encoder_model: "fp16", decoder_model_merged: "q4" },
  },
  "ggml-medium-q5_0": {
    hfId: "onnx-community/whisper-medium",
    dtype: { encoder_model: "fp16", decoder_model_merged: "q4" },
  },
  "ggml-small-q5_1": {
    hfId: "onnx-community/whisper-small",
    dtype: "q8",
  },
  "ggml-base-q5_1": {
    hfId: "onnx-community/whisper-base",
    dtype: "q8",
  },
  "ggml-tiny-q5_1": {
    hfId: "onnx-community/whisper-tiny",
    dtype: "q8",
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let transcriber: any = null;
let currentModelKey: GgufModelKey | null = null;
let isBusy = false;
let isAborted = false;

const runtimeCaps = detectRuntimeCaps(
  navigator as Navigator & { deviceMemory?: number; gpu?: unknown },
);

function postResponse(response: WorkerOutboundMessage) {
  self.postMessage(response);
}

function reportError(message: string, category: WhisperErrorCategory) {
  postResponse({ type: "error", message, category });
}

// Worker-level error handling — mirror the WASM worker's uncaught error forwarding
self.addEventListener("error", (ev: ErrorEvent) => {
  const msg = ev.message ?? String(ev);
  try {
    reportError(`worker uncaught: ${msg}`, /memory|allocat|OOM/i.test(msg) ? "oom" : "runtime");
  } catch {
    // postMessage failed — worker likely dying
  }
});
self.addEventListener("unhandledrejection", (ev: PromiseRejectionEvent) => {
  const reason = ev.reason;
  let msg: string;
  if (reason instanceof Error) {
    msg = `${reason.name}: ${reason.message}`;
  } else {
    try {
      msg = typeof reason === "string" ? reason : JSON.stringify(reason);
    } catch {
      msg = `<non-serializable>`;
    }
  }
  try {
    reportError(`worker unhandledrejection: ${msg}`, /memory|allocat|OOM/i.test(msg) ? "oom" : "runtime");
  } catch {
    // ignore
  }
});

async function loadModel(modelIdOverride?: string): Promise<GgufModelKey> {
  const modelKey = resolveGgufModel(modelIdOverride, runtimeCaps);

  if (transcriber && currentModelKey === modelKey) {
    postResponse({ type: "model-loaded", progress: 100 });
    return modelKey;
  }

  const config = HF_MODEL_MAP[modelKey];
  if (!config) {
    throw Object.assign(
      new Error(`WebGPU: no HF model mapping for key: ${modelKey}`),
      { category: "runtime" as WhisperErrorCategory },
    );
  }

  const fileProgress = new Map<string, { loaded: number; total: number }>();

  postResponse({ type: "model-progress", progress: 0, status: "loading-model" });

  // Destroy previous transcriber before loading new one to free GPU memory
  if (transcriber) {
    try {
      await transcriber.dispose?.();
    } catch {
      // ignore
    }
    transcriber = null;
    currentModelKey = null;
  }

  transcriber = await pipeline(
    "automatic-speech-recognition",
    config.hfId,
    {
      device: "webgpu",
      dtype: config.dtype,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      progress_callback: (info: any) => {
        if (
          (info.status === "progress" || info.status === "downloading") &&
          info.file &&
          typeof info.loaded === "number" &&
          typeof info.total === "number" &&
          info.total > 0
        ) {
          fileProgress.set(info.file as string, {
            loaded: info.loaded as number,
            total: info.total as number,
          });

          let totalLoaded = 0;
          let totalBytes = 0;
          for (const { loaded, total } of fileProgress.values()) {
            totalLoaded += loaded;
            totalBytes += total;
          }
          // Scale download progress to 0–90; reserve 90–100 for pipeline init
          const pct = Math.min(90, Math.round((totalLoaded / totalBytes) * 90));
          postResponse({ type: "model-progress", progress: pct, status: "loading-model" });
        }
      },
    },
  );

  currentModelKey = modelKey;
  postResponse({ type: "model-loaded", progress: 100 });
  return modelKey;
}

self.onmessage = async (event: MessageEvent<WorkerInboundMessage>) => {
  const msg = event.data;

  // ping / abort / dispose / reset are non-exclusive
  if (msg.type === "ping") {
    postResponse({ type: "pong" });
    return;
  }

  if (msg.type === "abort") {
    isAborted = true;
    return;
  }

  if (msg.type === "dispose") {
    if (transcriber) {
      try {
        await transcriber.dispose?.();
      } catch {
        // ignore
      }
      transcriber = null;
      currentModelKey = null;
    }
    return;
  }

  if (msg.type === "reset") {
    isAborted = false;
    isBusy = false;
    return;
  }

  if (msg.type === "load-model") {
    if (isBusy) return;
    isBusy = true;
    try {
      await loadModel(msg.modelId);
    } catch (err) {
      const e = err as Partial<Error & { category?: WhisperErrorCategory }>;
      reportError(e.message ?? String(err), e.category ?? "runtime");
    } finally {
      isBusy = false;
    }
    return;
  }

  if (msg.type === "transcribe") {
    if (isBusy) return;
    isBusy = true;
    isAborted = false;

    try {
      if (!transcriber || !currentModelKey) {
        throw Object.assign(
          new Error("Model not loaded — send load-model before transcribe"),
          { category: "runtime" as WhisperErrorCategory },
        );
      }

      const audioData = msg.audioData;
      const language = msg.language;

      postResponse({ type: "transcription-progress", progress: 10 });

      // AudioInput = Float32Array | Float64Array | string | URL — pass Float32Array directly.
      // The pipeline's feature extractor expects 16kHz PCM; audioData is already resampled.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (transcriber as any)(
        audioData,
        {
          language,
          task: "transcribe",
          return_timestamps: true,
          chunk_length_s: 30,
        },
      );

      if (isAborted) return;

      postResponse({ type: "transcription-progress", progress: 90 });

      // result.chunks may be absent for very short audio; fall back to single chunk
      const rawChunks: Array<{ text: string; timestamp: [number, number | null] }> =
        Array.isArray(result.chunks) && result.chunks.length > 0
          ? result.chunks
          : [{ text: result.text as string, timestamp: [0, null] as [number, null] }];

      const chunks: TranscriptionChunk[] = rawChunks
        .filter((c) => c.text.trim().length > 0)
        .map((c) => ({
          text: c.text,
          // null end-timestamp (last chunk) → use start + 1s as sentinel
          timestamp: [c.timestamp[0], c.timestamp[1] ?? c.timestamp[0] + 1] as [number, number],
        }));

      const modelConfig = HF_MODEL_MAP[currentModelKey]!;
      const dtypeStr =
        typeof modelConfig.dtype === "string"
          ? modelConfig.dtype
          : JSON.stringify(modelConfig.dtype);

      const diagnostics: WhisperDiagnostics = {
        device: "webgpu",
        modelId: modelConfig.hfId,
        dtype: dtypeStr,
        // Timings are overridden by buildTimings() in use-whisper-worker.ts
        timings: { workerInitMs: 0, modelLoadMs: 0, inferenceMs: 0, totalMs: 0 },
        rawChunkCount: rawChunks.length,
        filteredCount: chunks.length,
        removedCount: rawChunks.length - chunks.length,
        sampleRawTexts: rawChunks.slice(0, 3).map((c) => c.text),
      };

      postResponse({
        type: "transcription-result",
        data: chunks,
        progress: 100,
        diagnostics,
      });
    } catch (err) {
      const e = err as Partial<Error & { category?: WhisperErrorCategory }>;
      const message = e.message ?? String(err);
      const category: WhisperErrorCategory = /memory|allocat|OOM/i.test(message)
        ? "oom"
        : (e.category ?? "runtime");
      reportError(message, category);
    } finally {
      isBusy = false;
    }
  }
};
