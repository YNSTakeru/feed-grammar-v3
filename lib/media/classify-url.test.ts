import { describe, expect, it } from "vitest";

import { classifyUrl, parseIframeHtml } from "./classify-url";

describe("classifyUrl", () => {
  it("extracts tweet id from TWEET_ID pattern", () => {
    expect(classifyUrl("TWEET_ID:1234567890")).toEqual({
      tweetId: "1234567890",
      isInstagram: false,
      isIframe: false,
    });
  });

  it("detects instagram embed html", () => {
    const instagramHtml =
      '<blockquote class="instagram-media" data-instgrm-permalink="https://www.instagram.com/p/abc/"></blockquote>';

    expect(classifyUrl(instagramHtml)).toEqual({
      tweetId: null,
      isInstagram: true,
      isIframe: false,
    });
  });

  it("detects iframe html", () => {
    expect(
      classifyUrl('<iframe src="https://example.com/embed" width="345" height="445"></iframe>'),
    ).toEqual({
      tweetId: null,
      isInstagram: false,
      isIframe: true,
    });
  });

  it("returns all-false flags for undefined and empty values", () => {
    expect(classifyUrl()).toEqual({
      tweetId: null,
      isInstagram: false,
      isIframe: false,
    });
    expect(classifyUrl("")).toEqual({
      tweetId: null,
      isInstagram: false,
      isIframe: false,
    });
  });
});

describe("parseIframeHtml", () => {
  it("extracts src/height/width from iframe html", () => {
    expect(
      parseIframeHtml(
        '<iframe src="https://www.instagram.com/p/abc/embed" width="400" height="500"></iframe>',
      ),
    ).toEqual({
      src: "https://www.instagram.com/p/abc/embed",
      width: "400",
      height: "500",
    });
  });

  it("uses defaults when attributes are missing", () => {
    expect(parseIframeHtml("<iframe></iframe>")).toEqual({
      src: "",
      width: "345",
      height: "445",
    });
  });

  it("works with classifyUrl in iframe flow", () => {
    const url =
      '<iframe src="https://www.youtube.com/embed/abc" width="560" height="315"></iframe>';
    const classified = classifyUrl(url);

    expect(classified.isIframe).toBe(true);
    expect(parseIframeHtml(url)).toEqual({
      src: "https://www.youtube.com/embed/abc",
      width: "560",
      height: "315",
    });
  });
});
