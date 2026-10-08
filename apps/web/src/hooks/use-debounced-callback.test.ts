import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDebouncedCallback } from './use-debounced-callback';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useDebouncedCallback', () => {
  it('runs the callback once, after calls stop for the delay', () => {
    const callback = vi.fn<() => void>();
    const { result } = renderHook(() => useDebouncedCallback(callback, 300));
    result.current();
    vi.advanceTimersByTime(200);
    result.current();
    vi.advanceTimersByTime(299);
    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('always runs the latest version of the callback, and the returned function stays the same', () => {
    const first = vi.fn<() => void>();
    const second = vi.fn<() => void>();
    const { result, rerender } = renderHook(({ cb }) => useDebouncedCallback(cb, 100), {
      initialProps: { cb: first },
    });
    const trigger = result.current;
    trigger();
    rerender({ cb: second });
    expect(result.current).toBe(trigger);
    vi.advanceTimersByTime(100);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('does not fire after the component is gone', () => {
    const callback = vi.fn<() => void>();
    const { result, unmount } = renderHook(() => useDebouncedCallback(callback, 100));
    result.current();
    unmount();
    vi.advanceTimersByTime(500);
    expect(callback).not.toHaveBeenCalled();
  });
});
