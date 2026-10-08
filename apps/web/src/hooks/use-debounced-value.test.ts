import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDebouncedValue } from './use-debounced-value';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useDebouncedValue', () => {
  it('starts with the value it is given', () => {
    const { result } = renderHook(() => useDebouncedValue('ali', 300));
    expect(result.current).toBe('ali');
  });

  it('follows a change only after the delay, so typing does not search on every key', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
      initialProps: { value: 'a' },
    });
    rerender({ value: 'al' });
    rerender({ value: 'ali' });
    act(() => void vi.advanceTimersByTime(299));
    expect(result.current).toBe('a');
    act(() => void vi.advanceTimersByTime(1));
    expect(result.current).toBe('ali');
  });

  it('restarts the wait on every change', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
      initialProps: { value: 'a' },
    });
    rerender({ value: 'al' });
    act(() => void vi.advanceTimersByTime(200));
    rerender({ value: 'ali' });
    act(() => void vi.advanceTimersByTime(200));
    expect(result.current).toBe('a'); // 400 ms since the first change, but only 200 since the last
    act(() => void vi.advanceTimersByTime(100));
    expect(result.current).toBe('ali');
  });
});
