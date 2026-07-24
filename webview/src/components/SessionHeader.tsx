import { useEffect, useRef, useState } from "react";
import type { OpenCodeState, SessionSummary } from "../../../src/runtime/contracts";
import { t } from "../i18n";
import { useChatStore } from "../store";
import { postToHost } from "../vscodeApi";
import { formatSessionStatus } from "./SessionStatusBar";
import { IconArrowLeft, IconEllipsis, IconHistory, IconNewChat, IconSettings } from "./ToolbarIcons";

export type SessionPanel = "chat" | "history";

/**
 * 解析当前会话在工具栏中展示的标题。
 */
export function resolveSessionTitle(state: OpenCodeState): string {
  const active = state.sessions.find((session) => session.id === state.activeSessionId);
  if (active?.title) {
    return active.title;
  }
  const firstUserMessage = state.messages.find((message) => message.role === "user");
  if (firstUserMessage?.text.trim()) {
    return firstUserMessage.text.trim();
  }
  return t(state.locale, "untitledSession");
}

export function SessionHeader({
  state,
  panel,
  onPanelChange
}: {
  state: OpenCodeState;
  panel: SessionPanel;
  onPanelChange: (panel: SessionPanel) => void;
}) {
  const dispatch = useChatStore((store) => store.dispatch);
  const [filter, setFilter] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameTitle, setRenameTitle] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const active = state.sessions.find((session) => session.id === state.activeSessionId);
  const activeStatus = state.activeSessionId ? state.sessionStatuses[state.activeSessionId] : undefined;
  const title = resolveSessionTitle(state);
  const showLiveStatus = activeStatus && ["running", "following", "waiting-permission", "failed", "interrupted"].includes(activeStatus.status);
  const shareEnabled = state.connection.capabilities.share.enabled;
  const isShared = Boolean(active?.shareUrl);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const closeMenu = (event: MouseEvent): void => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", closeMenu);
    return () => window.removeEventListener("mousedown", closeMenu);
  }, [menuOpen]);

  const openHistory = (): void => {
    setMenuOpen(false);
    onPanelChange("history");
  };

  const backToChat = (): void => {
    setFilter("");
    onPanelChange("chat");
  };

  const startRename = (): void => {
    if (active) {
      setRenameTitle(active.title);
      setRenaming(true);
      setMenuOpen(false);
    }
  };

  const saveRename = (): void => {
    if (active && renameTitle.trim()) {
      dispatch({ type: "rename-session", sessionId: active.id, title: renameTitle.trim() });
      setRenaming(false);
    }
  };

  const selectSession = (sessionId: string): void => {
    dispatch({ type: "select-session", sessionId });
    backToChat();
  };

  return (
    <>
      <header className={`chat-toolbar chat-toolbar--${panel}`}>
        <div className="chat-toolbar__leading">
          <button
            type="button"
            className="toolbar-icon-button"
            title={panel === "history" ? t(state.locale, "backToChat") : t(state.locale, "backToHistory")}
            aria-label={panel === "history" ? t(state.locale, "backToChat") : t(state.locale, "backToHistory")}
            onClick={() => (panel === "history" ? backToChat() : openHistory())}
          >
            <IconArrowLeft />
          </button>
        </div>

        <div className="chat-toolbar__title-wrap">
          <div className="chat-toolbar__title" title={panel === "history" ? t(state.locale, "sessionHistory") : title}>
            {panel === "history" ? t(state.locale, "sessionHistory") : title}
          </div>
          {panel === "chat" && showLiveStatus && activeStatus && (
            <div className={`chat-toolbar__status chat-toolbar__status--${activeStatus.status}`}>
              {formatSessionStatus(state.locale, activeStatus)}
            </div>
          )}
        </div>

        <div className="chat-toolbar__actions">
          {panel === "chat" && (
            <div className="chat-toolbar__menu" ref={menuRef}>
              <button
                type="button"
                className="toolbar-icon-button"
                title={t(state.locale, "moreActions")}
                aria-label={t(state.locale, "moreActions")}
                aria-expanded={menuOpen}
                disabled={!active}
                onClick={() => setMenuOpen((open) => !open)}
              >
                <IconEllipsis />
              </button>
              {menuOpen && active && (
                <div className="chat-toolbar__dropdown" role="menu">
                  <button type="button" className="chat-toolbar__dropdown-item" role="menuitem" onClick={startRename}>
                    {t(state.locale, "renameSession")}
                  </button>
                  {shareEnabled && !isShared && (
                    <button
                      type="button"
                      className="chat-toolbar__dropdown-item"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        postToHost({ type: "request-share-session", sessionId: active.id });
                      }}
                    >
                      {t(state.locale, "shareSession")}
                    </button>
                  )}
                  {shareEnabled && isShared && (
                    <>
                      <button
                        type="button"
                        className="chat-toolbar__dropdown-item"
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          postToHost({ type: "request-copy-share-link", sessionId: active.id });
                        }}
                      >
                        {t(state.locale, "copyShareLink")}
                      </button>
                      <button
                        type="button"
                        className="chat-toolbar__dropdown-item"
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          postToHost({ type: "request-unshare-session", sessionId: active.id });
                        }}
                      >
                        {t(state.locale, "unshareSession")}
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className="chat-toolbar__dropdown-item chat-toolbar__dropdown-item--danger"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      postToHost({ type: "request-delete-session", sessionId: active.id });
                    }}
                  >
                    {t(state.locale, "deleteSession")}
                  </button>
                  <button
                    type="button"
                    className="chat-toolbar__dropdown-item"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      postToHost({ type: "open-editor" });
                    }}
                  >
                    {t(state.locale, "openEditor")}
                  </button>
                </div>
              )}
            </div>
          )}
          {panel === "chat" && (
            <button
              type="button"
              className="toolbar-icon-button"
              title={t(state.locale, "sessionHistory")}
              aria-label={t(state.locale, "sessionHistory")}
              onClick={openHistory}
            >
              <IconHistory />
            </button>
          )}
          <button
            type="button"
            className="toolbar-icon-button"
            title={t(state.locale, "openSettings")}
            aria-label={t(state.locale, "openSettings")}
            onClick={() => postToHost({ type: "open-settings" })}
          >
            <IconSettings />
          </button>
          <button
            type="button"
            className="toolbar-icon-button"
            title={t(state.locale, "newSession")}
            aria-label={t(state.locale, "newSession")}
            onClick={() => postToHost({ type: "new-session" })}
          >
            <IconNewChat />
          </button>
        </div>
      </header>

      {renaming && active && (
        <div className="session-rename">
          <input
            aria-label={t(state.locale, "sessionTitle")}
            value={renameTitle}
            onChange={(event) => setRenameTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") saveRename();
              if (event.key === "Escape") setRenaming(false);
            }}
          />
          <button type="button" className="link-button" onClick={saveRename}>{t(state.locale, "save")}</button>
          <button type="button" className="link-button" onClick={() => setRenaming(false)}>{t(state.locale, "cancel")}</button>
        </div>
      )}

      {panel === "history" && (
        <SessionHistoryPanel
          state={state}
          filter={filter}
          onFilterChange={setFilter}
          onSelectSession={selectSession}
        />
      )}
    </>
  );
}

