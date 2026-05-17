import fs from "fs";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import { loadArticle } from "./article-loader";

const createdFiles: string[] = [];

afterEach(() => {
  for (const filePath of createdFiles.splice(0)) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
});

describe("loadArticle", () => {
  it("parses stringified article_text and enriches chunk_sections", async () => {
    const articleId = 999991;
    const similarDir = path.join(process.cwd(), "lib", "data", "similar");
    const tempFile = path.join(similarDir, "__article_loader_test__.json");

    const fixture = [
      {
        id: articleId,
        url: "https://www.youtube.com/watch?v=Ij1o5zGDCeE",
        start_time: "1",
        end_time: "2",
        updated_at: "2026-05-17T00:00:00.000Z",
        question: "don't",
        question_katakana: "【ドン】",
        article_text: JSON.stringify({
          title: "test",
          meta_description: "test",
          introduction: "intro",
          section_1: { heading: "h1", content: "c1" },
          section_2: { heading: "h2", content: "c2" },
          section_3: { heading: "h3", content: "c3" },
          section_4: { heading: "h4", content: "c4" },
          conclusion: "end",
          keywords: [],
          chunk_sections: [
            {
              text: "don't want to think back",
              start_time: 1,
              end_time: 2,
              ipa_connected: "/doʊnt wɑnə θɪŋk bæk/",
            },
          ],
        }),
        category: "test",
        thumbnail: "{}",
        theme: "test",
        noIndex: 0,
        kugiri_eng: "",
        kugiri_jp: "",
        is_similar: 1,
        chunk_sections: [{ text: "don’t", start_time: 1, end_time: 1.2 }],
      },
    ];

    fs.writeFileSync(tempFile, JSON.stringify(fixture), "utf-8");
    createdFiles.push(tempFile);

    const loaded = await loadArticle(String(articleId));

    expect(loaded).not.toBeNull();
    expect(loaded?.article.title).toBe("test");
    expect(loaded?.item.chunk_sections[0].ipa_connected).toBe(
      "/doʊnt wɑnə θɪŋk bæk/",
    );
  });

  it("normalizes top-level tsukkomi/translated into article", async () => {
    const articleId = 999992;
    const similarDir = path.join(process.cwd(), "lib", "data", "similar");
    const tempFile = path.join(similarDir, "__article_loader_top_level_test__.json");

    const fixture = [
      {
        id: articleId,
        url: "https://www.youtube.com/watch?v=test2",
        start_time: "1",
        end_time: "2",
        updated_at: "2026-05-17T00:00:00.000Z",
        question: "question",
        question_katakana: "カタカナ",
        article_text: {
          title: "legacy schema article",
          meta_description: "test",
          introduction: "intro",
          section_1: { heading: "h1", content: "c1" },
          section_2: { heading: "h2", content: "c2" },
          section_3: { heading: "h3", content: "c3" },
          section_4: { heading: "h4", content: "c4" },
          conclusion: "end",
          keywords: [],
        },
        category: "test",
        thumbnail: "{}",
        theme: "test",
        noIndex: 0,
        is_similar: 1,
        translated: "top-level translated",
        tsukkomi: [{ question: "Q", answer: "A" }],
      },
    ];

    fs.writeFileSync(tempFile, JSON.stringify(fixture), "utf-8");
    createdFiles.push(tempFile);

    const loaded = await loadArticle(String(articleId));

    expect(loaded).not.toBeNull();
    expect(loaded?.article.translated).toBe("top-level translated");
    expect(loaded?.article.tsukkomi).toEqual([{ question: "Q", answer: "A" }]);
  });

  it("falls back to chunk_timestamps when chunk_sections is empty", async () => {
    const articleId = 999994;
    const similarDir = path.join(process.cwd(), "lib", "data", "similar");
    const tempFile = path.join(similarDir, "__article_loader_chunk_timestamps_test__.json");

    const fixture = [
      {
        id: articleId,
        url: "https://www.youtube.com/watch?v=fallback",
        start_time: "9",
        end_time: "10",
        updated_at: "2026-05-17T00:00:00.000Z",
        question: "back to our",
        question_katakana: "バック・トゥ・アワ",
        article_text: JSON.stringify({
          title: "test",
          meta_description: "test",
          introduction: "intro",
          section_1: { heading: "h1", content: "c1" },
          section_2: { heading: "h2", content: "c2" },
          section_3: { heading: "h3", content: "c3" },
          section_4: { heading: "h4", content: "c4" },
          conclusion: "end",
          keywords: [],
          pron_chunks: [
            { en: "back", ipa_citation: "bæk", ipa_connected: "bæk", kana: "バック" },
            { en: "to our", ipa_citation: "tu ɑr", ipa_connected: "t'ər", kana: "タウア" },
          ],
        }),
        category: "test",
        thumbnail: "{}",
        theme: "test",
        noIndex: 0,
        is_similar: 1,
        // chunk_sections intentionally absent (empty)
        chunk_timestamps: JSON.stringify([
          { text: "back to our", start_time: 9.6, end_time: 9.9 },
        ]),
      },
    ];

    fs.writeFileSync(tempFile, JSON.stringify(fixture), "utf-8");
    createdFiles.push(tempFile);

    const loaded = await loadArticle(String(articleId));

    expect(loaded).not.toBeNull();
    expect(loaded?.item.chunk_sections).toHaveLength(1);
    expect(loaded?.item.chunk_sections[0].text).toBe("back to our");
    expect(loaded?.item.chunk_sections[0].start_time).toBe(9.6);
  });

  it("keeps article_text tsukkomi/translated and falls back chunks to pron_chunks", async () => {
    const articleId = 999993;
    const similarDir = path.join(process.cwd(), "lib", "data", "similar");
    const tempFile = path.join(similarDir, "__article_loader_chunks_test__.json");

    const fixture = [
      {
        id: articleId,
        url: "https://www.youtube.com/watch?v=test3",
        start_time: "1",
        end_time: "2",
        updated_at: "2026-05-17T00:00:00.000Z",
        question: "question",
        question_katakana: "カタカナ",
        article_text: {
          title: "new schema article",
          meta_description: "test",
          introduction: "intro",
          section_1: { heading: "h1", content: "c1" },
          section_2: { heading: "h2", content: "c2" },
          section_3: { heading: "h3", content: "c3" },
          section_4: { heading: "h4", content: "c4" },
          conclusion: "end",
          keywords: [],
          translated: "article translated",
          tsukkomi: [{ question: "AQ", answer: "AA" }],
          chunks: [
            {
              en: "don't",
              ipa_citation: "/doʊnt/",
              ipa_connected: "/doʊnt/",
              kana: "ドント",
              start_time: 1,
              end_time: 2,
            },
          ],
        },
        category: "test",
        thumbnail: "{}",
        theme: "test",
        noIndex: 0,
        is_similar: 1,
        translated: "top-level translated",
        tsukkomi: [{ question: "TQ", answer: "TA" }],
      },
    ];

    fs.writeFileSync(tempFile, JSON.stringify(fixture), "utf-8");
    createdFiles.push(tempFile);

    const loaded = await loadArticle(String(articleId));

    expect(loaded).not.toBeNull();
    expect(loaded?.article.translated).toBe("article translated");
    expect(loaded?.article.tsukkomi).toEqual([{ question: "AQ", answer: "AA" }]);
    expect(loaded?.article.pron_chunks).toEqual(loaded?.article.chunks);
  });
});
