"use client"

import { useId, useState } from "react"

import { cn } from "@/lib/utils"

interface RevealTextProps {
  text: string
  label?: string
  className?: string
}

export function RevealText({ text, label = "翻訳を表示", className }: RevealTextProps) {
  const [revealed, setRevealed] = useState(false)
  const contentId = useId()

  return (
    <div className={cn("relative min-h-[44px]", className)}>
      <span id={contentId} aria-hidden={!revealed} className={revealed ? "" : "invisible"}>
        {text}
      </span>

      {revealed ? (
        <span className="sr-only" aria-live="polite">
          {text}
        </span>
      ) : (
        <>
          <span
            className="pointer-events-none absolute inset-0 flex items-center text-sm text-muted-foreground italic"
            aria-hidden="true"
          >
            タップして翻訳を表示
          </span>
          <button
            type="button"
            className="absolute inset-0 w-full min-h-[44px] cursor-pointer rounded-sm focus-visible:ring-2 focus-visible:ring-ring/50"
            onClick={() => setRevealed(true)}
            aria-label={label}
            aria-controls={contentId}
            aria-expanded="false"
          />
        </>
      )}
    </div>
  )
}

