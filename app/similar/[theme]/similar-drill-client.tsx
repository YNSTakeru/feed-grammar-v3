"use client";

import {
  YouTubePlayer,
  type YouTubePlayerHandle,
} from "@/components/youtube-player";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  SimilarItem,
  SimilarTheme,
} from "@/lib/data/similar/similar-loader";
import { extractYouTubeVideoId } from "@/lib/learn/dictation";
import {
  advanceAfterReveal,
  revealExposureCard,
  revealHeardCard,
  revealMissedCard,
  type DrillCard,
} from "@/lib/similar/drill-flow";
import { maskThemeInText } from "@/lib/similar/mask-text";
import type { PronChunk } from "@/types";
import { type ReactNode, useRef, useState } from "react";

type DrillPhase = "playing" | "revealed";

type ActiveChunk = { idx: number; speed: 0.5 | 0.25 };

type PlayableChunk = PronChunk & {
  start_time: number;
  end_time: number;
};

interface SimilarDrillClientProps {
  items: SimilarItem[];
  theme: string;
}

function isSimilarTheme(theme: string): theme is SimilarTheme {
  return theme === "and" || theme === "want_to";
}

function buildShuffledQueue(items: SimilarItem[]): DrillCard<SimilarItem>[] {
  const queue = items.map((item) => ({ item, streak: 0 }));
  for (let i = queue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [queue[i], queue[j]] = [queue[j], queue[i]];
  }
  return queue;
}

