"use client";

import { classifyUrl, parseIframeHtml } from "@/lib/media/classify-url";
import React, { useEffect, useMemo } from "react";
import { Tweet } from "react-tweet";

declare global {
  interface Window {
    instgrm?: {
      Embeds: {
        process: () => void;
      };
    };
  }
}

export interface MediaDisplayProps {
  url?: string;
  animationClass?: string;
}

function sanitizeInstagramEmbedHtml(html: string): string | null {
  const template = document.createElement("template");
  template.innerHTML = html;

  const blockquote = template.content.querySelector("blockquote.instagram-media");
  if (!blockquote) return null;

  const sanitized = blockquote.cloneNode(true) as HTMLElement;
  sanitized.querySelectorAll("script, iframe, object, embed").forEach((node) => {
    node.remove();
  });

  const elements = [sanitized, ...Array.from(sanitized.querySelectorAll("*"))];
  for (const element of elements) {
    for (const attr of Array.from(element.attributes)) {
      const attributeName = attr.name.toLowerCase();
      const attributeValue = attr.value.trim().toLowerCase();

      if (attributeName.startsWith("on")) {
        element.removeAttribute(attr.name);
        continue;
      }

      if (
        (attributeName === "href" ||
          attributeName === "src" ||
          attributeName === "data-instgrm-permalink") &&
        attributeValue.startsWith("javascript:")
      ) {
        element.removeAttribute(attr.name);
      }
    }
  }

  return sanitized.outerHTML;
}

export const StableIframe = React.memo(function StableIframe({
  src,
  height,
  width,
}: {
  src: string;
  height: string;
  width: string;
}) {
  return (
    <div className="mb-4">
      <iframe
        src={src}
        height={height}
        width={width}
        frameBorder="0"
        scrolling="no"
        style={{ maxWidth: "100%" }}
      />
    </div>
  );
});

export function MediaDisplay({ url, animationClass }: MediaDisplayProps) {
  const { tweetId, isInstagram, isIframe } = classifyUrl(url);
  const safeInstagramHtml = useMemo(() => {
    if (!isInstagram || !url) return null;
    return sanitizeInstagramEmbedHtml(url);
  }, [isInstagram, url]);

  useEffect(() => {
    if (!safeInstagramHtml) return;

    const loadAndProcess = () => {
      if (window.instgrm?.Embeds) {
        window.instgrm.Embeds.process();
      }
    };

    if (!document.querySelector('script[src*="instagram.com/embed.js"]')) {
      const script = document.createElement("script");
      script.src = "https://www.instagram.com/embed.js";
      script.async = true;
      script.onload = loadAndProcess;
      document.body.appendChild(script);
      return;
    }

    const timer = setTimeout(loadAndProcess, 300);
    return () => clearTimeout(timer);
  }, [safeInstagramHtml]);

  if (tweetId && !isInstagram && !isIframe) {
    return (
      <div className={`mb-4 ${animationClass ?? ""}`}>
        <Tweet id={tweetId} apiUrl={`/api/tweet/${tweetId}`} />
      </div>
    );
  }

  if (safeInstagramHtml) {
    return (
      <div
        className={`mb-4 ${animationClass ?? ""}`}
        dangerouslySetInnerHTML={{ __html: safeInstagramHtml }}
      />
    );
  }

  if (isIframe && url) {
    const attrs = parseIframeHtml(url);
    return (
      <StableIframe src={attrs.src} height={attrs.height} width={attrs.width} />
    );
  }

  if (!url) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`text-sm text-blue-700 underline ${animationClass ?? ""}`}
    >
      Open context image
    </a>
  );
}
