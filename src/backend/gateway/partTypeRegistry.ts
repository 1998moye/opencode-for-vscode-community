import type { Part } from "@opencode-ai/sdk/v2";

/**
 * 记录消息分片类型，避免将 reasoning 等分片的 text 增量误当作回复正文。
 */
export class PartTypeRegistry {
  readonly #types = new Map<string, Part["type"]>();

  /**
   * @param part - 已更新的消息分片
   */
  remember(part: Pick<Part, "id" | "type">): void {
    this.#types.set(part.id, part.type);
  }

  /**
   * @param partId - 已移除的分片 ID
   */
  forget(partId: string): void {
    this.#types.delete(partId);
  }

  /**
   * @param partId - 分片 ID
   */
  isTextPart(partId: string): boolean {
    return this.#types.get(partId) === "text";
  }

  clear(): void {
    this.#types.clear();
  }
}
