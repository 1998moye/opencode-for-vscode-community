/**
 * 将分享相关错误转为用户可读说明，并脱敏可能包含的分享地址。
 */
export function sanitizeShareError(error: unknown): string {
  const message = error instanceof Error ? error.message : "分享操作失败。";
  return redactShareUrls(message);
}

/**
 * 从诊断或错误文本中移除分享链接。
 */
export function redactShareUrls(text: string): string {
  return text.replace(/https?:\/\/\S+/g, "[已脱敏分享链接]");
}
