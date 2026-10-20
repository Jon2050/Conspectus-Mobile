import { describe, expect, it, vi } from 'vitest';
import { withRequestDeadline } from './requestDeadline';

describe('request deadline', () => {
  it('does not start an already cancelled operation', async () => {
    const controller = new AbortController();
    controller.abort();
    const operation = vi.fn(async () => 'unused');
    await expect(withRequestDeadline(operation, 1000, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(operation).not.toHaveBeenCalled();
  });
  it('aborts the actual transport and rejects even if it ignores abort', async () => {
    vi.useFakeTimers();
    try {
      let signal: AbortSignal | undefined;
      const request = withRequestDeadline(async (s) => {
        signal = s;
        return new Promise<never>(() => {});
      }, 100);
      const assertion = expect(request).rejects.toMatchObject({ name: 'TimeoutError' });
      await vi.advanceTimersByTimeAsync(100);
      await assertion;
      expect(signal?.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
  it('cancels on context replacement and removes timers', async () => {
    const context = new AbortController();
    let requestSignal: AbortSignal | undefined;
    const pending = withRequestDeadline(
      async (s) => {
        requestSignal = s;
        return new Promise<never>(() => {});
      },
      10000,
      context.signal,
    );
    context.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(requestSignal?.aborted).toBe(true);
  });
});
