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
  onLoopComplete?: () => void;
}

type YouTubePlayerInstance = {
  getCurrentTime: () => number;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  destroy: () => void;
  getPlaybackRate?: () => number;
  setPlaybackRate?: (suggestedRate: number) => void;
  getAvailablePlaybackRates?: () => number[];
  getPlayerState?: () => number;
  isMuted?: () => boolean;
  getVolume?: () => number;
};

export interface YouTubePlayerHandle {
  seekAndPlay: (seconds: number) => void;
  playSegment: (startSeconds: number, endSeconds: number) => void;
  setPlaybackRate: (rate: number) => void;
  getPlaybackRate: () => number | null;
  getAvailablePlaybackRates: () => number[];
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
    onPlaybackRateChange?: (event: YouTubePlayerEvent) => void;
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
      onLoopComplete,
    }: YouTubePlayerProps,
    ref,
  ) {
  const playerRef = useRef<YouTubePlayerInstance | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const autoplayGuardTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const playbackFrameRef = useRef<number | null>(null);
  const segmentLoopFrameRef = useRef<number | null>(null);
  const loopCompleteFiredRef = useRef(false);
  const loopSeekedRef = useRef(false);
  const targetRateRef = useRef(1);
  const onErrorRef = useRef(onError);
  const onPlaybackStateChangeRef = useRef(onPlaybackStateChange);
  const onTimeUpdateRef = useRef(onTimeUpdate);
  const onLoopCompleteRef = useRef(onLoopComplete);
  const loopRef = useRef(loop);
  const autoPlayRef = useRef(autoPlay);
  const startTimeRef = useRef(startTime);
  const endTimeRef = useRef(endTime);

  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [progress, setProgress] = useState(0);
  const [showResumeOverlay, setShowResumeOverlay] = useState(false);

  const duration = endTime - startTime;

  useEffect(() => {
    onErrorRef.current = onError;
  });

  useEffect(() => {
    onPlaybackStateChangeRef.current = onPlaybackStateChange;
  });

  useEffect(() => {
    onTimeUpdateRef.current = onTimeUpdate;
  });

  useEffect(() => {
    onLoopCompleteRef.current = onLoopComplete;
  });

  useEffect(() => {
    loopRef.current = loop;
  });

  useEffect(() => {
    autoPlayRef.current = autoPlay;
  });

  useEffect(() => {
    startTimeRef.current = startTime;
  });

  useEffect(() => {
    endTimeRef.current = endTime;
  });

  const stopSegmentLoop = useCallback(() => {
    if (segmentLoopFrameRef.current !== null) {
      window.cancelAnimationFrame(segmentLoopFrameRef.current);
      segmentLoopFrameRef.current = null;
    }
  }, []);

  const syncPlaybackRate = useCallback(() => {
    const player = playerRef.current;
    if (!player || typeof player.setPlaybackRate !== "function") {
      return;
    }

    const targetRate = targetRateRef.current;
    const currentRate = player.getPlaybackRate?.();
    if (currentRate === undefined || currentRate !== targetRate) {
      player.setPlaybackRate(targetRate);
    }
  }, []);

  const stopPlaybackMonitor = useCallback(() => {
    if (playbackFrameRef.current !== null) {
      window.cancelAnimationFrame(playbackFrameRef.current);
      playbackFrameRef.current = null;
    }
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      seekAndPlay: (seconds: number) => {
        stopSegmentLoop();
        playerRef.current?.seekTo(seconds, true);
        playerRef.current?.playVideo();
        syncPlaybackRate();
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
        syncPlaybackRate();

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
      setPlaybackRate: (rate: number) => {
        targetRateRef.current = rate;
        syncPlaybackRate();
      },
      getPlaybackRate: () => {
        return playerRef.current?.getPlaybackRate?.() ?? null;
      },
      getAvailablePlaybackRates: () => {
        return playerRef.current?.getAvailablePlaybackRates?.() ?? [];
      },
      isMuted: () => playerRef.current?.isMuted?.() ?? false,
      getVolume: () => playerRef.current?.getVolume?.() ?? null,
    }),
    [stopSegmentLoop, syncPlaybackRate],
  );

  const updateProgress = useCallback(() => {
    const player = playerRef.current;
    if (!player || !player.getCurrentTime) {
      return;
    }

    const current = player.getCurrentTime();
    const activeStartTime = startTimeRef.current;
    const activeEndTime = endTimeRef.current;
    const activeDuration = activeEndTime - activeStartTime;
    setCurrentTime(current);
    onTimeUpdateRef.current?.(current);

    if (activeDuration <= 0) {
      setProgress(0);
      return;
    }

    if (current >= activeStartTime && current <= activeEndTime) {
      const progressValue = ((current - activeStartTime) / activeDuration) * 100;
      setProgress(Math.min(progressValue, 100));
    }
  }, []);

  const monitorPlayback = useCallback(() => {
    const activePlayer = playerRef.current;
    if (!activePlayer) {
      stopPlaybackMonitor();
      return;
    }

    const state = activePlayer.getPlayerState?.();
    if (state !== undefined && state !== PlayerState.PLAYING && state !== PlayerState.BUFFERING) {
      stopPlaybackMonitor();
      return;
    }

    const current = activePlayer.getCurrentTime();
    const activeStartTime = startTimeRef.current;
    const activeEndTime = endTimeRef.current;
    const segmentDuration = Math.max(activeEndTime - activeStartTime, 0);

    if (loopCompleteFiredRef.current) {
      const resetThreshold =
        segmentDuration < 1
          ? activeStartTime + segmentDuration * 0.25
          : activeStartTime + 0.5;
      if (current < resetThreshold) {
        loopCompleteFiredRef.current = false;
      }
    }

    if (current >= activeEndTime - 0.1) {
      if (loopRef.current) {
        if (!loopCompleteFiredRef.current) {
          loopCompleteFiredRef.current = true;
          loopSeekedRef.current = true;
          activePlayer.seekTo(activeStartTime, true);
          syncPlaybackRate();
        }
      } else {
        activePlayer.pauseVideo();
        stopPlaybackMonitor();
        return;
      }
    }

    updateProgress();
    playbackFrameRef.current = window.requestAnimationFrame(monitorPlayback);
  }, [stopPlaybackMonitor, syncPlaybackRate, updateProgress]);

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
      syncPlaybackRate();
    }
  }, [startTime, endTime, syncPlaybackRate]);

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
      syncPlaybackRate();
    }
  }, [startTime, syncPlaybackRate]);

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
              const readyRate = event.target.getPlaybackRate?.() ?? 1;
              if (targetRateRef.current === 1) {
                targetRateRef.current = readyRate;
              }
              syncPlaybackRate();
              event.target.seekTo(startTimeRef.current, true);
              if (autoPlayRef.current) {
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
              if (
                state === PlayerState.PLAYING ||
                state === PlayerState.CUED ||
                state === PlayerState.BUFFERING
              ) {
                syncPlaybackRate();
              }
              setIsPlaying(state === PlayerState.PLAYING);
              onPlaybackStateChangeRef.current?.(state === PlayerState.PLAYING);
              if (state === PlayerState.PLAYING) {
                setShowResumeOverlay(false);
                if (autoplayGuardTimeoutRef.current) {
                  clearTimeout(autoplayGuardTimeoutRef.current);
                  autoplayGuardTimeoutRef.current = null;
                }
                if (loopSeekedRef.current) {
                  loopSeekedRef.current = false;
                  onLoopCompleteRef.current?.();
                }
                if (playbackFrameRef.current === null) {
                  playbackFrameRef.current = window.requestAnimationFrame(monitorPlayback);
                }
              } else if (state === PlayerState.PAUSED) {
                loopSeekedRef.current = false;
                stopPlaybackMonitor();
              } else if (state !== PlayerState.BUFFERING) {
                stopPlaybackMonitor();
              }
            },
            onPlaybackRateChange: (event: YouTubePlayerEvent) => {
              targetRateRef.current = event.data;
            },
            onError: () => {
              setIsLoading(false);
              setIsPlaying(false);
              onPlaybackStateChangeRef.current?.(false);
              onErrorRef.current?.();
            },
          },
        });
    }

    return () => {
      stopSegmentLoop();
      stopPlaybackMonitor();
      if (autoplayGuardTimeoutRef.current) {
        clearTimeout(autoplayGuardTimeoutRef.current);
        autoplayGuardTimeoutRef.current = null;
      }
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
    // Player instance intentionally rebuilds only when videoId changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

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
