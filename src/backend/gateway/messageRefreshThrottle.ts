export interface MessageRefreshThrottleState {
  lastEmit: number;
  trailingTimer?: ReturnType<typeof setTimeout>;
}

const NEVER_EMITTED = Number.NEGATIVE_INFINITY;

/**
 * 以节流方式调度消息刷新，避免流式更新被防抖一直推迟到结束。
 */
export function scheduleThrottledMessageRefresh(
  states: Map<string, MessageRefreshThrottleState>,
  sessionId: string,
  onRefresh: () => void,
  throttleMs = 24,
  now = Date.now(),
  schedule: typeof setTimeout = setTimeout,
  getNow: () => number = Date.now
): void {
  let state = states.get(sessionId);
  if (!state) {
    state = { lastEmit: NEVER_EMITTED };
    states.set(sessionId, state);
  }

  const emit = (emittedAt: number): void => {
    state!.lastEmit = emittedAt;
    onRefresh();
  };

  const elapsed = now - state.lastEmit;
  if (!Number.isFinite(state.lastEmit) || elapsed >= throttleMs) {
    if (state.trailingTimer) {
      clearTimeout(state.trailingTimer);
      delete state.trailingTimer;
    }
    emit(now);
    return;
  }

  if (!state.trailingTimer) {
    state.trailingTimer = schedule(() => {
      delete state!.trailingTimer;
      emit(getNow());
    }, throttleMs - elapsed);
  }
}

/**
 * 清理指定会话的节流状态。
 */
export function clearMessageRefreshThrottle(
  states: Map<string, MessageRefreshThrottleState>,
  sessionId?: string
): void {
  if (sessionId) {
    const state = states.get(sessionId);
    if (state?.trailingTimer) {
      clearTimeout(state.trailingTimer);
    }
    states.delete(sessionId);
    return;
  }

  for (const state of states.values()) {
    if (state.trailingTimer) {
      clearTimeout(state.trailingTimer);
    }
  }
  states.clear();
}
