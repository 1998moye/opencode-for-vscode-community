import type { ComposerSelection, ModelCatalog } from "../contracts.js";

export interface SelectionValidation {
  selection: ComposerSelection;
  changed: boolean;
}

/**
 * 根据最新目录校验并修正编写区选择。
 */
export function validateComposerSelection(
  selection: ComposerSelection,
  catalog: ModelCatalog
): SelectionValidation {
  if (!catalog.loaded) {
    return { selection, changed: false };
  }
  if (catalog.error) {
    return {
      selection: { ...selection, notice: catalog.error },
      changed: selection.notice !== catalog.error
    };
  }

  const next: ComposerSelection = { ...selection };
  let changed = false;
  let notice: string | undefined;

  if (next.providerID) {
    const provider = catalog.providers.find((candidate) => candidate.id === next.providerID);
    if (!provider?.connected) {
      next.providerID = undefined;
      next.modelID = undefined;
      next.variant = undefined;
      notice = "先前选择的模型供应商尚未连接。";
      changed = true;
    }
  }

  if (next.providerID && !catalog.providers.some((provider) => provider.id === next.providerID)) {
    next.providerID = undefined;
    next.modelID = undefined;
    next.variant = undefined;
    notice = "先前选择的模型供应商已不可用。";
    changed = true;
  }

  if (next.providerID && next.modelID) {
    const model = catalog.models.find((candidate) =>
      candidate.providerID === next.providerID && candidate.id === next.modelID
    );
    if (!model) {
      next.modelID = undefined;
      next.variant = undefined;
      notice = "先前选择的模型已不可用。";
      changed = true;
    } else if (!model.available) {
      next.modelID = undefined;
      next.variant = undefined;
      notice = "先前选择的模型尚未解锁，请先连接供应商。";
      changed = true;
    } else if (next.variant && !model.variants.includes(next.variant)) {
      next.variant = undefined;
      changed = true;
    }
  }

  if (next.agent && !catalog.agents.some((agent) => agent.id === next.agent)) {
    next.agent = undefined;
    notice = "先前选择的智能体已不可用。";
    changed = true;
  }

  if (next.notice !== notice) {
    next.notice = notice;
    changed = true;
  }

  return { selection: next, changed };
}

/**
 * 从会话摘要同步编写区选择。
 */
export function selectionFromSession(
  session: { model?: { providerID: string; modelID: string; variant?: string }; agent?: string }
): ComposerSelection {
  return {
    ...(session.model
      ? {
          providerID: session.model.providerID,
          modelID: session.model.modelID,
          ...(session.model.variant ? { variant: session.model.variant } : {})
        }
      : {}),
    ...(session.agent ? { agent: session.agent } : {})
  };
}

/**
 * 编写区是否已有有效选择。
 */
export function hasComposerSelection(selection: Partial<ComposerSelection>): boolean {
  return Boolean(selection.providerID || selection.modelID || selection.agent);
}
