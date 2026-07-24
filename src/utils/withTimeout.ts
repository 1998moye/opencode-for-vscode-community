/**
 * 在指定时间内完成 Promise，超时后拒绝。
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      })
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

/**
 * 忽略迟到的 Promise 结果，并在完成后执行清理。
 */
export function discardLatePromise<T>(promise: Promise<T>, dispose: (value: T) => void | Promise<void>): void {
  promise
    .then((value) => dispose(value))
    .catch(() => undefined);
}
