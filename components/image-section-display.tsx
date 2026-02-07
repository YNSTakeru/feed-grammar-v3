"use client";

import { MarkdownContent } from "@/components/markdown-content";
import React, { useMemo } from "react";
import { Tweet } from "react-tweet";

// ========================
// 型定義
// ========================

interface ImageSectionData {
  label: string;
  time: string;
  url: string;
  image_display_instruction?: string;
  description?: string;
  image_suggestion?: string;
}

// iframe HTMLからsrc/height/widthを抽出
function parseIframeHtml(html: string) {
  const srcMatch = html.match(/src=["']([^"']+)["']/);
  const heightMatch = html.match(/height=["']([^"']+)["']/);
  const widthMatch = html.match(/width=["']([^"']+)["']/);
  return {
    src: srcMatch?.[1] || "",
    height: heightMatch?.[1] || "445",
    width: widthMatch?.[1] || "345",
  };
}

// URLの種別を判定
function classifyUrl(url?: string) {
  if (!url) return { tweetId: null, isInstagram: false, isIframe: false };
  return {
    tweetId: url.match(/TWEET_ID:(\d+)/)?.[1] ?? null,
    isInstagram: url.includes("instagram-media"),
    isIframe: url.trim().startsWith("<iframe"),
  };
}

// ========================
// 安定したiframeレンダラー (React.memoで再レンダリング防止)
// ========================

const StableIframe = React.memo(function StableIframe({
  src,
  height,
  width,
}: {
  src: string;
  height: string;
  width: string;
}) {
  return (
    <div className="mb-4">
      <iframe
        src={src}
        height={height}
        width={width}
        frameBorder="0"
        scrolling="no"
        style={{ maxWidth: "100%" }}
      />
    </div>
  );
});

// ========================
// 単一セクションのメディア表示
// ========================

interface MediaDisplayProps {
  url?: string;
  animationClass?: string;
}

function MediaDisplay({ url, animationClass }: MediaDisplayProps) {
  const { tweetId, isInstagram, isIframe } = classifyUrl(url);

  if (tweetId && !isInstagram && !isIframe) {
    return (
      <div className={`mb-4 ${animationClass ?? ""}`}>
        <Tweet id={tweetId} />
      </div>
    );
  }

  if (isInstagram && url) {
    return (
      <div
        className={`mb-4 ${animationClass ?? ""}`}
        dangerouslySetInnerHTML={{ __html: url }}
      />
    );
  }

  if (isIframe && url) {
    const attrs = parseIframeHtml(url);
    return (
      <StableIframe src={attrs.src} height={attrs.height} width={attrs.width} />
    );
  }

  return null;
}

// ========================
// 🖼️ 静的 Image Sections
// ========================

interface StaticImageSectionsProps {
  sections: ImageSectionData[];
  animationStage: Map<number, "label-big" | "label-small" | "tweet">;
  sectionRefs: React.MutableRefObject<Map<number, HTMLDivElement>>;
}

