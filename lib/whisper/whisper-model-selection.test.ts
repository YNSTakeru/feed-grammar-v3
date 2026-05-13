import { describe, expect, it } from "vitest";
import {
  autoSelectGgufModel,
  detectRuntimeCaps,
  isMediumOrLargerModel,
  resolveGgufModel,
  type WhisperRuntimeCaps,
} from "./whisper-model-selection";

function caps(
  overrides: Partial<WhisperRuntimeCaps> = {},
): WhisperRuntimeCaps {
  return {
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
    deviceMemory: 8,
    hardwareConcurrency: 8,
    hasWebGPU: true,
    ...overrides,
  };
}

describe("autoSelectGgufModel", () => {
  it("returns tiny on iOS", () => {
    const selected = autoSelectGgufModel(
      caps({
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1",
      }),
    );
    expect(selected).toBe("ggml-tiny-q5_1");
  });

  it("returns base on safari without webgpu", () => {
    const selected = autoSelectGgufModel(
      caps({
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15",
        hasWebGPU: false,
      }),
    );
    expect(selected).toBe("ggml-base-q5_1");
  });

  it("returns base on standard desktop (8GB/8-core/WebGPU)", () => {
    // ggml-small-q5_1 measured ~72s/inference in @transcribe/shout v1.0.7 WASM.
    // Auto-select ceiling lowered to base (56MB, ~12s) for capable desktops.
    const selected = autoSelectGgufModel(caps());
    expect(selected).toBe("ggml-base-q5_1");
  });

  it("returns tiny when desktop concurrency is below base gate", () => {
    const selected = autoSelectGgufModel(
      caps({ deviceMemory: 4, hardwareConcurrency: 2 }),
    );
    expect(selected).toBe("ggml-tiny-q5_1");
  });
});

describe("resolveGgufModel", () => {
  it("maps string overrides", () => {
    const selected = resolveGgufModel("small-en", caps());
    expect(selected).toBe("ggml-small-q5_1");
  });

  it("falls back to auto select when override missing", () => {
    // caps() = 8GB/8-core/WebGPU → base (auto-select ceiling, not small)
    const selected = resolveGgufModel(undefined, caps());
    expect(selected).toBe("ggml-base-q5_1");
  });

  it("explicit model override bypasses auto-select", () => {
    expect(resolveGgufModel("ggml-medium-q5_0", caps())).toBe("ggml-medium-q5_0");
    expect(resolveGgufModel("medium", caps())).toBe("ggml-medium-q5_0");
  });
});

describe("isMediumOrLargerModel", () => {
  it("marks medium and large as consent targets", () => {
    expect(isMediumOrLargerModel("ggml-medium-q5_0")).toBe(true);
    expect(isMediumOrLargerModel("ggml-large-v3-turbo-q5_0")).toBe(true);
    expect(isMediumOrLargerModel("ggml-base-q5_1")).toBe(false);
  });
});

describe("detectRuntimeCaps", () => {
  it("normalizes missing values", () => {
    const result = detectRuntimeCaps({
      userAgent: "ua",
      hardwareConcurrency: undefined,
      deviceMemory: undefined,
    });
    expect(result.deviceMemory).toBe(0);
    expect(result.hardwareConcurrency).toBe(0);
    expect(result.hasWebGPU).toBe(false);
  });
});
