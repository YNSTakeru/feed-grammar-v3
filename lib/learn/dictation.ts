export type DictationState =
  | "blind"
  | "correct"
  | "incorrect"
  | "revealed"
  | "skipped";

export type DictationMode = "multiple-choice" | "free-text";

export type ChoiceSource = "adjacent_segment" | "pool";

export interface DictationChoices {
  correct: string;
  distractors: string[];
  generatedBy: ChoiceSource;
}

export interface DictationSentenceLike {
  id: string;
  english: string;
  theme?: string;
}

export interface DictationPoolItem {
  english: string;
  theme?: string;
}

export interface BuildChoicesInput {
  sentences: DictationSentenceLike[];
  index: number;
  pool: DictationPoolItem[];
  maxDistractors?: number;
}

export interface DictationAttemptInput {
  isCorrect: boolean;
  currentAttempts: number;
  maxWrongAttempts?: number;
}

export interface DictationAttemptResult {
  state: "correct" | "incorrect" | "revealed";
  nextAttempts: number;
}

function normalizeKey(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function seededShuffle<T>(items: T[], seedValue: string): T[] {
  const list = [...items];
  let seed = hashString(seedValue) || 1;

  for (let i = list.length - 1; i > 0; i -= 1) {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    const j = seed % (i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

export function getDictationMode(english: string): DictationMode {
  const words = english.trim().split(/\s+/).filter(Boolean);
  return words.length < 3 ? "free-text" : "multiple-choice";
}

export function blindLoopCount(english: string): number {
  const words = english.trim().split(/\s+/).filter(Boolean).length;
  if (words <= 6) return 1;
  if (words <= 12) return 2;
  return 3;
}

export function extractYouTubeVideoId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&]+)/i);
  if (!match) return null;
  const value = match[1]?.trim();
  return value ? value : null;
}

export function buildDictationChoices({
  sentences,
  index,
  pool,
  maxDistractors = 3,
}: BuildChoicesInput): DictationChoices {
  const current = sentences[index];
  if (!current) {
    return {
      correct: "",
      distractors: [],
      generatedBy: "adjacent_segment",
    };
  }

  const adjacentCandidates: string[] = [];
  const offsets = [-1, 1, -2, 2, -3, 3];
  for (const offset of offsets) {
    const candidate = sentences[index + offset];
    if (candidate && candidate.english !== current.english) {
      adjacentCandidates.push(candidate.english);
    }
  }

  const poolCandidates = pool
    .filter(
      (item) =>
        item.english !== current.english &&
        item.theme &&
        current.theme &&
        item.theme === current.theme,
    )
    .map((item) => item.english);

  const fallbackPoolCandidates = pool
    .filter((item) => item.english !== current.english)
    .map((item) => item.english);

  const chosen: string[] = [];
  const seen = new Set<string>([normalizeKey(current.english)]);

  const pick = (source: string[]) => {
    for (const value of source) {
      if (chosen.length >= maxDistractors) break;
      const key = normalizeKey(value);
      if (seen.has(key)) continue;
      seen.add(key);
      chosen.push(value);
    }
  };

  pick(adjacentCandidates);
  const hadPoolCandidate = chosen.length < maxDistractors && poolCandidates.length > 0;
  pick(poolCandidates);
  pick(fallbackPoolCandidates);

  return {
    correct: current.english,
    distractors: chosen.slice(0, maxDistractors),
    generatedBy: hadPoolCandidate ? "pool" : "adjacent_segment",
  };
}

export function buildChoiceOptions(
  choices: DictationChoices,
  seed: string,
): string[] {
  return seededShuffle([choices.correct, ...choices.distractors], seed);
}

export function evaluateDictationAttempt({
  isCorrect,
  currentAttempts,
  maxWrongAttempts = 2,
}: DictationAttemptInput): DictationAttemptResult {
  if (isCorrect) {
    return {
      state: "correct",
      nextAttempts: currentAttempts,
    };
  }

  const nextAttempts = currentAttempts + 1;
  if (nextAttempts >= maxWrongAttempts) {
    return {
      state: "revealed",
      nextAttempts,
    };
  }

  return {
    state: "incorrect",
    nextAttempts,
  };
}