export function StaticImageSections({
  sections,
  animationStage,
  sectionRefs,
}: StaticImageSectionsProps) {
  if (!sections || sections.length === 0) return null;

  return (
    <div className="mb-8 space-y-6">
      <h3 className="text-2xl font-bold text-blue-700 dark:text-blue-400 mb-4">
        🖼️ フレーズのイメージ
      </h3>
      {sections.map((imageSection, index) => {
        const { isIframe } = classifyUrl(imageSection.url);
        const stage = animationStage.get(index);

        const animationClass = !isIframe
          ? stage === "tweet"
            ? "transition-all duration-500 opacity-100 animate-in fade-in-0 slide-in-from-bottom-4"
            : "transition-all duration-500 opacity-0 translate-y-4"
          : undefined;

        return (
          <div
            key={index}
            ref={(el) => {
              if (el) sectionRefs.current.set(index, el);
            }}
            className="p-5 bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/30 dark:to-cyan-950/30 rounded-lg border-2 border-blue-200 dark:border-blue-800"
          >
            {/* Label */}
            {imageSection.label && (
              <div
                className={`mb-4 transition-transform duration-300 ${
                  isIframe
                    ? "scale-100"
                    : stage === "label-big"
                      ? "scale-125 animate-in zoom-in-50"
                      : stage === "label-small" || stage === "tweet"
                        ? "scale-100"
                        : "scale-100 opacity-0"
                }`}
                style={{ transformOrigin: "left center" }}
              >
                <span className="inline-block px-4 py-2 rounded-full bg-blue-600 dark:bg-blue-500 text-white text-lg font-bold shadow-md">
                  🎯 {imageSection.label}
                </span>
              </div>
            )}

            {/* Media */}
            <MediaDisplay
              url={imageSection.url}
              animationClass={animationClass}
            />

            {/* Description */}
            {imageSection.description && (
              <div className="mb-3 text-gray-700 dark:text-gray-200">
                <MarkdownContent content={imageSection.description} />
              </div>
            )}

            {/* Image Suggestion */}
            {imageSection.image_suggestion && (
              <div className="mt-2 p-3 bg-blue-100/50 dark:bg-blue-900/20 rounded border-l-4 border-blue-400 dark:border-blue-600">
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  <span className="font-semibold">💡 イメージ: </span>
                  {imageSection.image_suggestion}
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ========================
// 🎬 動画連動イメージ (Time-synced)
// ========================

// 全iframeを事前レンダリングし、opacity/z-indexで切り替える方式。
// iframeの再読み込みが発生しないため、切り替えが即座に反映される。

/** 単一のiframeレイヤー。React.memoでマウント後の再レンダリングを完全に防止 */
const IframeLayer = React.memo(
  function IframeLayer({
    src,
    height,
    width,
    isActive,
  }: {
    src: string;
    height: string;
    width: string;
    isActive: boolean;
  }) {
    return (
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          opacity: isActive ? 1 : 0,
          zIndex: isActive ? 1 : 0,
          pointerEvents: isActive ? "auto" : "none",
          transition: "opacity 0.15s ease-in-out",
        }}
      >
        <iframe
          src={src}
          height={height}
          width={width}
          frameBorder="0"
          scrolling="no"
          style={{ maxWidth: "100%", display: "block" }}
        />
      </div>
    );
  },
  // src が同じなら isActive の変更だけ反映（iframeの再マウントは絶対にしない）
  (prev, next) => prev.src === next.src && prev.isActive === next.isActive,
);

interface TimeSyncedImageSectionsProps {
  sections: ImageSectionData[];
  currentVideoTime: number;
  logPrefix?: string;
}

export function TimeSyncedImageSections({
  sections,
  currentVideoTime,
  logPrefix = "",
}: TimeSyncedImageSectionsProps) {
  if (!sections || sections.length === 0) return null;

  // セクションをソートして現在のセクションを決定
  const sortedSections = useMemo(
    () => [...sections].sort((a, b) => parseFloat(a.time) - parseFloat(b.time)),
    [sections],
  );

  // 現在の時刻に基づく現在のセクションインデックスを決定
  const currentIndex = useMemo(() => {
    let idx = 0;
    for (let i = 0; i < sortedSections.length; i++) {
      if (currentVideoTime >= parseFloat(sortedSections[i].time)) {
        idx = i;
      } else {
        break;
      }
    }
    return idx;
  }, [sortedSections, currentVideoTime]);

  const currentSection = sortedSections[currentIndex];

  // 全セクションがiframeかどうかを事前判定
  const sectionsMeta = useMemo(
    () =>
      sortedSections.map((s) => {
        const classified = classifyUrl(s.url);
        const iframeAttrs = classified.isIframe ? parseIframeHtml(s.url) : null;
        return { ...classified, iframeAttrs };
      }),
    [sortedSections],
  );

  // iframeの最大高さを計算してコンテナの高さを固定
  const maxIframeHeight = useMemo(() => {
    let max = 0;
    for (const meta of sectionsMeta) {
      if (meta.iframeAttrs) {
        const h = parseInt(meta.iframeAttrs.height, 10) || 445;
        if (h > max) max = h;
      }
    }
    return max;
  }, [sectionsMeta]);

  const hasAnyIframe = sectionsMeta.some((m) => m.isIframe);
  const currentMeta = sectionsMeta[currentIndex];

  return (
    <div className="mb-8">
      <h3 className="text-2xl font-bold text-purple-700 dark:text-purple-400 mb-4">
        🎬 動画連動イメージ
      </h3>
      <div className="p-5 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30 rounded-lg border-2 border-purple-200 dark:border-purple-800">
        {/* Label + Time */}
        <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
          <span className="inline-block px-4 py-2 rounded-full bg-purple-600 dark:bg-purple-500 text-white text-lg font-bold shadow-md">
            🎯 {currentSection.label}
          </span>
          <span className="px-3 py-1 rounded-full bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 text-sm font-mono font-semibold">
            {parseFloat(currentSection.time).toFixed(1)}秒
          </span>
        </div>

        {/* ====== iframe (Pinterest等): 全レイヤーを重ねて事前レンダリング ====== */}
        {hasAnyIframe && (
          <div
            className="mb-4 relative"
            style={{ height: maxIframeHeight, minHeight: maxIframeHeight }}
          >
            {sortedSections.map((section, idx) => {
              const meta = sectionsMeta[idx];
              if (!meta.isIframe || !meta.iframeAttrs) return null;
              return (
                <IframeLayer
                  key={meta.iframeAttrs.src}
                  src={meta.iframeAttrs.src}
                  height={meta.iframeAttrs.height}
                  width={meta.iframeAttrs.width}
                  isActive={idx === currentIndex}
                />
              );
            })}
          </div>
        )}

        {/* ====== Tweet (非iframe時のみ表示) ====== */}
        {!hasAnyIframe && currentMeta.tweetId && !currentMeta.isInstagram && (
          <div className="mb-4">
            <Tweet id={currentMeta.tweetId} />
          </div>
        )}

        {/* ====== Instagram (非iframe時のみ表示) ====== */}
        {!hasAnyIframe && currentMeta.isInstagram && currentSection.url && (
          <div
            className="mb-4"
            dangerouslySetInnerHTML={{ __html: currentSection.url }}
          />
        )}

        {/* Description */}
        {currentSection.description && (
          <div className="mb-3 text-gray-700 dark:text-gray-200">
            <MarkdownContent content={currentSection.description} />
          </div>
        )}

        {/* Image Suggestion */}
        {currentSection.image_suggestion && (
          <div className="mt-2 p-3 bg-purple-100/50 dark:bg-purple-900/20 rounded border-l-4 border-purple-400 dark:border-purple-600">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              <span className="font-semibold">💡 イメージ: </span>
              {currentSection.image_suggestion}
            </p>
          </div>
        )}

        {/* タイムライン */}
        <div className="mt-4 pt-4 border-t border-purple-200 dark:border-purple-800">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            タイムライン:
          </p>
          <div className="flex flex-wrap gap-2">
            {sortedSections.map((section, idx) => {
              const isActive = idx === currentIndex;
              const isPast = currentVideoTime >= parseFloat(section.time);
              return (
                <span
                  key={idx}
                  className={`px-2 py-1 rounded text-xs font-medium ${
                    isActive
                      ? "bg-purple-600 text-white"
                      : isPast
                        ? "bg-purple-200 dark:bg-purple-800 text-purple-900 dark:text-purple-100"
                        : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
                  }`}
                >
                  {section.label} ({parseFloat(section.time).toFixed(1)}s)
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
