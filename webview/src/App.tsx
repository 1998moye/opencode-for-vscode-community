import { useState } from "react";
import { Composer } from "./components/Composer";
import { ConnectionStatus } from "./components/ConnectionStatus";
import { ConnectionCapabilities } from "./components/ConnectionCapabilities";
import { MessageList } from "./components/MessageList";
import { ChangeReviewCenter } from "./components/ChangeReviewCenter";
import { SessionHeader, type SessionPanel } from "./components/SessionHeader";
import { t } from "./i18n";
import { useChatStore } from "./store";

export function App() {
  const state = useChatStore((store) => store.state);
  const [panel, setPanel] = useState<SessionPanel>("chat");
  const hasSession = Boolean(state.activeSessionId);
  const showChat = panel === "chat";

  return (
    <div className={`app-shell${showChat ? "" : " app-shell--history"}`}>
      <header className="app-shell__header">
        <ConnectionStatus state={state} />
        <ConnectionCapabilities locale={state.locale} capabilities={state.connection.capabilities} />
        <SessionHeader state={state} panel={panel} onPanelChange={setPanel} />
      </header>
      {showChat ? (
        <>
          <main className="app-shell__body">
            {hasSession ? (
              <MessageList messages={state.messages} locale={state.locale} />
            ) : (
              <div className="empty-state">{t(state.locale, "noSession")}</div>
            )}
          </main>
          <ChangeReviewCenter state={state} />
          <Composer state={state} />
        </>
      ) : null}
    </div>
  );
}
