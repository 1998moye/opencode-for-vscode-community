import type { FilePartInput, TextPartInput } from "@opencode-ai/sdk/v2";
import type { ContextPartInput } from "../../runtime/contracts.js";

/**
 * 将运行时上下文片段转换为 OpenCode SDK 输入分片。
 */
export function mapContextParts(parts: ContextPartInput[]): Array<TextPartInput | FilePartInput> {
  return parts.map((part) => {
    if (part.type === "file") {
      return {
        type: "file",
        mime: part.mime,
        url: part.url,
        ...(part.filename ? { filename: part.filename } : {})
      };
    }
    return { type: "text", text: part.text };
  });
}
