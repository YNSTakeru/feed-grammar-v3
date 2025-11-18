"use client";

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
}: YouTubePlayerProps) {
  const playerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [progress, setProgress] = useState(0);

  const duration = endTime - startTime;

  const updateProgress = useCallback(() => {
    if (playerRef.current && playerRef.current.getCurrentTime) {
      const current = playerRef.current.getCurrentTime();
      setCurrentTime(current);

      if (current >= startTime && current <= endTime) {
        const progressValue = ((current - startTime) / duration) * 100;
        setProgress(Math.min(progressValue, 100));
      }
    }
  }, [startTime, endTime, duration]);

  const handlePlay = useCallback(() => {
    if (playerRef.current) {
      const current = playerRef.current.getCurrentTime();

      // If video is at or past the end time, restart from beginning
      if (current >= endTime - 0.5 || current < startTime) {
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

  const handleRestart = useCallback(() => {
    if (playerRef.current) {
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
            autoplay: autoPlay ? 1 : 0,
            controls: 0,
            modestbranding: 1,
            rel: 0,
            fs: 0,
            disablekb: 1,
            hl: "en",
            cc_lang_pref: "en",
          },
          events: {
            onReady: (event: any) => {
              setIsLoading(false);
              if (autoPlay) {
                event.target.playVideo();
              }
            },
            onStateChange: (event: any) => {
              const state = event.data;
              setIsPlaying(state === PlayerState.PLAYING);

              // Handle loop
              if (state === PlayerState.PLAYING) {
                if (!intervalRef.current) {
                  intervalRef.current = setInterval(() => {
                    if (playerRef.current && playerRef.current.getCurrentTime) {
                      const current = playerRef.current.getCurrentTime();

                      // Loop back to start when reaching end time
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
          },
        });
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, [videoId, startTime, endTime, autoPlay, loop, updateProgress]);

  return (
    <div className="space-y-4">
      <div className="relative w-full aspect-video bg-muted rounded-md overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
        )}
        <div ref={containerRef} className="w-full h-full" />
      </div>

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
  );
}
