"use client";

import { KaraokeLearnText } from "@/components/karaoke-learn-text";
import {
  StaticImageSections,
  TimeSyncedImageSections,
} from "@/components/image-section-display";
import { YouTubePlayer, type YouTubePlayerHandle } from "@/components/youtube-player";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { RevealText } from "@/components/ui/reveal-text";
import {
  lesson001,
  type LessonSentence,
} from "@/lib/data/learn-materials/lesson-001";
import { sentenceProgressDB } from "@/lib/db/sentence-progress-db";
import {
  buildChoiceOptions,
  evaluateDictationAttempt,
  extractYouTubeVideoId,
  getDictationMode,
  type DictationState,
} from "@/lib/learn/dictation";
import { normalizedSimilarity } from "@/lib/learn/similarity";
import { KatakanaText } from "@/lib/text/render-katakana";
import { CheckCircle2, PlayCircle, SkipForward, XCircle } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Feedback =
  | { kind: "success"; message: string }
  | { kind: "error"; message: string }
  | { kind: "info"; message: string };

export default function LearnSession() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [phase, setPhase] = useState<DictationState>("blind");
  const [attempts, setAttempts] = useState(0);
  const [slowPlayActive, setSlowPlayActive] = useState(false);
  const [typedAnswer, setTypedAnswer] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [results, setResults] = useState<
    Record<string, { correct: boolean; attemptsBeforeCorrect: number }>
  >({});
  const [scoredCount, setScoredCount] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [youtubeLoadFailed, setYoutubeLoadFailed] = useState(false);
  const [imageRevealReady, setImageRevealReady] = useState(false);
  const [currentVideoTime, setCurrentVideoTime] = useState(0);
  const [imageAnimationStage, setImageAnimationStage] = useState<
    Map<number, "label-big" | "label-small" | "tweet">
  >(new Map());
  const [sessionId] = useState(
    () => `dictation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  const loggedSegmentIdsRef = useRef<Set<string>>(new Set());
  const playerRef = useRef<YouTubePlayerHandle>(null);
  const timeRef = useRef(0);
  const imageSectionRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const currentSentence = lesson001.sentences[currentIndex] ?? null;
  const mode = currentSentence ? getDictationMode(currentSentence.english) : "multiple-choice";
  const videoId = currentSentence ? extractYouTubeVideoId(currentSentence.url) : null;
  const choiceOptions = useMemo(() => {
    if (!currentSentence || mode !== "multiple-choice") return [];
    return buildChoiceOptions(currentSentence.choices, currentSentence.id);
  }, [currentSentence, mode]);
  const imageSections = currentSentence?.imageSections ?? [];
  const hasImageSections = imageSections.length > 0;
  const hasChunkTimestamps = (currentSentence?.chunkTimestamps?.length ?? 0) > 0;
  const hasPronChunks = (currentSentence?.pronChunks?.length ?? 0) > 0;
  const canShowKaraoke = hasChunkTimestamps || hasPronChunks;

  const completedCount = currentIndex;
  const completedPercent =
    lesson001.sentences.length === 0
      ? 0
      : (completedCount / lesson001.sentences.length) * 100;
  const firstTryHits = Object.values(results).filter(
    (entry) => entry.correct && entry.attemptsBeforeCorrect === 0,
  ).length;
  const firstTryRate =
    scoredCount === 0 ? 0 : Math.round((firstTryHits / scoredCount) * 100);

  async function saveResult(
    sentence: LessonSentence,
    correct: boolean,
    attemptsBeforeCorrect: number,
  ) {
    if (loggedSegmentIdsRef.current.has(sentence.id)) return;
    loggedSegmentIdsRef.current.add(sentence.id);
    setScoredCount((prev) => prev + 1);
    setIsSaving(true);
    try {
      await sentenceProgressDB.recordDictationEvent({
        sessionId,
        segmentId: sentence.id,
        reductionType: sentence.theme ?? "unknown",
        correct,
        attemptsBeforeCorrect,
      });
    } catch {
      setFeedback({
        kind: "error",
        message: "学習ログ保存に失敗しました。続行はできます。",
      });
    } finally {
      setIsSaving(false);
    }
  }

  function markOutcome(
    sentence: LessonSentence,
    correct: boolean,
    attemptsBeforeCorrect: number,
  ) {
    setResults((prev) => ({
      ...prev,
      [sentence.id]: { correct, attemptsBeforeCorrect },
    }));
    void saveResult(sentence, correct, attemptsBeforeCorrect);
  }

  function handleSkipSentence() {
    setImageRevealReady(false);
    setImageAnimationStage(new Map());
    setCurrentVideoTime(0);
    setSlowPlayActive(false);
    playerRef.current?.setPlaybackRate(1);
    setPhase("skipped");
    setFeedback({ kind: "info", message: "この問題はスキップしました（採点対象外）。" });
  }

  function applyAttempt(isCorrect: boolean) {
    if (!currentSentence) return;
    const maxWrongAttempts = mode === "free-text" ? 1 : 2;

    const result = evaluateDictationAttempt({
      isCorrect,
      currentAttempts: attempts,
      maxWrongAttempts,
    });

    setAttempts(result.nextAttempts);
    if (result.state === "correct") {
      setPhase("correct");
      setFeedback({
        kind: "success",
        message: result.nextAttempts === 0 ? "1発正解！" : "正解です！",
      });
      markOutcome(currentSentence, true, result.nextAttempts);
      return;
    }

    if (result.state === "incorrect") {
      setPhase("incorrect");
      setFeedback({ kind: "error", message: "惜しい！もう一度聞いてみましょう。" });
      return;
    }

    if (mode === "free-text") {
      setPhase("revealed");
      setFeedback({
        kind: "info",
        message: "回答を reveal しました。答えを確認して次へ進みましょう。",
      });
    } else {
      setPhase("correct");
      setFeedback({
        kind: "info",
        message: "2回ミスで正解を表示しました。答えを確認して次へ進みましょう。",
      });
    }
    markOutcome(currentSentence, false, result.nextAttempts);
  }

  function handleChoiceSelect(option: string) {
    if (!currentSentence) return;
    applyAttempt(option === currentSentence.choices.correct);
  }

  function handleSubmitFreeText() {
    if (!currentSentence) return;
    const score = normalizedSimilarity(typedAnswer, currentSentence.english);
    applyAttempt(score === 1);
  }

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => prev + 1);
    setPhase("blind");
    setSlowPlayActive(false);
    setAttempts(0);
    setTypedAnswer("");
    setFeedback(null);
    setYoutubeLoadFailed(false);
    setImageRevealReady(false);
    setImageAnimationStage(new Map());
    setCurrentVideoTime(0);
  }, []);

  function handleSlowPlay() {
    if (!currentSentence) return;

    const availableRates = playerRef.current?.getAvailablePlaybackRates() ?? [];
    const targetRate = availableRates.includes(0.75)
      ? 0.75
      : availableRates.includes(0.5)
        ? 0.5
        : null;

    if (targetRate === null) {
      setFeedback({
        kind: "info",
        message: "この環境ではゆっくり再生に非対応です。",
      });
      return;
    }

    setSlowPlayActive(true);
    playerRef.current?.setPlaybackRate(targetRate);
    playerRef.current?.seekAndPlay(currentSentence.startTime);
  }

  function handleNormalRetry() {
    if (!currentSentence) return;
    setSlowPlayActive(false);
    playerRef.current?.setPlaybackRate(1);
    playerRef.current?.seekAndPlay(currentSentence.startTime);
  }

  function handleShowScript() {
    if (slowPlayActive) {
      playerRef.current?.setPlaybackRate(1);
      setSlowPlayActive(false);
    }
    setPhase("revealed");
    setImageRevealReady(false);
    setImageAnimationStage(new Map());
    setCurrentVideoTime(0);
    setFeedback({
      kind: "info",
      message: "スクリプトを表示しました。",
    });
  }

  const handleReplayChunk = useCallback((startTime: number) => {
    playerRef.current?.seekAndPlay(startTime);
  }, []);

  useEffect(() => {
    if (phase !== "correct") return;
    const timer = setTimeout(() => {
      handleNext();
    }, 2000);
    return () => clearTimeout(timer);
  }, [handleNext, phase]);

  useEffect(() => {
    if (!imageRevealReady || imageSections.length === 0) return;

    const timers: Array<ReturnType<typeof setTimeout>> = [];
    imageSections.forEach((_, index) => {
      const baseDelay = index * 180;
      timers.push(
        setTimeout(() => {
          setImageAnimationStage((prev) => new Map(prev).set(index, "label-big"));
        }, baseDelay),
      );
      timers.push(
        setTimeout(() => {
          setImageAnimationStage((prev) => new Map(prev).set(index, "label-small"));
        }, baseDelay + 500),
      );
      timers.push(
        setTimeout(() => {
          setImageAnimationStage((prev) => new Map(prev).set(index, "tweet"));
        }, baseDelay + 800),
      );
    });

    return () => {
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, [imageRevealReady, imageSections]);

  if (!currentSentence) {
    return (
      <LearnShell>
        <div className="space-y-4">
          <p className="text-lg font-bold text-foreground">Session complete 🎉</p>
          <p>採点対象: {scoredCount} 文</p>
          <p>1発正解: {firstTryHits} 文</p>
          <p>1発正解率: {firstTryRate}%</p>
          <p className="text-sm text-muted-foreground">
            保存中: {isSaving ? "yes" : "no"} / sessionId: {sessionId}
          </p>
        </div>
      </LearnShell>
    );
  }

  const feedbackClassName =
    feedback?.kind === "success"
      ? "rounded-2xl bg-green-100 px-5 py-3 font-bold text-green-900 dark:bg-green-950 dark:text-green-100"
      : feedback?.kind === "error"
        ? "rounded-2xl bg-red-100 px-5 py-3 font-bold text-red-900 dark:bg-red-950 dark:text-red-100"
        : "rounded-2xl bg-amber-100 px-5 py-3 font-bold text-amber-900 dark:bg-amber-950 dark:text-amber-100";

  return (
    <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-3xl flex-col px-4 py-6 sm:py-10">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{lesson001.title}</p>
          <h1 className="text-2xl font-bold">Dictation Reception Loop</h1>
        </div>
        <div className="rounded-full bg-blue-100 px-3 py-2 text-sm font-bold text-blue-900 dark:bg-blue-950 dark:text-blue-100">
          {currentIndex + 1}/{lesson001.sentences.length}
        </div>
      </div>

      <Card className="flex-1">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            {(phase === "blind" || phase === "revealed") && (
              <PlayCircle className="h-5 w-5 text-blue-600" />
            )}
            {phase === "correct" && <CheckCircle2 className="h-5 w-5 text-green-600" />}
            {phase === "incorrect" && <XCircle className="h-5 w-5 text-red-600" />}
            {phase === "skipped" && <SkipForward className="h-5 w-5 text-amber-600" />}
            {phase === "blind" && "1) blind listening"}
            {phase === "revealed" && "2) reveal + answer"}
            {phase === "incorrect" && "2) retry"}
            {phase === "correct" && "3) 正解"}
            {phase === "skipped" && "3) skipped reveal"}
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="flex justify-end">
            <Button type="button" variant="ghost" size="sm" onClick={handleSkipSentence}>
              Skip sentence
            </Button>
          </div>

          {!sessionStarted ? (
            <div className="space-y-4 rounded-2xl border p-4">
              <p className="text-sm text-muted-foreground">
                最初の1回は iPhone Safari の再生制約に合わせて Start タップから始めます。
              </p>
              <Button
                onClick={() => {
                  setSessionStarted(true);
                  setFeedback({ kind: "info", message: "Startしました。blind listening 開始。" });
                }}
                className="w-full"
                size="lg"
              >
                Start
              </Button>
            </div>
          ) : youtubeLoadFailed || !videoId ? (
            <div className="space-y-4">
              <p className="text-sm font-medium text-red-700 dark:text-red-300">
                YouTube の読み込みに失敗しました。この文はブラウザで開くか、スキップできます。
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Button asChild variant="outline">
                  <a href={currentSentence.url} target="_blank" rel="noopener noreferrer">
                    Open on YouTube
                  </a>
                </Button>
                <Button type="button" variant="secondary" onClick={handleSkipSentence}>
                  Skip sentence
                </Button>
              </div>
            </div>
          ) : (
            <YouTubePlayer
              ref={playerRef}
              key={currentSentence.id}
              videoId={videoId}
              startTime={currentSentence.startTime}
              endTime={currentSentence.endTime}
              autoPlay={sessionStarted}
              loop={phase === "blind" || phase === "revealed"}
              onTimeUpdate={(time) => {
                timeRef.current = time;
                setCurrentVideoTime(time);
              }}
              onLoopComplete={() => setImageRevealReady(true)}
              onError={() => setYoutubeLoadFailed(true)}
            />
          )}

          {phase === "blind" && sessionStarted ? (
            <div className="rounded-2xl border p-4">
              <p className="text-sm text-muted-foreground">
                文字を見ずに音だけで掴みます。わかったら「スクリプトを表示」、難しければ
                {!slowPlayActive ? "「ゆっくり再生」" : "「⚡ 等倍でリトライ」"}を使います。
              </p>
              {!youtubeLoadFailed && (
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Button className="h-11 flex-1 text-sm font-bold" onClick={handleShowScript}>
                    スクリプトを表示
                  </Button>
                  {!slowPlayActive ? (
                    <Button
                      variant="outline"
                      className="h-11 flex-1 text-sm font-medium"
                      onClick={handleSlowPlay}
                    >
                      ゆっくり再生
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      className="h-11 flex-1 text-sm font-medium"
                      onClick={handleNormalRetry}
                    >
                      ⚡ 等倍でリトライ
                    </Button>
                  )}
                </div>
              )}
            </div>
          ) : null}

          {(phase === "revealed" || phase === "incorrect") && (
            <div className="space-y-4 rounded-2xl border p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Transcript
                </p>
                <p className="mt-1 text-xl font-bold text-foreground">{currentSentence.english}</p>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Katakana
                </p>
                <div className="mt-2">
                  <KatakanaText text={currentSentence.katakana} variant="learn" />
                </div>
              </div>

              {currentSentence.articleIntroduction ? (
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    発音解説
                  </p>
                  <p className="text-sm">{currentSentence.articleIntroduction}</p>
                  <Link
                    href={`/article/${currentSentence.feedId}`}
                    className="inline-flex text-sm font-medium text-blue-700 underline underline-offset-4 dark:text-blue-300"
                  >
                    記事全文を読む
                  </Link>
                </div>
              ) : null}

              {currentSentence.translated ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Translation
                  </p>
                  <RevealText key={currentSentence.feedId} text={currentSentence.translated} />
                </div>
              ) : null}

              {canShowKaraoke ? (
                <KaraokeLearnText
                  chunkTimestamps={currentSentence.chunkTimestamps}
                  pronChunks={currentSentence.pronChunks}
                  timeRef={timeRef}
                  enabled={phase === "revealed" || phase === "incorrect"}
                  onReplay={(chunk) => handleReplayChunk(chunk.start_time)}
                />
              ) : null}

              {hasImageSections && imageRevealReady ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Image context
                  </p>
                  <StaticImageSections
                    sections={imageSections}
                    animationStage={imageAnimationStage}
                    sectionRefs={imageSectionRefs}
                  />
                  <TimeSyncedImageSections
                    sections={imageSections}
                    currentVideoTime={currentVideoTime}
                  />
                </div>
              ) : null}

              {mode === "multiple-choice" ? (
                <div className="grid gap-2">
                  {choiceOptions.map((option) => (
                    <Button
                      key={option}
                      type="button"
                      variant="outline"
                      className="h-auto justify-start whitespace-normal py-3 text-left"
                      onClick={() => handleChoiceSelect(option)}
                    >
                      {option}
                    </Button>
                  ))}
                </div>
              ) : attempts === 0 ? (
                <div className="space-y-2">
                  <Input
                    value={typedAnswer}
                    onChange={(event) => setTypedAnswer(event.target.value)}
                    placeholder="聞こえた英文を入力"
                  />
                  <Button
                    type="button"
                    onClick={handleSubmitFreeText}
                    disabled={typedAnswer.trim().length === 0}
                    className="w-full"
                  >
                    回答する
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Free-text は1回回答で reveal です。正解を確認して次へ進みましょう。
                  </p>
                  <Button onClick={handleNext} className="w-full">
                    次へ進む
                  </Button>
                </div>
              )}
            </div>
          )}

          {(phase === "correct" || phase === "skipped") && (
            <div className="space-y-4 rounded-2xl border p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Transcript
                </p>
                <p className="mt-1 text-xl font-bold text-foreground">
                  {currentSentence.english}
                </p>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Katakana
                </p>
                <div className="mt-2">
                  <KatakanaText text={currentSentence.katakana} variant="learn" />
                </div>
              </div>

              {phase === "correct" && canShowKaraoke ? (
                <KaraokeLearnText
                  chunkTimestamps={currentSentence.chunkTimestamps}
                  pronChunks={currentSentence.pronChunks}
                  timeRef={timeRef}
                  enabled
                  onReplay={(chunk) => handleReplayChunk(chunk.start_time)}
                />
              ) : null}

              {phase === "correct" && currentSentence.pronMemo ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Pronunciation memo
                  </p>
                  <p className="mt-1 text-sm">{currentSentence.pronMemo}</p>
                </div>
              ) : null}

              {phase === "skipped" && currentSentence.tsukkomi?.length ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Tsukkomi
                  </p>
                  <ul className="space-y-2">
                    {currentSentence.tsukkomi.map((item, index) => (
                      <li key={`${currentSentence.id}-tsukkomi-${index}`} className="space-y-1">
                        <p className="text-sm font-medium">Q. {item.question}</p>
                        <p className="text-sm text-muted-foreground">A. {item.answer}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <Button onClick={handleNext} className="w-full">
                次へ進む
              </Button>
            </div>
          )}

          {feedback ? <div className={feedbackClassName}>{feedback.message}</div> : null}
        </CardContent>
      </Card>

      <div className="mt-5 space-y-2 pb-[env(safe-area-inset-bottom)]">
        <div className="flex justify-between text-sm font-medium text-muted-foreground">
          <span>進行状況</span>
          <span>
            {completedCount}/{lesson001.sentences.length}
          </span>
        </div>
        <Progress value={completedPercent} className="h-3" />
        <p className="text-xs text-muted-foreground">
          採点対象 {scoredCount} 文 / 1発正解率 {firstTryRate}% / 保存中 {isSaving ? "yes" : "no"}
        </p>
      </div>
    </div>
  );
}

function LearnShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-xl items-center px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle>Feed Grammar Learn</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground">{children}</CardContent>
      </Card>
    </div>
  );
}
