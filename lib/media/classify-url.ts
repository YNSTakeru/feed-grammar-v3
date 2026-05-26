export interface ClassifiedUrl {
  tweetId: string | null;
  isInstagram: boolean;
  isIframe: boolean;
}

export interface IframeAttributes {
  src: string;
  height: string;
  width: string;
}

export function classifyUrl(url?: string): ClassifiedUrl {
  if (!url) {
    return { tweetId: null, isInstagram: false, isIframe: false };
  }

  return {
    tweetId: url.match(/TWEET_ID:(\d+)/)?.[1] ?? null,
    isInstagram: url.includes("instagram-media"),
    isIframe: url.trim().startsWith("<iframe"),
  };
}

export function parseIframeHtml(html: string): IframeAttributes {
  const srcMatch = html.match(/src=["']([^"']+)["']/);
  const heightMatch = html.match(/height=["']([^"']+)["']/);
  const widthMatch = html.match(/width=["']([^"']+)["']/);

  return {
    src: srcMatch?.[1] || "",
    height: heightMatch?.[1] || "445",
    width: widthMatch?.[1] || "345",
  };
}
