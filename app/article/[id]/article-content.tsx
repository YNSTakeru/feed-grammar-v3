"use client";

import { FloatingNavigation } from "@/components/floating-navigation";
import { MarkdownContent } from "@/components/markdown-content";
import { PhraseBreakdown } from "@/components/phrase-breakdown";
import { QuizSection } from "@/components/quiz-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { progressDB } from "@/lib/db/progress-db";
import { ArticleData, FeedItem } from "@/types";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Headphones,
  Lock,
  Volume2,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Tweet } from "react-tweet";

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
}: ArticleContentProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showArticle, setShowArticle] = useState(false);
  const [showQuiz, setShowQuiz] = useState(false);
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

        // nextIdのアンロック状態もチェック
        if (nextId) {
          const nextUnlocked = await progressDB.isUnlocked(nextId);
          setIsNextUnlocked(nextUnlocked);
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

        // similarが1の場合は次の類似問題に遷移
        if (isSimilar === 1 && similarItems && similarItems.length > 0) {
          setTimeout(() => {
            router.push(`/article/${similarItems[0].id}?mode=article`);
          }, 500);
        } else if (nextId) {
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

        // similarが1の場合は次の類似問題に遷移
        if (isSimilar === 1 && similarItems && similarItems.length > 0) {
          setTimeout(() => {
            router.push(`/article/${similarItems[0].id}?mode=article`);
          }, 1000);
        } else if (nextId) {
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
            videoId={videoId}
            startTime={startTime}
            endTime={endTime}
            question={question}
            questionKatakana={questionKatakana}
            youtubeUrl={youtubeUrl}
            hideQuiz={true}
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
              videoId={videoId}
              startTime={startTime}
              endTime={endTime}
              question={question}
              questionKatakana={questionKatakana}
              youtubeUrl={youtubeUrl}
              onAnswered={() => setShowArticle(true)}
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
              <p className="text-xl font-bold text-gray-800 dark:text-gray-100">
                {question}
              </p>
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
          {article.image_sections && article.image_sections.length > 0 && (
            <div className="mb-8 space-y-6">
              <h3 className="text-2xl font-bold text-blue-700 dark:text-blue-400 mb-4">
                🖼️ フレーズのイメージ
              </h3>
              {article.image_sections.map((imageSection, index) => {
                const tweetId = imageSection.url?.match(/TWEET_ID:(\d+)/)?.[1];
                const displayLabel = imageSection.label.replace(/ /g, '_');
                
                return (
                  <div
                    key={index}
                    className="p-5 bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/30 dark:to-cyan-950/30 rounded-lg border-2 border-blue-200 dark:border-blue-800"
                  >
                    <div className="mb-3">
                      <h4 className="text-lg font-bold text-blue-800 dark:text-blue-300">
                        【ここに{displayLabel}の画像を表示】
                      </h4>
                    </div>
                    {tweetId && (
                      <div className="mb-4">
                        <Tweet id={tweetId} />
                      </div>
                    )}
                    {imageSection.description && (
                      <div className="text-gray-700 dark:text-gray-200">
                        <MarkdownContent content={imageSection.description} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

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
              videoId={videoId}
              startTime={startTime}
              endTime={endTime}
              question={question}
              questionKatakana={questionKatakana}
              youtubeUrl={youtubeUrl}
              hideQuiz={true}
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
              <p className="text-xl font-bold text-gray-800 dark:text-gray-100">
                {question}
              </p>
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
          {article.image_sections && article.image_sections.length > 0 && (
            <div className="mb-8 space-y-6">
              <h3 className="text-2xl font-bold text-blue-700 dark:text-blue-400 mb-4">
                🖼️ フレーズのイメージ
              </h3>
              {article.image_sections.map((imageSection, index) => {
                const tweetId = imageSection.url?.match(/TWEET_ID:(\d+)/)?.[1];
                const displayLabel = imageSection.label.replace(/ /g, '_');
                
                return (
                  <div
                    key={index}
                    className="p-5 bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/30 dark:to-cyan-950/30 rounded-lg border-2 border-blue-200 dark:border-blue-800"
                  >
                    <div className="mb-3">
                      <h4 className="text-lg font-bold text-blue-800 dark:text-blue-300">
                        【ここに{displayLabel}の画像を表示】
                      </h4>
                    </div>
                    {tweetId && (
                      <div className="mb-4">
                        <Tweet id={tweetId} />
                      </div>
                    )}
                    {imageSection.description && (
                      <div className="text-gray-700 dark:text-gray-200">
                        <MarkdownContent content={imageSection.description} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

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
                                    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&]+)/
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
