import type { ContextItem } from "../contracts.js";
import { OpenCodeStateStore } from "../state/openCodeStateStore.js";

const AUTO_ID = "auto-selection";

export class ContextModule {
  constructor(private readonly state: OpenCodeStateStore) {}

  /**
   * 同步或清除自动选区上下文；不影响用户手动添加的项。
   */
  syncAutoSelection(item: ContextItem | undefined): void {
    const manual = this.state.current.contextItems.filter((candidate) => !candidate.auto);
    this.state.update({
      contextItems: item ? [...manual, item] : manual
    });
  }

  add(item: ContextItem): void {
    const withoutDuplicate = this.state.current.contextItems.filter((candidate) => candidate.id !== item.id);
    this.state.update({ contextItems: [...withoutDuplicate, item] });
  }

  remove(itemId: string): void {
    this.state.update({
      contextItems: this.state.current.contextItems.filter((candidate) => candidate.id !== itemId)
    });
  }

  applyResolved(items: ContextItem[]): void {
    this.state.update({ contextItems: items });
  }

  clearAfterSend(): void {
    this.state.update({
      contextItems: this.state.current.contextItems.filter((candidate) => candidate.auto)
    });
  }

  static autoSelectionId(): string {
    return AUTO_ID;
  }
}
