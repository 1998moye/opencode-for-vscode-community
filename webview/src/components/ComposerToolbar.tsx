import type { OpenCodeState } from "../../../src/runtime/contracts";
import { t } from "../i18n";
import { ComposerAttachButton } from "./ComposerAttachButton";
import { ComposerToolbarControls } from "./ComposerToolbarControls";
import { ToolbarPopoverProvider } from "../composer/useToolbarPopover";
import { IconSend, IconStop } from "./ToolbarIcons";

/**
 * 编写区底栏：左下智能体/模型，右下上下文与发送。
 */
export function ComposerToolbar({
  state,
  canSend,
  canAbort,
  following,
  onSend,
  onAbort
}: {
  state: OpenCodeState;
  canSend: boolean;
  canAbort: boolean;
  following: boolean;
  onSend: () => void;
  onAbort: () => void;
}) {
  return (
    <ToolbarPopoverProvider>
      <div className="composer__toolbar">
        <ComposerToolbarControls state={state} />
        <div className="composer__toolbar-actions">
          <ComposerAttachButton state={state} />
          {canAbort ? (
            <button
              type="button"
              className="composer__button composer__button--stop"
              aria-label={t(state.locale, "stop")}
              onClick={onAbort}
            >
              <IconStop />
            </button>
          ) : following ? (
            <button type="button" className="composer__button composer__button--muted" disabled>
              {t(state.locale, "statusFollowing")}
            </button>
          ) : (
            <button
              type="button"
              className="composer__button composer__button--send"
              disabled={!canSend}
              aria-label={t(state.locale, "send")}
              onClick={onSend}
            >
              <IconSend />
            </button>
          )}
        </div>
      </div>
    </ToolbarPopoverProvider>
  );
}