function parseTime(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getThemePattern(theme: SimilarTheme): RegExp {
  return theme === "and" ? /\band\b/gi : /\b(?:want\s+to|wanna)\b/gi;
}

function renderHighlightedTheme(
  text: string,
  theme: SimilarTheme,
): ReactNode {
  const pattern = getThemePattern(theme);
  const matches = Array.from(text.matchAll(pattern));

  if (matches.length === 0) return text;

  const parts: ReactNode[] = [];
  let lastIndex = 0;

  matches.forEach((match, index) => {
    const start = match.index ?? -1;
    const value = match[0] ?? "";
    if (start < 0) return;

    if (lastIndex < start) {
      parts.push(
        <span key={`t${index}-${lastIndex}`}>
          {text.slice(lastIndex, start)}
        </span>,
      );
    }

    parts.push(
      <mark
        key={`m${index}-${start}`}
        className="rounded bg-yellow-200 px-1 text-slate-900"
      >
        {value}
      </mark>,
    );
    lastIndex = start + value.length;
  });

  if (lastIndex < text.length) {
    parts.push(
      <span key={`tail-${lastIndex}`}>{text.slice(lastIndex)}</span>,
    );
  }

  return parts;
}

function getPlayableChunks(item: SimilarItem): PlayableChunk[] {
  const chunks = item.chunks ?? null;
  if (!Array.isArray(chunks)) return [];
  return chunks.filter(
    (chunk): chunk is PlayableChunk =>
      typeof chunk.start_time === "number" &&
      typeof chunk.end_time === "number" &&
      chunk.start_time > 0 &&
      chunk.end_time > chunk.start_time,
  );
}

function chunkContainsTheme(chunk: PronChunk, theme: SimilarTheme): boolean {
  if (theme === "and") return /\band\b/i.test(chunk.en);
  return /\b(?:want\s+to|wanna)\b/i.test(chunk.en);
}

function formatThemeLabel(theme: SimilarTheme): string {
  return theme === "and" ? "and (アン)" : "want to / wanna (ワナ)";
}

export function SimilarDrillClient({
  items,
  theme,
}: SimilarDrillClientProps) {
  const playerRef = useRef<YouTubePlayerHandle | null>(null);

  const [activeQueue, setActiveQueue] = useState<DrillCard<SimilarItem>[]>(() =>
    buildShuffledQueue(items),
  );
  const [nextQueue, setNextQueue] = useState<DrillCard<SimilarItem>[]>([]);
  const [graduatedIds, setGraduatedIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [missedIds, setMissedIds] = useState<Set<number>>(() => new Set());
  const [loopCount, setLoopCount] = useState(items.length > 0 ? 1 : 0);
  const [phase, setPhase] = useState<DrillPhase>("playing");
  const [revealedCard, setRevealedCard] =
    useState<DrillCard<SimilarItem> | null>(null);
  const [activeChunk, setActiveChunk] = useState<ActiveChunk | null>(null);
  const [isDone, setIsDone] = useState(items.length === 0);

  if (!isSimilarTheme(theme)) return null;

  const currentCard =
    phase === "revealed" ? revealedCard : (activeQueue[0] ?? null);
  const currentItem = currentCard?.item ?? null;
  const videoId = currentItem ? extractYouTubeVideoId(currentItem.url) : null;
  const startTime = currentItem ? parseTime(currentItem.start_time) : 0;
  const endTime = currentItem ? parseTime(currentItem.end_time) : 0;
  const playableChunks = currentItem ? getPlayableChunks(currentItem) : [];
  const graduatedCount = graduatedIds.size;
  const remainingCount = activeQueue.length + nextQueue.length;
  const isExposureLoop = loopCount === 1;

  function resetDrill() {
    setActiveQueue(buildShuffledQueue(items));
    setNextQueue([]);
    setGraduatedIds(new Set());
    setMissedIds(new Set());
    setLoopCount(items.length > 0 ? 1 : 0);
    setPhase("playing");
    setRevealedCard(null);
    setActiveChunk(null);
    setIsDone(items.length === 0);
    playerRef.current?.setPlaybackRate(1.0);
  }

  function handlePlay() {
    if (!videoId) return;
    setActiveChunk(null);
    playerRef.current?.setPlaybackRate(1.0);
    if (endTime > startTime) {
      playerRef.current?.playSegment(startTime, endTime);
    } else {
      playerRef.current?.seekAndPlay(startTime);
    }
  }

  function handlePlaySlow(chunk: PlayableChunk, idx: number, speed: 0.5 | 0.25) {
    if (!videoId) return;
    setActiveChunk({ idx, speed });
    playerRef.current?.setPlaybackRate(speed);
    playerRef.current?.playSegment(chunk.start_time, chunk.end_time);
  }

  function revealCard(card: DrillCard<SimilarItem>) {
    setRevealedCard(card);
    setPhase("revealed");
  }

  function handlePredict() {
    const result = revealExposureCard(activeQueue, nextQueue);
    if (!result.revealedCard) return;

    setActiveQueue(result.activeQueue);
    setNextQueue(result.nextQueue);
    revealCard(result.revealedCard);
  }

  function handleHeard() {
    const result = revealHeardCard(activeQueue, nextQueue);
    if (!result.revealedCard) return;

    setActiveQueue(result.activeQueue);
    setNextQueue(result.nextQueue);
    if (result.graduatedId !== null) {
      const graduatedId = result.graduatedId;
      setGraduatedIds((prev) => {
        const next = new Set(prev);
        next.add(graduatedId);
        return next;
      });
    }
    revealCard(result.revealedCard);
  }

  function handleMissed() {
    const result = revealMissedCard(activeQueue, nextQueue);
    if (!result.revealedCard) return;

    setActiveQueue(result.activeQueue);
    setNextQueue(result.nextQueue);
    if (result.missedId !== null) {
      const missedId = result.missedId;
      setMissedIds((prev) => {
        const next = new Set(prev);
        next.add(missedId);
        return next;
      });
    }

    revealCard(result.revealedCard);
  }

  function handleNext() {
    const result = advanceAfterReveal({ activeQueue, nextQueue, loopCount });

    setActiveChunk(null);
    playerRef.current?.setPlaybackRate(1.0);
    setPhase("playing");
    setRevealedCard(null);
    setActiveQueue(result.activeQueue);
    setNextQueue(result.nextQueue);
    setLoopCount(result.loopCount);
    setIsDone(result.isDone);
  }

  if (isDone) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-4 py-8">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Similar Drill 完了</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              テーマ: {formatThemeLabel(theme)}
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">graduated</p>
                <p className="text-2xl font-semibold">{graduatedCount}</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">missed</p>
                <p className="text-2xl font-semibold">{missedIds.size}</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">loops</p>
                <p className="text-2xl font-semibold">{loopCount}</p>
              </div>
            </div>
            <Button onClick={resetDrill}>もう一周</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!currentItem) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-4 py-8">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Similar Drill</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">問題がありません。</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Similar Drill</CardTitle>
            <p className="text-sm text-muted-foreground">
              {formatThemeLabel(theme)}
            </p>
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span>graduated: {graduatedCount}</span>
            <span>missed: {missedIds.size}</span>
            <span>loop: {loopCount}</span>
            <span>remaining: {remainingCount}</span>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <div>
            {videoId ? (
              <YouTubePlayer
                ref={playerRef}
                videoId={videoId}
                startTime={startTime}
                endTime={endTime}
                autoPlay={false}
                loop={true}
              />
            ) : (
              <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                YouTube URL を解析できませんでした。
              </div>
            )}
          </div>

          {phase === "playing" ? (
            <>
              <div className="space-y-3">
                <p className="text-xl font-semibold leading-relaxed">
                  {maskThemeInText(currentItem.question, theme)}
                </p>
                {isExposureLoop ? (
                  <p className="text-sm text-muted-foreground">
                    まず音を聞いて、隠れている単語を頭の中で予想してから答え合わせします。
                  </p>
                ) : null}
                <div className="space-y-1">
                  <p className="select-none whitespace-pre-wrap text-muted-foreground blur-sm">
                    {currentItem.question_katakana}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    カタカナは答え合わせで表示されます。
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button onClick={handlePlay} disabled={!videoId}>
                  再生
                </Button>
                {isExposureLoop ? (
                  <Button variant="secondary" onClick={handlePredict}>
                    予想する
                  </Button>
                ) : (
                  <>
                    <Button variant="secondary" onClick={handleHeard}>
                      聴こえた
                    </Button>
                    <Button variant="outline" onClick={handleMissed}>
                      聴こえなかった
                    </Button>
                  </>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="space-y-3">
                <p className="text-xl font-semibold leading-relaxed">
                  {renderHighlightedTheme(currentItem.question, theme)}
                </p>
                <p className="whitespace-pre-wrap text-muted-foreground">
                  {currentItem.question_katakana}
                </p>
              </div>

              {currentItem.translated ? (
                <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
                  <p className="text-sm font-medium">意味</p>
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                    {currentItem.translated}
                  </p>
                </div>
              ) : null}

              <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
                <p className="text-sm font-medium">pron_memo</p>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {currentItem.pron_memo?.trim() || "メモはありません。"}
                </p>
              </div>

              {playableChunks.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium">チャンク別スロー再生</p>
                  <div className="divide-y rounded-lg border">
                    {playableChunks.map((chunk, idx) => {
                      const isTheme = chunkContainsTheme(chunk, theme);

                      return (
                        <div
                          key={`${chunk.start_time}-${chunk.end_time}-${idx}`}
                          className={[
                            "flex items-center gap-3 px-3 py-2",
                            isTheme ? "bg-amber-50" : "",
                            activeChunk?.idx === idx ? "ring-2 ring-inset ring-blue-400" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          <Button
                            size="sm"
                            variant="ghost"
                            className="shrink-0 font-mono text-xs"
                            onClick={() => handlePlaySlow(chunk, idx, 0.5)}
                            disabled={!videoId}
                          >
                            {activeChunk?.idx === idx && activeChunk?.speed === 0.5 ? "▶ 再生中" : "0.5x"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="shrink-0 font-mono text-xs"
                            onClick={() => handlePlaySlow(chunk, idx, 0.25)}
                            disabled={!videoId}
                          >
                            {activeChunk?.idx === idx && activeChunk?.speed === 0.25 ? "▶ 再生中" : "0.25x"}
                          </Button>
                          <div className="min-w-0 flex-1">
                            <p
                              className={[
                                "text-sm font-medium",
                                isTheme ? "text-amber-700" : "",
                              ]
                                .filter(Boolean)
                                .join(" ")}
                            >
                              {chunk.en}
                              {isTheme ? (
                                <span className="ml-1 rounded bg-amber-200 px-1 text-xs text-amber-800">
                                  {theme === "and" ? "and" : "want to / wanna"}
                                </span>
                              ) : null}
                            </p>
                            <p className="text-xs text-muted-foreground">{chunk.kana}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-3">
                <Button onClick={handlePlay} disabled={!videoId}>
                  再生 (1x)
                </Button>
                <Button onClick={handleNext}>次へ</Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
