# Testing

Every change in this repository starts with a failing test (see "Test-first workflow" in [development.md](./development.md)). This page describes what is tested, how, and what the numbers mean.

## The layers

| Layer                 | Where                              | Runner                        | Needs                               | What it proves                                                                                    |
| --------------------- | ---------------------------------- | ----------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------- |
| Repository rules      | `tooling/*.test.mjs`               | `node --test`                 | nothing (Docker for compose checks) | the structure, tooling and documentation stay as designed                                         |
| Shared contract       | `packages/shared/src/**/*.test.ts` | Vitest                        | nothing                             | the zod schemas, the socket types and the pure helpers                                            |
| API unit tests        | `apps/api/src/**/*.spec.ts`        | Vitest, project `unit`        | nothing                             | logic that needs no database: encryption, key ring, guards, packet guard, the gateway's decisions |
| API integration tests | `apps/api/src/**/*.int.spec.ts`    | Vitest, project `integration` | Postgres and S3 (`pnpm infra:up`)   | the whole application over real HTTP and real WebSockets                                          |
| Web tests             | `apps/web/src/**/*.test.tsx`       | Vitest, jsdom                 | nothing                             | the legacy UI components (rewritten in Step 14)                                                   |

Nothing in the data layer is mocked. Integration tests talk to a real PostgreSQL (database `chat_test`, created and migrated automatically) and a real S3-compatible store (SeaweedFS, bucket `chat-attachments-test`, emptied before each test).

## Running the tests

| Command                              | Runs                                                                              |
| ------------------------------------ | --------------------------------------------------------------------------------- |
| `pnpm test`                          | builds `@chat/shared`, then the repository, shared, API unit and web tests        |
| `pnpm test:int`                      | the API integration tests                                                         |
| `pnpm test:cov`                      | all API tests (unit + integration) with a coverage report and enforced thresholds |
| `pnpm --filter @chat/api test:watch` | API unit tests while developing                                                   |

## Coverage

`pnpm test:cov` measures all API source files with both test projects together and writes a report to `apps/api/coverage/` (open `index.html`; the folder is not committed).

| Measure    | Value  | Threshold (the run fails below it) |
| ---------- | ------ | ---------------------------------- |
| Statements | 99.3 % | 98 %                               |
| Branches   | 97.0 % | 95 %                               |
| Functions  | 100 %  | 99 %                               |
| Lines      | 99.8 % | 98 %                               |

The thresholds sit slightly under the measured values: they catch real regressions without failing on a one-line change. Excluded from the measurement: the test helpers, Prisma's generated client, and `main.ts` (which only starts the server; the smoke test below covers it).

A high number is not the goal. The first measurement showed 97.7 % with a gap that mattered: almost all of it was **error handling** (what happens when the database or S3 fails). Those paths now have tests, which is the useful part of the work.

## How the integration tests work

`createTestApp()` (in `apps/api/src/test/app.ts`) starts the real `AppModule`, empties the database and the test bucket, and returns helpers:

- `t.http()` is a supertest client for REST calls; `t.auth(user)` returns an `Authorization` header signed like a real log-in.
- `t.listen()` starts a real server on a free port, which WebSocket tests need.
- `createUser`, `createGroup`, `createDirectChat`, `addMessage`, `befriend` create fixtures directly with Prisma.
- `TestClients` (in `src/test/realtime.ts`) opens real Socket.IO clients; `nextEvent` and `expectNoEvent` wait for, or prove the absence of, a server event.

Techniques used throughout:

- **Failure injection.** `vi.spyOn(prisma.user, 'create').mockRejectedValue(...)` makes one dependency fail on purpose, to check that an error is reported without leaking details and that nothing is half-done.
- **Concurrency.** Twenty senders at once must get distinct, gap-free numbers; two identical sends at once must produce one message; two people starting the same direct chat must end up in one chat.
- **Fake timers** for time-based rules in unit tests (the presence grace period, the packet guard's window).
- **Security as tests.** A forged sender is ignored; a token in the URL is refused; an SVG upload is refused; a tampered signed URL returns 403; a database error never reaches the response body.

## Rules learned the hard way

A flaky test is a bug report: both times this suite misbehaved intermittently, it pointed at something real.

1. **Register a listener before the thing that triggers the event, and before connecting if the event can arrive immediately.** One test failed intermittently because the server announced a user's presence _to that same user_; whether the stray packet arrived before or after the test started listening was a race. the fix was in the server (a user is no longer told about themselves) and a deterministic test now guards it.
2. **Never build a supertest request while another one is still being built.** `t.http().get(...).set(await logIn(...))` makes the inner request close the outer one's server. Compute the header first.
3. **A test that passes without the fix proves nothing.** Once, a single test hung during a coverage run and could not be reproduced; it exposed that the S3 client had no timeout at all. When the timeout was added, the test was run both with and without it; the first version of the fix passed review but changed nothing, because the AWS SDK only _logs_ a timeout unless `throwOnRequestTimeout` is set.
4. **Do not use fixed sleeps to wait for something to happen.** Wait for the event. Sleeps are used only where elapsed time is the thing under test (an expiring URL, a grace period), and then with a safety margin.
5. **A threshold must be able to fail.** The coverage thresholds were checked by running with an impossible one.

## The smoke test

The integration tests run the code through Vitest. Production runs the compiled CommonJS build. After changing build or module settings, check the real thing:

```bash
pnpm --filter @chat/api build
```

```bash
PORT=3999 node apps/api/dist/main.js
```

```bash
API_URL=http://localhost:3999 pnpm --filter @chat/api exec tsx scripts/ws-smoke.ts
```

The script (see [realtime.md](./realtime.md)) uses real WebSockets against the running server and exits non-zero on any failure, so the same command can verify a deployment.

## What is not covered yet

- The web application's tests are the old UI's (7 tests). They are replaced together with the UI in Steps 13 to 15.
- There is no browser-level end-to-end test. The API is exercised end to end through real HTTP and WebSockets, and the UI is thin enough that component tests are planned to be enough.
- Load and performance are out of scope for this project.
