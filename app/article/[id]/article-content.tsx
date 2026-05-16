"use client";

import { FloatingNavigation } from "@/components/floating-navigation";
import { MarkdownContent } from "@/components/markdown-content";
import { PhraseBreakdown } from "@/components/phrase-breakdown";
import { QuizSection } from "@/components/quiz-section";
import { type YouTubePlayerHandle } from "@/components/youtube-player";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { progressDB } from "@/lib/db/progress-db";
import { CHUNK_REPLAY_PAD_S, computeChunkReplayEnd } from "@/lib/learn/chunk-replay";
import { ArticleData, ChunkTimestamp, FeedItem, PronChunk } from "@/types";
import { Tweet } from "react-tweet";
import {
  StaticImageSections,
  TimeSyncedImageSections,
} from "@/components/image-section-display";

import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Headphones,
  Lock,
  Volume2,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    twttr?: {
      widgets: {
        load: () => void;
      };
    };
    instgrm?: {
      Embeds: {
        process: () => void;
      };
    };
  }
}

const buildChunkInteractionKey = (chunk: ChunkTimestamp) =>
  `${chunk.text}-${chunk.start_time}`;

function findPronChunk(
  chunk: ChunkTimestamp,
  pronChunks: PronChunk[],
): PronChunk | null {
  if (!pronChunks.length) return null;
  const chunkText = chunk.text.toLowerCase();
  const exact = pronChunks.find((pc) =>
    pc.en.toLowerCase().replace(/[＜＞<>]/g, "").includes(chunkText),
  );
  if (exact) return exact;
  const words = chunkText.split(/\s+/).filter(Boolean);
  let best: PronChunk | null = null;
  let bestScore = 0;
  for (const pc of pronChunks) {
    const pcText = pc.en.toLowerCase().replace(/[＜＞<>]/g, "");
    const score = words.filter((w) => pcText.includes(w)).length;
    if (score > bestScore) {
      bestScore = score;
      best = pc;
    }
  }
  return bestScore > 0 ? best : null;
}

