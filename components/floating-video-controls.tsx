"use client";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";

interface FloatingVideoControlsProps {
  isPlaying: boolean;
  progress: number;
  currentTime: number;
  duration: number;
  startTime: number;
  loop: boolean;
  onPlay: () => void;
  onPause: () => void;
  onRestart: () => void;
  videoElementRef?: React.RefObject<HTMLDivElement | null>;
}

export function FloatingVideoControls({
  isPlaying,
  progress,
  currentTime,
  duration,
  startTime,
  loop,
  onPlay,
  onPause,
  onRestart,
  videoElementRef,
}: FloatingVideoControlsProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      if (videoElementRef?.current) {
        const rect = videoElementRef.current.getBoundingClientRect();
        // 動画が画面上部から外れたら表示
        setIsVisible(rect.bottom < 0);
      }
    };

    window.addEventListener("scroll", handleScroll);
    handleScroll(); // 初期チェック

    return () => window.removeEventListener("scroll", handleScroll);
  }, [videoElementRef]);

  if (!isVisible) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-background/98 backdrop-blur-md border-b border-border shadow-lg animate-in slide-in-from-top duration-300">
      <div className="container mx-auto px-4 py-3 max-w-4xl">
        <div className="space-y-3">
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
              <Button onClick={onPlay} size="default" className="min-w-28">
                <Play className="h-4 w-4 mr-2" />
                再生
              </Button>
            ) : (
              <Button
                onClick={onPause}
                variant="secondary"
                size="default"
                className="min-w-28"
              >
                <Pause className="h-4 w-4 mr-2" />
                一時停止
              </Button>
            )}
            <Button onClick={onRestart} variant="outline" size="default">
              <RotateCcw className="h-4 w-4 mr-2" />
              最初から
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
