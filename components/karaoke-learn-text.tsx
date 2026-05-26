"use client";

import { Button } from "@/components/ui/button";
import { findPronChunk } from "@/lib/utils/find-pron-chunk";
import type { ChunkTimestamp, PronChunk } from "@/types";
import type { MutableRefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

export function getActiveChunkIndex(
  chunks: Pick<ChunkTimestamp, "start_time" | "end_time">[],
  time: number,
): number {
  for (let index = 0; index < chunks.length; index++) {
    const chunk = chunks[index];
    if (time >= chunk.start_time && time < chunk.end_time) {
      return index;
    }
  }
  return -1;
}

interface KaraokeLearnTextProps {
  chunkTimestamps?: ChunkTimestamp[] | null;
  pronChunks?: PronChunk[] | null;
  timeRef: MutableRefObject<number>;
  onReplay?: (chunk: ChunkTimestamp) => void;
  enabled?: boolean;
}

type Selection =
  | { mode: "timed"; index: number }
  | { mode: "text"; index: number }
  | null;

export function KaraokeLearnText({
  chunkTimestamps,
  pronChunks,
  timeRef,
  onReplay,
  enabled = true,
}: KaraokeLearnTextProps) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const [selection, setSelection] = useState<Selection>(null);
  const activeIndexRef = useRef(-1);
  const hasTimedChunks = !!chunkTimestamps && chunkTimestamps.length > 0;
  const safePronChunks = useMemo(() => pronChunks ?? [], [pronChunks]);
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (!enabled || !chunkTimestamps || chunkTimestamps.length === 0) {
      return;
    }

    let rafId = 0;
    const tick = () => {
      const nextIndex = getActiveChunkIndex(chunkTimestamps, timeRef.current);
      if (activeIndexRef.current !== nextIndex) {
        activeIndexRef.current = nextIndex;
        setActiveIndex(nextIndex);
      }
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [chunkTimestamps, enabled, timeRef]);

  const selectedInfo = useMemo(() => {
    if (!selection) return null;

    if (selection.mode === "timed") {
      const chunk = chunkTimestamps?.[selection.index];
      if (!chunk) return null;

      if (chunk.ipa_connected) {
        return {
          ipa: chunk.ipa_connected,
          text: chunk.text,
          isFallback: false,
        };
      }

      const fallback = findPronChunk(chunk, safePronChunks);
      if (fallback?.ipa_connected) {
        return {
          ipa: fallback.ipa_connected,
          text: chunk.text,
          isFallback: true,
        };
      }

      return {
        ipa: "—",
        text: chunk.text,
        isFallback: false,
      };
    }

    const pronChunk = safePronChunks[selection.index];
    if (!pronChunk) return null;

    return {
      ipa: pronChunk.ipa_connected || pronChunk.ipa_citation || "—",
      text: pronChunk.en,
      isFallback: false,
    };
  }, [chunkTimestamps, safePronChunks, selection]);

  const transitionClass = prefersReducedMotion ? "" : "transition-colors duration-150";
  const currentActiveIndex = enabled ? activeIndex : -1;

  return (
    <div className="space-y-3" aria-live="off">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-900 dark:bg-blue-950 dark:text-blue-100">
          {hasTimedChunks ? "▶ 音声同期" : "📖 テキスト"}
        </span>
      </div>

      {hasTimedChunks ? (
        <div className="flex flex-wrap items-center gap-2">
          {chunkTimestamps.map((chunk, index) => {
            const isActive = index === currentActiveIndex;
            const isSelected =
              selection?.mode === "timed" && selection.index === index;
            return (
              <span key={`${chunk.start_time}-${chunk.end_time}-${chunk.text}`} className="inline-flex items-center gap-1">
                <button
                  type="button"
                  aria-current={isActive ? "true" : undefined}
                  onClick={() =>
                    setSelection((current) =>
                      current?.mode === "timed" && current.index === index
                        ? null
                        : { mode: "timed", index },
                    )
                  }
                  className={`rounded px-1.5 py-0.5 text-sm font-medium ${transitionClass} ${
                    isSelected
                      ? "bg-cyan-100 text-cyan-900 dark:bg-cyan-900/40 dark:text-cyan-100"
                      : isActive
                        ? "bg-yellow-200 text-yellow-900 dark:bg-yellow-500/40 dark:text-yellow-100"
                        : "bg-muted/40 text-foreground"
                  }`}
                >
                  {chunk.text}
                </button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5 text-xs"
                  onClick={(event) => {
                    event.stopPropagation();
                    onReplay?.(chunk);
                  }}
                  disabled={!onReplay}
                  aria-label={`${chunk.text} をリプレイ`}
                >
                  ↩
                </Button>
              </span>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {safePronChunks.map((chunk, index) => {
            const isSelected =
              selection?.mode === "text" && selection.index === index;
            return (
              <button
                key={`${chunk.en}-${index}`}
                type="button"
                onClick={() =>
                  setSelection((current) =>
                    current?.mode === "text" && current.index === index
                      ? null
                      : { mode: "text", index },
                  )
                }
                className={`rounded bg-muted/40 px-1.5 py-0.5 text-sm font-medium text-foreground ${transitionClass} ${
                  isSelected ? "bg-cyan-100 text-cyan-900 dark:bg-cyan-900/40 dark:text-cyan-100" : ""
                }`}
              >
                {chunk.en}
              </button>
            );
          })}
        </div>
      )}

      {selectedInfo ? (
        <div className="rounded-lg border bg-muted/30 px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            IPA: {selectedInfo.text}
          </p>
          <p className="mt-1 font-mono text-sm">{selectedInfo.ipa}</p>
          {selectedInfo.isFallback && selectedInfo.ipa !== "—" ? (
            <p className="mt-1 text-xs text-muted-foreground">
              (単体発音 / 連音データなし)
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
