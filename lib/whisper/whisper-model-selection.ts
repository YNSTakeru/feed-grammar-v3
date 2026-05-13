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
  // WebGPU path: whisper-large-v3-turbo via @huggingface/transformers achieves
  // ~2–3 s inference on 8 GB VRAM, making the large model viable.
  // Requires at least 4 hardware threads to avoid blocking the main thread.
  if (caps.hasWebGPU && caps.hardwareConcurrency >= 4) {
    return "ggml-large-v3-turbo-q5_0";
  }
  // WASM-only path (@transcribe/shout): cap at base (56MB, ~12s) for capable
  // desktops. small (181MB) takes ~72s in this build — unacceptable UX.
  // Note: navigator.deviceMemory is browser-capped at 8, so the ≥16 gate
  // above is unreachable via auto-select. Use a modelId override to opt-in.
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