function KaraokeQuestion({
  question,
  chunks,
  currentTime,
  onChunkSelect,
  onChunkReplay,
  showDiscoveryHint = false,
  showContextualPulse = false,
  seekingChunkKey,
  pronChunks,
}: {
  question: string;
  chunks: ChunkTimestamp[];
  currentTime: number;
  onChunkSelect?: (chunk: ChunkTimestamp) => void;
  onChunkReplay?: (chunk: ChunkTimestamp, index: number) => void;
  showDiscoveryHint?: boolean;
  showContextualPulse?: boolean;
  seekingChunkKey?: string | null;
  pronChunks?: PronChunk[] | null;
}) {
  const [selectedChunk, setSelectedChunk] = useState<ChunkTimestamp | null>(null);
  const [flashingChunkKey, setFlashingChunkKey] = useState<string | null>(null);
  const [showKatakana, setShowKatakana] = useState(false);

  if (!chunks.length) return <>{question}</>;

  const hasPronunciationData = (_chunk: ChunkTimestamp) => true;

  const isSameChunk = (a: ChunkTimestamp, b: ChunkTimestamp) =>
    a.text === b.text &&
    a.start_time === b.start_time &&
    a.end_time === b.end_time;

  const handleChunkSelect = (chunk: ChunkTimestamp) => {
    const key = buildChunkInteractionKey(chunk);
    const isSameSelected = selectedChunk && isSameChunk(selectedChunk, chunk);

    setFlashingChunkKey(key);

    if (isSameSelected) {
      setSelectedChunk(null);
      return;
    }

    setSelectedChunk(chunk);
    onChunkSelect?.(chunk);
  };

  const firstTappableIndex = chunks.findIndex(hasPronunciationData);
  const shouldShowHintBadge = showDiscoveryHint && firstTappableIndex >= 0;

  return (
    <>
      {shouldShowHintBadge && (
        <div className="mb-1">
          <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm">
            🔊 タップで IPA
          </span>
        </div>
      )}
      {chunks.map((chunk, i) => {
        const isActive =
          currentTime >= chunk.start_time && currentTime < chunk.end_time;
        const isTappable = hasPronunciationData(chunk);
        const key = buildChunkInteractionKey(chunk);
        const isFirstTappable = isTappable && i === firstTappableIndex;
        const isFlashing = flashingChunkKey === key;
        const isSeeking = seekingChunkKey === key;
        const isSelected = selectedChunk ? isSameChunk(selectedChunk, chunk) : false;
        const shouldShowPulseRing = isFirstTappable && showContextualPulse;

        return (
          <Fragment key={`${key}-${chunk.end_time}`}>
            <span
              role={isTappable ? "button" : undefined}
              tabIndex={isTappable ? 0 : undefined}
              onClick={() => handleChunkSelect(chunk)}
              onKeyDown={(event) => {
                if (!isTappable) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  handleChunkSelect(chunk);
                }
              }}
              onAnimationEnd={() => {
                if (isFlashing) {
                  setFlashingChunkKey(null);
                }
              }}
              className={`relative inline-block align-middle rounded-sm px-0.5 transition-all duration-150 ${
                isTappable ? "cursor-pointer chunk-zebra" : "pointer-events-none cursor-default"
              } ${
                isActive
                  ? "bg-yellow-200 dark:bg-yellow-500/40 text-yellow-900 dark:text-yellow-100"
                  : ""
              } ${isSelected ? "chunk-float" : ""} ${isFlashing ? "chunk-flash" : ""} ${
                isSeeking ? "chunk-seeking" : ""
              } ${shouldShowPulseRing ? "chunk-pulse-ring" : ""}`}
            >
              {i > 0 ? " " : ""}
              {chunk.text}
            </span>

            {isSelected && (
              <div className="my-3 ml-1 rounded-md border border-border bg-background/95 p-3 shadow-sm">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Pronunciation
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs"
                    onClick={(event) => {
                      event.preventDefault();
                      onChunkReplay?.(chunk, i);
                    }}
                  >
                    <Headphones className="mr-1 h-3.5 w-3.5" />
                    🔁 Replay
                  </Button>
                </div>

                {(() => {
                  const pc = pronChunks ? findPronChunk(chunk, pronChunks) : null;
                  if (pc) {
                    return (
                      <div className="space-y-1">
                        <p className="font-mono text-sm text-foreground">{pc.ipa_connected}</p>
                        {pc.ipa_citation && pc.ipa_citation !== pc.ipa_connected && (
                          <p className="text-xs text-muted-foreground">
                            辞書形: {pc.ipa_citation}
                          </p>
                        )}
                        {pc.kana && (
                          <p className="mt-1 text-sm text-muted-foreground">{pc.kana}</p>
                        )}
                      </div>
                    );
                  } else if (chunk.ipa_connected) {
                    return <p className="font-mono text-sm text-foreground">{chunk.ipa_connected}</p>;
                  } else {
                    return <p className="text-sm text-muted-foreground">IPA データなし</p>;
                  }
                })()}

                {chunk.reduction_type && (
                  <div className="mt-2">
                    <Badge variant="secondary">{chunk.reduction_type}</Badge>
                  </div>
                )}

                {chunk.katakana && (
                  <div className="mt-2 space-y-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={(event) => {
                        event.preventDefault();
                        setShowKatakana((current) => !current);
                      }}
                    >
                      {showKatakana ? "カタカナを隠す" : "カタカナを表示"}
                    </Button>
                    {showKatakana && (
                      <p className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
                        {chunk.katakana}
                      </p>
                    )}
                  </div>
                )}

                {chunk.linking && chunk.linking.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                    {chunk.linking.map((item, index) => (
                      <li key={`${chunk.start_time}-${index}`}>{item.description}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </Fragment>
        );
      })}
    </>
  );
}

interface ArticleContentProps {
  videoId: string;
  startTime: number;
  endTime: number;
  question: string;
  questionKatakana: string;
  youtubeUrl: string;
  article: ArticleData;
  category: string;
  currentId: number;
  prevId: number | null;
  nextId: number | null;
  kugiriEng: string;
  kugiriJp: string;
  similarItems?: FeedItem[];
  theme?: string;
  isSimilar?: number;
  parentArticleId?: number | null;
  chunkTimestamps?: ChunkTimestamp[] | null;
  pronChunks?: PronChunk[] | null;
}

export function ArticleContent({
  videoId,
  startTime,
  endTime,
  question,
  questionKatakana,
  youtubeUrl,
  article,
  category,
  currentId,
  prevId,
  nextId,
  kugiriEng,
  kugiriJp,
  similarItems,
  theme,
  isSimilar,
  parentArticleId,
  chunkTimestamps,
  pronChunks,
}: ArticleContentProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showArticle, setShowArticle] = useState(false);
  const [showQuiz, setShowQuiz] = useState(false);
  const playerRef = useRef<YouTubePlayerHandle | null>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isMarkingComplete, setIsMarkingComplete] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isCheckingUnlock, setIsCheckingUnlock] = useState(true);
  const [isNextUnlocked, setIsNextUnlocked] = useState(false);
  const [needsReview, setNeedsReview] = useState(false);
  const [similarItemsCompleted, setSimilarItemsCompleted] = useState<
    Set<number>
  >(new Set());
  const pathname = usePathname();
  const [currentVideoTime, setCurrentVideoTime] = useState<number>(startTime);
  const lastUpdateTimeRef = useRef<number>(startTime);
  const hasEverTappedRef = useRef(false);
  const [hasEverTapped, setHasEverTapped] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [seekingChunk, setSeekingChunk] = useState<{
    key: string;
    start: number;
    end: number;
  } | null>(null);
  // Ref mirror for seekingChunk — used in handleTimeUpdate to avoid re-creating
  // the callback (and triggering YouTubePlayer's useEffect cleanup) on every
  // seekingChunk state change.
  const seekingChunkRef = useRef<{ key: string; start: number; end: number } | null>(null);
  const seekingFallbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // スクロールアニメーション用のstate
  const [visibleSections, setVisibleSections] = useState<Set<number>>(
    new Set(),
  );
  const [animationStage, setAnimationStage] = useState<
    Map<number, "label-big" | "label-small" | "tweet">
  >(new Map());
  const sectionRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [shouldInitObservers, setShouldInitObservers] = useState(false);

  const handlePlaybackStateChange = useCallback((isPlaying: boolean) => {
    setIsVideoPlaying(isPlaying);
  }, []);

  // Keep seekingChunkRef in sync so handleTimeUpdate can read it without
  // taking seekingChunk as a dependency (which would cascade a player rebuild).
  useEffect(() => {
    seekingChunkRef.current = seekingChunk;
  }, [seekingChunk]);

  // YouTube動画の現在時刻を更新するコールバック
  // image_sectionsの切り替えポイントを検知するため、常に更新
  const handleTimeUpdate = useCallback((time: number) => {
    lastUpdateTimeRef.current = time;
    setCurrentVideoTime(time);
    const sc = seekingChunkRef.current;
    if (
      sc &&
      time >= sc.start &&
      time <= sc.end
    ) {
      setSeekingChunk(null);
      if (seekingFallbackTimeoutRef.current) {
        clearTimeout(seekingFallbackTimeoutRef.current);
        seekingFallbackTimeoutRef.current = null;
      }
    }
  }, []);

  const markKaraokeHintAsDiscovered = useCallback(() => {
    if (!hasEverTappedRef.current) {
      hasEverTappedRef.current = true;
      setHasEverTapped(true);
    }
  }, []);

  const markChunkAsSeeking = useCallback((chunk: ChunkTimestamp) => {
    const key = buildChunkInteractionKey(chunk);

    setSeekingChunk({
      key,
      start: chunk.start_time,
      end: chunk.end_time,
    });

    if (seekingFallbackTimeoutRef.current) {
      clearTimeout(seekingFallbackTimeoutRef.current);
    }
    seekingFallbackTimeoutRef.current = setTimeout(() => {
      setSeekingChunk((current) => (current?.key === key ? null : current));
    }, 800);
  }, []);

  const handleKaraokeChunkSelect = useCallback(() => {
    markKaraokeHintAsDiscovered();
  }, [markKaraokeHintAsDiscovered]);

  const handleKaraokeChunkReplay = useCallback((chunk: ChunkTimestamp, index: number) => {
    markKaraokeHintAsDiscovered();
    markChunkAsSeeking(chunk);

    const playerHandle = playerRef.current;
    if (!playerHandle) {
      console.warn("Chunk replay requested, but player handle is unavailable");
      return;
    }

    const nextChunk = chunkTimestamps?.[index + 1];
    const paddedEnd = computeChunkReplayEnd(
      chunk,
      nextChunk,
      CHUNK_REPLAY_PAD_S,
    );

    playerHandle.playSegment(chunk.start_time, paddedEnd);
  }, [chunkTimestamps, markChunkAsSeeking, markKaraokeHintAsDiscovered]);

  useEffect(() => {
    return () => {
      if (seekingFallbackTimeoutRef.current) {
        clearTimeout(seekingFallbackTimeoutRef.current);
      }
    };
  }, []);

  // 記事が表示されたらIntersection Observerを初期化
  useEffect(() => {
    if (showArticle) {
      // 少し遅延させてDOM要素が確実に登録されるのを待つ
      const timer = setTimeout(() => {
        setShouldInitObservers(true);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [showArticle]);

  // スクロールアニメーション: Intersection Observer設定
  useEffect(() => {
    if (!shouldInitObservers || sectionRefs.current.size === 0) return;

    const observers: IntersectionObserver[] = [];
    const observedIndices = new Set<number>();

    sectionRefs.current.forEach((element, index) => {
      if (!element || observedIndices.has(index)) return;

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting && !visibleSections.has(index)) {
            // セクションが表示されたら、アニメーション開始
            setVisibleSections((prev) => new Set(prev).add(index));
            setAnimationStage((prev) => new Map(prev).set(index, "label-big"));

            // 500ms後にラベルを縮小
            setTimeout(() => {
              setAnimationStage((prev) =>
                new Map(prev).set(index, "label-small"),
              );
            }, 500);

            // 800ms後にツイートを表示
            setTimeout(() => {
              setAnimationStage((prev) => new Map(prev).set(index, "tweet"));
            }, 800);

            // 一度だけ実行するためdisconnect
            observer.disconnect();
          }
        },
        {
          threshold: 0.3,
          rootMargin: "0px 0px -50px 0px",
        },
      );

      observer.observe(element);
      observers.push(observer);
      observedIndices.add(index);
    });

    return () => {
      observers.forEach((observer) => observer.disconnect());
    };
  }, [shouldInitObservers]);

  // Twitter埋め込み: ページ遷移時にウィジェットを再読み込み
  useEffect(() => {
    if (typeof window.twttr === "object") {
      window.twttr.widgets.load();
    }
  }, [pathname]);

  // Instagram埋め込み: 動的にスクリプトを読み込み、埋め込みを処理
  useEffect(() => {
    const hasInstagramEmbed = article.image_sections?.some(
      (section) => section.url?.includes('instagram-media')
    );
    if (!hasInstagramEmbed) return;

    const loadAndProcess = () => {
      if (window.instgrm?.Embeds) {
        window.instgrm.Embeds.process();
      }
    };

    if (!document.querySelector('script[src*="instagram.com/embed.js"]')) {
      const script = document.createElement('script');
      script.src = 'https://www.instagram.com/embed.js';
      script.async = true;
      script.onload = loadAndProcess;
      document.body.appendChild(script);
    } else {
      // スクリプト読み込み済みの場合は少し待ってから処理
      const timer = setTimeout(loadAndProcess, 300);
      return () => clearTimeout(timer);
    }
  }, [article.image_sections, animationStage, pathname]);

  // 初期化時にアンロック状態と完了状態を確認
  useEffect(() => {
    const checkStatus = async () => {
      setIsCheckingUnlock(true);
      try {
        // 直接アクセスかどうかを判定
        // 1. document.referrerが空 = URL直接入力
        // 2. document.referrerが同一オリジンでない = 外部サイトから
        const referrer = document.referrer;
        const currentOrigin = window.location.origin;
        const isDirectAccess = !referrer || !referrer.startsWith(currentOrigin);

        console.log("Direct access check:", {
          referrer,
          currentOrigin,
          isDirectAccess,
        });

        // 直接アクセスまたは外部からのアクセスの場合は常にアンロック
        if (isDirectAccess) {
          setIsUnlocked(true);
          console.log("Direct access detected - unlocking article");
        } else {
          const unlocked = await progressDB.isUnlocked(currentId);
          setIsUnlocked(unlocked);
          console.log("Site navigation detected - unlock status:", unlocked);
        }

        const completed = await progressDB.isCompleted(currentId);
        setIsCompleted(completed);

        // 復習が必要かチェック
        const needsReviewStatus = await progressDB.needsReview(currentId);
        setNeedsReview(needsReviewStatus);

        // nextIdのアンロック状態もチェック（類似問題の場合は常にアンロック）
        if (nextId) {
          if (isSimilar === 1) {
            // 類似問題の場合は、ナビゲーションに制限をかけない
            setIsNextUnlocked(true);
          } else {
            const nextUnlocked = await progressDB.isUnlocked(nextId);
            setIsNextUnlocked(nextUnlocked);
          }
        }
      } catch (error) {
        console.error("Failed to check status:", error);
        // エラー時はアンロック
        setIsUnlocked(true);
        setIsNextUnlocked(false);
      } finally {
        setIsCheckingUnlock(false);
      }
    };
    checkStatus();
  }, [currentId, nextId]);

  // 類似問題の完了状態をチェック
  useEffect(() => {
    const checkSimilarItemsStatus = async () => {
      if (!similarItems || similarItems.length === 0) return;

      const completed = new Set<number>();
      for (const item of similarItems) {
        const isItemCompleted = await progressDB.isCompleted(item.id);
        if (isItemCompleted) {
          completed.add(item.id);
        }
      }
      setSimilarItemsCompleted(completed);
    };

    checkSimilarItemsStatus();
  }, [similarItems]);

  // 「理解した」ボタンのハンドラー
  const handleMarkAsCompleted = async () => {
    setIsMarkingComplete(true);
    try {
      if (isCompleted) {
        // 既に完了済みの場合は復習として記録
        await progressDB.updateReviewStatus(currentId);
        console.log("Review status updated for article", currentId);

        // 次の問題に遷移（類似問題でもnextIdを使用）
        if (nextId) {
          setTimeout(() => {
            router.push(`/article/${nextId}?mode=article`);
          }, 500);
        }
      } else {
        // 初回完了の場合
        await progressDB.markAsCompleted(currentId);
        setIsCompleted(true);

        // nextIdをアンロック
        if (nextId) {
          setIsNextUnlocked(true);
        }

        // 次の問題に遷移（類似問題でもnextIdを使用）
        if (nextId) {
          setTimeout(() => {
            router.push(`/article/${nextId}?mode=article`);
          }, 1000);
        }
      }
    } catch (error) {
      console.error("Failed to mark as completed:", error);
    } finally {
      setIsMarkingComplete(false);
    }
  };

  // クライアントサイドでURLパラメータを読み取り、初期状態を設定
  useEffect(() => {
    const mode = searchParams.get("mode");
    if (mode === "article") {
      setShowArticle(true);
      setShowQuiz(false);
    } else if (mode === "quiz") {
      setShowQuiz(true);
      setShowArticle(false);
    }
  }, [searchParams]);

  // アンロックチェック中の表示
  if (isCheckingUnlock) {
    return (
      <div className="flex justify-center items-center py-12">
        <p className="text-muted-foreground">読み込み中...</p>
      </div>
    );
  }

  // アンロックされていない場合の表示
  if (!isUnlocked) {
    return (
      <div className="mb-8">
        <div className="flex flex-wrap gap-2 mb-4">
          <Badge variant="secondary">{category}</Badge>
        </div>
        <div className="space-y-6">
          <div className="p-8 border-2 border-dashed rounded-lg bg-muted/50 text-center">
            <div className="mb-4 text-4xl">🔒</div>
            <h2 className="text-2xl font-bold mb-3">
              この問題はまだロックされています
            </h2>
            <p className="text-muted-foreground mb-6">
              前の問題を完了すると、この問題が解放されます。
              <br />
              学習を進めて、新しいフレーズを解放しましょう！
            </p>
            {prevId && (
              <Link href={`/article/${prevId}?mode=article`}>
                <Button size="lg" className="gap-2">
                  <ArrowLeft className="h-5 w-5" />
                  前の問題に戻る
                </Button>
              </Link>
            )}
            {!prevId && (
              <Link href="/">
                <Button size="lg" className="gap-2">
                  <ArrowLeft className="h-5 w-5" />
                  トップページに戻る
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-8">
      <div className="flex flex-wrap gap-2 mb-4">
        <Badge variant="secondary">{category}</Badge>
      </div>

      {/* Initial Choice with Video */}
      {!showQuiz && !showArticle && (
        <div className="space-y-6">
          <QuizSection
            ref={playerRef}
            videoId={videoId}
            startTime={startTime}
            endTime={endTime}
            question={question}
            questionKatakana={questionKatakana}
            youtubeUrl={youtubeUrl}
            hideQuiz={true}
            onPlaybackStateChange={handlePlaybackStateChange}
            onTimeUpdate={handleTimeUpdate}
          />
          <div className="flex flex-col gap-4 p-6 border-2 border-dashed rounded-lg bg-muted/50">
            <h2 className="text-xl font-bold text-center mb-2">
              この動画をどのように学習しますか？
            </h2>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button
                size="lg"
                onClick={() => setShowQuiz(true)}
                className="flex-1 h-auto py-6 flex flex-col gap-2"
              >
                <Volume2 className="h-8 w-8" />
                <span className="text-lg font-bold">リスニングに挑戦</span>
                <span className="text-sm font-normal opacity-90">
                  音声を聞いて単語を並べるクイズに挑戦
                </span>
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => setShowArticle(true)}
                className="flex-1 h-auto py-6 flex flex-col gap-2"
              >
                <span className="text-lg font-bold">解説を観る</span>
                <span className="text-sm font-normal opacity-90">
                  クイズをスキップして解説記事を読む
                </span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Quiz Section with YouTube Player */}
      {showQuiz && (
        <>
          <div ref={videoContainerRef}>
            <QuizSection
              ref={playerRef}
              videoId={videoId}
              startTime={startTime}
              endTime={endTime}
              question={question}
              questionKatakana={questionKatakana}
              youtubeUrl={youtubeUrl}
              onAnswered={() => setShowArticle(true)}
              onTimeUpdate={handleTimeUpdate}
              onPlaybackStateChange={handlePlaybackStateChange}
            />
          </div>
          <FloatingNavigation
            prevId={prevId}
            nextId={nextId}
            mode="quiz"
            videoElementRef={videoContainerRef}
          />
        </>
      )}

      {/* Article Content */}
      {showArticle && showQuiz && (
        <>
          <FloatingNavigation
            prevId={prevId}
            nextId={nextId}
            mode="article"
            videoElementRef={videoContainerRef}
          />
          <h1 className="text-4xl font-bold mb-4 mt-8">{article.title}</h1>
          <p className="text-lg text-muted-foreground mb-6">
            {article.meta_description}
          </p>

          {/* Question and Translation */}
          <div className="mb-6 p-6 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30 rounded-lg border-2 border-purple-200 dark:border-purple-800">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-purple-700 dark:text-purple-300 mb-2">
                🎯 English
              </h3>
              <div className="text-xl font-bold text-gray-800 dark:text-gray-100">
                {chunkTimestamps && chunkTimestamps.length > 0 ? (
                  <KaraokeQuestion
                    question={question}
                    chunks={chunkTimestamps}
                    currentTime={currentVideoTime}
                    onChunkSelect={handleKaraokeChunkSelect}
                    onChunkReplay={handleKaraokeChunkReplay}
                    showDiscoveryHint={!hasEverTapped && isVideoPlaying}
                    showContextualPulse={!hasEverTapped && !isVideoPlaying}
                    seekingChunkKey={seekingChunk?.key ?? null}
                    pronChunks={pronChunks}
                  />
                ) : (
                  question
                )}
              </div>
            </div>
            {article.translated && (
              <div>
                <h3 className="text-sm font-semibold text-purple-700 dark:text-purple-300 mb-2">
                  🇯🇵 日本語訳
                </h3>
                <p className="text-lg text-gray-700 dark:text-gray-200">
                  {article.translated}
                </p>
              </div>
            )}
          </div>

          {/* フレーズの区切りと発音の視覚的表示 */}
          <div className="mb-8">
            <PhraseBreakdown kugiriEng={kugiriEng} kugiriJp={kugiriJp} />
          </div>

          {/* Tsukkomi Section */}
          {article.tsukkomi && article.tsukkomi.length > 0 && (
            <div className="mb-8 space-y-4">
              <h3 className="text-2xl font-bold text-orange-700 dark:text-orange-400 mb-4">
                💬 ツッコミどころ解説
              </h3>
              {article.tsukkomi.map((item, index) => (
                <div
                  key={index}
                  className="p-5 bg-gradient-to-br from-orange-50 to-yellow-50 dark:from-orange-950/30 dark:to-yellow-950/30 rounded-lg border-2 border-orange-200 dark:border-orange-800"
                >
                  <div className="mb-3">
                    <h4 className="text-lg font-bold text-orange-800 dark:text-orange-300">
                      Q: {item.question}
                    </h4>
                  </div>
                  <div className="pl-4 border-l-4 border-orange-400 dark:border-orange-600">
                    <MarkdownContent
                      content={item.answer}
                      className="text-gray-700 dark:text-gray-200"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Image Sections */}
          <StaticImageSections
            sections={article.image_sections ?? []}
            animationStage={animationStage}
            sectionRefs={sectionRefs}
          />

          {/* Time-synced Image Display */}
          <TimeSyncedImageSections
            sections={article.image_sections ?? []}
            currentVideoTime={currentVideoTime}
          />

          {/* Remember Section */}
          {article.remember && (
            <div className="mb-8 p-6 bg-gradient-to-br from-green-50 to-teal-50 dark:from-green-950/30 dark:to-teal-950/30 rounded-lg border-2 border-green-200 dark:border-green-800">
              <h3 className="text-xl font-bold text-green-700 dark:text-green-300 mb-4">
                📝 覚えておきたい表現
              </h3>
              <MarkdownContent
                content={article.remember}
                className="text-gray-700 dark:text-gray-200 whitespace-pre-line"
              />
            </div>
          )}

          {/* リスニングに挑戦と次の問題、前の問題ボタン */}
          <div className="my-8 space-y-4">
            {/* リスニングに挑戦ボタン */}
            {searchParams.get("mode") === "article" && (
              <div className="flex justify-center">
                <Button
                  size="lg"
                  className="gap-2 text-lg px-8 py-6 w-full sm:w-auto"
                  onClick={() => {
                    router.push(`/article/${currentId}?mode=quiz`);
                    setTimeout(() => {
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }, 100);
                  }}
                >
                  <Headphones className="h-5 w-5" />
                  リスニングに挑戦
                </Button>
              </div>
            )}

            {/* 前後の問題ボタン */}
            {(prevId || nextId) && (
              <div className="flex justify-between gap-4">
                {prevId ? (
                  <Link
                    href={`/article/${prevId}?mode=article`}
                    className="flex-1"
                  >
                    <Button
                      variant="outline"
                      size="lg"
                      className="gap-2 w-full"
                    >
                      <ArrowLeft className="h-5 w-5" />
                      {isSimilar === 1 ? "前の類題へ" : "前の問題へ"}
                    </Button>
                  </Link>
                ) : (
                  <div className="flex-1" />
                )}
                {nextId && isNextUnlocked ? (
                  <Link
                    href={`/article/${nextId}?mode=article`}
                    className="flex-1"
                  >
                    <Button size="lg" className="gap-2 w-full">
                      {isSimilar === 1 ? "次の類題へ" : "次の問題へ"}
                      <ArrowRight className="h-5 w-5" />
                    </Button>
                  </Link>
                ) : nextId ? (
                  <Button
                    size="lg"
                    disabled
                    className="gap-2 w-full flex-1 opacity-50 cursor-not-allowed"
                    title="「理解した」ボタンを押すと解放されます"
                  >
                    {isSimilar === 1 ? "次の類題へ" : "次の問題へ"}
                    <Lock className="h-5 w-5" />
                  </Button>
                ) : null}
              </div>
            )}
          </div>

          <div className="prose prose-neutral dark:prose-invert max-w-none mt-8">
            <section className="mb-8">
              <MarkdownContent
                content={article.introduction}
                className="text-lg"
              />
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">
                <MarkdownContent
                  content={article.section_1.heading}
                  className="inline"
                />
              </h2>
              <MarkdownContent content={article.section_1.content} />
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">
                <MarkdownContent
                  content={article.section_2.heading}
                  className="inline"
                />
              </h2>
              <MarkdownContent content={article.section_2.content} />
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">
                <MarkdownContent
                  content={article.section_3.heading}
                  className="inline"
                />
              </h2>
              <MarkdownContent content={article.section_3.content} />
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">
                <MarkdownContent
                  content={article.section_4.heading}
                  className="inline"
                />
              </h2>
              <MarkdownContent content={article.section_4.content} />
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">まとめ</h2>
              <MarkdownContent content={article.conclusion} />
            </section>

            {/* Quiz CTA Button - shown when article is accessed directly */}
            {searchParams.get("mode") === "article" && (
              <div className="mt-8 mb-8 flex justify-center">
                <Button
                  size="lg"
                  className="gap-2 text-lg px-8 py-6"
                  onClick={() => {
                    setShowQuiz(true);
                    // Smooth scroll to quiz section
                    setTimeout(() => {
                      const quizSection =
                        document.getElementById("quiz-section");
                      if (quizSection) {
                        quizSection.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        });
                      }
                    }, 100);
                  }}
                >
                  <Headphones className="h-5 w-5" />
                  リスニングに挑戦
                </Button>
              </div>
            )}
          </div>

          {article.keywords && article.keywords.length > 0 && (
            <div className="mt-8 pt-8 border-t">
              <h3 className="text-sm font-semibold mb-3">キーワード</h3>
              <div className="flex flex-wrap gap-2">
                {article.keywords.map((keyword, index) => (
                  <Badge key={index} variant="secondary">
                    {keyword}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* 理解したボタン */}
          <div className="mt-8 mb-6 p-6 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 rounded-lg border-2 border-blue-200 dark:border-blue-800">
            <h3 className="text-xl font-bold text-blue-700 dark:text-blue-300 mb-3">
              {needsReview
                ? "🔄 このフレーズを復習しましょう！"
                : "🎓 このフレーズを理解できましたか？"}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {needsReview
                ? "エビングハウスの忘却曲線に基づき、復習の時期が来ています。もう一度確認して記憶を定着させましょう。"
                : isCompleted
                  ? "✅ 完了済み！次の問題に進めます。"
                  : "「理解した」ボタンを押すと、次の問題が解放されます。"}
            </p>
            <Button
              size="lg"
              onClick={handleMarkAsCompleted}
              disabled={isMarkingComplete}
              className="w-full sm:w-auto gap-2"
              variant={needsReview ? "destructive" : "default"}
            >
              <CheckCircle2 className="h-5 w-5" />
              {isMarkingComplete
                ? "保存中..."
                : needsReview
                  ? "復習完了！次へ進む"
                  : isCompleted
                    ? "もう一度復習して次へ"
                    : "理解した！次へ進む"}
            </Button>
          </div>

          {/* Navigation Buttons */}
          {(prevId || nextId) && (
            <div className="mt-6 flex justify-between gap-4">
              {prevId ? (
                <Link href={`/article/${prevId}?mode=article`}>
                  <Button variant="outline" size="lg" className="gap-2">
                    <ArrowLeft className="h-5 w-5" />
                    前の問題へ
                  </Button>
                </Link>
              ) : (
                <div />
              )}
              {nextId && isNextUnlocked ? (
                <Link href={`/article/${nextId}?mode=article`}>
                  <Button size="lg" className="gap-2">
                    次の問題へ
                    <ArrowRight className="h-5 w-5" />
                  </Button>
                </Link>
              ) : nextId ? (
                <Button
                  size="lg"
                  disabled
                  className="gap-2 opacity-50 cursor-not-allowed"
                  title="「理解した」ボタンを押すと解放されます"
                >
                  次の問題へ
                  <Lock className="h-5 w-5" />
                </Button>
              ) : null}
            </div>
          )}
        </>
      )}

      {/* Article Content (when skipped quiz) */}
      {showArticle && !showQuiz && (
        <>
          <FloatingNavigation prevId={prevId} nextId={nextId} mode="article" />
          {/* Show video if quiz was skipped */}
          <div className="mb-8" ref={videoContainerRef}>
            <QuizSection
              ref={playerRef}
              videoId={videoId}
              startTime={startTime}
              endTime={endTime}
              question={question}
              questionKatakana={questionKatakana}
              youtubeUrl={youtubeUrl}
              hideQuiz={true}
              onTimeUpdate={handleTimeUpdate}
              onPlaybackStateChange={handlePlaybackStateChange}
            />
          </div>

          <h1 className="text-4xl font-bold mb-4 mt-8">{article.title}</h1>
          <p className="text-lg text-muted-foreground mb-6">
            {article.meta_description}
          </p>

          {/* Question and Translation */}
          <div className="mb-6 p-6 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30 rounded-lg border-2 border-purple-200 dark:border-purple-800">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-purple-700 dark:text-purple-300 mb-2">
                🎯 English
              </h3>
              <div className="text-xl font-bold text-gray-800 dark:text-gray-100">
                {chunkTimestamps && chunkTimestamps.length > 0 ? (
                  <KaraokeQuestion
                    question={question}
                    chunks={chunkTimestamps}
                    currentTime={currentVideoTime}
                    onChunkSelect={handleKaraokeChunkSelect}
                    onChunkReplay={handleKaraokeChunkReplay}
                    showDiscoveryHint={!hasEverTapped && isVideoPlaying}
                    showContextualPulse={!hasEverTapped && !isVideoPlaying}
                    seekingChunkKey={seekingChunk?.key ?? null}
                    pronChunks={pronChunks}
                  />
                ) : (
                  question
                )}
              </div>
            </div>
            {article.translated && (
              <div>
                <h3 className="text-sm font-semibold text-purple-700 dark:text-purple-300 mb-2">
                  🇯🇵 日本語訳
                </h3>
                <p className="text-lg text-gray-700 dark:text-gray-200">
                  {article.translated}
                </p>
              </div>
            )}
          </div>

          {/* フレーズの区切りと発音の視覚的表示 */}
          <div className="mb-8">
            <PhraseBreakdown kugiriEng={kugiriEng} kugiriJp={kugiriJp} />
          </div>

          {/* Tsukkomi Section */}
          {article.tsukkomi && article.tsukkomi.length > 0 && (
            <div className="mb-8 space-y-4">
              <h3 className="text-2xl font-bold text-orange-700 dark:text-orange-400 mb-4">
                💬 ツッコミどころ解説
              </h3>
              {article.tsukkomi.map((item, index) => (
                <div
                  key={index}
                  className="p-5 bg-gradient-to-br from-orange-50 to-yellow-50 dark:from-orange-950/30 dark:to-yellow-950/30 rounded-lg border-2 border-orange-200 dark:border-orange-800"
                >
                  <div className="mb-3">
                    <h4 className="text-lg font-bold text-orange-800 dark:text-orange-300">
                      Q: {item.question}
                    </h4>
                  </div>
                  <div className="pl-4 border-l-4 border-orange-400 dark:border-orange-600">
                    <MarkdownContent
                      content={item.answer}
                      className="text-gray-700 dark:text-gray-200"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Image Sections */}
          <StaticImageSections
            sections={article.image_sections ?? []}
            animationStage={animationStage}
            sectionRefs={sectionRefs}
          />

          {/* Time-synced Image Display */}
          <TimeSyncedImageSections
            sections={article.image_sections ?? []}
            currentVideoTime={currentVideoTime}
          />

          {/* Remember Section */}
          {article.remember && (
            <div className="mb-8 p-6 bg-gradient-to-br from-green-50 to-teal-50 dark:from-green-950/30 dark:to-teal-950/30 rounded-lg border-2 border-green-200 dark:border-green-800">
              <h3 className="text-xl font-bold text-green-700 dark:text-green-300 mb-4">
                📝 覚えておきたい表現
              </h3>
              <MarkdownContent
                content={article.remember}
                className="text-gray-700 dark:text-gray-200 whitespace-pre-line"
              />
            </div>
          )}
          {/* 理解したボタン */}
          <div className="mt-8 mb-6 p-6 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 rounded-lg border-2 border-blue-200 dark:border-blue-800">
            <h3 className="text-xl font-bold text-blue-700 dark:text-blue-300 mb-3">
              {needsReview
                ? "🔄 このフレーズを復習しましょう！"
                : "🎓 このフレーズを理解できましたか？"}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {needsReview
                ? "エビングハウスの忘却曲線に基づき、復習の時期が来ています。もう一度確認して記憶を定着させましょう。"
                : isCompleted
                  ? "✅ 完了済み！次の問題に進めます。"
                  : "「理解した」ボタンを押すと、次の問題が解放されます。"}
            </p>
            <Button
              size="lg"
              onClick={handleMarkAsCompleted}
              disabled={isMarkingComplete}
              className="w-full sm:w-auto gap-2"
              variant={needsReview ? "destructive" : "default"}
            >
              <CheckCircle2 className="h-5 w-5" />
              {isMarkingComplete
                ? "保存中..."
                : needsReview
                  ? "復習完了！次へ進む"
                  : isCompleted
                    ? "もう一度復習して次へ"
                    : "理解した！次へ進む"}
            </Button>
          </div>

          {/* リスニングに挑戦と次の問題、前の問題ボタン */}
          <div className="my-8 space-y-4">
            {/* リスニングに挑戦ボタン */}
            {searchParams.get("mode") === "article" && (
              <div className="flex justify-center">
                <Button
                  size="lg"
                  className="gap-2 text-lg px-8 py-6 w-full sm:w-auto"
                  onClick={() => {
                    router.push(`/article/${currentId}?mode=quiz`);
                    setTimeout(() => {
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }, 100);
                  }}
                >
                  <Headphones className="h-5 w-5" />
                  リスニングに挑戦
                </Button>
              </div>
            )}

            {/* 前後の問題ボタン */}
            {(prevId || nextId) && (
              <div className="flex justify-between gap-4">
                {prevId ? (
                  <Link
                    href={`/article/${prevId}?mode=article`}
                    className="flex-1"
                  >
                    <Button
                      variant="outline"
                      size="lg"
                      className="gap-2 w-full"
                    >
                      <ArrowLeft className="h-5 w-5" />
                      {isSimilar === 1 ? "前の類題へ" : "前の問題へ"}
                    </Button>
                  </Link>
                ) : (
                  <div className="flex-1" />
                )}
                {nextId && isNextUnlocked ? (
                  <Link
                    href={`/article/${nextId}?mode=article`}
                    className="flex-1"
                  >
                    <Button size="lg" className="gap-2 w-full">
                      {isSimilar === 1 ? "次の類題へ" : "次の問題へ"}
                      <ArrowRight className="h-5 w-5" />
                    </Button>
                  </Link>
                ) : nextId ? (
                  <Button
                    size="lg"
                    disabled
                    className="gap-2 w-full flex-1 opacity-50 cursor-not-allowed"
                    title="「理解した」ボタンを押すと解放されます"
                  >
                    {isSimilar === 1 ? "次の類題へ" : "次の問題へ"}
                    <Lock className="h-5 w-5" />
                  </Button>
                ) : null}
              </div>
            )}
          </div>

          <div className="prose prose-neutral dark:prose-invert max-w-none mt-8">
            <MarkdownContent content={article.introduction} />

            <h2>{article.section_1.heading}</h2>
            <MarkdownContent content={article.section_1.content} />

            <h2>{article.section_2.heading}</h2>
            <MarkdownContent content={article.section_2.content} />

            <h2>{article.section_3.heading}</h2>
            <MarkdownContent content={article.section_3.content} />

            <h2>{article.section_4.heading}</h2>
            <MarkdownContent content={article.section_4.content} />

            <MarkdownContent content={article.conclusion} />
          </div>

          {/* 理解したボタン */}
          <div className="mt-8 mb-6 p-6 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 rounded-lg border-2 border-blue-200 dark:border-blue-800">
            <h3 className="text-xl font-bold text-blue-700 dark:text-blue-300 mb-3">
              {needsReview
                ? "🔄 このフレーズを復習しましょう！"
                : "🎓 このフレーズを理解できましたか？"}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {needsReview
                ? "エビングハウスの忘却曲線に基づき、復習の時期が来ています。もう一度確認して記憶を定着させましょう。"
                : isCompleted
                  ? "✅ 完了済み！次の問題に進めます。"
                  : "「理解した」ボタンを押すと、次の問題が解放されます。"}
            </p>
            <Button
              size="lg"
              onClick={handleMarkAsCompleted}
              disabled={isMarkingComplete}
              className="w-full sm:w-auto gap-2"
              variant={needsReview ? "destructive" : "default"}
            >
              <CheckCircle2 className="h-5 w-5" />
              {isMarkingComplete
                ? "保存中..."
                : needsReview
                  ? "復習完了！次へ進む"
                  : isCompleted
                    ? "もう一度復習して次へ"
                    : "理解した！次へ進む"}
            </Button>
          </div>

          {/* Similar Articles Section */}
          {similarItems && similarItems.length > 0 && theme && (
            <div className="mt-8 pt-8 border-t">
              <div className="mb-4">
                <h3 className="text-2xl font-bold mb-2">類似問題</h3>
                <p className="text-sm text-muted-foreground">
                  テーマ:{" "}
                  <span className="font-medium text-foreground">{theme}</span>
                </p>
              </div>
              <p className="text-muted-foreground mb-6">
                同じテーマの関連問題で理解を深めましょう
              </p>
              <div className="grid grid-cols-1 gap-4">
                {similarItems.slice(0, 1).map((item) => {
                  const isSimilarCompleted = similarItemsCompleted.has(item.id);
                  return (
                    <Link
                      key={item.id}
                      href={`/article/${item.id}?mode=article`}
                      className="block"
                    >
                      <div className="border rounded-lg p-4 hover:shadow-lg transition-shadow cursor-pointer bg-gradient-to-br from-purple-50/50 to-pink-50/50 dark:from-purple-950/20 dark:to-pink-950/20 relative">
                        <div className="flex gap-4">
                          {item.thumbnail && (
                            <div className="flex-shrink-0 w-32 h-32 relative rounded overflow-hidden">
                              <img
                                src={`https://img.youtube.com/vi/${
                                  item.url.match(
                                    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&]+)/,
                                  )?.[1]
                                }/mqdefault.jpg`}
                                alt=""
                                className={`object-cover w-full h-full ${
                                  !isSimilarCompleted ? "blur-lg" : ""
                                }`}
                              />
                              {!isSimilarCompleted && (
                                <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                                  <Lock className="h-8 w-8 text-white" />
                                </div>
                              )}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start gap-2 mb-2">
                              <span className="inline-block px-2 py-1 text-xs font-medium bg-primary/10 text-primary rounded">
                                {item.category}
                              </span>
                              {!isSimilarCompleted && (
                                <span className="inline-block px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 rounded">
                                  未解答
                                </span>
                              )}
                            </div>
                            <h4 className="font-medium line-clamp-2 mb-2">
                              {isSimilarCompleted
                                ? item.question
                                : "???????????????????????????"}
                            </h4>
                            {item.question_katakana && (
                              <p className="text-sm text-muted-foreground line-clamp-2">
                                {isSimilarCompleted
                                  ? item.question_katakana
                                  : "???????????????????????????????????????"}
                              </p>
                            )}
                            {!isSimilarCompleted && (
                              <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                                <Lock className="h-3 w-3" />
                                この問題を解くと内容が表示されます
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          {isSimilar === 1 && parentArticleId && (
            <div className="mt-6 mb-4 flex justify-center">
              <Link href={`/article/${parentArticleId}?mode=article`}>
                <Button variant="outline" size="lg" className="gap-2">
                  <ArrowLeft className="h-5 w-5" />
                  元の記事に戻る
                </Button>
              </Link>
            </div>
          )}

          {(prevId || nextId) && (
            <div className="mt-6 flex justify-between gap-4">
              {prevId ? (
                <Link href={`/article/${prevId}?mode=article`}>
                  <Button variant="outline" size="lg" className="gap-2">
                    <ArrowLeft className="h-5 w-5" />
                    {isSimilar === 1 ? "前の類題へ" : "前の問題へ"}
                  </Button>
                </Link>
              ) : (
                <div />
              )}
              {nextId && isNextUnlocked ? (
                <Link href={`/article/${nextId}?mode=article`}>
                  <Button size="lg" className="gap-2">
                    {isSimilar === 1 ? "次の類題へ" : "次の問題へ"}
                    <ArrowRight className="h-5 w-5" />
                  </Button>
                </Link>
              ) : nextId ? (
                <Button
                  size="lg"
                  disabled
                  className="gap-2 opacity-50 cursor-not-allowed"
                  title="「理解した」ボタンを押すと解放されます"
                >
                  {isSimilar === 1 ? "次の類題へ" : "次の問題へ"}
                  <Lock className="h-5 w-5" />
                </Button>
              ) : null}
            </div>
          )}
        </>
      )}
    </div>
  );
}
