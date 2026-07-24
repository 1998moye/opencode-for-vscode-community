/**
 * 将二进制数据编码为 base64，供 Extension Host 写入临时附件。
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

/**
 * 从拖放或粘贴的 File 读取并发送到 Extension Host。
 */
export async function uploadAttachmentFile(
  file: File,
  post: (message: { type: "request-add-attachment-binary"; mime: string; filename: string; dataBase64: string }) => void
): Promise<void> {
  const buffer = await file.arrayBuffer();
  post({
    type: "request-add-attachment-binary",
    mime: file.type || guessMimeFromName(file.name),
    filename: file.name || "attachment",
    dataBase64: bytesToBase64(new Uint8Array(buffer))
  });
}

function guessMimeFromName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) {
    return "application/pdf";
  }
  if (lower.endsWith(".png")) {
    return "image/png";
  }
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (lower.endsWith(".gif")) {
    return "image/gif";
  }
  if (lower.endsWith(".webp")) {
    return "image/webp";
  }
  return "application/octet-stream";
}
