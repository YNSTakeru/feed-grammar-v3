export interface PronChunk {
  en: string;
  ipa_citation: string;
  ipa_connected: string;
  kana: string;
  reduction_type?: string;
  start_time?: number;
  end_time?: number;
}

export type DifficultyLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

export interface ArticleData {
  title: string;
  meta_description: string;
  translated?: string;
  tsukkomi?: Array<{
    question: string;
    answer: string;
  }> | null;
  image_sections?: Array<{
    label: string;
    time: string;
    url: string;
    image_display_instruction?: string;
    description?: string;
    image_suggestion?: string;
  }>;
  remember?: string;
  introduction: string;
  section_1: {
    heading: string;
    content: string;
  };
  section_2: {
    heading: string;
    content: string;
  };
  section_3: {
    heading: string;
    content: string;
  };
  section_4: {
    heading: string;
    content: string;
  };
  conclusion: string;
  keywords: string[];
  pron_chunks?: PronChunk[] | null;
  chunks?: PronChunk[] | null;
  chunk_sections?: ChunkTimestamp[] | null;
  katakana_weak_strong?: string;
}

export interface Thumbnail {
  default: string;
  medium: string;
  high: string;
  standard: string;
  maxres: string;
}

export interface ChunkTimestamp {
  text: string;
  start_time: number;
  end_time: number;
  katakana?: string;
  ipa_connected?: string;
  reduction_type?: string;
  linking?: ChunkLinkingAnnotation[];
}

export interface ChunkLinkingAnnotation {
  type: "linking" | "reduction" | "elision" | "assimilation";
  description: string;
  from_word_index?: number;
  to_word_index?: number;
  word_index?: number;
}

export interface FeedItem {
  id: number;
  url: string;
  start_time: string;
  end_time: string;
  updated_at: string;
  question: string;
  question_katakana: string;
  article_text: string | ArticleData;
  category: string;
  thumbnail: string;
  theme: string;
  difficulty_level?: DifficultyLevel;
  tags?: string[];
  noIndex: number;
  kugiri_eng?: string;
  kugiri_jp?: string;
  is_similar: number;
  translated?: string;
  tsukkomi?: Array<{
    question: string;
    answer: string;
  }> | null;
  chunk_timestamps?: string | null;
  chunk_sections?: ChunkTimestamp[] | null;
  image_sections?: Array<{
    label: string;
    time: string;
    url: string;
    image_display_instruction?: string;
    description?: string;
    image_suggestion?: string;
  }>;
}
