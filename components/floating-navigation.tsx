"use client";

import { Button } from "@/components/ui/button";
import { progressDB } from "@/lib/db/progress-db";
import { ArrowLeft, ArrowRight, Lock } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

interface FloatingNavigationProps {
  prevId: number | null;
  nextId: number | null;
  mode: "quiz" | "article";
  videoElementRef?: React.RefObject<HTMLDivElement | null>;
}

export function FloatingNavigation({
  prevId,
  nextId,
  mode,
  videoElementRef,
}: FloatingNavigationProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isNextUnlocked, setIsNextUnlocked] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      if (videoElementRef?.current) {
        const rect = videoElementRef.current.getBoundingClientRect();
        // 動画が画面上部から外れたら表示
        setIsVisible(rect.bottom < 0);
      } else {
        // videoElementRefがない場合は、一定スクロールしたら表示
        setIsVisible(window.scrollY > 300);
      }
    };

    window.addEventListener("scroll", handleScroll);
    handleScroll(); // 初期チェック

    return () => window.removeEventListener("scroll", handleScroll);
  }, [videoElementRef]);

  // nextIdのアンロック状態をチェック
  useEffect(() => {
    const checkNextUnlock = async () => {
      if (!nextId) {
        setIsNextUnlocked(false);
        return;
      }
      try {
        const unlocked = await progressDB.isUnlocked(nextId);
        setIsNextUnlocked(unlocked);
      } catch (error) {
        console.error("Failed to check next unlock status:", error);
        setIsNextUnlocked(false);
      }
    };
    checkNextUnlock();
  }, [nextId]);

  if (!isVisible || (!prevId && !nextId)) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom duration-300">
      <div className="bg-background/98 backdrop-blur-md border border-border shadow-2xl rounded-full px-4 py-3">
        <div className="flex items-center gap-3">
          {prevId ? (
            <Link href={`/article/${prevId}?mode=${mode}`}>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 rounded-full shadow-sm hover:shadow-md transition-shadow"
              >
                <ArrowLeft className="h-4 w-4" />
                前の問題
              </Button>
            </Link>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              disabled
              className="gap-2 rounded-full opacity-50 cursor-not-allowed"
            >
              <ArrowLeft className="h-4 w-4" />
              前の問題
            </Button>
          )}

          <div className="h-6 w-px bg-border" />

          {nextId && isNextUnlocked ? (
            <Link href={`/article/${nextId}?mode=${mode}`}>
              <Button
                size="sm"
                className="gap-2 rounded-full shadow-sm hover:shadow-md transition-shadow"
              >
                次の問題
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          ) : nextId ? (
            <Button
              variant="ghost"
              size="sm"
              disabled
              className="gap-2 rounded-full opacity-50 cursor-not-allowed"
              title="前の問題を完了すると解放されます"
            >
              次の問題
              <Lock className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              disabled
              className="gap-2 rounded-full opacity-50 cursor-not-allowed"
            >
              次の問題
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
