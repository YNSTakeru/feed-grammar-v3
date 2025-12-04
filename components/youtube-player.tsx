"use client";

import { FloatingVideoControls } from "@/components/floating-video-controls";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Pause, Play, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

interface YouTubePlayerProps {
  videoId: string;
  startTime: number;
  endTime: number;
  autoPlay?: boolean;
  loop?: boolean;
  onTimeUpdate?: (time: number) => void;
}

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

const PlayerState = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
};

export function YouTubePlayer({
  videoId,
  startTime,
  endTime,
  autoPlay = true,
  loop = true,
  onTimeUpdate,
}: YouTubePlayerProps) {
  // 【デバッグ】受け取ったプロップの値を確認
  console.log(
    `[YouTubePlayer] Props received - videoId: ${videoId}, startTime: ${startTime}, endTime: ${endTime}, loop: ${loop}`
  );

  const playerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [progress, setProgress] = useState(0);

  const duration = endTime - startTime;

  // 【機能】プログレスバーの更新と現在時刻の表示を管理
  // 100msごとに呼ばれて、現在の再生位置を取得し、プログレスバーを更新
  const updateProgress = useCallback(() => {
    if (playerRef.current && playerRef.current.getCurrentTime) {
      const current = playerRef.current.getCurrentTime();
      console.log(
        `[updateProgress] 現在時刻: ${current.toFixed(
          2
        )}s (範囲: ${startTime}s - ${endTime}s)`
      );
      setCurrentTime(current);

      // 親コンポーネントに現在時刻を通知
      if (onTimeUpdate) {
        onTimeUpdate(current);
      }

      if (current >= startTime && current <= endTime) {
        const progressValue = ((current - startTime) / duration) * 100;
        setProgress(Math.min(progressValue, 100));
      }
    }
  }, [startTime, endTime, duration, onTimeUpdate]);

  // 【機能】再生ボタンが押された時の処理
  // 現在位置がendTimeを超えているか、startTimeより前なら、startTimeに巻き戻してから再生
  const handlePlay = useCallback(() => {
    if (playerRef.current) {
      const current = playerRef.current.getCurrentTime();
      // console.log(
      //   `[handlePlay] 再生ボタン押下 現在時刻: ${current.toFixed(2)}s`
      // );

      // If video is at or past the end time, restart from beginning
      if (current >= endTime - 0.5 || current < startTime) {
        // console.log(`[handlePlay] 範囲外のため ${startTime}s にシーク`);
        playerRef.current.seekTo(startTime, true);
      }

      playerRef.current.playVideo();
    }
  }, [startTime, endTime]);

  const handlePause = useCallback(() => {
    if (playerRef.current) {
      playerRef.current.pauseVideo();
    }
  }, []);

  // 【機能】最初からボタンが押された時の処理
  // startTimeに巻き戻して再生開始
  const handleRestart = useCallback(() => {
    if (playerRef.current) {
      // console.log(`[handleRestart] 最初から再生: ${startTime}s にシーク`);
      playerRef.current.seekTo(startTime, true);
      playerRef.current.playVideo();
    }
  }, [startTime]);

  useEffect(() => {
    // Load YouTube IFrame API
    if (!window.YT) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName("script")[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

      window.onYouTubeIframeAPIReady = () => {
        initPlayer();
      };
    } else {
      initPlayer();
    }

    function initPlayer() {
      if (containerRef.current && !playerRef.current) {
        playerRef.current = new window.YT.Player(containerRef.current, {
          videoId: videoId,
          playerVars: {
            start: startTime,
            autoplay: 1,
            controls: 0,
            modestbranding: 1,
            rel: 0,
            fs: 0,
            disablekb: 1,
            hl: "en",
            cc_lang_pref: "en",
            mute: 0,
          },
          events: {
            // 【イベント】プレイヤーの準備が完了した時
            // ローディング状態を解除し、autoPlayがtrueなら自動再生開始
            onReady: (event: any) => {
              // console.log(
              //   `[onReady] プレイヤー準備完了 (autoPlay: ${autoPlay})`
              // );
              setIsLoading(false);
              // Ensure video starts playing
              event.target.seekTo(startTime, true);
              if (autoPlay) {
                setTimeout(() => {
                  event.target.playVideo();
                }, 100);
              }
            },
            // 【イベント】プレイヤーの状態が変化した時（再生/一時停止/終了など）
            onStateChange: (event: any) => {
              const state = event.data;
              const stateNames = {
                [-1]: "UNSTARTED",
                [0]: "ENDED",
                [1]: "PLAYING",
                [2]: "PAUSED",
                [3]: "BUFFERING",
                [5]: "CUED",
              };
              // console.log(
              //   `[onStateChange] 状態変化: ${
              //     stateNames[state as keyof typeof stateNames]
              //   }`
              // );
              setIsPlaying(state === PlayerState.PLAYING);

              // Handle loop
              // 【機能】再生中の場合、100msごとにendTimeをチェックしてループ処理
              if (state === PlayerState.PLAYING) {
                if (!intervalRef.current) {
                  // console.log(
                  //   "[onStateChange] 100msインターバル開始 (endTime監視)"
                  // );
                  intervalRef.current = setInterval(() => {
                    if (playerRef.current && playerRef.current.getCurrentTime) {
                      const current = playerRef.current.getCurrentTime();

                      // Loop back to start when reaching end time
                      // 【ループ判定】現在時刻がendTimeの0.1秒手前に到達したらループ
                      if (current >= endTime - 0.1) {
                        console.log(
                          `[Loop Check] endTime到達! 現在: ${current.toFixed(
                            2
                          )}s, endTime: ${endTime}s, startTime: ${startTime}s`
                        );
                        if (loop) {
                          console.log(
                            `[Loop] ${startTime}s にシークしてループ再生`
                          );
                          playerRef.current.seekTo(startTime, true);
                        } else {
                          console.log("[Loop] ループ無効のため一時停止");
                          playerRef.current.pauseVideo();
                        }
                      }

                      updateProgress();
                    }
                  }, 100);
                }
              } else {
                // 【機能】再生停止時はインターバルをクリア
                if (intervalRef.current) {
                  // console.log("[onStateChange] インターバル停止");
                  clearInterval(intervalRef.current);
                  intervalRef.current = null;
                }
              }
            },
          },
        });
      }
    }

    return () => {
      console.log(
        `[YouTubePlayer] Cleanup - Destroying player for videoId: ${videoId}`
      );
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, [videoId, startTime, endTime, autoPlay, loop, updateProgress]);

  return (
    <>
      {/* Floating Controls */}
      <FloatingVideoControls
        isPlaying={isPlaying}
        progress={progress}
        currentTime={currentTime}
        duration={duration}
        startTime={startTime}
        loop={loop}
        onPlay={handlePlay}
        onPause={handlePause}
        onRestart={handleRestart}
        videoElementRef={videoContainerRef}
      />

      <div ref={videoContainerRef}>
        <div className="relative w-full aspect-video bg-muted rounded-md overflow-hidden">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
          )}
          <div ref={containerRef} className="w-full h-full" />
        </div>

        {/* Static Progress Bar and Controls - shown when in viewport */}
        <div className="mt-4 space-y-3">
          {/* Progress Bar */}
          <div className="space-y-2">
            <Progress value={progress} className="h-2" />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {Math.max(0, currentTime - startTime).toFixed(1)}s /{" "}
                {duration.toFixed(1)}s
              </span>
              {loop && (
                <span className="flex items-center gap-1">
                  <RotateCcw className="h-3 w-3" />
                  ループ再生中
                </span>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="flex gap-2 justify-center">
            {!isPlaying ? (
              <Button onClick={handlePlay} size="lg" className="min-w-32">
                <Play className="h-5 w-5 mr-2" />
                再生
              </Button>
            ) : (
              <Button
                onClick={handlePause}
                variant="secondary"
                size="lg"
                className="min-w-32"
              >
                <Pause className="h-5 w-5 mr-2" />
                一時停止
              </Button>
            )}
            <Button onClick={handleRestart} variant="outline" size="lg">
              <RotateCcw className="h-5 w-5 mr-2" />
              最初から
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