function SessionHistoryPanel({
  state,
  filter,
  onFilterChange,
  onSelectSession
}: {
  state: OpenCodeState;
  filter: string;
  onFilterChange: (value: string) => void;
  onSelectSession: (sessionId: string) => void;
}) {
  const query = filter.trim().toLocaleLowerCase();
  const visibleSessions = query
    ? state.sessions.filter((session) => `${session.title}\n${session.directory}`.toLocaleLowerCase().includes(query))
    : state.sessions;
  const sortedSessions = [...visibleSessions].sort((left, right) => right.updatedAt - left.updatedAt);

  return (
    <section className="session-history" aria-label={t(state.locale, "sessionHistory")}>
      <div className="session-history__search">
        <input
          className="session-history__filter"
          type="search"
          aria-label={t(state.locale, "filterSessions")}
          placeholder={t(state.locale, "filterSessions")}
          value={filter}
          onChange={(event) => onFilterChange(event.target.value)}
        />
      </div>
      {sortedSessions.length === 0 ? (
        <div className="session-history__empty">{t(state.locale, "noSessions")}</div>
      ) : (
        <ul className="session-history__list">
          {sortedSessions.map((session) => (
            <SessionHistoryItem
              key={session.id}
              session={session}
              active={session.id === state.activeSessionId}
              locale={state.locale}
              status={state.sessionStatuses[session.id]}
              disabled={state.phase !== "ready"}
              onSelect={() => onSelectSession(session.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function SessionHistoryItem({
  session,
  active,
  locale,
  status,
  disabled,
  onSelect
}: {
  session: SessionSummary;
  active: boolean;
  locale: OpenCodeState["locale"];
  status: OpenCodeState["sessionStatuses"][string] | undefined;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        className={`session-history__item${active ? " session-history__item--active" : ""}`}
        disabled={disabled}
        onClick={onSelect}
      >
        <span className="session-history__item-title">{session.title}</span>
        <span className="session-history__item-meta">
          {formatSessionStatus(locale, status)}
        </span>
      </button>
    </li>
  );
}
