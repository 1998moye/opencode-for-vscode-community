import type { OpenCodeState } from "../../../src/runtime/contracts";
import { t } from "../i18n";
import { postToHost } from "../vscodeApi";
import { IconPaperclip } from "./ToolbarIcons";

/**
 * 编写区底栏附件按钮：点击直接打开系统文件选择器。
 */
export function ComposerAttachButton({ state }: { state: OpenCodeState }) {
  const disabled = state.phase !== "ready";

  return (
    <button
      type="button"
      className="composer__button composer__button--icon"
      aria-label={t(state.locale, "addContext")}
      disabled={disabled}
      onClick={() => postToHost({ type: "request-pick-attachments" })}
    >
      <IconPaperclip />
    </button>
  );
}
