"use client";

import { ListeningQuiz } from "@/components/listening-quiz";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { YouTubePlayer } from "@/components/youtube-player";
import { ExternalLink } from "lucide-react";

interface QuizSectionProps {
  videoId: string;
  startTime: number;
  endTime: number;
  question: string;
  questionKatakana: string;
  youtubeUrl: string;
  onAnswered?: () => void;
  hideQuiz?: boolean;
  onTimeUpdate?: (time: number) => void;
}

export function QuizSection({
  videoId,
  startTime,
  endTime,
  question,
  questionKatakana,
  youtubeUrl,
  onAnswered,
  hideQuiz = false,
  onTimeUpdate,
}: QuizSectionProps) {
  return (
    <div className="space-y-6">
      {/* YouTube Player */}
      <div>
        <Card>
          <CardContent className="p-6 pb-0">
            <YouTubePlayer
              key={`yt-${videoId}-${startTime}-${endTime}`}
              videoId={videoId}
              startTime={startTime}
              endTime={endTime}
              onTimeUpdate={onTimeUpdate}
            />
          </CardContent>
        </Card>
        <div className="mt-4 flex justify-between items-center px-2">
          <p className="text-sm text-muted-foreground">
            動画を見て、フレーズを聞き取ってください
          </p>
          <a href={youtubeUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm">
              <ExternalLink className="h-4 w-4 mr-2" />
              YouTubeで見る
            </Button>
          </a>
        </div>
      </div>

      {/* Listening Quiz */}
      {!hideQuiz && (
        <ListeningQuiz
          question={question}
          questionKatakana={questionKatakana}
          onComplete={() => onAnswered?.()}
        />
      )}
    </div>
  );
}
