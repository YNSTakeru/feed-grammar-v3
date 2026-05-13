import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // allowedDevOrigins: ["http://192.168.x.x:3000"], // LAN IP for iPhone Safari via `next dev`

  async headers() {
    return [
      {
        // すべてのルートに COOP/COEP ヘッダーを付与
        // SharedArrayBuffer を有効化し @transcribe/shout (whisper.cpp WASM) を正常動作させる
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
