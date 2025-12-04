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
}

export interface Thumbnail {
  default: string;
  medium: string;
  high: string;
  standard: string;
  maxres: string;
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
  noIndex: number;
  kugiri_eng: string;
  kugiri_jp: string;
  is_similar: number;
  image_sections?: Array<{
    label: string;
    time: string;
    url: string;
    image_display_instruction?: string;
    description?: string;
    image_suggestion?: string;
  }>;
}
