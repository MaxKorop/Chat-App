/**
 * Checks a RUNNING api over real HTTP and WebSocket, using the demo users from `pnpm db:seed`.
 *   API_URL=http://localhost:3000 pnpm --filter @chat/api exec tsx scripts/ws-smoke.ts
 * Exits with a non-zero code if anything is wrong, so it can also gate a deployment.
 */
import { io, type Socket } from 'socket.io-client';

const base = process.env.API_URL ?? 'http://localhost:3000';
let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) failures += 1;
  console.warn(`${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `  ${detail}`}`);
};

async function logIn(username: string): Promise<string> {
  const res = await fetch(`${base}/api/auth/log-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password: 'password123' }),
  });
  if (!res.ok)
    throw new Error(`log-in as ${username} failed (${res.status}); did you run \`pnpm db:seed\`?`);
  return ((await res.json()) as { accessToken: string }).accessToken;
}

const open = (token?: string) =>
  new Promise<Socket>((resolve, reject) => {
    const socket = io(base, {
      transports: ['websocket'],
      auth: { token },
      reconnection: false,
      forceNew: true,
    });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });

const hears = (socket: Socket, event: string, ms = 1_500) =>
  new Promise<unknown>((resolve) => {
    const timer = setTimeout(() => resolve(undefined), ms);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

async function main() {
  const [alice, bob, carol] = await Promise.all(['alice', 'bob', 'carol'].map(logIn));

  await open().then(
    () => check('a socket without a token is refused', false),
    (error: Error) =>
      check('a socket without a token is refused', error.message === 'Unauthorized', error.message),
  );

  const chats = (await (
    await fetch(`${base}/api/chats`, { headers: { authorization: `Bearer ${alice}` } })
  ).json()) as {
    id: string;
    type: string;
  }[];
  const dm = chats.find((chat) => chat.type === 'DIRECT');
  if (!dm) throw new Error('alice has no direct chat; run `pnpm db:seed`');

  const [forAlice, forBob, forCarol] = await Promise.all([open(alice), open(bob), open(carol)]);
  try {
    const bobHears = hears(forBob, 'message:created');
    const carolHears = hears(forCarol, 'message:created', 600);
    const input = {
      chatId: dm.id,
      clientId: crypto.randomUUID(),
      content: 'hello from the smoke test',
      attachmentIds: [],
    };

    const ack = (await forAlice.emitWithAck('message:send', input)) as {
      ok: boolean;
      data?: { id: string; seq: number };
    };
    check('alice’s message is acknowledged', ack.ok, JSON.stringify(ack));
    check(
      'bob receives it in real time',
      ((await bobHears) as { id?: string } | undefined)?.id === ack.data?.id,
    );
    check('carol, who is not in that chat, receives nothing', (await carolHears) === undefined);

    const retry = (await forAlice.emitWithAck('message:send', input)) as typeof ack;
    check(
      'a retry with the same clientId returns the same message',
      retry.ok && retry.data?.id === ack.data?.id,
    );

    const forbidden = (await forCarol.emitWithAck('message:send', {
      ...input,
      clientId: crypto.randomUUID(),
    })) as { ok: boolean };
    check('carol cannot send into the chat', forbidden.ok === false);

    if (ack.data) await forAlice.emitWithAck('message:delete', { messageId: ack.data.id }); // leave the demo data as it was
  } finally {
    for (const socket of [forAlice, forBob, forCarol]) socket.disconnect();
  }

  console.warn(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
  process.exitCode = failures ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
