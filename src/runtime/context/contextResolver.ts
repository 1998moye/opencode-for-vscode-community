import type { ContextItem, ContextPartInput } from "../contracts.js";

export interface ContextResolveResult {
  items: ContextItem[];
  parts: ContextPartInput[];
  blocked: boolean;
  error?: string;
}

/**
 * 将上下文项解析为 OpenCode 消息片段。
 */
export type ContextResolver = (items: ContextItem[]) => Promise<ContextResolveResult>;
