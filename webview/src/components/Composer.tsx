import { useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from "react";
import type { OpenCodeState } from "../../../src/runtime/contracts";
import { useAutoResizeTextarea } from "../composer/useAutoResizeTextarea";
import { useComposerAutocomplete } from "../composer/useComposerAutocomplete";
import { useDraftInput } from "../composer/useDraftInput";
import { uploadAttachmentFile } from "../composer/uploadAttachment";
import { t } from "../i18n";
import { useChatStore } from "../store";
import { postToHost } from "../vscodeApi";
import { ComposerAutocomplete } from "./ComposerAutocomplete";
import { ComposerContext } from "./ComposerContext";
import { ComposerToolbar } from "./ComposerToolbar";

export function Composer({ state }: { state: OpenCodeState }) {
  const dispatch = useChatStore((store) => store.dispatch);
  const [cursor, setCursor] = useState(0);
  const draft = useDraftInput(state.draft, (value) => {
    dispatch({ type: "update-draft", draft: value });
  });
  const inputRef = useAutoResizeTextarea(draft.value);
  const assist = useComposerAutocomplete({
    state,
    draft: draft.value,
    cursor,
    setDraft: draft.setValue,
    setCursor,
    dispatch
  });
  const activeStatus = state.activeSessionId ? state.sessionStatuses[state.activeSessionId]?.status : undefined;
  const canAbort = activeStatus === "running" || activeStatus === "waiting-permission";
  const following = activeStatus === "following";
  const hasAttachments = state.contextItems.some((item) => item.kind === "image" || item.kind === "pdf" || item.kind === "attachment");
  const canSend = state.phase === "ready" && (Boolean(draft.value.trim()) || hasAttachments) && !canAbort && !following;
  const send = (): void => {
    if (canSend) {
      dispatch({ type: "send-message", text: draft.value });
      assist.dismiss();
    }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.nativeEvent.isComposing || draft.isComposing()) {
      return;
    }
    if (assist.onKeyDown(event)) {
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>): void => {
    const items = event.clipboardData?.items;
    if (!items) {
      return;
    }
    for (const item of items) {
      if (!item.type.startsWith("image/")) {
        continue;
      }
      const file = item.getAsFile();
      if (!file) {
        continue;
      }
      event.preventDefault();
      void uploadAttachmentFile(file, postToHost);
      return;
    }
  };
  const onDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    const files = [...event.dataTransfer.files];
    for (const file of files) {
      void uploadAttachmentFile(file, postToHost);
    }
  };

  return (
    <footer className="composer">
      <div
        className="composer__box"
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDrop}
      >
        {state.contextItems.length > 0 ? <ComposerContext state={state} /> : null}
        <div className="composer__input-area">
          {assist.panelOpen ? (
            <ComposerAutocomplete
              locale={state.locale}
              listboxId={assist.listboxId}
              activeIndex={assist.activeIndex}
              suggestions={{ ...assist.suggestions, displayStatus: assist.displayStatus }}
              onSelect={(index) => {
                const item = assist.suggestions.items[index];
                if (item) {
                  assist.selectItem(item, "complete");
                }
              }}
            />
          ) : null}
          <textarea
            ref={inputRef}
            className="composer__input"
            value={draft.value}
            rows={1}
            disabled={state.phase !== "ready" || following}
            placeholder={t(state.locale, "placeholder")}
            aria-controls={assist.panelOpen ? assist.listboxId : undefined}
            aria-expanded={assist.panelOpen}
            aria-autocomplete={assist.panelOpen ? "list" : undefined}
            onChange={(event) => {
              draft.onChange(event);
              setCursor(event.target.selectionStart ?? event.target.value.length);
            }}
            onSelect={(event) => {
              setCursor(event.currentTarget.selectionStart ?? event.currentTarget.value.length);
            }}
            onCompositionStart={draft.onCompositionStart}
            onCompositionEnd={draft.onCompositionEnd}
            onPaste={onPaste}
            onKeyDown={onKeyDown}
          />
        </div>
        <ComposerToolbar
          state={state}
          canSend={canSend}
          canAbort={canAbort}
          following={following}
          onSend={send}
          onAbort={() => dispatch({ type: "abort-session" })}
        />
      </div>
    </footer>
  );
}
