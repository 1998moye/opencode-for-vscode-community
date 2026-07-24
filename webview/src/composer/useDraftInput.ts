import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CompositionEvent
} from "react";

export interface DraftInputBinding {
  value: string;
  setValue(draft: string): void;
  onChange(event: ChangeEvent<HTMLTextAreaElement>): void;
  onCompositionStart(): void;
  onCompositionEnd(event: CompositionEvent<HTMLTextAreaElement>): void;
  isComposing(): boolean;
}

export function useDraftInput(
  hostDraft: string,
  publishDraft: (draft: string) => void
): DraftInputBinding {
  const [localDraft, setLocalDraft] = useState(hostDraft);
  const composing = useRef(false);
  const awaitingHostEcho = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (composing.current) {
      return;
    }
    if (awaitingHostEcho.current !== undefined) {
      if (hostDraft === awaitingHostEcho.current) {
        awaitingHostEcho.current = undefined;
      }
      return;
    }
    setLocalDraft(hostDraft);
  }, [hostDraft]);

  const publish = (draft: string): void => {
    awaitingHostEcho.current = draft;
    publishDraft(draft);
  };

  return {
    value: localDraft,
    setValue(draft: string): void {
      setLocalDraft(draft);
      publish(draft);
    },
    onChange(event): void {
      const draft = event.target.value;
      setLocalDraft(draft);
      if (!composing.current) {
        publish(draft);
      }
    },
    onCompositionStart(): void {
      composing.current = true;
    },
    onCompositionEnd(event): void {
      composing.current = false;
      const draft = event.currentTarget.value;
      setLocalDraft(draft);
      publish(draft);
    },
    isComposing(): boolean {
      return composing.current;
    }
  };
}
