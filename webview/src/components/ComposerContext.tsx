import type { ContextItem, OpenCodeState } from "../../../src/runtime/contracts";
import { formatContextChipLabel, shouldShowContextKind } from "../composer/contextChipLabel";
import { t, type TranslationKey } from "../i18n";
import { useChatStore } from "../store";

/**
 * 展示可移除的上下文芯片。
 */
export function ComposerContext({ state }: { state: OpenCodeState }) {
  const dispatch = useChatStore((store) => store.dispatch);

  if (state.contextItems.length === 0) {
    return null;
  }

  return (
    <div className="composer__context" aria-label={t(state.locale, "contextLabel")}>
      <div className="composer__context-chips">
        {state.contextItems.map((item) => (
          <ContextChip
            key={item.id}
            item={item}
            locale={state.locale}
            onRemove={() => dispatch({ type: "remove-context-item", itemId: item.id })}
          />
        ))}
      </div>
    </div>
  );
}

function ContextChip({
  item,
  locale,
  onRemove
}: {
  item: ContextItem;
  locale: OpenCodeState["locale"];
  onRemove: () => void;
}) {
  const label = formatContextChipLabel(item);
  const isAttachment = item.kind === "image" || item.kind === "pdf" || item.kind === "attachment";

  return (
    <div className={`composer__context-chip${item.error ? " composer__context-chip--error" : ""}${isAttachment ? " composer__context-chip--attachment" : ""}`}>
      {item.previewUri && item.kind === "image" ? (
        <img className="composer__context-chip-preview" src={item.previewUri} alt="" />
      ) : null}
      <div className="composer__context-chip-body">
        {shouldShowContextKind(item) ? (
          <span className="composer__context-chip-kind">{t(locale, contextKey(item.kind))}</span>
        ) : null}
        <span className="composer__context-chip-label" title={item.label}>{label}</span>
        {item.sizeLabel ? <span className="composer__context-chip-size">{item.sizeLabel}</span> : null}
        {item.status === "loading" ? (
          <span className="composer__context-chip-detail">{t(locale, "attachmentLoading")}</span>
        ) : null}
        {item.error ? <span className="composer__context-chip-error">{item.error}</span> : null}
      </div>
      <button
        type="button"
        className="composer__context-chip-remove"
        aria-label={t(locale, "removeContext")}
        onClick={onRemove}
      >
        ×
      </button>
    </div>
  );
}

function contextKey(kind: ContextItem["kind"]): TranslationKey {
  switch (kind) {
    case "selection": return "contextSelection";
    case "file": return "contextFile";
    case "files": return "contextFiles";
    case "folder": return "contextFolder";
    case "problems": return "contextProblems";
    case "git-diff": return "contextGitDiff";
    case "terminal": return "contextTerminal";
    case "terminal-paste": return "contextTerminalPaste";
    case "image": return "contextImage";
    case "pdf": return "contextPdf";
    case "attachment": return "contextAttachment";
    default: return "addContext";
  }
}
