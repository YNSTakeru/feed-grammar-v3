import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_FLAG = process.env.NEXT_ENABLE_CROSS_ORIGIN_ISOLATION;

async function loadHeaders() {
  vi.resetModules();
  const nextConfig = (await import("./next.config")).default;
  return nextConfig.headers?.();
}

afterEach(() => {
  if (ORIGINAL_FLAG === undefined) {
    delete process.env.NEXT_ENABLE_CROSS_ORIGIN_ISOLATION;
  } else {
    process.env.NEXT_ENABLE_CROSS_ORIGIN_ISOLATION = ORIGINAL_FLAG;
  }
});

describe("next.config headers", () => {
  it("does not emit COOP/COEP by default", async () => {
    delete process.env.NEXT_ENABLE_CROSS_ORIGIN_ISOLATION;
    const headers = await loadHeaders();
    expect(headers).toEqual([]);
  });

  it("emits COOP/COEP when isolation flag is enabled", async () => {
    process.env.NEXT_ENABLE_CROSS_ORIGIN_ISOLATION = "true";
    const headers = await loadHeaders();

    expect(headers).toHaveLength(1);
    expect(headers?.[0]?.headers).toEqual(
      expect.arrayContaining([
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
      ]),
    );
  });
});
