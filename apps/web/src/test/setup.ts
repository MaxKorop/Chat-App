import '@testing-library/jest-dom/vitest';

// jsdom has no IntersectionObserver. Tests don't depend on visibility, so a no-op stub is enough.
class IntersectionObserverStub {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = vi.fn(() => []);
}
vi.stubGlobal('IntersectionObserver', IntersectionObserverStub);
