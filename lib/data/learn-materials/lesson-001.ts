import feedData from "@/lib/data/feed-data.json";

export interface LessonSentence {
  id: string;
  english: string;
  katakana: string;
}

export interface Lesson {
  id: string;
  title: string;
  sentences: LessonSentence[];
}

type FeedRecord = {
  id: number;
  question: string;
  question_katakana: string;
  category: string;
};

const LESSON_ID = "lesson-001";
const LESSON_CATEGORY = "最初の30フレーズ";
const LESSON_SIZE = 15;

const records = (feedData as FeedRecord[])
  .filter((record) => record.category === LESSON_CATEGORY)
  .slice(0, LESSON_SIZE);

export const lesson001: Lesson = {
  id: LESSON_ID,
  title: "最初の15フレーズ",
  sentences: records.map((record, index) => ({
    id: `${LESSON_ID}-${index + 1}`,
    english: record.question,
    katakana: record.question_katakana,
  })),
};
