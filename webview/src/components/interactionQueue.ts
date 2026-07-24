import type { PermissionRequest, QuestionRequest } from "../../../src/runtime/contracts";

/**
 * 交互请求在状态中的通用形状（授权、提问等）。
 */
type QueuedRequest = { id: string; sessionId: string };

/**
 * 当前会话优先，其余按到达顺序排队，每次只展示队首一项。
 */
export function selectQueuedRequest<T extends QueuedRequest>(
  requests: T[],
  activeSessionId?: string
): { request: T; index: number; total: number } | undefined {
  if (requests.length === 0) {
    return undefined;
  }
  const ordered = orderByActiveSession(requests, activeSessionId);
  return { request: ordered[0]!, index: 1, total: requests.length };
}

function orderByActiveSession<T extends QueuedRequest>(requests: T[], activeSessionId?: string): T[] {
  if (!activeSessionId) {
    return requests;
  }
  const active = requests.filter((request) => request.sessionId === activeSessionId);
  if (active.length === 0) {
    return requests;
  }
  const others = requests.filter((request) => request.sessionId !== activeSessionId);
  return [...active, ...others];
}

export function selectQueuedPermission(
  permissions: PermissionRequest[],
  activeSessionId?: string
): { request: PermissionRequest; index: number; total: number } | undefined {
  return selectQueuedRequest(permissions, activeSessionId);
}

export function selectQueuedQuestion(
  questions: QuestionRequest[],
  activeSessionId?: string
): { request: QuestionRequest; index: number; total: number } | undefined {
  return selectQueuedRequest(questions, activeSessionId);
}
