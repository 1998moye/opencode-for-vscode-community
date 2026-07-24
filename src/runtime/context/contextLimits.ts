/** 单个上下文项允许的最大字节数。 */
export const MAX_CONTEXT_ITEM_BYTES = 256 * 1024;

/** 所有上下文项合计允许的最大字节数。 */
export const MAX_TOTAL_CONTEXT_BYTES = 1024 * 1024;

/** 单个二进制附件允许的最大字节数。 */
export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

/** 全部附件合计允许的最大字节数。 */
export const MAX_TOTAL_ATTACHMENT_BYTES = 16 * 1024 * 1024;

/**
 * 格式化字节数为可读大小标签。
 */
export function formatByteSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * 从文本内容估算字节大小。
 */
export function textByteSize(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}
