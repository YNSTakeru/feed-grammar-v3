"use client";

import { FloatingVideoControls } from "@/components/floating-video-controls";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Pause, Play, RotateCcw } from "lucide-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

interface YouTubePlayerProps {
  videoId: string;
  startTime: number;
  endTime: number;
  autoPlay?: boolean;
  loop?: boolean;
  onTimeUpdate?: (time: number) => void;
  onPlaybackStateChange?: (isPlaying: boolean) => void;
  onError?: () => void;
}

type YouTubePlayerInstance = {
  getCurrentTime: () => number;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  destroy: () => void;
  getPlayerState?: () => number;
  isMuted?: () => boolean;
  getVolume?: () => number;
};

export interface YouTubePlayerHandle {
  seekAndPlay: (seconds: number) => void;
  playSegment: (startSeconds: number, endSeconds: number) => void;
  isMuted: () => boolean;
  getVolume: () => number | null;
}

type YouTubePlayerEvent = {
  data: number;
  target: YouTubePlayerInstance;
};

type YouTubePlayerConfig = {
  videoId: string;
  playerVars: Record<string, string | number>;
  events: {
    onReady: (event: YouTubePlayerEvent) => void;
    onStateChange: (event: YouTubePlayerEvent) => void;
    onError: () => void;
  };
};

