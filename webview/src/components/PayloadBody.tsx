import { useEffect, useMemo, useState } from "react";
import { postToHost } from "../vscodeApi";
import { DiffCodeBlock } from "./DiffCodeBlock";
import { MarkdownBlock } from "./MarkdownBlock";
import {
  highlightCodeHtml,
  joinDirectoryEntry,
  parseToolPayloadSegments,
  type PayloadSegment,
  type TodoItem
} from "./payloadDisplayCore";
import { computeLineDiff, markAllAdded } from "./lineDiff";

/**
 * 可点击的文件路径，点击后在 VS Code 主编辑区打开。
 */
function PayloadPath({ filePath }: { filePath: string }) {
  return (
    <button
      type="button"
      className="message__payload-path"
      title={filePath}
      onClick={() => postToHost({ type: "request-open-file", filePath })}
    >
      {filePath}
    </button>
  );
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [html, setHtml] = useState(() => code);
  useEffect(() => {
    let cancelled = false;
    void highlightCodeHtml(code, language).then((value) => {
      if (!cancelled) {
        setHtml(value);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [code, language]);
  return (
    <pre className="message__code-block">
      <code
        className={`hljs language-${language}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </pre>
  );
}

function MarkdownPayload({ text }: { text: string }) {
  return <MarkdownBlock text={text} className="message__markdown message__markdown--payload" />;
}

function EditDiffView({
  oldText,
  newText,
  language
}: {
  oldText: string;
  newText: string;
  language: string;
}) {
  const { oldLines, newLines } = useMemo(
    () => computeLineDiff(oldText, newText),
    [oldText, newText]
  );
  return (
    <div className="message__edit-diff">
      {oldLines.length > 0 ? (
        <DiffCodeBlock title="--- 旧 ---" lines={oldLines} language={language} />
      ) : null}
      {newLines.length > 0 ? (
        <DiffCodeBlock title="--- 新 ---" lines={newLines} language={language} />
      ) : null}
    </div>
  );
}

function todoStatusLabel(status: string): string {
  switch (status) {
    case "completed": return "已完成";
    case "in_progress": return "进行中";
    default: return "待办";
  }
}

function TodoList({ items }: { items: TodoItem[] }) {
  return (
    <ul className="message__todo-list">
      {items.map((item, index) => (
        <li
          key={`${item.content}-${index}`}
          className={`message__todo-item message__todo-item--${item.status.replace(/[^a-z]/gi, "") || "pending"}`}
        >
          <span className="message__todo-mark" aria-hidden="true">
            {item.status === "completed" ? "✓" : item.status === "in_progress" ? "◔" : "○"}
          </span>
          <span className="message__todo-content">{item.content}</span>
          <span className="message__todo-status">{todoStatusLabel(item.status)}</span>
          {item.priority ? <span className="message__todo-priority">{item.priority}</span> : null}
        </li>
      ))}
    </ul>
  );
}

function DirectoryEntryList({ basePath, entries }: { basePath: string; entries: string[] }) {
  return (
    <div className="message__dir-list-wrap">
      <div className="message__dir-list-header">{entries.length} 项</div>
      <ul className="message__dir-list">
        {entries.map((entry, index) => {
          const isFolder = entry.endsWith("/") || entry.endsWith("\\");
          if (isFolder) {
            return (
              <li key={`${entry}-${index}`} className="message__dir-entry message__dir-entry--folder">
                {entry}
              </li>
            );
          }
          const fullPath = basePath ? joinDirectoryEntry(basePath, entry) : entry;
          return (
            <li key={`${entry}-${index}`}>
              <button
                type="button"
                className="message__dir-entry message__dir-entry--file"
                title={fullPath}
                onClick={() => postToHost({ type: "request-open-file", filePath: fullPath })}
              >
                {entry}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PayloadSegmentView({ segment }: { segment: PayloadSegment }) {
  switch (segment.kind) {
    case "path":
      return <PayloadPath filePath={segment.text} />;
    case "code":
      if (segment.diffAll === "add") {
        return <DiffCodeBlock lines={markAllAdded(segment.text)} language={segment.language} />;
      }
      return <CodeBlock code={segment.text} language={segment.language} />;
    case "edit-diff":
      return (
        <EditDiffView
          oldText={segment.oldText}
          newText={segment.newText}
          language={segment.language}
        />
      );
    case "markdown":
      return <MarkdownPayload text={segment.text} />;
    case "todos":
      return <TodoList items={segment.items} />;
    case "dir-list":
      return <DirectoryEntryList basePath={segment.basePath} entries={segment.entries} />;
    case "meta":
      return (
        <div className="message__payload-meta">
          <span className="message__payload-meta-key">{segment.key}:</span>
          {segment.highlight
            ? <CodeBlock code={segment.value} language="bash" />
            : <span className="message__payload-meta-value">{segment.value}</span>}
        </div>
      );
    case "section":
      return (
        <div className="message__payload-section">
          <div className="message__payload-section-title">{segment.title}</div>
          {segment.segments.map((child, index) => (
            <PayloadSegmentView key={`${segment.title}-${index}`} segment={child} />
          ))}
        </div>
      );
    case "text":
      return <div className="message__payload-text">{segment.text}</div>;
    default:
      return null;
  }
}

/**
 * 工具展开区：按工具类型拆分载荷，代码与命令走语法高亮，元数据与纯文本保持可读排版。
 */
export function PayloadBody({
  body,
  toolLabel,
  variant = "input"
}: {
  body: string;
  toolLabel: string;
  variant?: "input" | "output";
}) {
  const segments = useMemo(
    () => parseToolPayloadSegments(toolLabel, body, variant),
    [body, toolLabel, variant]
  );
  if (segments.length === 0) {
    return null;
  }
  if (segments.length === 1 && segments[0]!.kind === "text") {
    return <div className="message__timeline-payload-pre">{segments[0]!.text}</div>;
  }
  return (
    <div className="message__timeline-payload-body">
      {segments.map((segment, index) => (
        <PayloadSegmentView key={index} segment={segment} />
      ))}
    </div>
  );
}
