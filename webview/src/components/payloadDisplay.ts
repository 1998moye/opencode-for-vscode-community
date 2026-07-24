export type { PayloadSegment, TodoItem } from "./payloadDisplayCore";
export {
  highlightCodeHtml,
  joinDirectoryEntry,
  languageFromPath,
  normalizeToolKind,
  parseDirectoryEntries,
  parseSearchResultPayload,
  parseToolPayloadSegments,
  stripLineNumberPrefixes
} from "./payloadDisplayCore";

import { highlightCodeHtml } from "./payloadDisplayCore";

let markdownConfigured = false;

/**
 * 把 Markdown 正文渲染为 HTML；marked 仅在首次渲染时加载。
 */
export async function renderMarkdownHtml(markdown: string): Promise<string> {
  const { marked } = await import("marked");
  if (!markdownConfigured) {
    marked.use({
      breaks: true,
      gfm: true,
      renderer: {
        code({ text, lang }) {
          const language = lang?.trim() || "plaintext";
          return `<pre class="message__code-block"><code class="hljs language-${language}">${escapeHtml(text)}</code></pre>`;
        }
      }
    });
    markdownConfigured = true;
  }
  const html = marked.parse(markdown, { async: false }) as string;
  return highlightMarkdownCodeBlocks(html);
}

async function highlightMarkdownCodeBlocks(html: string): Promise<string> {
  const pattern = /<pre class="message__code-block"><code class="hljs language-([^"]+)">([\s\S]*?)<\/code><\/pre>/g;
  const matches = [...html.matchAll(pattern)];
  if (matches.length === 0) {
    return html;
  }
  let result = html;
  for (const match of matches) {
    const language = match[1] ?? "plaintext";
    const raw = unescapeHtml(match[2] ?? "");
    const highlighted = await highlightCodeHtml(raw, language);
    const replacement = `<pre class="message__code-block"><code class="hljs language-${language}">${highlighted}</code></pre>`;
    result = result.replace(match[0]!, replacement);
  }
  return result;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function unescapeHtml(text: string): string {
  return text
    .replace(/&quot;/g, "\"")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}
