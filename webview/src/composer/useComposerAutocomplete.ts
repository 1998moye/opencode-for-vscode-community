import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { ComposerSuggestionItem, OpenCodeState } from "../../../src/runtime/contracts";
import { applyComposerSuggestion, detectComposerTrigger } from "./detectComposerTrigger";

const DEBOUNCE_MS = 150;

interface UseComposerAutocompleteOptions {
  state: OpenCodeState;
  draft: string;
  cursor: number;
  setDraft: (value: string) => void;
  setCursor: (value: number) => void;
  dispatch: (intent: import("../../../src/runtime/contracts").OpenCodeIntent) => void;
}

/**
 * 管理 `/` 与 `@` 触发的补全面板状态与键盘导航。
 */
export function useComposerAutocomplete(options: UseComposerAutocompleteOptions) {
  const { state, draft, cursor, setDraft, setCursor, dispatch } = options;
  const requestCounter = useRef(0);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [activeIndex, setActiveIndex] = useState(0);
  const listboxId = useId();
  const trigger = useMemo(() => detectComposerTrigger(draft, cursor), [draft, cursor]);
  const suggestions = state.composerSuggestions ?? {
    requestId: "",
    trigger: "slash" as const,
    query: "",
    status: "idle" as const,
    items: []
  };
  const suggestionsMatch = Boolean(trigger)
    && suggestions.trigger === trigger?.trigger
    && suggestions.query === trigger?.query;
  const panelOpen = Boolean(trigger) && state.phase === "ready";
  // A trigger opens the panel synchronously, before the debounced host request
  // has had a chance to mark the shared state as loading. Treat that idle gap
  // as loading so the panel never looks like a non-responsive blank box.
  const displayStatus = !suggestionsMatch || suggestions.status === "idle" || suggestions.status === "loading"
    ? "loading" as const
    : suggestions.status;

  useEffect(() => {
    setActiveIndex(0);
  }, [suggestions.requestId, suggestions.status]);

  useEffect(() => {
    if (!trigger || state.phase !== "ready") {
      if ((state.composerSuggestions?.status ?? "idle") !== "idle") {
        dispatch({ type: "dismiss-composer-suggestions" });
      }
      return;
    }
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    const requestId = `assist-${++requestCounter.current}`;
    debounceTimer.current = setTimeout(() => {
      dispatch({
        type: "query-composer-suggestions",
        requestId,
        trigger: trigger.trigger,
        query: trigger.query
      });
    }, DEBOUNCE_MS);
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [trigger?.trigger, trigger?.query, state.phase, dispatch]);

  const selectItem = (item: ComposerSuggestionItem, mode: "complete" | "execute" = "complete"): void => {
    if (!trigger) {
      return;
    }
    if (mode === "execute" && item.cliCommand) {
      dispatch({ type: "run-cli-command", command: item.cliCommand });
      dispatch({ type: "dismiss-composer-suggestions" });
      return;
    }
    if (item.contextItem) {
      dispatch({ type: "add-context-item", item: item.contextItem });
    }
    const applied = applyComposerSuggestion(draft, trigger, item.insertText);
    setDraft(applied.draft);
    setCursor(applied.cursor);
    dispatch({ type: "dismiss-composer-suggestions" });
  };

  const dismiss = (): void => {
    dispatch({ type: "dismiss-composer-suggestions" });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (!panelOpen) {
      if (event.key === "Escape" && (state.composerSuggestions?.status ?? "idle") !== "idle") {
        event.preventDefault();
        dismiss();
        return true;
      }
      return false;
    }
    if (displayStatus !== "ready" || suggestions.items.length === 0) {
      if (event.key === "Escape" && (state.composerSuggestions?.status ?? "idle") !== "idle") {
        event.preventDefault();
        dismiss();
        return true;
      }
      return false;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % suggestions.items.length);
      return true;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + suggestions.items.length) % suggestions.items.length);
      return true;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      dismiss();
      return true;
    }
    if (event.key === "Tab") {
      const item = suggestions.items[activeIndex];
      if (item) {
        event.preventDefault();
        selectItem(item, "complete");
        return true;
      }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      const item = suggestions.items[activeIndex];
      if (item) {
        event.preventDefault();
        selectItem(item, "complete");
        return true;
      }
    }
    return false;
  };

  return {
    trigger,
    panelOpen,
    activeIndex,
    listboxId,
    suggestions,
    displayStatus,
    selectItem,
    dismiss,
    onKeyDown
  };
}
