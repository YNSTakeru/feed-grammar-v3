"use client";

import { MarkdownContent } from "@/components/markdown-content";
import { PhraseBreakdown } from "@/components/phrase-breakdown";
import { QuizSection } from "@/components/quiz-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArticleData } from "@/types";
import { ArrowLeft, ArrowRight, Headphones, Volume2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

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
}: ArticleContentProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showArticle, setShowArticle] = useState(false);
  const [showQuiz, setShowQuiz] = useState(false);

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
        <QuizSection
          videoId={videoId}
          startTime={startTime}
          endTime={endTime}
          question={question}
          questionKatakana={questionKatakana}
          youtubeUrl={youtubeUrl}
          onAnswered={() => setShowArticle(true)}
        />
      )}

      {/* Article Content */}
      {showArticle && showQuiz && (
        <>
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
                      前の問題へ
                    </Button>
                  </Link>
                ) : (
                  <div className="flex-1" />
                )}
                {nextId && (
                  <Link
                    href={`/article/${nextId}?mode=article`}
                    className="flex-1"
                  >
                    <Button size="lg" className="gap-2 w-full">
                      次の問題へ
                      <ArrowRight className="h-5 w-5" />
                    </Button>
                  </Link>
                )}
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
              {nextId && (
                <Link href={`/article/${nextId}?mode=article`}>
                  <Button size="lg" className="gap-2">
                    次の問題へ
                    <ArrowRight className="h-5 w-5" />
                  </Button>
                </Link>
              )}
            </div>
          )}
        </>
      )}

      {/* Article Content (when skipped quiz) */}
      {showArticle && !showQuiz && (
        <>
          {/* Show video if quiz was skipped */}
          <div className="mb-8">
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
                      前の問題へ
                    </Button>
                  </Link>
                ) : (
                  <div className="flex-1" />
                )}
                {nextId && (
                  <Link
                    href={`/article/${nextId}?mode=article`}
                    className="flex-1"
                  >
                    <Button size="lg" className="gap-2 w-full">
                      次の問題へ
                      <ArrowRight className="h-5 w-5" />
                    </Button>
                  </Link>
                )}
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
              {nextId && (
                <Link href={`/article/${nextId}?mode=article`}>
                  <Button size="lg" className="gap-2">
                    次の問題へ
                    <ArrowRight className="h-5 w-5" />
                  </Button>
                </Link>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
