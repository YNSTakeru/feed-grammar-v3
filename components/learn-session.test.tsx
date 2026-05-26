import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import LearnSession from "./learn-session";

type MockYouTubePlayerProps = {
  onLoopComplete?: () => void;
};

vi.mock("@/components/youtube-player", () => ({
  YouTubePlayer: (props: MockYouTubePlayerProps) => (
    <button type="button" onClick={() => props.onLoopComplete?.()}>
      Trigger loop complete
    </button>
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    ...props
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
  }) => (
    <button type="button" onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock("@/components/ui/progress", () => ({
  Progress: () => null,
}));

vi.mock("@/lib/text/render-katakana", () => ({
  KatakanaText: ({ text }: { text: string }) => <span>{text}</span>,
}));

vi.mock("lucide-react", () => ({
  CheckCircle2: () => null,
  PlayCircle: () => null,
  SkipForward: () => null,
  XCircle: () => null,
}));

vi.mock("react-tweet", () => ({
  Tweet: ({ id }: { id: string }) => <div>Tweet:{id}</div>,
}));

vi.mock("@/lib/db/sentence-progress-db", () => ({
  sentenceProgressDB: {
    recordDictationEvent: vi.fn(async () => undefined),
  },
}));

vi.mock("@/lib/data/learn-materials/lesson-001", () => ({
  normalizeIpaChunks: (chunks: Array<{ ipa: string }> | undefined) => chunks ?? [],
  lesson001: {
    id: "lesson-001",
    title: "test lesson",
    sentences: [
      {
        id: "sentence-1",
        feedId: 1,
        english: "this is a long enough sentence",
        katakana: "ディス イズ ア ロング イナフ センテンス",
        url: "https://youtu.be/video-id",
        startTime: 8,
        endTime: 11,
        translated: "これは十分に長い文です。",
        articleIntroduction: "発音のつながりを確認するための導入文です。",
        tsukkomi: [
          {
            question: "Why does this sound fast?",
            answer: "Because sounds are linked in natural speech.",
          },
        ],
        choices: {
          correct: "this is a long enough sentence",
          distractors: ["a", "b", "c"],
          generatedBy: "adjacent_segment",
        },
        imageSections: [
          {
            label: "some of us",
            time: "8",
            url: "TWEET_ID:1996959664760869004",
          },
          {
            label: "don't want to think back",
            time: "8.6",
            url: "TWEET_ID:1996959723535622457",
          },
          {
            label: "to our childhoods",
            time: "9.72",
            url: "TWEET_ID:2002615597704913023",
          },
        ],
      },
      {
        id: "sentence-2",
        feedId: 11,
        english: "another long enough sentence to keep multiple choice mode",
        katakana: "アナザー ロング イナフ センテンス トゥ キープ モード",
        url: "https://youtu.be/video-id",
        startTime: 12,
        endTime: 15,
        translated: "次の文の翻訳です。",
        articleIntroduction: "2文目の導入文です。",
        tsukkomi: [],
        choices: {
          correct: "another long enough sentence to keep multiple choice mode",
          distractors: ["x", "y", "z"],
          generatedBy: "adjacent_segment",
        },
        imageSections: [],
      },
    ],
  },
}));

function clickButton(container: HTMLDivElement, label: string) {
  const buttons = Array.from(container.querySelectorAll("button"));
  const target = buttons.find((button) => button.textContent?.includes(label));
  if (!target) {
    throw new Error(`Button not found: ${label}`);
  }
  act(() => {
    target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("LearnSession image reveal", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  });

  it("reveals image context only after loop completion callback", () => {
    act(() => {
      root.render(<LearnSession />);
    });

    clickButton(container, "Start");
    clickButton(container, "スクリプトを表示");

    expect(container.textContent).not.toContain("Image context");

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(container.textContent).not.toContain("Image context");

    clickButton(container, "Trigger loop complete");
    expect(container.textContent).toContain("Image context");
    expect(container.textContent).toContain("Tweet:1996959664760869004");
    expect(container.textContent).toContain("Tweet:1996959723535622457");
    expect(container.textContent).toContain("Tweet:2002615597704913023");
  });

  it("hides IPA block when ipaChunks are missing in scored phase", () => {
    act(() => {
      root.render(<LearnSession />);
    });

    clickButton(container, "Start");
    clickButton(container, "Skip sentence");

    expect(container.textContent).toContain("3) skipped reveal");
    expect(container.textContent).not.toContain("IPA");
    expect(container.textContent).not.toContain("v0 では IPA データ未対応です。暫定で発音区切りを表示します。");
  });

  it("resets translated reveal state on sentence switch", () => {
    act(() => {
      root.render(<LearnSession />);
    });

    clickButton(container, "Start");
    clickButton(container, "スクリプトを表示");

    const firstRevealButton = container.querySelector('button[aria-label="翻訳を表示"]');
    expect(firstRevealButton).toBeTruthy();
    act(() => {
      firstRevealButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.querySelector('button[aria-label="翻訳を表示"]')).toBeNull();

    clickButton(container, "Skip sentence");
    clickButton(container, "次へ進む");
    clickButton(container, "スクリプトを表示");

    expect(container.querySelector('button[aria-label="翻訳を表示"]')).toBeTruthy();
  });

  it("shows tsukkomi only in skipped phase when items exist", () => {
    act(() => {
      root.render(<LearnSession />);
    });

    clickButton(container, "Start");
    clickButton(container, "Skip sentence");

    expect(container.textContent).toContain("Tsukkomi");
    expect(container.textContent).toContain("Q. Why does this sound fast?");

    clickButton(container, "次へ進む");
    clickButton(container, "Skip sentence");

    expect(container.textContent).not.toContain("Q. Why does this sound fast?");
    expect(container.textContent).not.toContain("A. Because sounds are linked in natural speech.");
  });
});
