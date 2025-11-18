"use client";

import { MarkdownContent } from "@/components/markdown-content";
import { QuizSection } from "@/components/quiz-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArticleData } from "@/types";
import { ArrowLeft, ArrowRight, Volume2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

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
}: ArticleContentProps) {
  const [showArticle, setShowArticle] = useState(false);
  const [showQuiz, setShowQuiz] = useState(false);

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

      {/* Navigation Buttons */}
      {(prevId || nextId) && (
        <div className="mt-6 flex justify-between gap-4">
          {prevId ? (
            <Link href={`/article/${prevId}`}>
              <Button variant="outline" size="lg" className="gap-2">
                <ArrowLeft className="h-5 w-5" />
                前の問題へ
              </Button>
            </Link>
          ) : (
            <div />
          )}
          {nextId && (
            <Link href={`/article/${nextId}`}>
              <Button size="lg" className="gap-2">
                次の問題へ
                <ArrowRight className="h-5 w-5" />
              </Button>
            </Link>
          )}
        </div>
      )}

      {/* Article Content */}
      {showArticle && (
        <>
          {/* Show video if quiz was skipped */}
          {!showQuiz && (
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
          )}

          <h1 className="text-4xl font-bold mb-4 mt-8">{article.title}</h1>
          <p className="text-lg text-muted-foreground mb-6">
            {article.meta_description}
          </p>

          <div className="prose prose-neutral dark:prose-invert max-w-none mt-8">
            <section className="mb-8">
              <MarkdownContent
                content={article.introduction}
                className="text-lg"
              />
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">
                {article.section_1.heading}
              </h2>
              <MarkdownContent content={article.section_1.content} />
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">
                {article.section_2.heading}
              </h2>
              <MarkdownContent content={article.section_2.content} />
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">
                {article.section_3.heading}
              </h2>
              <MarkdownContent content={article.section_3.content} />
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">
                {article.section_4.heading}
              </h2>
              <MarkdownContent content={article.section_4.content} />
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">まとめ</h2>
              <MarkdownContent content={article.conclusion} />
            </section>
          </div>

          {/* Navigation Buttons */}
          {(prevId || nextId) && (
            <div className="mt-6 flex justify-between gap-4">
              {prevId ? (
                <Link href={`/article/${prevId}`}>
                  <Button variant="outline" size="lg" className="gap-2">
                    <ArrowLeft className="h-5 w-5" />
                    前の問題へ
                  </Button>
                </Link>
              ) : (
                <div />
              )}
              {nextId && (
                <Link href={`/article/${nextId}`}>
                  <Button size="lg" className="gap-2">
                    次の問題へ
                    <ArrowRight className="h-5 w-5" />
                  </Button>
                </Link>
              )}
            </div>
          )}

          {/* Keywords */}
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
        </>
      )}
    </div>
  );
}
