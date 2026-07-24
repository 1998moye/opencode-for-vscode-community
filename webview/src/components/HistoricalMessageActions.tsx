import { useState } from "react";
import type { Locale } from "../../../src/runtime/contracts";
import { t } from "../i18n";

export function HistoricalMessageActions({
  locale,
  originalText,
  onSend
}: {
  locale: Locale;
  originalText: string;
  onSend: (text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(originalText);
  if (editing) {
    return (
      <div className="historical-message-editor">
        <textarea aria-label={t(locale, "editHistoricalPrompt")} value={text} onChange={(event) => setText(event.target.value)} />
        <div className="message-actions">
          <button className="link-button" disabled={!text.trim()} onClick={() => onSend(text.trim())}>
            {t(locale, "sendToCurrentSession")}
          </button>
          <button className="link-button" onClick={() => { setText(originalText); setEditing(false); }}>
            {t(locale, "cancel")}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="message-actions message-actions--historical">
      <button className="link-button" aria-label={t(locale, "resendMessage")} onClick={() => onSend(originalText)}>↻ {t(locale, "resendMessage")}</button>
      <button className="link-button" aria-label={t(locale, "editMessage")} onClick={() => setEditing(true)}>✎ {t(locale, "editMessage")}</button>
    </div>
  );
}
