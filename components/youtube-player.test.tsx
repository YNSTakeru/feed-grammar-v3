import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { YouTubePlayer, type YouTubePlayerHandle } from "./youtube-player";

vi.mock("@/components/floating-video-controls", () => ({
  FloatingVideoControls: () => null,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children?: React.ReactNode }) => children ?? null,
}));

vi.mock("@/components/ui/progress", () => ({
  Progress: () => null,
}));

type YouTubeConfig = {
  events: {
    onReady: (event: { data: number; target: MockYouTubePlayer }) => void;
    onStateChange: (event: { data: number; target: MockYouTubePlayer }) => void;
    onPlaybackRateChange?: (event: { data: number; target: MockYouTubePlayer }) => void;
    onError: () => void;
  };
};

let latestConfig: YouTubeConfig | null = null;
let latestPlayer: MockYouTubePlayer | null = null;
let playerCreationCount = 0;

class MockYouTubePlayer {
  public ready = false;
  public playbackRate = 1;
  public currentTime = 0;
  public state = -1;
  public setRateCalls: number[] = [];
  public seekCalls: number[] = [];

  getCurrentTime() {
    return this.currentTime;
  }

  seekTo(seconds: number) {
    this.currentTime = seconds;
    this.seekCalls.push(seconds);
  }

  playVideo() {
    this.state = 1;
  }

  pauseVideo() {
    this.state = 2;
  }

  destroy() {
    this.state = 0;
  }

  setPlaybackRate(rate: number) {
    if (!this.ready) {
      return;
    }
    this.playbackRate = rate;
    this.setRateCalls.push(rate);
  }

  getPlaybackRate() {
    return this.playbackRate;
  }

  getAvailablePlaybackRates() {
    return [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
  }

  getPlayerState() {
    return this.state;
  }
}

describe("YouTubePlayer slow-play pre-ready behavior", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    latestConfig = null;
    latestPlayer = null;
    playerCreationCount = 0;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    function Player(_container: HTMLElement, config: YouTubeConfig) {
      latestConfig = config;
      const player = new MockYouTubePlayer();
      latestPlayer = player;
      playerCreationCount += 1;
      return player;
    }
    window.YT = {
      Player: Player as unknown as typeof window.YT.Player,
    };
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    delete window.YT;
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  });

  it("keeps the queued slow rate when set before onReady", () => {
    const ref = createRef<YouTubePlayerHandle>();

    act(() => {
      root.render(
        <YouTubePlayer
          ref={ref}
          videoId="video-id"
          startTime={8}
          endTime={12}
          autoPlay={false}
          loop={false}
        />,
      );
    });

    expect(latestPlayer).not.toBeNull();
    expect(latestConfig).not.toBeNull();
    expect(ref.current).not.toBeNull();

    act(() => {
      ref.current?.setPlaybackRate(0.75);
      ref.current?.seekAndPlay(8);
    });

    expect(latestPlayer?.playbackRate).toBe(1);

    act(() => {
      if (!latestPlayer || !latestConfig) return;
      latestPlayer.ready = true;
      latestConfig.events.onReady({ data: 0, target: latestPlayer });
      latestConfig.events.onStateChange({ data: 1, target: latestPlayer });
    });

    expect(latestPlayer?.playbackRate).toBe(0.75);
    expect(latestPlayer?.setRateCalls).toContain(0.75);
  });

  it("does not recreate player when callback props change and uses latest callback refs", () => {
    const firstOnError = vi.fn();

    act(() => {
      root.render(
        <YouTubePlayer
          videoId="video-id"
          startTime={8}
          endTime={12}
          autoPlay={false}
          loop={false}
          onError={firstOnError}
        />,
      );
    });

    expect(playerCreationCount).toBe(1);

    const secondOnError = vi.fn();
    act(() => {
      root.render(
        <YouTubePlayer
          videoId="video-id"
          startTime={8}
          endTime={12}
          autoPlay={false}
          loop={false}
          onError={secondOnError}
        />,
      );
    });

    expect(playerCreationCount).toBe(1);

    act(() => {
      latestConfig?.events.onError();
    });

    expect(firstOnError).not.toHaveBeenCalled();
    expect(secondOnError).toHaveBeenCalledTimes(1);
  });

  it("fires onLoopComplete once when loop seek resumes into PLAYING", () => {
    const onLoopComplete = vi.fn();
    const rafQueue: FrameRequestCallback[] = [];
    const rafSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback: FrameRequestCallback) => {
        rafQueue.push(callback);
        return rafQueue.length;
      });
    const cancelSpy = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);

    act(() => {
      root.render(
        <YouTubePlayer
          videoId="video-id"
          startTime={8}
          endTime={10}
          autoPlay={false}
          loop
          onLoopComplete={onLoopComplete}
        />,
      );
    });

    if (!latestPlayer || !latestConfig) {
      throw new Error("player not initialized");
    }

    act(() => {
      latestPlayer!.ready = true;
      latestConfig!.events.onReady({ data: 0, target: latestPlayer! });
      latestPlayer!.state = 1;
      latestPlayer!.currentTime = 10.2;
      latestConfig!.events.onStateChange({ data: 1, target: latestPlayer! });
    });

    expect(rafQueue.length).toBeGreaterThan(0);

    act(() => {
      const callback = rafQueue.shift();
      if (!callback) {
        throw new Error("expected queued animation frame");
      }
      callback(0);
    });

    expect(latestPlayer.seekCalls).toContain(8);

    act(() => {
      latestConfig!.events.onStateChange({ data: 3, target: latestPlayer! });
    });
    expect(onLoopComplete).toHaveBeenCalledTimes(0);

    act(() => {
      latestConfig!.events.onStateChange({ data: 1, target: latestPlayer! });
    });
    expect(onLoopComplete).toHaveBeenCalledTimes(1);

    act(() => {
      latestConfig!.events.onStateChange({ data: 1, target: latestPlayer! });
    });
    expect(onLoopComplete).toHaveBeenCalledTimes(1);

    rafSpy.mockRestore();
    cancelSpy.mockRestore();
  });
});
