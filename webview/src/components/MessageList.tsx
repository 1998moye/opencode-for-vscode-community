import { useState, type SyntheticEvent } from "react";
import type { ChatMessage, ChatMessageStep, Locale, OpenCodeState } from "../../../src/runtime/contracts";
import { useChatScroll } from "../hooks/useChatScroll";
import { t } from "../i18n";
import { useChatStore } from "../store";
import { HistoricalMessageActions } from "./HistoricalMessageActions";
import { PermissionCenter } from "./PermissionCenter";
import { QuestionCenter } from "./QuestionCenter";
import { PayloadBody } from "./PayloadBody";
import { MarkdownBlock } from "./MarkdownBlock";
import { normalizeToolKind } from "./payloadDisplayCore";
import { parseToolCallDisplay, parseUserMessageDisplay } from "./toolCallDisplay";

function isSoloSlashBubble(message: ChatMessage): boolean {
  if (message.role !== "user") {
    return false;
  }
  const parsed = parseUserMessageDisplay(message.text);
  const commandName = message.slashCommand ?? parsed.slashCommand;
  if (!commandName) {
    return false;
  }
  const args = message.slashArguments ?? parsed.arguments;
  return !args?.trim() && !message.slashDetail?.trim();
}

function UserMessageText({
  text,
  slashCommand,
  slashArguments,
  slashDetail
}: {
  text: string;
  slashCommand?: string;
  slashArguments?: string;
  slashDetail?: string;
}) {
  const parsed = parseUserMessageDisplay(text);
  const commandName = slashCommand ?? parsed.slashCommand;
  const args = slashArguments ?? parsed.arguments;
  // 斜杠命令：消息正文是 `/<命令> <参数>`，气泡只展示命令胶囊 + 简短参数摘要，不铺出整段文本。
  if (commandName) {
    const withArgs = Boolean(args?.trim());
    const solo = !withArgs && !slashDetail;
    return (
      <div className={`message__command-line${withArgs ? " message__command-line--with-args" : solo ? " message__command-line--solo" : slashDetail ? " message__command-line--skill" : ""}`}>
        <span className="message__command-chip" title={`/${commandName}`}>
          <span className="message__command-slash">/</span>{commandName}
        </span>
        {args ? <span className="message__command-args">{args}</span> : null}
        {!args && slashDetail ? (
          <span className="message__command-detail">{slashDetail}</span>
        ) : null}
      </div>
    );
  }
  // Shell 命令：同理以胶囊展示，避免把整段命令裸文本铺给用户。
  if (parsed.shellCommand) {
    return (
      <div className="message__command-line">
        <span className="message__command-chip message__command-chip--shell" title={`!${parsed.shellCommand}`}>
          <span className="message__command-slash">!</span>{parsed.shellCommand}
        </span>
      </div>
    );
  }
  // 含一个或多个文件附件前缀时，统一渲染为附件卡片，去掉裸 JSON / 结构化文本残留。
  if (parsed.attachments && parsed.attachments.length > 0) {
    return (
      <>
        <div className="message__file-attachments" role="list">
          {parsed.attachments.map((attachment, index) => {
            const type = attachment.fileName.includes(".")
              ? attachment.fileName.slice(attachment.fileName.lastIndexOf(".") + 1).toUpperCase()
              : "FILE";
            return (
              <div key={`${attachment.filePath}-${index}`} className="message__file-attachment" title={attachment.filePath} role="listitem">
                <span className="message__file-type" aria-label={type}>{type}</span>
                <span className="message__file-name">{attachment.fileName}</span>
              </div>
            );
          })}
        </div>
        {parsed.remainingText ? <div className="message__tool-call-text">{parsed.remainingText}</div> : null}
      </>
    );
  }
  // 历史里单个 Read 工具调用仍走旧解析，保持向后兼容。
  const toolCall = parseToolCallDisplay(text);
  if (!toolCall) {
    return <>{text}</>;
  }
  const fileType = toolCall.fileName?.includes(".")
    ? toolCall.fileName.slice(toolCall.fileName.lastIndexOf(".") + 1).toUpperCase()
    : "FILE";
  return (
    <>
      <div className="message__file-attachment" title={toolCall.filePath}>
        <span className="message__file-type" aria-label={fileType}>{fileType}</span>
        <span className="message__file-name">{toolCall.fileName ?? toolCall.toolName}</span>
      </div>
      {toolCall.remainingText ? <div className="message__tool-call-text">{toolCall.remainingText}</div> : null}
    </>
  );
}

/**
 * 展开工具时直接展示内容原文（命令、被写入/编辑的代码、搜索关键词、待办列表等），
 * 代码与 Shell 命令使用语法高亮，不再渲染结构化字段网格或原始 JSON。
 */
function ToolPayloadBody({
  body,
  toolLabel,
  variant = "input"
}: {
  body: string;
  toolLabel: string;
  variant?: "input" | "output";
}) {
  return <PayloadBody body={body} toolLabel={toolLabel} variant={variant} />;
}

type AssistantTurn = {
  steps: ChatMessageStep[];
  /** 该段原文（回复正文）。只在仍有可展示文字时存在。 */
  output?: string;
  streaming?: boolean;
};

