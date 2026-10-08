import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GRACE_MS, PresenceService } from './presence.service';

describe('PresenceService', () => {
  let presence: PresenceService;
  beforeEach(() => {
    vi.useFakeTimers();
    presence = new PresenceService();
  });
  afterEach(() => vi.useRealTimers());

  it('reports "just came online" only for the first socket', () => {
    expect(presence.connect('u1')).toBe(true);
    expect(presence.connect('u1')).toBe(false); // second tab
    expect(presence.isOnline('u1')).toBe(true);
    expect(presence.isOnline('u2')).toBe(false);
  });

  it('stays online while at least one socket is open', () => {
    const onOffline = vi.fn<() => void>();
    presence.connect('u1');
    presence.connect('u1');
    presence.disconnect('u1', onOffline);
    vi.advanceTimersByTime(GRACE_MS * 2);
    expect(onOffline).not.toHaveBeenCalled();
    expect(presence.isOnline('u1')).toBe(true);
  });

  it('keeps the user online during the grace period, then goes offline exactly once', () => {
    const onOffline = vi.fn<() => void>();
    presence.connect('u1');
    presence.disconnect('u1', onOffline);

    vi.advanceTimersByTime(GRACE_MS - 1);
    expect(presence.isOnline('u1')).toBe(true);
    expect(onOffline).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onOffline).toHaveBeenCalledTimes(1);
    expect(presence.isOnline('u1')).toBe(false);
    vi.advanceTimersByTime(GRACE_MS * 5);
    expect(onOffline).toHaveBeenCalledTimes(1);
  });

  it('a reconnect inside the grace period (page refresh) cancels going offline', () => {
    const onOffline = vi.fn<() => void>();
    presence.connect('u1');
    presence.disconnect('u1', onOffline);
    vi.advanceTimersByTime(GRACE_MS / 2);

    expect(presence.connect('u1')).toBe(false); // never looked offline to anyone
    vi.advanceTimersByTime(GRACE_MS * 2);
    expect(onOffline).not.toHaveBeenCalled();
    expect(presence.isOnline('u1')).toBe(true);
  });

  it('can come online again after really going offline', () => {
    presence.connect('u1');
    presence.disconnect('u1', () => {});
    vi.advanceTimersByTime(GRACE_MS);
    expect(presence.connect('u1')).toBe(true);
  });

  it('uses the grace period it is given, so tests and deployments can shorten it', () => {
    const quick = new PresenceService(100);
    const onOffline = vi.fn<() => void>();
    quick.connect('u1');
    quick.disconnect('u1', onOffline);
    vi.advanceTimersByTime(99);
    expect(onOffline).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onOffline).toHaveBeenCalledTimes(1);
  });

  it('ignores a disconnect for a user it has never seen', () => {
    const onOffline = vi.fn<() => void>();
    expect(() => presence.disconnect('ghost', onOffline)).not.toThrow();
    vi.advanceTimersByTime(GRACE_MS * 2);
    expect(onOffline).not.toHaveBeenCalled();
    expect(presence.isOnline('ghost')).toBe(false);
  });
});
