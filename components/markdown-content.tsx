"use client";

import "katex/dist/katex.min.css";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

interface MarkdownContentProps {
  content: string;
  className?: string;
}

export function MarkdownContent({
  content,
  className = "",
}: MarkdownContentProps) {
  // Fix the issue where \r and \t in LaTeX commands get interpreted as control characters
  let processedContent = content;

  // The problem: JSON.parse interprets escape sequences in strings
  // "\rightarrow" becomes "\r" (carriage return) + "ightarrow"
  // "\text" becomes "\t" (tab) + "ext"

  // Solution: Detect these patterns and restore the backslash
  // Pattern 1: Carriage return followed by common LaTeX commands starting with 'r'
  processedContent = processedContent
    .replace(/\r(ightarrow|ho|ule|angle|ight)/g, "\\r$1")
    // Pattern 2: Tab followed by common LaTeX commands starting with 't'
    .replace(/\t(ext|imes|o|heta)/g, "\\t$1")
    // Pattern 3: Handle any remaining control characters before lowercase letters (likely LaTeX)
    .replace(/\r([a-z])/g, "\\r$1")
    .replace(/\t([a-z])/g, "\\t$1");

  // Now process other escaped characters
  processedContent = processedContent
    .replace(/\\\\n/g, "\n") // Handle \\n (double backslash from JSON)
    .replace(/\\\*/g, "*"); // Fix escaped asterisks

  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          strong: ({ children }) => (
            <strong className="font-bold text-foreground">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          p: ({ children }) => <p className="mb-4">{children}</p>,
          ul: ({ children }) => (
            <ul className="list-disc ml-6 mb-4 space-y-2">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal ml-6 mb-4 space-y-2">{children}</ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          code: ({ children }) => (
            <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono">
              {children}
            </code>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              className="text-primary underline hover:text-primary/80"
              target="_blank"
              rel="noopener noreferrer"
            >
              {children}
            </a>
          ),
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}
