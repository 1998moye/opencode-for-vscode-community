import type { Message, Part } from "@opencode-ai/sdk/v2";
import type { ChatMessage, ChatMessageStep } from "../../runtime/contracts.js";
import { looksLikeSkillPromptBody, shouldHideSkillBackedUserText, extractTrailingUserArgsFromSkillEnvelope } from "../../runtime/messages/skillPromptDisplay.js";

/**
 * 归一化 OpenCode 工具名（大小写、下划线不敏感）。
 */
function normalizeToolKind(toolName: string): string {
  return toolName.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function formatTodoItems(todos: unknown[]): string {
  return todos.map((entry) => {
    if (entry && typeof entry === "object") {
      const obj = entry as Record<string, unknown>;
      const mark = obj.status === "completed" ? "[x]" : obj.status === "in_progress" ? "[~]" : "[ ]";
      return `${mark} ${obj.content ?? ""}`;
    }
    return String(entry);
  }).join("\n");
}

function stripLineNumberPrefixes(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/^\s*\d+(?:[|:])\s?/, ""))
    .join("\n");
}

/**
 * 把 Read 工具的 XML 输出转成「路径 + 正文」，供 Webview 按文件类型渲染。
 */
function formatReadToolOutput(output: string): string | undefined {
  const pathMatch = output.match(/<path>([\s\S]*?)<\/path>/i);
  const contentMatch = output.match(/<content>([\s\S]*?)<\/content>/i);
  if (!contentMatch) {
    return undefined;
  }
  const path = pathMatch?.[1]?.trim();
  const content = stripLineNumberPrefixes(contentMatch[1]!.trim());
  return path ? `${path}\n\n${content}` : content;
}

function formatTodoOutputBody(output: string): string | undefined {
  try {
    const parsed = JSON.parse(output) as unknown;
    if (Array.isArray(parsed)) {
      return formatTodoItems(parsed);
    }
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>).todos)) {
      return formatTodoItems((parsed as Record<string, unknown>).todos as unknown[]);
    }
  } catch {
    // 非 JSON 时继续尝试其它格式。
  }
  if (/^\[[ x~]\]/m.test(output)) {
    return output;
  }
  const jsonBlock = output.match(/(\[[\s\S]*\])\s*$/);
  if (jsonBlock) {
    try {
      const items = JSON.parse(jsonBlock[1]!) as unknown;
      if (Array.isArray(items)) {
        return formatTodoItems(items);
      }
    } catch {
      // 忽略无效 JSON。
    }
  }
  return undefined;
}

/**
 * 判断 subtask.prompt 或 text 分片是否为技能模板，而非用户输入的参数。
 */
function looksLikeSkillTemplate(text: string): boolean {
  return shouldHideSkillBackedUserText(text);
}

/**
 * 从 subtask 分片推断斜杠命令名（部分技能不写 command 字段）。
 */
function resolveSlashCommandName(subtask: Extract<Part, { type: "subtask" }>): string | undefined {
  const explicit = subtask.command?.trim();
  if (explicit) {
    return explicit;
  }
  const description = subtask.description?.trim();
  if (description) {
    const taskMatch = description.match(/^task\s+([\w.-]+)$/i);
    if (taskMatch?.[1]) {
      return taskMatch[1];
    }
    if (/^[\w.-]+$/.test(description) && description.length <= 48) {
      return description;
    }
  }
  const agent = subtask.agent?.trim();
  if (agent && /^[\w.-]+$/.test(agent) && agent.length <= 48) {
    return agent;
  }
  return undefined;
}

function extractLeadingSlashCommand(text: string): string | undefined {
  const match = text.trim().match(/^\/([\w.-]+)(?:\s+|$)/);
  return match?.[1];
}

