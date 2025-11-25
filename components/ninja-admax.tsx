"use client";

import { useEffect, useRef } from "react";

interface NinjaAdMaxProps {
  adSpotId: string;
  width?: number;
  height?: number;
  className?: string;
}

export default function NinjaAdMax({
  adSpotId,
  width = 300,
  height = 250,
  className = "",
}: NinjaAdMaxProps) {
  const scriptLoadedRef = useRef(false);

  useEffect(() => {
    // グローバルな admaxads 配列を初期化
    if (typeof window !== "undefined") {
      (window as any).admaxads = (window as any).admaxads || [];

      // 広告を配列にプッシュ
      (window as any).admaxads.push({
        admax_id: adSpotId,
        type: "banner",
      });

      // スクリプトが未ロードの場合のみ読み込む
      if (!scriptLoadedRef.current) {
        const script = document.createElement("script");
        script.type = "text/javascript";
        script.charset = "utf-8";
        script.src = "https://adm.shinobi.jp/st/t.js";
        script.async = true;
        document.body.appendChild(script);
        scriptLoadedRef.current = true;
      }
    }
  }, [adSpotId]);

  return (
    <div
      className={`ninja-admax-container flex justify-center my-4 ${className}`}
    >
      <div
        className="admax-ads"
        data-admax-id={adSpotId}
        style={{
          display: "inline-block",
          width: `${width}px`,
          height: `${height}px`,
        }}
      ></div>
    </div>
  );
}
