import { Inject, Injectable, Optional } from '@nestjs/common';

export const GRACE_MS = 5_000;

/** Injection token for the grace period, so tests can shorten it. */
export const PRESENCE_GRACE_MS = Symbol('PRESENCE_GRACE_MS');

/**
 * Who is online, kept in memory (fine for a single api instance). A user is online while at
 * least one socket is open (all tabs count), and a reconnect within the grace period, such as
 * a page refresh, never shows up as offline.
 */
@Injectable()
export class PresenceService {
  private readonly sockets = new Map<string, number>(); // userId → open sockets
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(@Optional() @Inject(PRESENCE_GRACE_MS) private readonly graceMs: number = GRACE_MS) {}

  /** @returns true if the user just came online (nobody saw them as online before) */
  connect(userId: string): boolean {
    const pending = this.timers.get(userId);
    if (pending) {
      clearTimeout(pending);
      this.timers.delete(userId);
    }
    const wasOnline = this.sockets.has(userId);
    this.sockets.set(userId, (this.sockets.get(userId) ?? 0) + 1);
    return !wasOnline;
  }

  /** `onOffline` runs only if the user is still gone after the grace period. */
  disconnect(userId: string, onOffline: () => void): void {
    if (!this.sockets.has(userId)) return;
    const left = this.sockets.get(userId)! - 1; // present: checked above
    this.sockets.set(userId, left);
    if (left > 0) return;

    this.timers.set(
      userId,
      setTimeout(() => {
        this.timers.delete(userId);
        this.sockets.delete(userId);
        onOffline();
      }, this.graceMs),
    );
  }

  isOnline(userId: string): boolean {
    return this.sockets.has(userId);
  }
}