function timelineStatus(locale: Locale, status: ChatMessageStep["status"]): string {
  switch (status) {
    case "pending": return t(locale, "timelineWaiting");
    case "running": return t(locale, "timelineRunning");
    case "completed": return t(locale, "timelineCompleted");
    default: return t(locale, "timelineFailed");
  }
}

function MessageTimeline({
  turns,
  locale
}: {
  turns: AssistantTurn[];
  locale: Locale;
}) {
  return (
    <div className="message__timeline">
      {turns.map((turn, turnIndex) => (
        <TurnSegment key={turnIndex} turn={turn} locale={locale} />
      ))}
    </div>
  );
}

function TurnSegment({ turn, locale }: { turn: AssistantTurn; locale: Locale }) {
  const hasOutput = Boolean(turn.output?.trim());
  return (
    <>
      {turn.steps.map((step, index) => (
        <TimelineStep key={`${step.type}-${step.label}-${index}`} step={step} locale={locale} />
      ))}
      {hasOutput ? (
        <div className={`message__timeline-output${turn.streaming ? " message__timeline-output--streaming" : ""}`}>
          <span className="message__timeline-output-dot" aria-hidden="true" />
          <div className="message__text message__text--markdown">
            <MarkdownBlock text={turn.output!} />
          </div>
        </div>
      ) : null}
    </>
  );
}

/**
 * Read 工具的 input 只有路径，output 已含路径与正文，展开时跳过 input 避免重复。
 * Glob/Grep 有 output 时 input 与摘要行重复，同样跳过。
 */
function shouldShowToolInput(step: ChatMessageStep): boolean {
  const kind = normalizeToolKind(step.label);
  if (kind === "read" && step.output) {
    return false;
  }
  if ((kind === "glob" || kind === "grep") && step.output) {
    return false;
  }
  return Boolean(step.input);
}

/**
 * Write/Edit 的成功短句 output 无信息量，展开时隐藏。
 */
function shouldShowToolOutput(step: ChatMessageStep): boolean {
  if (!step.output?.trim()) {
    return false;
  }
  const kind = normalizeToolKind(step.label);
  if ((kind === "todowrite" || kind === "towrite") && step.input) {
    return false;
  }
  if (kind !== "edit" && kind !== "write") {
    return true;
  }
  const trimmed = step.output.trim();
  if (trimmed.includes("\n")) {
    return true;
  }
  return !(/^(?:edit|write|file|patch|updated|wrote|saved|applied)\b/i.test(trimmed)
    || /successfully\.?$/i.test(trimmed)
    || /^(?:已成功|已写入|已更新|已保存)/.test(trimmed));
}

function TimelineStep({ step, locale }: { step: ChatMessageStep; locale: Locale }) {
  const [open, setOpen] = useState(false);
  const onToggle = (event: SyntheticEvent<HTMLDetailsElement>): void => {
    setOpen(event.currentTarget.open);
  };
  return (
    <details
      className={`message__timeline-step message__timeline-step--${step.type} message__timeline-step--${step.status}`}
      onToggle={onToggle}
    >
      <summary>
        <span className="message__timeline-dot" aria-hidden="true" />
        <span className="message__timeline-status">{timelineStatus(locale, step.status)}</span>
        <strong>{step.type === "reasoning" ? t(locale, "timelineThinking") : step.label}</strong>
        {step.detail && step.type !== "reasoning" ? <span className="message__timeline-detail">{step.detail}</span> : null}
      </summary>
      {step.type === "reasoning" && step.detail ? <div className="message__timeline-reasoning">{step.detail}</div> : null}
      {open && (step.input || step.output) ? (
        <div className="message__timeline-payload">
          {step.input && shouldShowToolInput(step) ? (
            <ToolPayloadBody body={step.input} toolLabel={step.label} variant="input" />
          ) : null}
          {step.output && shouldShowToolOutput(step) ? (
            <ToolPayloadBody body={step.output} toolLabel={step.label} variant="output" />
          ) : null}
        </div>
      ) : null}
    </details>
  );
}

/**
 * 把连续的 assistant 消息合并为单一时间线，即使中途出现正文文字也不断开竖线。
 * 每条原始消息被归一为一段 turn：工具步骤在前，回复正文在后；多段 turn 共用一条左竖线。
 */
function groupAssistantTurns(messages: ChatMessage[]): { message: ChatMessage; turns: AssistantTurn[] }[] {
  const groups: { message: ChatMessage; turns: AssistantTurn[] }[] = [];
  for (const message of messages) {
    const steps = message.steps ?? [];
    const hasText = Boolean(message.text?.trim());
    const hasError = Boolean(message.error);
    const previous = groups.at(-1);
    const previousIsAssistant = previous?.message.role === "assistant";
    if (message.role === "assistant" && previousIsAssistant) {
      previous!.turns.push({
        steps,
        ...(hasText ? { output: message.text } : {}),
        ...(message.streaming ? { streaming: true } : {})
      });
      // 无文字又无步骤又无错误的段不单独占行，仅追加到同时间线的 turn 池（这里等同空 turn，跳过）。
      continue;
    }
    groups.push({
      message,
      turns: [{
        steps,
        ...(hasText ? { output: message.text } : {}),
        ...(message.streaming ? { streaming: true } : {}),
        ...(hasError ? {} : {})
      }]
    });
  }
  return groups.map((group) => ({
    ...group,
    turns: group.turns.filter((turn, index) => turn.steps.length > 0 || Boolean(turn.output?.trim()) || index === group.turns.length - 1)
  }));
}

