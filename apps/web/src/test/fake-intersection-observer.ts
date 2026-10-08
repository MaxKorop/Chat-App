import { vi } from 'vitest';

/**
 * An IntersectionObserver that tests control. jsdom has no layout, so nothing is ever "visible" on
 * its own: a test calls `show(element)` / `hide(element)` to say what the user can see.
 */
export class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  readonly elements = new Set<Element>();

  constructor(
    private readonly callback: IntersectionObserverCallback,
    readonly options?: IntersectionObserverInit,
  ) {
    FakeIntersectionObserver.instances.push(this);
  }

  observe = vi.fn<(element: Element) => void>((element) => void this.elements.add(element));
  unobserve = vi.fn<(element: Element) => void>((element) => void this.elements.delete(element));
  disconnect = vi.fn<() => void>(() => this.elements.clear());
  takeRecords = vi.fn<() => IntersectionObserverEntry[]>(() => []);

  show(...elements: Element[]) {
    this.notify(elements, true);
  }
  hide(...elements: Element[]) {
    this.notify(elements, false);
  }
  private notify(elements: Element[], isIntersecting: boolean) {
    const entries = elements.map((target) => ({
      target,
      isIntersecting,
      intersectionRatio: isIntersecting ? 1 : 0,
    }));
    this.callback(entries as IntersectionObserverEntry[], this as unknown as IntersectionObserver);
  }

  /** every observer currently watching `element` */
  static watching(element: Element) {
    return FakeIntersectionObserver.instances.filter((observer) => observer.elements.has(element));
  }
  /** make the element visible to all observers watching it */
  static show(...elements: Element[]) {
    for (const element of elements)
      for (const observer of FakeIntersectionObserver.watching(element)) observer.show(element);
  }
  static hide(...elements: Element[]) {
    for (const element of elements)
      for (const observer of FakeIntersectionObserver.watching(element)) observer.hide(element);
  }
}