function readSlashFromTextMetadata(parts: Part[]): string | undefined {
  for (const part of parts) {
    if (part.type !== "text" || !part.metadata) {
      continue;
    }
    for (const key of ["command", "skill", "name"] as const) {
      const value = part.metadata[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim().replace(/^\//, "");
      }
    }
  }
  return undefined;
}

/**
 * 从 subtask 分片还原用户输入的斜杠命令展示文本。
 */
function formatSlashCommandFromSubtask(part: Extract<Part, { type: "subtask" }>): string | undefined {
  const commandName = resolveSlashCommandName(part);
  if (!commandName) {
    return undefined;
  }
  const base = `/${commandName}`;
  const candidate = part.prompt?.trim();
  if (!candidate || looksLikeSkillTemplate(candidate)) {
    return base;
  }
  return `${base} ${candidate}`;
}

interface UserMessageContent {
  text: string;
  slashDetail?: string;
  slashCommand?: string;
  slashArguments?: string;
}

function buildSlashUserContent(
  commandName: string,
  userArgs: string | undefined,
  slashDetail?: string
): UserMessageContent {
  const args = userArgs?.trim();
  const text = args ? `/${commandName} ${args}` : `/${commandName}`;
  return {
    text,
    slashCommand: commandName,
    ...(args ? { slashArguments: args } : {}),
    ...(slashDetail ? { slashDetail } : {})
  };
}

/**
 * 从 text 分片提取斜杠命令后的用户附加文字（技能 prompt 模板除外）。
 */
function extractSlashUserArguments(
  parts: Part[],
  commandName: string,
  subtask?: Extract<Part, { type: "subtask" }>
): string | undefined {
  for (const part of parts) {
    if (part.type !== "text") {
      continue;
    }
    const trimmed = part.text.trim();
    if (!trimmed) {
      continue;
    }
    if (shouldHideSkillBackedUserText(trimmed)) {
      const trailing = extractTrailingUserArgsFromSkillEnvelope(trimmed);
      if (trailing) {
        return trailing;
      }
      continue;
    }
    const slashMatch = trimmed.match(new RegExp(`^/${commandName}\\s+([\\s\\S]+)$`));
    if (slashMatch?.[1]?.trim()) {
      return slashMatch[1].trim();
    }
    if (!trimmed.startsWith("/")) {
      return trimmed;
    }
  }
  if (subtask?.command?.trim()) {
    const candidate = subtask.prompt?.trim();
    if (candidate && !looksLikeSkillTemplate(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

/**
 * 用户消息可能没有 text 分片（斜杠命令 / 技能走 subtask），需从其它分片还原气泡正文。
 */
function extractUserMessageContent(parts: Part[]): UserMessageContent {
  const subtask = parts.find((part): part is Extract<Part, { type: "subtask" }> => part.type === "subtask");
  if (subtask) {
    const commandName = resolveSlashCommandName(subtask);
    if (commandName) {
      const userArgs = extractSlashUserArguments(parts, commandName, subtask);
      return buildSlashUserContent(commandName, userArgs, subtask.description?.trim() || undefined);
    }
  }

  const joinedText = parts
    .filter((part): part is Extract<Part, { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
  const leading = joinedText ? extractLeadingSlashCommand(joinedText) : undefined;
  if (leading) {
    const argsMatch = joinedText.match(new RegExp(`^/${leading}\\s+([\\s\\S]+)$`));
    return buildSlashUserContent(leading, argsMatch?.[1]);
  }

  const metadataCommand = readSlashFromTextMetadata(parts);
  if (metadataCommand) {
    return buildSlashUserContent(metadataCommand, undefined);
  }

  // 普通文字消息（无 subtask、非斜杠）：直接展示全文，不按技能模板长度规则过滤。
  if (!subtask && !leading && !metadataCommand) {
    const plainVisible = parts
      .filter((part): part is Extract<Part, { type: "text" }> => part.type === "text" && !part.ignored)
      .map((part) => part.text)
      .join("");
    if (plainVisible.trim() && !looksLikeSkillTemplate(plainVisible)) {
      return { text: plainVisible };
    }
    const plainHidden = parts
      .filter((part): part is Extract<Part, { type: "text" }> => part.type === "text" && part.ignored)
      .map((part) => part.text)
      .join("");
    if (plainHidden.trim() && !looksLikeSkillTemplate(plainHidden)) {
      return { text: plainHidden };
    }
  }

  const visibleText = parts
    .filter((part): part is Extract<Part, { type: "text" }> => part.type === "text" && !part.ignored)
    .map((part) => part.text)
    .join("");
  if (visibleText.trim() && !looksLikeSkillTemplate(visibleText)) {
    return { text: visibleText };
  }
  const hiddenText = parts
    .filter((part): part is Extract<Part, { type: "text" }> => part.type === "text" && part.ignored)
    .map((part) => part.text)
    .join("");
  if (hiddenText.trim() && !looksLikeSkillTemplate(hiddenText)) {
    return { text: hiddenText };
  }

  const segments: string[] = [];
  let fallbackSubtask: Extract<Part, { type: "subtask" }> | undefined;
  for (const part of parts) {
    if (part.type === "subtask") {
      fallbackSubtask = part;
      const slash = formatSlashCommandFromSubtask(part);
      if (slash) {
        segments.push(slash);
      }
    } else if (part.type === "agent") {
      segments.push(`@${part.name}`);
    }
  }
  if (segments.length === 1 && fallbackSubtask) {
    const commandName = resolveSlashCommandName(fallbackSubtask);
    if (commandName) {
      return buildSlashUserContent(commandName, undefined, fallbackSubtask.description?.trim() || undefined);
    }
  }
  return { text: segments.join(" ") };
}

function extractMessageText(info: Message, parts: Part[]): UserMessageContent {
  if (info.role === "user") {
    return extractUserMessageContent(parts);
  }
  const text = parts
    .filter((part): part is Extract<Part, { type: "text" }> => part.type === "text" && !part.ignored)
    .map((part) => part.text)
    .join("");
  return { text };
}

export function mapOpenCodeMessage(entry: { info: Message; parts: Part[] }): ChatMessage | undefined {
  const { text, slashDetail, slashCommand, slashArguments } = extractMessageText(entry.info, entry.parts);
  const steps = mapMessageSteps(entry.parts);
  const error = entry.info.role === "assistant" && entry.info.error
    ? readOpenCodeErrorMessage(entry.info.error) ?? "OpenCode 返回了消息错误。"
    : undefined;
  if (entry.info.role === "assistant" && !text.trim() && !error && steps.length === 0) {
    return undefined;
  }
  if (entry.info.role === "user" && !text.trim() && !slashCommand) {
    return undefined;
  }
  if (entry.info.role === "user" && !slashCommand && shouldHideSkillBackedUserText(text)) {
    return undefined;
  }
  return {
    id: entry.info.id,
    sessionId: entry.info.sessionID,
    role: entry.info.role,
    text,
    createdAt: entry.info.time.created,
    ...(slashDetail ? { slashDetail } : {}),
    ...(slashCommand ? { slashCommand } : {}),
    ...(slashArguments ? { slashArguments } : {}),
    ...(steps.length > 0 ? { steps } : {}),
    ...(entry.info.role === "assistant" && !entry.info.time.completed ? { streaming: true } : {}),
    ...(error ? { error } : {})
  };
}

function mapMessageSteps(parts: Part[]): ChatMessageStep[] {
  return parts.flatMap((part): ChatMessageStep[] => {
    try {
      if (part.type === "reasoning") {
        return [{
          type: "reasoning",
          label: "Thinking",
          detail: part.text,
          status: part.time.end === undefined ? "running" : "completed"
        }];
      }
      if (part.type !== "tool") {
        return [];
      }
      const tool = part.tool;
      const input = (part.state.input ?? {}) as Record<string, unknown>;
      const inputSummary = formatToolInputSummary(tool, input);
      const outputRaw = part.state.status === "completed"
        ? part.state.output
        : part.state.status === "error"
          ? part.state.error
          : undefined;
      const title = "title" in part.state ? part.state.title : undefined;
      const detail = inputSummary ?? title;
      const formattedOutput = outputRaw ? formatToolOutputSummary(tool, outputRaw, inputSummary) : undefined;
      const output = formattedOutput !== undefined
        ? formattedOutput
        : outputRaw && !shouldSuppressToolOutput(tool, outputRaw)
          ? outputRaw
          : undefined;
      const inputDisplay = buildToolInputDisplay(tool, input);
      const step: ChatMessageStep = {
        type: "tool",
        label: tool,
        status: part.state.status
      };
      if (detail) step.detail = detail;
      if (inputDisplay) step.input = inputDisplay;
      if (output) step.output = output;
      return [step];
    } catch {
      return [];
    }
  });
}

/**
 * 按工具类型提取关键参数，生成人类可读的一行摘要。
 * 前面是已知工具类型的精确格式化，最后的通用回退确保所有工具都有可读摘要。
 */
function formatToolInputSummary(toolName: string, input: Record<string, unknown>): string | undefined {
  switch (toolName) {
    // ── 文件搜索 ──
    case "Glob":
    case "glob":
      return typeof input.pattern === "string"
        ? `"${input.pattern}"${typeof input.path === "string" ? ` in ${extractDirName(String(input.path))}` : ""}`
        : undefined;
    case "Grep":
    case "grep": {
      const pattern = typeof input.pattern === "string" ? `"${input.pattern}"` : "";
      const target = typeof input.path === "string" ? extractDirName(String(input.path)) : "";
      const filter = typeof input.glob === "string" ? ` [${input.glob}]` : "";
      return pattern ? `${pattern}${target ? ` in ${target}` : ""}${filter}` : undefined;
    }
    case "Read":
    case "read":
    case "Write":
    case "write":
    case "Edit":
    case "edit": {
      const filePath = (input.file_path ?? input.filePath ?? input.path) as string | undefined;
      if (typeof filePath !== "string") return undefined;
      const name = extractFileName(filePath);
      if (input.offset !== undefined) {
        const offset = Number(input.offset);
        const limit = input.limit !== undefined ? Number(input.limit) : undefined;
        return limit !== undefined ? `${name} L${offset + 1}-${offset + limit}` : `${name} L${offset + 1}+`;
      }
      return name;
    }
    case "NotebookEdit":
    case "notebookEdit":
    case "notebook_edit": {
      const nbPath = (input.notebook_path ?? input.notebookPath) as string | undefined;
      return typeof nbPath === "string" ? extractFileName(nbPath) : undefined;
    }
    // ── Shell ──
    case "Bash":
    case "PowerShell":
    case "shell": {
      const cmd = input.command;
      return typeof cmd === "string" ? truncateText(String(cmd).replace(/\r?\n/g, " "), 100) : undefined;
    }
    // ── Web ──
    case "WebFetch":
    case "WebSearch":
    case "webFetch":
    case "webSearch":
    case "web_fetch":
    case "web_search":
      return typeof input.url === "string" ? String(input.url)
        : typeof input.query === "string" ? `"${String(input.query)}"`
        : undefined;
    // ── 智能体 ──
    case "Agent":
    case "agent":
      return typeof input.description === "string" ? String(input.description) : undefined;
    // ── 技能 ──
    case "Skill":
    case "skill":
      return typeof input.skill === "string" ? `${String(input.skill)}${typeof input.args === "string" && input.args ? ` ${String(input.args)}` : ""}` : undefined;
    // ── 待办 ──
    case "TodoWrite":
    case "todoWrite":
    case "todo_write": {
      const todos = input.todos;
      if (Array.isArray(todos)) {
        const pending = todos.filter((t) => t && typeof t === "object" && (t as Record<string, unknown>).status === "pending").length;
        const inProgress = todos.filter((t) => t && typeof t === "object" && (t as Record<string, unknown>).status === "in_progress").length;
        const completed = todos.filter((t) => t && typeof t === "object" && (t as Record<string, unknown>).status === "completed").length;
        return `${pending} 待办 / ${inProgress} 进行中 / ${completed} 完成`;
      }
      return undefined;
    }
    // ── 提问 ──
    case "AskUserQuestion":
    case "askUserQuestion":
    case "ask_user_question": {
      const questions = input.questions;
      if (Array.isArray(questions) && questions.length > 0) {
        const first = questions[0];
        if (first && typeof first === "object" && typeof (first as Record<string, unknown>).question === "string") {
          return `"${truncateText((first as Record<string, unknown>).question as string, 60)}"${questions.length > 1 ? ` 等 ${questions.length} 个问题` : ""}`;
        }
      }
      return undefined;
    }
    default:
      return genericToolSummary(toolName, input);
  }
}

/**
 * 未知工具类型的通用回退：按常见字段优先级提取一行摘要。
 */
function genericToolSummary(toolName: string, input: Record<string, unknown>): string | undefined {
  // 优先查找常见参数字段
  const command = input.command;
  if (typeof command === "string" && command.trim()) {
    return truncateText(command.replace(/\r?\n/g, " "), 100);
  }
  const filePath = input.file_path ?? input.filePath;
  if (typeof filePath === "string" && filePath.trim()) {
    return extractFileName(filePath);
  }
  const url = input.url;
  if (typeof url === "string" && url.trim()) {
    return truncateText(url, 80);
  }
  const pattern = input.pattern;
  if (typeof pattern === "string" && pattern.trim()) {
    return `"${truncateText(pattern, 60)}"`;
  }
  const query = input.query;
  if (typeof query === "string" && query.trim()) {
    return `"${truncateText(query, 60)}"`;
  }
  const description = input.description;
  if (typeof description === "string" && description.trim()) {
    return truncateText(description, 80);
  }
  // 最后兜底：找输入里第一个有意义的字符串值
  for (const key of Object.keys(input)) {
    const value = input[key];
    if (typeof value === "string" && value.trim() && !["id", "sessionID", "messageID", "model"].includes(key)) {
      return truncateText(value, 60);
    }
  }
  return undefined;
}

/**
 * 按工具类型把输入参数铺成可读的「内容」文本，而不是结构化 JSON 或占位符。
 * 命令、文件代码、pattern 等直接展示原文，符合 Claude Code 式的工具展开。
 */
function buildToolInputDisplay(toolName: string, input: Record<string, unknown>): string | undefined {
  const filePath = pickFilePath(input);
  const has = (key: string): boolean => input[key] !== undefined && input[key] !== null && input[key] !== "";
  const kind = normalizeToolKind(toolName);
  switch (kind) {
    case "bash":
    case "powershell":
    case "shell": {
      const cmd = input.command;
      return typeof cmd === "string" ? cmd : undefined;
    }
    case "read": {
      if (!filePath) return undefined;
      const offset = input.offset;
      const limit = input.limit;
      if (offset !== undefined) {
        const start = Number(offset) + 1;
        return limit !== undefined ? `${filePath}  ·  L${start}-${start + Number(limit) - 1}` : `${filePath}  ·  L${start}+`;
      }
      return filePath;
    }
    case "write": {
      const content = input.content;
      if (typeof content === "string") {
        return `${filePath ?? "新文件"}\n\n${content}`.trim();
      }
      return filePath;
    }
    case "edit": {
      const parts: string[] = [];
      if (filePath) parts.push(`编辑 ${filePath}`);
      const oldStr = pickString(input, "old_string", "oldString", "oldText");
      const newStr = pickString(input, "new_string", "newString", "newText", "content", "replace", "insert", "text", "patch");
      if (oldStr) parts.push(`--- 旧 ---\n${oldStr}`);
      if (newStr) parts.push(`--- 新 ---\n${newStr}`);
      if (parts.length === 0) return undefined;
      if (parts.length === 1 && filePath) {
        const generic = genericToolContent(input);
        return generic ? `${parts[0]}\n\n${generic}` : parts[0];
      }
      return parts.join("\n\n");
    }
    case "notebookedit": {
      const nb = (input.notebook_path ?? input.notebookPath ?? input.path) as string | undefined;
      return typeof nb === "string" ? nb : undefined;
    }
    case "glob": {
      if (typeof input.pattern !== "string") return undefined;
      return `"${input.pattern}"${typeof input.path === "string" ? ` in ${extractDirName(String(input.path))}` : ""}`;
    }
    case "grep": {
      if (typeof input.pattern !== "string") return undefined;
      const target = typeof input.path === "string" ? ` in ${extractDirName(String(input.path))}` : "";
      const filter = typeof input.glob === "string" ? `  [${input.glob}]` : "";
      return `"${input.pattern}"${target}${filter}`;
    }
    case "webfetch":
    case "websearch": {
      if (typeof input.url === "string") return input.url;
      if (typeof input.prompt === "string") return input.prompt;
      if (typeof input.query === "string") return `"${input.query}"`;
      return undefined;
    }
    case "agent": {
      const description = typeof input.description === "string" ? input.description : undefined;
      const prompt = typeof input.prompt === "string" ? input.prompt : undefined;
      return description ?? prompt;
    }
    case "skill": {
      const skill = typeof input.skill === "string" ? input.skill : undefined;
      const args = typeof input.args === "string" ? input.args : undefined;
      return [skill, args].filter(Boolean).join("  ") || undefined;
    }
    case "todowrite":
    case "towrite": {
      const todos = input.todos;
      if (!Array.isArray(todos)) return undefined;
      return formatTodoItems(todos);
    }
    case "askuserquestion": {
      const questions = input.questions;
      if (!Array.isArray(questions)) return undefined;
      return questions.map((q) => {
        if (q && typeof q === "object") {
          const obj = q as Record<string, unknown>;
          const header = typeof obj.header === "string" ? obj.header : "";
          const question = typeof obj.question === "string" ? obj.question : "";
          const options = Array.isArray(obj.options) ? obj.options.map((o: unknown) => {
            const opt = o as Record<string, unknown>;
            return `  - ${opt?.label ?? opt}`;
          }).join("\n") : "";
          return [header || question, options].filter(Boolean).join("\n");
        }
        return String(q);
      }).join("\n\n");
    }
    default:
      return genericToolContent(input);
  }
}

/**
 * 未知工具的回退：把每个字段的值直接展示，长文本成块、标量成行，不再 JSON 化或占位符。
 */
function genericToolContent(input: Record<string, unknown>): string | undefined {
  const keys = Object.keys(input).filter((key) => !["id", "sessionID", "messageID", "callID", "model"].includes(key));
  if (keys.length === 0) return undefined;
  const lines: string[] = [];
  for (const key of keys) {
    const value = input[key];
    if (value === undefined || value === null || value === "" || value === false) continue;
    if (typeof value === "string") {
      lines.push(value.includes("\n") || value.length > 60 ? `${key}:\n${value}` : `${key}: ${value}`);
    } else if (Array.isArray(value)) {
      if (key === "todos") {
        lines.push(formatTodoItems(value));
        continue;
      }
      lines.push(`${key}: [${value.length} 项]`);
    } else if (typeof value === "object") {
      try { lines.push(`${key}:\n${JSON.stringify(value, null, 2)}`); } catch { /* 忽略不可序列化对象 */ }
    } else {
      lines.push(`${key}: ${String(value)}`);
    }
  }
  return lines.length > 0 ? lines.join("\n") : undefined;
}

function pickFilePath(input: Record<string, unknown>): string | undefined {
  const candidate = input.file_path ?? input.filePath ?? input.path;
  return typeof candidate === "string" ? candidate : undefined;
}

function pickString(input: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return undefined;
}

/**
 * Write/Edit 工具常返回无信息量的成功短句，展开时应隐藏 output、只展示 input 内容。
 */
function shouldSuppressToolOutput(toolName: string, output: string): boolean {
  const trimmed = output.trim();
  if (!trimmed || trimmed.includes("\n")) {
    return false;
  }
  const kind = normalizeToolKind(toolName);
  if (kind !== "edit" && kind !== "write") {
    return false;
  }
  return /^(?:edit|write|file|patch|updated|wrote|saved|applied)\b/i.test(trimmed)
    || /successfully\.?$/i.test(trimmed)
    || /^(?:已成功|已写入|已更新|已保存)/.test(trimmed);
}

/**
 * 为列表类工具的输出追加计数摘要，避免用户必须数行。
 * 长输出（>50 行）默认截断头部展示，完整内容保留在 pre 区域可滚动查看。
 */
function formatToolOutputSummary(toolName: string, output: string, _inputSummary?: string): string | undefined {
  const trimmed = output.trim();
  if (!trimmed) return undefined;
  const kind = normalizeToolKind(toolName);
  if (kind === "read") {
    const parsed = formatReadToolOutput(trimmed);
    if (parsed) return parsed;
  }
  if (kind === "todowrite" || kind === "towrite") {
    const parsed = formatTodoOutputBody(trimmed);
    if (parsed) return parsed;
  }
  if (kind === "edit" || kind === "write") {
    if (shouldSuppressToolOutput(toolName, trimmed)) return undefined;
  }
  switch (kind) {
    case "glob":
    case "grep": {
      const lines = trimmed.split("\n").filter((line) => line.trim().length > 0);
      const count = lines.length;
      const suffix = count === 0 ? "无匹配结果" : `${count} 条结果`;
      return `${suffix}\n${trimmed}`;
    }
    case "bash":
    case "powershell":
    case "shell": {
      const lines = trimmed.split("\n").length;
      if (lines > 50) {
        const head = trimmed.split("\n").slice(0, 30).join("\n");
        return `${head}\n…（共 ${lines} 行，已截断）`;
      }
      return trimmed;
    }
    default:
      return trimmed;
  }
}

function extractFileName(filePath: string): string {
  return filePath.replace(/\\/g, "/").split("/").filter(Boolean).at(-1) ?? filePath;
}

function extractDirName(filePath: string): string {
  const parts = filePath.replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.length <= 1) return filePath;
  return parts.at(-1) ?? filePath;
}

function truncateText(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + "…" : text;
}

export function readOpenCodeErrorMessage(error: unknown): string | undefined {
  if (typeof error !== "object" || !error) {
    return undefined;
  }
  if ("data" in error && typeof error.data === "object" && error.data && "message" in error.data) {
    return String(error.data.message);
  }
  if ("message" in error && typeof error.message === "string") {
    return error.message;
  }
  return undefined;
}
