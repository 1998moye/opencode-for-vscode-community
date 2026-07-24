import type { ComposerSelection, ContextItem, ModelCatalog, ModelInputModality } from "../contracts.js";

/**
 * 附件类型对应的模型输入模态。
 */
export function attachmentModality(kind: ContextItem["kind"]): ModelInputModality | undefined {
  if (kind === "image") {
    return "image";
  }
  if (kind === "pdf") {
    return "pdf";
  }
  return undefined;
}

/**
 * 判断当前所选模型是否支持待发送附件。
 */
export function validateAttachmentModalities(
  items: ContextItem[],
  catalog: ModelCatalog,
  selection: ComposerSelection
): { ok: true } | { ok: false; error: string } {
  const attachments = items.filter((item) => attachmentModality(item.kind));
  if (attachments.length === 0) {
    return { ok: true };
  }
  const model = catalog.models.find(
    (candidate) => candidate.providerID === selection.providerID && candidate.id === selection.modelID
  );
  if (!model) {
    return {
      ok: false,
      error: "请先选择支持图片或 PDF 的模型后再发送附件。"
    };
  }
  for (const item of attachments) {
    const modality = attachmentModality(item.kind);
    if (!modality) {
      continue;
    }
    if (!model.inputModalities.includes(modality)) {
      const label = item.kind === "pdf" ? "PDF" : "图片";
      return {
        ok: false,
        error: `当前模型「${model.name}」不支持${label}输入，请更换模型或移除附件。`
      };
    }
  }
  return { ok: true };
}
