import { useEffect, useState } from "react";
import { renderMarkdownHtml } from "./payloadDisplay";

/**
 * 把 Markdown 正文渲染为 HTML；加载完成前先展示纯文本，避免空白闪烁。
 */
export function MarkdownBlock({
  text,
  className = "message__markdown"
}: {
  text: string;
  className?: string;
}) {
  const [html, setHtml] = useState(() => text);
  useEffect(() => {
    let cancelled = false;
    void renderMarkdownHtml(text).then((value) => {
      if (!cancelled) {
        setHtml(value);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [text]);
  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
