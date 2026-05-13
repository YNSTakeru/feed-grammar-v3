export interface TranscriptionChunk {
  text: string;
  timestamp: [number, number];
}

export interface WhisperDiagnostics {
  device: "wasm" | "webgpu";
  modelId: string;
  dtype: string;
  timings: {
    workerInitMs: number;
    modelLoadMs: number;
    inferenceMs: number;
    totalMs: number;
  };
  rawChunkCount: number;
  filteredCount: number;
  removedCount: number;
  sampleRawTexts: string[];
  truncatedFrom?: number;
  // backward compatibility for old consumers/tests.
  finalChunkCount?: number;
  sampleTexts?: string[];
}

export type WhisperErrorCategory = "oom" | "abort" | "runtime" | "network";

export type WorkerInboundMessage =
  | { type: "ping" }
  | { type: "load-model"; modelId?: string; quantize?: "fp32" | "q4" }
  | {
      type: "transcribe";
      /**
       * WARNING: This Float32Array's underlying ArrayBuffer MUST be posted as a
       * Transferable (second argument of `postMessage`). Ownership moves to the
       * Worker and the sender's view is detached — accessing `audioData.length`
       * or any element after post will yield 0 / throw. Do not reuse.
       */
      audioData: Float32Array;
      sampleRate: 16000;
      language: string;
    }
  | { type: "abort" }
  | { type: "reset" }
  | { type: "dispose" };

export type WorkerOutboundMessage =
  | { type: "pong" }
  | { type: "model-progress"; progress: number; status?: string }
  | { type: "model-loaded"; progress: 100 }
  | { type: "transcription-progress"; progress: number }
  | {
      type: "transcription-result";
      data: TranscriptionChunk[];
      progress: 100;
      diagnostics: WhisperDiagnostics;
    }
  | { type: "error"; message: string; category: WhisperErrorCategory };
