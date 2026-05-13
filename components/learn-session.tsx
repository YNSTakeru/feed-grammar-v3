"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { lesson001 } from "@/lib/data/learn-materials/lesson-001";
import {
  sentenceProgressDB,
  type SentenceProgress,
} from "@/lib/db/sentence-progress-db";
import { normalizedSimilarity } from "@/lib/learn/similarity";
import { resampleTo16k } from "@/lib/audio/resample";
import { KatakanaText } from "@/lib/text/render-katakana";
import { useWhisperWorker } from "@/lib/whisper/use-whisper-worker";
import { Mic, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Feedback =
  | { kind: "hit"; message: string; asrText?: string }
  | { kind: "try-again"; message: string; asrText?: string }
  | { kind: "info"; message: string };

const ISOLATION_ERROR =
  "ヘッダ設定が反映されていません (COEP/COOP)。ローカル開発の場合は本番環境で確認してください。";

export default function LearnSession() {
  const canUseWhisper =
    typeof crossOriginIsolated !== "undefined" && crossOriginIsolated === true;

  if (!canUseWhisper) {
    return <LearnShell>{ISOLATION_ERROR}</LearnShell>;
  }

  return <LearnSessionReady />;
}

function LearnSessionReady() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [progressById, setProgressById] = useState<Record<string, SentenceProgress>>(
    {},
  );
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [workerProgress, setWorkerProgress] = useState(0);
  const [workerStage, setWorkerStage] = useState<
    "initializing-wasm" | "loading-model" | "transcribing"
  >("loading-model");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const isMountedRef = useRef(true);
  // RULE A-3: single AudioContext instance reused across recordings
  const audioContextRef = useRef<AudioContext | null>(null);

  const { run } = useWhisperWorker({
    onProgress: (stage, percent) => {
      if (isMountedRef.current) {
        setWorkerStage(stage);
        setWorkerProgress(percent);
      }
    },
    // small (181MB) needs ~90 s for first download+IDB-write+WASM-init.
    loadTimeoutMs: 90_000,
    transcribeTimeoutMs: 5 * 60_000,
  });

  const currentSentence = lesson001.sentences[currentIndex] ?? null;
  const currentProgress = currentSentence
    ? progressById[currentSentence.id]
    : undefined;
  const currentStage = currentProgress?.stage ?? "katakana";
  const englishCount = useMemo(
    () =>
      lesson001.sentences.filter(
        (sentence) => progressById[sentence.id]?.stage === "english",
      ).length,
    [progressById],
  );
  const completedPercent =
    lesson001.sentences.length === 0
      ? 0
      : (englishCount / lesson001.sentences.length) * 100;
  const isBusy = isRecording || isProcessing;

  const stopMediaTracks = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    isMountedRef.current = true;

    async function loadProgress() {
      const entries = await Promise.all(
        lesson001.sentences.map(async (sentence) => {
          const progress = await sentenceProgressDB.getProgress(sentence.id);
          return [sentence.id, progress] as const;
        }),
      );

      if (cancelled) return;

      const next: Record<string, SentenceProgress> = {};
      for (const [sentenceId, progress] of entries) {
        if (progress) next[sentenceId] = progress;
      }
      setProgressById(next);
    }

    loadProgress().catch(() => {
      if (!cancelled) {
        setFeedback({ kind: "info", message: "進捗はこの端末に保存されません。" });
      }
    });

    return () => {
      cancelled = true;
      isMountedRef.current = false;
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = null;
        recorder.stop();
      }
      stopMediaTracks();
      audioContextRef.current?.close().catch(() => {});
    };
  }, [stopMediaTracks]);

  async function startRecording() {
    if (!currentSentence || isBusy) return;

    setFeedback({ kind: "info", message: "声をそのまま届けてみましょう。" });
    setWorkerProgress(0);
    setWorkerStage("loading-model");
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        void finishRecording();
      };

      recorder.start();
      setIsRecording(true);
    } catch {
      stopMediaTracks();
      setFeedback({
        kind: "try-again",
        message: "マイクを使える状態にして、もう1回！",
      });
    }
  }

  function stopRecording() {
    if (!isRecording) return;

    setIsRecording(false);
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
      return;
    }
    stopMediaTracks();
  }

  async function finishRecording() {
    if (!currentSentence) return;

    // Guard: tap was too short — ondataavailable never fired with real data
    if (chunksRef.current.length === 0) {
      setFeedback({
        kind: "try-again",
        message: "もう少し長めに押しながら話してください。",
      });
      stopMediaTracks();
      chunksRef.current = [];
      return;
    }

    setIsProcessing(true);

    try {
      const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });

      if (audioBlob.size === 0) {
        setFeedback({
          kind: "try-again",
          message: "もう少し長めに押しながら話してください。",
        });
        return;
      }

      // RULE A-3: reuse AudioContext instead of creating a new one each call
      const arrayBuffer = await audioBlob.arrayBuffer();
      if (!audioContextRef.current || audioContextRef.current.state === "closed") {
        const AudioContextCtor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!AudioContextCtor) throw new Error("AudioContext is not available");
        audioContextRef.current = new AudioContextCtor();
      }
      const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);

      const monoAudio = audioBuffer.getChannelData(0);
      const resampled = await resampleTo16k(
        new Float32Array(monoAudio),
        audioBuffer.sampleRate,
      );
      if (process.env.NODE_ENV !== "production") {
        console.log(
          `[whisper] 🎤 audio: duration=${audioBuffer.duration.toFixed(2)}s sampleRate=${audioBuffer.sampleRate} resampled=${(resampled.length / 16000).toFixed(2)}s`,
        );
      }
      const result = await run(resampled, "en");
      if (!isMountedRef.current) return;

      if (!result.ok) {
        const msg =
          result.category === "timeout"
            ? "処理が長すぎました。もう1回！"
            : result.category === "empty"
              ? "音が短かったかも。もう1回！"
              : "うまく聞き取れませんでした。もう1回！";
        if (process.env.NODE_ENV !== "production") {
          console.warn(`[whisper] ❌ ${result.category}: ${result.error}`);
        }
        setFeedback({ kind: "try-again", message: msg });
        await applyMiss(currentSentence.id);
        return;
      }

      const asrText = result.chunks.map((chunk) => chunk.text).join(" ").trim();
      const score = normalizedSimilarity(asrText, currentSentence.english);

      if (score >= 0.85) {
        const nextProgress = await sentenceProgressDB.recordHit(currentSentence.id);
        if (!isMountedRef.current) return;
        const hits = nextProgress?.hits ?? (currentProgress?.hits ?? 0) + 1;
        setProgressById((prev) => ({
          ...prev,
          [currentSentence.id]:
            nextProgress ?? {
              sentenceId: currentSentence.id,
              hits,
              stage: hits >= 3 ? "english" : "katakana",
              lastUpdated: Date.now(),
            },
        }));
        setFeedback({
          kind: "hit",
          message: `通じた！ (${Math.min(hits, 3)} 連続中)`,
          asrText,
        });
        window.setTimeout(() => {
          if (!isMountedRef.current) return;
          setFeedback(null);
          setWorkerProgress(0);
          setWorkerStage("loading-model");
        }, 1500);
      } else {
        await applyMiss(currentSentence.id);
        if (isMountedRef.current) {
          setFeedback({ kind: "try-again", message: "もう1回！今の調子です。", asrText });
        }
      }
    } catch {
      if (isMountedRef.current) {
        setFeedback({ kind: "try-again", message: "音を処理できませんでした。もう1回！" });
      }
    } finally {
      if (isMountedRef.current) {
        setIsProcessing(false);
        mediaRecorderRef.current = null;
        chunksRef.current = [];
      }
      stopMediaTracks();
    }
  }

  async function applyMiss(sentenceId: string) {
    const nextProgress = await sentenceProgressDB.recordMiss(sentenceId);
    if (!isMountedRef.current) return;

    setProgressById((prev) => ({
      ...prev,
      [sentenceId]:
        nextProgress ?? {
          sentenceId,
          hits: 0,
          stage: prev[sentenceId]?.stage ?? "katakana",
          lastUpdated: Date.now(),
        },
    }));
  }

  if (!currentSentence) {
    return <LearnShell>教材がまだ準備できていません。</LearnShell>;
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-2xl flex-col px-4 py-6 sm:py-10">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{lesson001.title}</p>
          <h1 className="text-2xl font-bold">声で覚える Feed Grammar</h1>
        </div>
        <div className="rounded-full bg-blue-100 px-3 py-2 text-sm font-bold text-blue-900 dark:bg-blue-950 dark:text-blue-100">
          今日の挑戦 {currentIndex + 1}/{lesson001.sentences.length}
        </div>
      </div>

      <Card className="flex-1 justify-between">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5 text-blue-600" />
            {currentStage === "english" ? "英語で言ってみる" : "音の形で言ってみる"}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
          <div className="min-h-36 w-full rounded-3xl bg-gradient-to-br from-blue-50 to-indigo-50 p-6 dark:from-blue-950/40 dark:to-indigo-950/40">
            {currentStage === "english" ? (
              <p className="text-3xl font-extrabold leading-relaxed text-blue-950 dark:text-blue-100 sm:text-4xl">
                {currentSentence.english}
              </p>
            ) : (
              <KatakanaText text={currentSentence.katakana} variant="learn" />
            )}
          </div>

          <Button
            type="button"
            onPointerDown={() => void startRecording()}
            onPointerUp={stopRecording}
            onPointerCancel={stopRecording}
            onPointerLeave={stopRecording}
            disabled={isProcessing}
            className="min-h-28 w-full rounded-3xl text-xl font-black shadow-xl [-webkit-touch-callout:none] [-webkit-user-select:none] [user-select:none] sm:min-h-32"
            size="lg"
          >
            <Mic className="h-7 w-7" />
            {isRecording ? "話してください" : isProcessing ? "聞き取っています" : "押して話す"}
          </Button>

          {isRecording && (
            <div className="flex items-center gap-2 text-sm font-bold text-red-600">
              <span className="h-3 w-3 animate-pulse rounded-full bg-red-500" />
              録音中
            </div>
          )}

          {isProcessing && (
            <div className="w-full space-y-2">
              <Progress value={workerProgress} />
              <p className="text-sm text-muted-foreground">
                {workerStage === "initializing-wasm"
                  ? "WASM初期化中…"
                  : workerStage === "loading-model"
                    ? "モデル読込中…"
                    : "認識中…"}
              </p>
            </div>
          )}

          {feedback && (
            <div className={feedback.kind === "hit" ? "rounded-2xl bg-green-100 px-5 py-3 font-bold text-green-900 dark:bg-green-950 dark:text-green-100" : "rounded-2xl bg-amber-100 px-5 py-3 font-bold text-amber-900 dark:bg-amber-950 dark:text-amber-100"}>
              {feedback.message}
              {"asrText" in feedback && feedback.asrText && (
                <p className="mt-1 text-sm font-normal opacity-75">
                  聞こえた:「{feedback.asrText}」
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mt-5 space-y-2 pb-[env(safe-area-inset-bottom)]">
        <div className="flex justify-between text-sm font-medium text-muted-foreground">
          <span>英語ステージ到達</span>
          <span>{englishCount}/{lesson001.sentences.length}</span>
        </div>
        <Progress value={completedPercent} className="h-3" />
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
