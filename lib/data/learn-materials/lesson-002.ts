import feedData from "@/lib/data/feed-data.json";
import { buildDictationChoices, type DictationChoices } from "@/lib/learn/dictation";
import type { ChunkTimestamp, PronChunk } from "../../../types";

export interface ImageLearnSection {
  label: string;
  time: string;
  url: string;
}

export interface IpaChunk {
  text: string;
  ipa: string;
  startOffset?: number;
  endOffset?: number;
}

interface TsukkomiEntry {
  question: string;
  answer: string;
}

export interface LessonSentence {
  id: string;
  feedId: number;
  english: string;
  katakana: string;
  url: string;
  startTime: number;
  endTime: number;
  theme?: string;
  pronMemo?: string;
  kugiriEng?: string;
  kugiriJp?: string;
  imageSections?: ImageLearnSection[] | null;
  chunkTimestamps?: ChunkTimestamp[];
  pronChunks?: PronChunk[];
  ipaChunks?: IpaChunk[];
  translated?: string;
  tsukkomi?: TsukkomiEntry[];
  articleIntroduction?: string;
  choices: DictationChoices;
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
  url: string;
  start_time: string;
  end_time: string;
  theme?: string;
  pron_memo?: string;
  kugiri_eng?: string;
  kugiri_jp?: string;
  image_learn?: string;
  translated?: string;
  tsukkomi?: TsukkomiEntry[];
  article_text?:
    | string
    | {
        introduction?: string;
        pron_chunks?: PronChunk[] | null;
        chunks?: PronChunk[] | null;
      };
  chunk_timestamps?: string | null;
};

function isImageLearnSection(value: unknown): value is ImageLearnSection {
  if (!value || typeof value !== "object") return false;
  const section = value as Record<string, unknown>;
  return (
    typeof section.label === "string" &&
    typeof section.time === "string" &&
    typeof section.url === "string"
  );
}

export function parseImageLearnSections(
  raw: string | undefined,
): ImageLearnSection[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const validSections = parsed.filter((section): section is ImageLearnSection =>
      isImageLearnSection(section),
    );
    if (validSections.length === 0) return null;
    return validSections;
  } catch {
    return null;
  }
}

export function normalizeIpaChunks(chunks: IpaChunk[] | undefined): IpaChunk[] {
  if (!chunks || chunks.length === 0) {
    return [];
  }
  return chunks;
}

function fixJsonEscaping(jsonString: string): string {
  return jsonString.replace(/\\\\\"/g, '\\\\\\"');
}

function parsePronChunks(
  articleText: FeedRecord["article_text"],
): PronChunk[] | undefined {
  if (!articleText) return undefined;

  let source: unknown = articleText;
  if (typeof articleText === "string") {
    try {
      source = JSON.parse(articleText) as unknown;
    } catch {
      try {
        source = JSON.parse(fixJsonEscaping(articleText)) as unknown;
      } catch {
        return undefined;
      }
    }
  }

  if (!source || typeof source !== "object") return undefined;
  const article = source as { pron_chunks?: unknown; chunks?: unknown };
  const candidate = Array.isArray(article.pron_chunks)
    ? article.pron_chunks
    : Array.isArray(article.chunks)
      ? article.chunks
      : null;
  if (!candidate || candidate.length === 0) return undefined;
  return candidate as PronChunk[];
}

function parseChunkTimestamps(
  raw: string | null | undefined,
): ChunkTimestamp[] | undefined {
  if (!raw) return undefined;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return undefined;

    const first = parsed[0] as Record<string, unknown>;
    if (
      typeof first.text !== "string" ||
      typeof first.start_time !== "number" ||
      typeof first.end_time !== "number"
    ) {
      if (process.env.NODE_ENV === "development") {
        console.warn(
          "[karaoke] chunk_timestamps entry missing text/start_time/end_time; skipping",
        );
      }
      return undefined;
    }

    return parsed as ChunkTimestamp[];
  } catch {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[karaoke] chunk_timestamps JSON.parse failed; check malformed source data",
      );
    }
    return undefined;
  }
}

const LESSON_ID = "lesson-002";
const LESSON_CATEGORY = "最初の30フレーズ";
const LESSON_OFFSET = 15;
const LESSON_SIZE = 1;

const allRecords = feedData as FeedRecord[];
const records = allRecords
  .filter((record) => record.category === LESSON_CATEGORY)
  // TODO: Replace scaffold row with curated YouGlish clips (5-8 entries).
  .slice(LESSON_OFFSET, LESSON_OFFSET + LESSON_SIZE);

const baseSentences = records.map((record, index) => ({
  id: `${LESSON_ID}-${index + 1}`,
  feedId: record.id,
  english: record.question,
  katakana: record.question_katakana,
  url: record.url,
  startTime: Number(record.start_time),
  endTime: Number(record.end_time),
  theme: record.theme,
  pronMemo: record.pron_memo,
  kugiriEng: record.kugiri_eng,
  kugiriJp: record.kugiri_jp,
  imageSections: parseImageLearnSections(record.image_learn),
  chunkTimestamps: parseChunkTimestamps(record.chunk_timestamps),
  pronChunks: parsePronChunks(record.article_text),
  translated: record.translated?.trim() || undefined,
  tsukkomi: record.tsukkomi?.length ? record.tsukkomi : undefined,
  articleIntroduction:
    typeof record.article_text === "object"
      ? record.article_text?.introduction?.trim() || undefined
      : undefined,
}));

export const lesson002: Lesson = {
  id: LESSON_ID,
  title: "YouGlish lesson-002 scaffold",
  sentences: baseSentences.map((sentence, index) => ({
    ...sentence,
    choices: buildDictationChoices({
      sentences: baseSentences,
      index,
      pool: allRecords.map((record) => ({
        english: record.question,
        theme: record.theme,
      })),
    }),
  })),
};

export default lesson002;