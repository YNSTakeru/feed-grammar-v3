export const GGUF_BASE_URL =
  "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/";

export const GGUF_MODELS = {
  "ggml-tiny-q5_1": { sizeMB: 32 },
  "ggml-base-q5_1": { sizeMB: 56 },
  "ggml-small-q5_1": { sizeMB: 181 },
  "ggml-medium-q5_0": { sizeMB: 514 },
  "ggml-large-v3-turbo-q5_0": { sizeMB: 547 },
} as const;

export type GgufModelKey = keyof typeof GGUF_MODELS;

export const GGUF_BASE_MODEL_KEY: GgufModelKey = "ggml-base-q5_1";
export const GGUF_MEDIUM_MODEL_KEY: GgufModelKey = "ggml-medium-q5_0";

export interface WhisperRuntimeCaps {
  userAgent: string;
  deviceMemory: number;
  hardwareConcurrency: number;
  hasWebGPU: boolean;
}

interface NavigatorLike {
  userAgent: string;
  hardwareConcurrency?: number;
  deviceMemory?: number;
  gpu?: unknown;
}

export function isIOSUserAgent(userAgent: string): boolean {
  return /iPhone|iPad/i.test(userAgent);
}

export function isAndroidUserAgent(userAgent: string): boolean {
  return /Android/i.test(userAgent);
}

export function isSafariUserAgent(userAgent: string): boolean {
  return /^((?!chrome|android|edg).)*safari/i.test(userAgent);
}

export function detectRuntimeCaps(navigatorLike: NavigatorLike): WhisperRuntimeCaps {
  return {
    userAgent: navigatorLike.userAgent,
    deviceMemory: navigatorLike.deviceMemory ?? 0,
    hardwareConcurrency: navigatorLike.hardwareConcurrency ?? 0,
    hasWebGPU: "gpu" in navigatorLike && navigatorLike.gpu !== undefined,
  };
}

export function autoSelectGgufModel(caps: WhisperRuntimeCaps): GgufModelKey {
  if (isIOSUserAgent(caps.userAgent) || isAndroidUserAgent(caps.userAgent)) {
    return "ggml-tiny-q5_1";
  }
  if (isSafariUserAgent(caps.userAgent) && !caps.hasWebGPU) {
    return GGUF_BASE_MODEL_KEY;
  }
  // @transcribe/shout WASM runs on CPU regardless of WebGPU — there is no GPU
  // inference path. The medium model (514MB) takes 60-120 s cold-start on CPU
  // even with SIMD+pthreads, which is unacceptable UX.
  //
  // Note: navigator.deviceMemory is capped at 8 by browsers, so the ≥16 gate
  // is intentionally unreachable via auto-select. Use a modelId override (e.g.
  // "ggml-medium-q5_0") to opt-in to medium explicitly.
  if (
    caps.deviceMemory >= 16 &&
    caps.hardwareConcurrency >= 8 &&
    caps.hasWebGPU
  ) {
    return GGUF_MEDIUM_MODEL_KEY;
  }
  // ggml-small-q5_1 (181MB) measured ~72 s/inference in @transcribe/shout v1.0.7
  // WASM — SIMD acceleration is not effective in this build, making small
  // unacceptably slow. Cap auto-select at base (56MB, ~12 s) on capable desktops;
  // tiny (32MB, ~6 s) everywhere else.
  if (caps.deviceMemory >= 4 && caps.hardwareConcurrency >= 4) {
    return GGUF_BASE_MODEL_KEY;
  }
  return "ggml-tiny-q5_1";
}

export function resolveGgufModel(
  modelIdOverride: string | undefined,
  caps: WhisperRuntimeCaps,
): GgufModelKey {
  if (modelIdOverride) {
    if (modelIdOverride in GGUF_MODELS) {
      return modelIdOverride as GgufModelKey;
    }
    if (modelIdOverride.includes("large")) return "ggml-large-v3-turbo-q5_0";
    if (modelIdOverride.includes("medium")) return "ggml-medium-q5_0";
    if (modelIdOverride.includes("small")) return "ggml-small-q5_1";
    if (modelIdOverride.includes("base")) return GGUF_BASE_MODEL_KEY;
    if (modelIdOverride.includes("tiny")) return "ggml-tiny-q5_1";
  }
  return autoSelectGgufModel(caps);
}

export function getGgufUrl(key: GgufModelKey): string {
  return `${GGUF_BASE_URL}${key}.bin`;
}

export function isMediumOrLargerModel(modelKey: GgufModelKey): boolean {
  return GGUF_MODELS[modelKey].sizeMB >= GGUF_MODELS[GGUF_MEDIUM_MODEL_KEY].sizeMB;
}
