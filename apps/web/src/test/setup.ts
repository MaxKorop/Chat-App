import '@testing-library/jest-dom/vitest';
import type { InternalAxiosRequestConfig } from 'axios';

import { FakeIntersectionObserver } from './fake-intersection-observer';

// A test must never reach a real server: jsdom's address is http://localhost:3000, which is where the
// API runs in development, so a forgotten mock would otherwise talk to it (and a 401 logs the user out).
// A test that needs REST answers replaces this adapter or mocks the feature's `api` module.
// (Imported here, not at the top: a test file's own `vi.mock` must be registered before the app's modules load.)
beforeEach(async () => {
  const { api } = await import('@/lib/api-client');
  api.defaults.adapter = (config: InternalAxiosRequestConfig) =>
    Promise.reject(new Error(`Unexpected request in a test: ${config.method} ${config.url}`));
});

// jsdom has no IntersectionObserver. This one lets a test decide what is visible.
vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
beforeEach(() => {
  FakeIntersectionObserver.instances.length = 0;
});

// Image previews use object URLs, which jsdom does not implement.
URL.createObjectURL ??= () => 'blob:preview';
URL.revokeObjectURL ??= () => undefined;

// More browser APIs that jsdom does not have but Radix UI and sonner use.
class ResizeObserverStub {
  observe = vi.fn<() => void>();
  unobserve = vi.fn<() => void>();
  disconnect = vi.fn<() => void>();
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn<() => void>(),
    removeEventListener: vi.fn<() => void>(),
    addListener: vi.fn<() => void>(),
    removeListener: vi.fn<() => void>(),
    dispatchEvent: vi.fn<() => boolean>(),
  }),
});

// Radix uses pointer capture and scrolling when opening menus and selects.
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.setPointerCapture ??= () => undefined;
Element.prototype.releasePointerCapture ??= () => undefined;
Element.prototype.scrollIntoView ??= () => undefined;

// Nothing a test stores in the browser may leak into the next test.
afterEach(() => localStorage.clear());
