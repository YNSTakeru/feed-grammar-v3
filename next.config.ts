import type { NextConfig } from "next";

const enableCrossOriginIsolation =
  process.env.NEXT_ENABLE_CROSS_ORIGIN_ISOLATION === "true";

const nextConfig: NextConfig = {
  // allowedDevOrigins: ["http://192.168.x.x:3000"], // LAN IP for iPhone Safari via `next dev`

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "i.ytimg.com",
        pathname: "/vi/**",
      },
    ],
  },

  // Prevent @huggingface/transformers from being bundled for SSR.
  // It is used only in Web Workers (client-side), so server-side bundling
  // would fail on Node.js-incompatible browser APIs.
  serverExternalPackages: ["@huggingface/transformers"],

  async headers() {
    if (!enableCrossOriginIsolation) {
      return [];
    }

    return [
      {
        // SharedArrayBuffer が必要な検証時のみ COOP/COEP を有効化する。
        // 既定 OFF にして YouTube / 外部埋め込み互換性を優先する。
        source: "/:path*",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
          {
            key: "Cross-Origin-Embedder-Policy",
            // require-corp: iOS Safari は credentialless 未サポート →
            // crossOriginIsolated=false → pthreads 無効 → shout 起動不能。
            // 外部リソース (YouTube IFrame, react-tweet 等) は CORP ヘッダー or
            // crossorigin="anonymous" が必要。読み込み失敗を監視すること。
            value: "require-corp",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
