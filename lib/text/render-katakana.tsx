import React from "react";

import { cn } from "@/lib/utils";

export type KatakanaPart = {
  text: string;
  tone: "strong" | "weak" | "normal";
};

export type KatakanaVariant = "phrase" | "quiz" | "learn";

export function parseKatakana(text: string): KatakanaPart[] {
  const parts: KatakanaPart[] = [];
  const regex = /【([^】]+)】|〈([^〉]+)〉|([^【〈]+)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match[1]) {
      parts.push({ text: match[1], tone: "strong" });
    } else if (match[2]) {
      parts.push({ text: match[2], tone: "weak" });
    } else if (match[3]) {
      parts.push({ text: match[3], tone: "normal" });
    }
  }

  return parts;
}

function getPartClassName(part: KatakanaPart, variant: KatakanaVariant) {
  if (variant === "phrase") {
    if (part.tone === "strong") return "font-bold text-blue-700 dark:text-blue-300";
    if (part.tone === "weak") {
      return "font-normal text-blue-400 dark:text-blue-500 opacity-70";
    }
    return "font-medium";
  }

  if (variant === "learn") {
    if (part.tone === "strong") return "font-extrabold text-blue-950 dark:text-blue-100";
    if (part.tone === "weak") {
      return "font-semibold text-blue-500 dark:text-blue-300 opacity-70";
    }
    return "font-bold text-blue-800 dark:text-blue-200";
  }

  if (part.tone === "strong") return "font-bold text-2xl text-blue-900 dark:text-blue-100";
  if (part.tone === "weak") {
    return "font-normal text-xl text-blue-400 dark:text-blue-400 opacity-60";
  }
  return "font-semibold text-2xl text-blue-700 dark:text-blue-200";
}

export function renderKatakana(
  text: string,
  variant: KatakanaVariant = "phrase",
): React.ReactElement {
  const parts = parseKatakana(text).filter((part) => {
    if (variant !== "quiz") return true;
    return part.tone !== "normal" || part.text.trim().length > 0;
  });

  return (
    <>
      {parts.map((part, index) => (
        <span
          key={`${part.tone}-${index}`}
          className={cn(
            variant === "quiz" || variant === "learn" ? "inline-block" : undefined,
            variant === "quiz" ? "transition-all duration-200" : undefined,
            getPartClassName(part, variant),
          )}
        >
          {variant === "quiz" ? part.text.trim() : part.text}
        </span>
      ))}
    </>
  );
}

interface KatakanaTextProps {
  text: string;
  variant?: KatakanaVariant;
  className?: string;
}

export function KatakanaText({
  text,
  variant = "phrase",
  className,
}: KatakanaTextProps) {
  if (variant === "quiz") {
    return (
      <div
        className={cn(
          "flex flex-wrap items-center justify-center gap-1 leading-relaxed",
          className,
        )}
      >
        {renderKatakana(text, variant)}
      </div>
    );
  }

  if (variant === "learn") {
    return (
      <div
        className={cn(
          "flex flex-wrap items-center justify-center gap-2 text-3xl leading-relaxed sm:text-4xl",
          className,
        )}
      >
        {renderKatakana(text, variant)}
      </div>
    );
  }

  return <>{renderKatakana(text, variant)}</>;
}
