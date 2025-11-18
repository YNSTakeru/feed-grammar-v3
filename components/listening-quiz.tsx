"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, RotateCcw, Volume2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";

interface ListeningQuizProps {
  question: string;
  questionKatakana: string;
  onComplete?: (correct: boolean) => void;
}

export function ListeningQuiz({
  question,
  questionKatakana,
  onComplete,
}: ListeningQuizProps) {
  const [words, setWords] = useState<string[]>([]);
  const [selectedWords, setSelectedWords] = useState<string[]>([]);
  const [showAnswer, setShowAnswer] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);

  useEffect(() => {
    // Split question into words and shuffle them
    const questionWords = question.split(" ");
    const shuffled = [...questionWords].sort(() => Math.random() - 0.5);
    setWords(shuffled);
  }, [question]);

  const handleWordClick = (word: string, index: number) => {
    if (showAnswer) return;
    setSelectedWords([...selectedWords, word]);
    setWords(words.filter((_, i) => i !== index));
  };

  const handleSelectedWordClick = (index: number) => {
    if (showAnswer) return;
    const word = selectedWords[index];
    setWords([...words, word]);
    setSelectedWords(selectedWords.filter((_, i) => i !== index));
  };

  const handleCheck = () => {
    const userAnswer = selectedWords.join(" ");
    const correct = userAnswer === question;
    setIsCorrect(correct);

    if (correct) {
      setShowAnswer(true);
      onComplete?.(correct);
    }
  };

  const handleReset = () => {
    const questionWords = question.split(" ");
    const shuffled = [...questionWords].sort(() => Math.random() - 0.5);
    setWords(shuffled);
    setSelectedWords([]);
    setShowAnswer(false);
    setIsCorrect(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Volume2 className="h-5 w-5" />
          リスニングクイズ
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          正しい順番で単語を並べてください
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Selected Words Area */}
        <div className="min-h-24 p-4 border-2 border-dashed rounded-lg bg-muted/50">
          <div className="flex flex-wrap gap-2">
            {selectedWords.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                下から単語をタップして並べてください
              </p>
            ) : (
              selectedWords.map((word, index) => (
                <Button
                  key={`${word}-${index}`}
                  variant="default"
                  size="lg"
                  onClick={() => handleSelectedWordClick(index)}
                  disabled={showAnswer}
                  className="text-base"
                >
                  {word}
                </Button>
              ))
            )}
          </div>
        </div>

        {/* Available Words */}
        <div className="flex flex-wrap gap-2">
          {words.map((word, index) => (
            <Button
              key={`${word}-${index}`}
              variant="outline"
              size="lg"
              onClick={() => handleWordClick(word, index)}
              disabled={showAnswer}
              className="text-base"
            >
              {word}
            </Button>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          {!showAnswer ? (
            <>
              <Button
                onClick={handleCheck}
                disabled={selectedWords.length === 0}
                className="flex-1"
              >
                チェック
              </Button>
              <Button
                onClick={() => {
                  setShowAnswer(true);
                  setIsCorrect(false);
                  onComplete?.(false);
                }}
                variant="secondary"
              >
                ギブアップ
              </Button>
              <Button onClick={handleReset} variant="outline">
                <RotateCcw className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <Button onClick={handleReset} className="flex-1">
              もう一度挑戦
            </Button>
          )}
        </div>

        {/* Result */}
        {isCorrect === false && !showAnswer && (
          <div className="p-4 rounded-lg bg-red-100 dark:bg-red-950 border border-red-300 dark:border-red-800">
            <div className="flex items-start gap-3">
              <XCircle className="h-6 w-6 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-red-900 dark:text-red-100">
                  もう一度聞いてみましょう
                </p>
              </div>
            </div>
          </div>
        )}

        {showAnswer && isCorrect && (
          <div className="p-4 rounded-lg bg-green-100 dark:bg-green-950 border border-green-300 dark:border-green-800">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 space-y-2">
                <p className="font-semibold text-green-900 dark:text-green-100">
                  正解です!
                </p>
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">
                    カタカナ表記:
                  </p>
                  <Badge variant="secondary" className="text-sm">
                    {questionKatakana}
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        )}

        {showAnswer && !isCorrect && (
          <div className="p-4 rounded-lg bg-red-100 dark:bg-red-950 border border-red-300 dark:border-red-800">
            <div className="flex items-start gap-3">
              <XCircle className="h-6 w-6 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 space-y-2">
                <p className="font-semibold text-red-900 dark:text-red-100">
                  ギブアップしました
                </p>
                <div>
                  <p className="text-sm font-medium text-red-900 dark:text-red-100 mb-1">
                    正解:
                  </p>
                  <p className="font-mono text-red-900 dark:text-red-100">
                    {question}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">
                    カタカナ表記:
                  </p>
                  <Badge variant="secondary" className="text-sm">
                    {questionKatakana}
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
