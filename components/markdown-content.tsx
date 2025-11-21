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
  let processedContent = content;

  // Step 1: Replace quadruple backslashes
  processedContent = processedContent.replace(/\\\\\\\\/g, "\\\\");
  
  // Step 2: Handle \text{...} with special Unicode combining characters
  // These need to be converted to plain text outside of math mode
  // Match pattern: $\\text{...}$ where content has combining diacritics
  processedContent = processedContent.replace(/\$\\\\text\{([^}]*[̀-ͯ][^}]*)\}\$/g, (match, content) => {
    // Return as plain text in a span (not in math mode)
    return content;
  });
  
  // Step 3: Protect remaining LaTeX \text{...} commands
  const textCommandPattern = /\\\\text\{[^}]*\}/g;
  const textPlaceholders: string[] = [];
  processedContent = processedContent.replace(textCommandPattern, (match) => {
    const placeholder = `___TEXT_CMD_${textPlaceholders.length}___`;
    textPlaceholders.push(match.replace(/\\\\/g, "\\"));
    return placeholder;
  });

  // Step 4: Handle remaining double backslashes
  processedContent = processedContent.replace(/\\\\/g, "\\");

  // Step 5: Fix control characters
  processedContent = processedContent
    .replace(/\r(ightarrow|ho|ule|angle|ight)/g, "\\r$1")
    .replace(/\t(ext|imes|o|heta)/g, "\\t$1")
    .replace(/\r([a-z])/g, "\\r$1")
    .replace(/\t([a-z])/g, "\\t$1");

  // Step 6: Restore protected commands
  textPlaceholders.forEach((original, index) => {
    const placeholder = `___TEXT_CMD_${index}___`;
    processedContent = processedContent.replace(placeholder, original);
  });

  // Step 7: Handle other escaped characters
  processedContent = processedContent
    .replace(/\\n\\n\*/g, "\n\n*")
    .replace(/\\n\\n/g, "\n\n")
    .replace(/\\n/g, "\n")
    .replace(/\\\*/g, "*");

  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          [
            rehypeKatex,
            {
              throwOnError: false,
              errorColor: "#cc0000",
              strict: false,
              trust: true,
              maxExpand: 1000,
            },
          ],
        ]}
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
          table: ({ children }) => (
            <div className="overflow-x-auto my-6">
              <table className="min-w-full border-collapse border border-border">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-muted">{children}</thead>
          ),
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => (
            <tr className="border-b border-border">{children}</tr>
          ),
          th: ({ children }) => (
            <th className="border border-border px-4 py-2 text-left font-semibold">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-border px-4 py-2">{children}</td>
          ),
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}