declare global {
  interface Window {
    YT?: {
      Player: new (container: HTMLElement, config: YouTubePlayerConfig) => YouTubePlayerInstance;
    };
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

export const YouTubePlayer = forwardRef<YouTubePlayerHandle, YouTubePlayerProps>(
  function YouTubePlayer(
    {
      videoId,
      startTime,
      endTime,
      autoPlay = true,
      loop = true,
      onTimeUpdate,
      onPlaybackStateChange,
      onError,
    }: YouTubePlayerProps,
    ref,
  ) {
  const playerRef = useRef<YouTubePlayerInstance | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const autoplayGuardTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const segmentLoopFrameRef = useRef<number | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [progress, setProgress] = useState(0);
  const [showResumeOverlay, setShowResumeOverlay] = useState(false);

  const duration = endTime - startTime;

  const stopSegmentLoop = useCallback(() => {
    if (segmentLoopFrameRef.current !== null) {
      window.cancelAnimationFrame(segmentLoopFrameRef.current);
      segmentLoopFrameRef.current = null;
    }
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      seekAndPlay: (seconds: number) => {
        stopSegmentLoop();
        playerRef.current?.seekTo(seconds, true);
        playerRef.current?.playVideo();
      },
      playSegment: (startSeconds: number, endSeconds: number) => {
        const player = playerRef.current;
        if (!player) {
          return;
        }

        stopSegmentLoop();
        // Capture position BEFORE seekTo so the rAF guard can detect stale values.
        const preSeekCt = player.getCurrentTime();
        player.seekTo(startSeconds, true);
        player.playVideo();

        if (endSeconds <= startSeconds) {
          return;
        }

        // seekTo() is async: getCurrentTime() may still return the pre-seek
        // position for several rAF frames. If that stale value already satisfies
        // the stop condition (>= endSeconds), the loop would pause
        // immediately before any audio plays. Guard against this by waiting
        // until getCurrentTime() has dropped at least 0.2s from preSeekCt.
        let seekGuardActive = preSeekCt >= endSeconds;
        let guardWaitFrames = 0;
        const MAX_GUARD_FRAMES = 60; // ~1 s safety timeout at 60 fps

        const monitorSegmentEnd = () => {
          const activePlayer = playerRef.current;
          if (!activePlayer) {
            stopSegmentLoop();
            return;
          }

          const ct = activePlayer.getCurrentTime();

          if (seekGuardActive) {
            guardWaitFrames++;
            // Release once ct has moved 0.2s toward startSeconds, or after timeout.
            if (ct < preSeekCt - 0.2 || guardWaitFrames > MAX_GUARD_FRAMES) {
              seekGuardActive = false;
            } else {
              segmentLoopFrameRef.current = window.requestAnimationFrame(monitorSegmentEnd);
              return;
            }
          }

          const state = activePlayer.getPlayerState?.();
          if (
            state !== undefined &&
            state !== PlayerState.PLAYING &&
            state !== PlayerState.BUFFERING
          ) {
            stopSegmentLoop();
            return;
          }

          if (ct >= endSeconds) {
            activePlayer.pauseVideo();
            stopSegmentLoop();
            return;
          }

          segmentLoopFrameRef.current = window.requestAnimationFrame(monitorSegmentEnd);
        };

        segmentLoopFrameRef.current = window.requestAnimationFrame(monitorSegmentEnd);
      },
      isMuted: () => playerRef.current?.isMuted?.() ?? false,
      getVolume: () => playerRef.current?.getVolume?.() ?? null,
    }),
    [stopSegmentLoop],
  );

  // 【機能】プログレスバーの更新と現在時刻の表示を管理
  // 100msごとに呼ばれて、現在の再生位置を取得し、プログレスバーを更新
  const updateProgress = useCallback(() => {
    if (playerRef.current && playerRef.current.getCurrentTime) {
      const current = playerRef.current.getCurrentTime();
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
      if (current >= endTime - 0.5 || current < startTime) {
        playerRef.current.seekTo(startTime, true);
      }

      setShowResumeOverlay(false);
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
      playerRef.current.seekTo(startTime, true);
      setShowResumeOverlay(false);
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
      if (!window.YT?.Player || !containerRef.current || playerRef.current) return;

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
            onReady: (event: YouTubePlayerEvent) => {
              setIsLoading(false);
              event.target.seekTo(startTime, true);
              if (autoPlay) {
                setTimeout(() => {
                  event.target.playVideo();
                  if (autoplayGuardTimeoutRef.current) {
                    clearTimeout(autoplayGuardTimeoutRef.current);
                  }
                  autoplayGuardTimeoutRef.current = setTimeout(() => {
                    const state = playerRef.current?.getPlayerState?.();
                    if (state !== PlayerState.PLAYING) {
                      setShowResumeOverlay(true);
                    }
                  }, 1200);
                }, 100);
              }
            },
            onStateChange: (event: YouTubePlayerEvent) => {
              const state = event.data;
              setIsPlaying(state === PlayerState.PLAYING);
              onPlaybackStateChange?.(state === PlayerState.PLAYING);
              if (state === PlayerState.PLAYING) {
                setShowResumeOverlay(false);
                if (autoplayGuardTimeoutRef.current) {
                  clearTimeout(autoplayGuardTimeoutRef.current);
                  autoplayGuardTimeoutRef.current = null;
                }
              }

              if (state === PlayerState.PLAYING) {
                if (!intervalRef.current) {
                  intervalRef.current = setInterval(() => {
                    if (playerRef.current && playerRef.current.getCurrentTime) {
                      const current = playerRef.current.getCurrentTime();

                      if (current >= endTime - 0.1) {
                        if (loop) {
                          playerRef.current.seekTo(startTime, true);
                        } else {
                          playerRef.current.pauseVideo();
                        }
                      }

                      updateProgress();
                    }
                  }, 100);
                }
              } else {
                if (intervalRef.current) {
                  clearInterval(intervalRef.current);
                  intervalRef.current = null;
                }
              }
            },
            onError: () => {
              setIsLoading(false);
              setIsPlaying(false);
              onPlaybackStateChange?.(false);
              onError?.();
            },
          },
        });
    }

    return () => {
      stopSegmentLoop();
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (autoplayGuardTimeoutRef.current) {
        clearTimeout(autoplayGuardTimeoutRef.current);
        autoplayGuardTimeoutRef.current = null;
      }
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, [
    videoId,
    startTime,
    endTime,
    autoPlay,
    loop,
    updateProgress,
    onPlaybackStateChange,
    onError,
    stopSegmentLoop,
  ]);

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
          {showResumeOverlay && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/55 p-4">
              <Button onClick={handlePlay} size="lg">
                Tap to resume
              </Button>
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
  },
);

YouTubePlayer.displayName = "YouTubePlayer";
