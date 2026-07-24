import { useEffect, useMemo, useState } from "react";
import { highlightCodeHtml } from "./payloadDisplay";
import type { DiffLine } from "./lineDiff";

/**
 * 带行级 diff 背景的代码块；变更行用红/绿底纹区分。
 */
export function DiffCodeBlock({
  lines,
  language,
  title
}: {
  lines: DiffLine[];
  language: string;
  title?: string;
}) {
  const [lineHtml, setLineHtml] = useState<string[]>(() => lines.map((line) => line.text));
  const serialized = useMemo(() => lines.map((line) => `${line.kind}:${line.text}`).join("\n"), [lines]);
  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      lines.map((line) => highlightCodeHtml(line.text || " ", language))
    ).then((values) => {
      if (!cancelled) {
        setLineHtml(values);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [language, serialized, lines]);
  if (lines.length === 0) {
    return null;
  }
  return (
    <div className="message__diff-block">
      {title ? <div className="message__payload-section-title">{title}</div> : null}
      <pre className="message__code-block message__code-block--diff">
        <code className={`hljs language-${language}`}>
          {lines.map((line, index) => (
            <span
              key={`${index}-${line.kind}`}
              className={`message__diff-line message__diff-line--${line.kind}`}
              dangerouslySetInnerHTML={{ __html: lineHtml[index] ?? "" }}
            />
          ))}
        </code>
      </pre>
    </div>
  );
}
