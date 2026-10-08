type GuardedSocket = {
  data: { exp: number }; // when the token expires, in seconds since 1970
  disconnect(close?: boolean): void;
};

/**
 * A Socket.IO packet middleware that runs before every incoming event of one socket:
 * - a token that expired while the socket was open ends the connection (HTTP checks the token on
 *   every request, a socket would otherwise stay authenticated forever);
 * - more than `max` events per `windowMs` are dropped before they reach a handler. The sender
 *   gets no acknowledgement for them, which its ack timeout turns into "try again".
 */
export function createPacketGuard(
  socket: GuardedSocket,
  options: { max?: number; windowMs?: number; now?: () => number } = {},
) {
  const { max = 30, windowMs = 10_000, now = Date.now } = options;
  let windowStart = now();
  let count = 0;

  return (_packet: unknown[], next: (error?: Error) => void) => {
    const current = now();
    if (current >= socket.data.exp * 1000) {
      socket.disconnect(true);
      return;
    }
    if (current - windowStart > windowMs) {
      windowStart = current;
      count = 0;
    }
    count += 1;
    if (count > max) return next(new Error('Rate limit exceeded'));
    next();
  };
}