export function MessageList({ messages, locale }: { messages: ChatMessage[]; locale: Locale }) {
  const dispatch = useChatStore((store) => store.dispatch);
  const state = useChatStore((store) => store.state) as OpenCodeState | undefined;
  const groups = groupAssistantTurns(messages
    .filter((message) => message.role !== "assistant" || Boolean(message.text.trim()) || Boolean(message.error) || (message.steps?.length ?? 0) > 0)
    .slice(-200));
  const lastGroup = groups.at(-1);
  const lastMessage = lastGroup?.message;
  const stepsSignature = lastGroup
    ? lastGroup.turns.flatMap((turn) => turn.steps).map((step) => `${step.label}:${step.status}`).join(";")
    : "";
  const scrollKey = lastMessage
    ? `${lastMessage.id}:${lastGroup!.turns.reduce((sum, turn) => sum + (turn.output?.length ?? 0), 0)}:${stepsSignature}:${lastMessage.error ?? ""}:${lastGroup!.turns.some((turn) => turn.streaming) ? "streaming" : "complete"}`
    : "empty";
  const interactionKey = [
    ...(state?.permissions ?? []).map((request) => `permission:${request.id}:${request.status ?? "pending"}`),
    ...(state?.questions ?? []).map((request) => `question:${request.id}:${request.status ?? "pending"}`)
  ].join("|");
  const { endRef, showScrollFab, scrollToBottom } = useChatScroll(scrollKey, interactionKey);

  if (groups.length === 0) {
    return (
      <main className="messages">
        {state ? <QuestionCenter state={state} /> : null}
        {state ? <PermissionCenter state={state} /> : null}
        <div className="empty-state">{t(locale, "noMessage")}</div>
      </main>
    );
  }
  return (
    <main className="messages" aria-live="polite">
      {groups.map((group) => {
        const message = group.message;
        const hasTimeline = message.role === "assistant" && group.turns.some((turn) => turn.steps.length > 0);
        const isStreaming = message.role === "assistant" && group.turns.some((turn) => turn.streaming);
        const isSoloSlash = message.role === "user" && isSoloSlashBubble(message);
        const isHistoricalUser = message.role === "user" && !message.id.startsWith("local-");
        const userBody = (
          <div className="message__text">
            <UserMessageText
              text={message.text}
              slashCommand={message.slashCommand}
              slashArguments={message.slashArguments}
              slashDetail={message.slashDetail}
            />
          </div>
        );
        return (
          <article
            key={message.id}
            className={`message message--${message.role}${hasTimeline ? " message--has-timeline" : ""}${isStreaming ? " message--streaming" : ""}${isSoloSlash ? " message--slash-solo" : ""}${isHistoricalUser ? " message--user-stack" : ""}`}
            aria-label={message.role === "user" ? "你的消息" : "OpenCode 回复"}
          >
            {hasTimeline
              ? <MessageTimeline turns={group.turns} locale={locale} />
              : message.role === "assistant"
                ? (
                  <div className="message__text message__text--markdown">
                    <MarkdownBlock text={message.text} />
                  </div>
                )
                : isHistoricalUser
                  ? (
                    <div className="message__user-bubble">
                      {userBody}
                      {message.error ? <div className="message__error">{message.error}</div> : null}
                    </div>
                  )
                  : (
                    <>
                      {userBody}
                      {message.error ? <div className="message__error">{message.error}</div> : null}
                    </>
                  )}
            {message.role === "assistant" && message.error ? <div className="message__error">{message.error}</div> : null}
            {isHistoricalUser ? (
              <HistoricalMessageActions
                locale={locale}
                originalText={message.text}
                onSend={(text) => dispatch({ type: "send-message", text })}
              />
            ) : null}
          </article>
        );
      })}
      {state ? <QuestionCenter state={state} /> : null}
      {state ? <PermissionCenter state={state} /> : null}
      {showScrollFab ? (
        <button
          type="button"
          className="scroll-to-bottom-fab"
          aria-label={t(locale, "scrollToBottom")}
          title={t(locale, "scrollToBottom")}
          onClick={() => scrollToBottom("smooth")}
        >
          <svg className="scroll-to-bottom-fab__icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path d="M8 12.5a.75.75 0 0 0 .53-.22l4.25-4.25a.75.75 0 1 0-1.06-1.06L8.75 9.44V4a.75.75 0 0 0-1.5 0v5.44L4.28 7.03a.75.75 0 1 0-1.06 1.06l4.25 4.25c.14.14.33.22.53.22Z" fill="currentColor" />
          </svg>
        </button>
      ) : null}
      <div ref={endRef} />
    </main>
  );
}
