import { afterEach, describe, expect, it, vi } from "vitest";
import { clearMessageRefreshThrottle, scheduleThrottledMessageRefresh } from "../src/backend/gateway/messageRefreshThrottle.js";

describe("消息刷新节流", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("首次事件立即刷新，连续事件不会推迟到流式结束", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const states = new Map();
    let refreshes = 0;
    const refresh = (): void => {
      refreshes += 1;
    };

    scheduleThrottledMessageRefresh(states, "session-1", refresh, 50, 0);
    expect(refreshes).toBe(1);

    scheduleThrottledMessageRefresh(states, "session-1", refresh, 50, 10);
    scheduleThrottledMessageRefresh(states, "session-1", refresh, 50, 20);
    expect(refreshes).toBe(1);

    vi.setSystemTime(50);
    vi.advanceTimersByTime(50);
    expect(refreshes).toBeGreaterThanOrEqual(2);
  });

  it("可清理指定会话的尾随定时器", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const states = new Map();
    const refreshes: string[] = [];

    scheduleThrottledMessageRefresh(states, "session-1", () => refreshes.push("a"), 50, 0);
    scheduleThrottledMessageRefresh(states, "session-1", () => refreshes.push("b"), 50, 10);

    clearMessageRefreshThrottle(states, "session-1");
    vi.setSystemTime(100);
    vi.advanceTimersByTime(100);

    expect(refreshes).toEqual(["a"]);
  });
});
