# Implementation log

What has been implemented from [IMPROVEMENT_PLAN.md](./IMPROVEMENT_PLAN.md), how each step was verified, and where reality differed from the plan. The plan is never edited to hide a deviation; this log is where deviations are recorded.

| Step  | Title                                     | Status |
| ----- | ----------------------------------------- | ------ |
| 1     | pnpm monorepo                             | done   |
| 2     | Shared tooling (oxlint, oxfmt, commits)   | done   |
| 3     | Frontend on Vite + React 19 + Vitest      | done   |
| 4     | `packages/shared`                         | done   |
| 5     | Local infrastructure (docker compose)     | done   |
| 6     | Database schema (Prisma, PostgreSQL)      | done   |
| 7     | Backend foundation (auth, users)          | done   |
| 8     | Chats, messages, read cursors, encryption | done   |
| 9     | File storage on S3, attachments           | done   |
| 10-19 | everything else                           | todo   |

Working branches, each started from the previous one: `feat/monorepo-tooling-vite` (Steps 1-3), `feat/shared-and-infra` (Steps 4-5, committed) and `feat/api-rewrite` (Steps 6-11). The old MongoDB version is tagged `v1-mongo`. Nothing has been pushed.

## How these steps were done (test first)

Before any implementation, `tooling/repo.test.mjs` was written to describe Steps 1-3. It started with **16 failing tests**. Steps 4-5 repeated the same cycle (see their sections). The steps were then implemented one at a time until all 16 passed. Step 3 also started from the existing web tests: they were switched to the Vitest API (`jest.fn()` → `vi.fn()`) and confirmed failing before the toolchain was replaced. One more assertion (overridable proxy target) was added to an existing test the same way, failing first.

**Final verification** (all green):

| Check                          | Result                                                    |
| ------------------------------ | --------------------------------------------------------- |
| `pnpm test:repo`               | 16 / 16                                                   |
| `pnpm --filter @chat/web test` | 7 / 7 (same tests as before, now under Vitest, React 19)  |
| `pnpm typecheck`               | api and web clean                                         |
| `pnpm lint`                    | 0 errors (legacy-code warnings only)                      |
| `pnpm format:check`            | clean                                                     |
| `pnpm build`                   | api (`nest build`) and web (`vite build`) succeed         |
| Dev-server smoke test          | Vite served the app; `/api` and `/socket.io` were proxied |

## Step 1: pnpm monorepo

**Done**

- `client/` → `apps/web` and `server/` → `apps/api` with `git mv` (history kept); `sequence-diagram.puml` → `docs/`.
- Removed both `package-lock.json`, both boilerplate READMEs and both per-app `.gitignore` files. One root `.gitignore` replaces them.
- Added `pnpm-workspace.yaml` (workspaces, `catalog:`, `injectWorkspacePackages`), root `package.json` (private, `packageManager`, `engines`), `.nvmrc` (24), `.editorconfig`.
- Packages renamed to `@chat/web` and `@chat/api`.

**Deviations from the plan**

- **pnpm 12 blocks install scripts by default** and fails the install until they are decided. They are recorded in `pnpm-workspace.yaml` → `allowBuilds`: `bcrypt` allowed (native module of the old api, replaced by `bcryptjs` in Step 7), and `@nestjs/core`, `core-js`, `core-js-pure` and `lefthook` denied (they only print banners, or the tool works without the script).
- **TypeScript is pinned to `^5.9.3` in the catalog**, although TypeScript 7 is the newest release. The old Nest code depends on decorator metadata and the rewrite hasn't happened yet, so a compiler jump would add risk with no benefit. Revisit at Step 7.
- **The api stopped compiling after the lockfile was removed.** Without `package-lock.json`, mongoose resolved to a newer release whose `_id` typing exposed a wrong annotation in `ResponseUserDto` (`ObjectId[]` instead of `ObjectId`). Fixed in `user.dto.ts`; the file is deleted in Step 7 anyway.

## Step 2: shared tooling

**Done**

- Removed ESLint and Prettier (packages and configs) from the api and the `eslintConfig` block from the web app.
- Root dev dependencies: `oxlint`, `oxfmt`, `typescript`, `@commitlint/cli`, `@commitlint/config-conventional`, `lefthook`.
- `.oxlintrc.json`, `.oxfmtrc.json` (import and Tailwind class sorting enabled), `tsconfig.base.json` (strict), `commitlint.config.mjs`, `lefthook.yml` (format and lint staged files on commit; commitlint on the message).
- Root scripts: `lint`, `lint:fix`, `format`, `format:check`, `typecheck`, `test`, `test:repo`, `prepare`. Both apps got a `typecheck` script.
- The whole codebase was formatted once with oxfmt.

**Deviations from the plan**

- **`tsconfig.base.json` has no `isolatedModules`.** With `emitDecoratorMetadata` (NestJS) it turns type-only imports in decorated signatures into errors (TS1272). The web app sets `isolatedModules` itself.
- **The api tsconfig keeps its legacy relaxations** (`strictNullChecks`, `noImplicitAny`, `strictBindCallApply`, `noImplicitOverride` off) on top of the strict base. The old Mongo code was never strict and would not compile otherwise. They are removed in Step 7, when the api is rewritten under `strict: true`, which is what the plan intended.
- **oxlint overrides for legacy code.** About 40 errors in code that Steps 7 and 14 delete (unused imports, `Boolean` wrapper types, missing a11y roles) are downgraded to warnings only for the legacy paths. Three rules are off globally because they fight this stack: `import/no-unassigned-import` (CSS imports), `typescript/no-extraneous-class` (empty Nest modules), `no-underscore-dangle` (Mongo `_id`). The override block must be deleted with the legacy code.
- **`docs/IMPROVEMENT_PLAN.md` is excluded from oxfmt** so the plan's history stays readable (formatting it changed ~650 lines of table alignment).
- **api `test` script is `jest --passWithNoTests`** until Step 11 moves it to Vitest. The old script failed with "no tests found", which would break `pnpm -r test`.
- **`pnpm install` installs the git hooks** (`prepare` → `lefthook install`), so the next `git commit` on this machine is checked by commitlint.

## Step 3: frontend on Vite + React 19 + Vitest

**Done**

- Removed `react-scripts`, `web-vitals`, Jest, Babel presets, `intersection-observer` and the temporary jest-dom type stubs; deleted `babel.config.js`, `jest.config.js`, `jest.setup.ts` and `__mocks__/`.
- Added Vite 8, `@vitejs/plugin-react`, Vitest 5, jsdom, current Testing Library packages; upgraded to **React 19**.
- `public/index.html` → `index.html` (module entry); `src/index.tsx` → `src/main.tsx`; `src/index.css` → `src/styles.css`.
- `vite.config.ts`: `@` alias, dev server on 5173, proxy for `/api` and `/socket.io` (with WebSocket support), Vitest `jsdom` environment and `src/test/setup.ts`.
- The code now uses same-origin URLs: axios `baseURL` is `/api`, and the socket connects with `io({...})` instead of `ws://localhost:5000`. The legacy api listens on 3000 (it was 5000).
- React 19 ref typing fixed in two places (`RefObject<T | null>`).
- Scripts: `dev`, `build` (typecheck + vite build), `preview`, `typecheck`, `test`, `test:watch`.

**Deviations from the plan**

- **`antd` stays on 5.x** (`^5.17`, resolved 5.29). antd 6 exists, but this UI is deleted in Step 14, so an upgrade would be wasted work. React 19 prints antd's compatibility warning in the console until then.
- **No `intersection-observer` polyfill.** jsdom has no `IntersectionObserver`, and the tests don't depend on visibility, so `src/test/setup.ts` installs a small no-op stub instead of keeping a dependency.
- **The proxy target and api port are configurable** (`API_URL` for Vite, `PORT` for the api, both defaulting to 3000). The plan hard-codes 3000, but on the author's machine that port is held by an OrbStack container, so a fixed port would have broken `pnpm dev`. Documented in `docs/development.md`.
- **The web package is `"type": "module"`** (Vite convention).
- The production bundle is 1.1 MB (antd + moment). It shrinks when antd and moment are removed in Steps 13-14.

## Step 4: `packages/shared`

**Test first.** 9 test files / 65 tests were written against modules that did not exist yet and failed with "cannot find module". Ten more repo-level checks (package wiring, dual build, real imports from the apps) were red at the same time. Then the package was implemented until everything was green.

**Done**

- `@chat/shared` with zod 4 schemas for auth, users, chats, messages and attachments, the typed Socket.IO contract (`ClientToServerEvents`, `ServerToClientEvents`, `Ack<T>`), and the pure utilities (`directKey`, `canEditMessage`, `canDeleteMessage`, `isReadBy`, date helpers on date-fns, `truncate`, `getInitials`).
- It is built twice by tsdown (ESM + CJS with matching `.d.mts` / `.d.cts`), because Vite consumes ESM and Nest consumes CJS.
- Both apps depend on it with `workspace:*`. A repo test imports it with `require()` from `apps/api` and with `import()` from `apps/web`, so the dual-format claim is checked for real, not assumed.
- The read cursor (`lastReadSeq`), the per-chat `seq` and the idempotency `clientId` from plan §2.9 are part of the schemas already.

**Deviations from the plan**

- **Root `typecheck` and `test` build `@chat/shared` first**, not only `dev`. The apps resolve the package through its built output, so without a build their typecheck and tests would fail on a fresh clone.
- **`truncate` and `getInitials` had no specification in the plan.** Their behaviour is defined by their tests: `truncate` never returns more than `max` characters and never leaves a space before the ellipsis; `getInitials` takes the first letter of the first two words and returns `?` for an empty name.
- **`tsdown.config.ts` has no `exclude` option** (the plan's first draft guessed one; the typecheck rejected it). It is not needed, because only `src/index.ts` is an entry point, so test files never reach `dist/`.
- Versions: zod 4.6, vitest 5, tsdown 0.23, date-fns 4.4.

## Step 5: local infrastructure

**Test first.** Six repo tests described the compose file, the env examples and the infra scripts, and failed before any file existed. A seventh was added after a finding below, and also failed first.

**Done**

- `docker-compose.yml`: `postgres` (17-alpine, with a healthcheck) and `s3` (SeaweedFS) by default; `api` and `web` only in the `full` profile (their Dockerfiles arrive in Step 16). Data lives in the named volumes `pgdata` and `s3data`.
- Root `.env.example` (host ports) and `apps/api/.env.example` (every variable the api will validate in Step 7, with the encryption key left empty on purpose).
- Root scripts `infra:up` (`docker compose up -d postgres s3`) and `infra:down`.

**Verified on real containers** (then removed again with `docker compose down -v`; no volumes or containers of this project are left):

| Check                                                            | Result                    |
| ---------------------------------------------------------------- | ------------------------- |
| Postgres reachable through the published port, healthcheck       | healthy, PostgreSQL 17.11 |
| S3 create bucket, put, get, delete (AWS CLI, SigV4-signed)       | works with the dev key    |
| Presigned URL fetched with plain `curl`                          | 200                       |
| Presigned URL with a tampered signature / for a different object | 403 / 403                 |
| Presigned URL after it expired                                   | 403                       |
| Anonymous requests, wrong access key                             | 403, `InvalidAccessKeyId` |
| Clean start from empty volumes, then bucket creation             | works                     |

**Deviations from the plan**

- **The local S3 enforces credentials** (`docker/s3.json` defines one identity, `dev` / `dev`, matching `apps/api/.env.example`). The plan said any key would work. Measured instead: with no identity file SeaweedFS performs **no authentication at all**, and a presigned URL with a corrupted signature still returned 200. That would hide signing bugs and make URL-security tests meaningless locally. Now local behaviour matches AWS for signing, tampering and expiry.
- **SeaweedFS is pinned to `4.48`** (the plan used `latest`), so a new upstream release can't change local behaviour.
- **Host ports are bound to `127.0.0.1` and overridable** with `POSTGRES_PORT`, `S3_PORT` and `WEB_PORT` (root `.env`). The services use default dev passwords, so they should not listen on the network, and on the author's machine 5432 and 3000 are already taken by other containers.
- The compose `api` service reads `apps/api/.env` as **optional** (`required: false`), so `docker compose config` works on a fresh clone and in CI.

## Steps 6-9: the new backend

These four steps replace the whole MongoDB/Mongoose api. They were done test-first and are described together because they depend on each other. The order inside the batch differed from the plan: **Step 9 (storage) was built before the messages half of Step 8**, because turning a stored message into a response signs its attachment URLs and therefore needs the storage service.

**Test status when these steps were finished**

| Suite                                           | Result    |
| ----------------------------------------------- | --------- |
| `pnpm test:repo`                                | 39 / 39   |
| `@chat/shared` unit tests                       | 65 / 65   |
| `@chat/api` unit tests (`pnpm test`)            | 92 / 92   |
| `@chat/api` integration tests (`pnpm test:int`) | 156 / 156 |
| `@chat/web` tests                               | 7 / 7     |
| typecheck, lint, format check, build            | clean     |

The integration tests run against a real PostgreSQL (database `chat_test`, created and migrated automatically) and a real S3 (SeaweedFS, bucket `chat-attachments-test`). Nothing in the database or S3 layer is mocked.

### Step 6: database

- `apps/api/prisma/schema.prisma` with six tables (`users`, `friendships`, `chats`, `chat_members`, `messages`, `attachments`), the init migration, `prisma.config.ts`, and `docs/database.md` with an ER diagram.
- 23 tests describe the schema: unique keys, defaults, every cascade and "set null" rule, and that the migrations and `schema.prisma` do not drift apart.

### Step 7: backend foundation

- Environment validation (`parseEnv`, reports every problem at once), the key-ring parser, `PrismaService`, JWT authentication as a global guard with `@Public()`, the rate limiter, helmet, and the auth and users modules.
- Validation uses Nest 12's built-in `StandardSchemaValidationPipe` with the shared zod schemas (`@Body({ schema })`), instead of the custom pipe the plan sketched.
- The old Mongo code, its dependencies, the tsconfig relaxations and the API part of the lint override are gone.

### Step 8: chats, messages, encryption, seed

- Encryption: AES-256-GCM, a key per chat derived with HKDF, the chat id and message id bound into the ciphertext, a key ring with key ids for rotation. 17 tests cover round trips, tampering, moving a ciphertext to another chat or message, and rotation.
- `ChatsService` (list with unread counts, search, create, join, details, `markRead`) and `MessagesService` (`send`, `edit`, `delete`, `list`). Only the history route is REST; the commands are plain service methods that the WebSocket gateway will call in Step 10, and they announce results with domain events.
- `pnpm db:seed` fills the development database with demo data. The seed is tested like any other code and refuses to run in production.

### Step 9: storage and attachments

- `StorageService` (upload, signed URLs, batch delete, bucket creation outside production) and `POST /api/attachments`.

### Things the tests caught

Each of these was a failing test before it was a fix:

1. **`prisma@latest` is the 8.0 release candidate.** Stable is 7.10, so Prisma is pinned to `7.10.0` (client and adapter too).
2. **Prisma's `contains` does not escape SQL wildcards.** Searching for `a_c` also found `abc`, and `%` matched everything, which lets a user enumerate accounts. Fixed with an `escapeLike` helper used by both user and chat search.
3. **multer reads multipart file names as Latin-1**, which turned `фото.png` into mojibake. Fixed with `defParamCharset: 'utf8'`.
4. **Attachments lost their upload order**, because files of one request shared a timestamp. Each file now gets its own millisecond.
5. **Global guards also run for WebSocket handlers.** The throttler and the JWT guard now skip non-HTTP contexts (unit-tested), so the Step 10 gateway will not be rejected by them.
6. **Behind a reverse proxy every user would have shared one rate limit.** `trust proxy` is enabled in production only, and a test proves `X-Forwarded-For` is ignored otherwise (so it cannot be used to dodge the limit).

### Deviations from the plan

- **NestJS 12, with the app staying CommonJS.** The plan was written for Nest 11. Nest 12 ships ESM-only packages but supports CommonJS apps through `require(esm)`, and migrating our own code to ESM is optional. The compiled server was started and exercised over HTTP, because Vitest (which transforms to ESM) cannot prove that the CommonJS build works.
- **Vitest was set up for the api at Step 6, not Step 11**, since there is no test-first work without a test runner. Step 11 now only needs the remaining cleanup. Two projects: `unit` (`pnpm test`, no services needed) and `integration` (`pnpm test:int`, needs `pnpm infra:up`).
- **`PresenceService` (planned for Step 10) was built in Step 7**, because `GET /users/:id` and the friends list report who is online. Its grace-period behaviour is unit-tested with fake timers.
- **The seed moved from Step 6 to Step 8**: it needs the encryption helper, and its messages must be encrypted like real ones.
- **Direct chats require friendship**, like the old app (it only offered friends). The plan did not say; without it anyone could start a chat with anyone.
- **Non-members get `403` for private chats**, and `members: []` plus no messages for a public-group preview, so a member list is for members only.
- **Mongoose was removed in Step 7**, not Step 6, because the old code that used it was deleted then.
- **Usernames are unique case-sensitively.** A case-insensitive rule would need a functional index that Prisma's schema cannot express (every `migrate dev` would try to drop it). Recorded in `docs/database.md`.
- **pnpm build approvals** added: `prisma` and `@prisma/engines` (they download the migration engine). `@swc/core`, `esbuild` and `lefthook` are denied, because their binaries come as optional dependencies, and `bcrypt` was removed together with the native module.
- **`@types/multer` needed in the api's `types`**, because the tsconfig restricts global types to the ones it lists.

## Steps 10-11: realtime and the backend test suite

**Test status when these steps were finished**

| Suite                                           | Result                                                                                      |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `pnpm test:repo`                                | 42 / 42                                                                                     |
| `@chat/shared` unit tests                       | 65 / 65                                                                                     |
| `@chat/api` unit tests (`pnpm test`)            | 122 / 122                                                                                   |
| `@chat/api` integration tests (`pnpm test:int`) | 203 / 203 (202 were stable over five consecutive runs; the S3 timeout test was added after) |
| `@chat/web` tests                               | 7 / 7                                                                                       |
| API coverage (`pnpm test:cov`, 325 tests)       | 99.3 % statements, 97.0 % branches, 100 % functions, 99.8 % lines                           |
| typecheck, lint, format check, build            | clean                                                                                       |

### Step 10: the gateway

- `RealtimeGateway` is a thin adapter, as designed: it authenticates the handshake, validates each command with the shared zod schemas, calls the services, and answers with `{ ok, data | error }`. Services publish domain events, the gateway listens and broadcasts. Nothing in the services knows about sockets.
- `createPacketGuard` ends sockets whose token expired and drops events above 30 per 10 seconds. Transport is WebSocket only, packets are limited to 100 KB, unknown events are ignored.
- Documented in `docs/realtime.md`, with a repo test that fails if an event of the shared contract is missing from it.
- The tests use **real Socket.IO clients against a really listening server**: 38 integration tests cover authentication, delivery to members and only to members, forged senders, idempotent retries, edits and deletes, read cursors, typing, chats created or joined while connected, presence (including several tabs and a page refresh), rate limiting, token expiry on an open socket, oversized packets and unknown events. 31 unit tests cover the gateway's decisions with fakes.
- The compiled production build was started and checked with `scripts/ws-smoke.ts` over real WebSockets: all checks passed, no errors in the server log.

### Step 11: tests and coverage

Most of Step 11 had already happened as a by-product of working test-first (Vitest in Step 6, unit and integration projects, the crypto, chats, messages, presence, packet-guard and gateway tests). What was added here:

- `pnpm test:cov` with `@vitest/coverage-v8`: both test projects measured together, thresholds enforced, reports not committed. The thresholds were verified to fail when set too high.
- **Error-path tests.** The first measurement (97.7 % statements, 92.6 % branches) showed that the missing coverage was nearly all error handling. New tests cover: unexpected database errors are neither swallowed nor leaked (the 500 body is generic, secrets in the error message never reach the client); a failing S3 cleanup does not hide the original error; deleting a message succeeds when S3 file removal fails; two people starting the same direct chat at once end up in one chat; wrong S3 credentials fail startup instead of creating a bucket; plus edge cases of previews and deleted accounts. After that: 99.3 % and 97.0 %.
- `docs/testing.md`: the layers, what is real and what is injected, the lessons from the flaky tests, and how to run each part.

### Bugs found by the tests in these steps

1. **A user was told about their own presence.** When someone connected, the server announced "online" to the rooms of their chats, and their own socket is in those rooms. A test failed intermittently on whether the stray packet arrived before or after it started listening. Fixed by announcing from the connecting socket, which leaves it out; a deterministic test now guards it.
2. **The S3 client had no timeout.** An unresponsive S3 would hang an upload for ever. Adding `requestTimeout` was not enough: in this SDK version it only _logs a warning_, and `throwOnRequestTimeout: true` is what makes it an error. The first version of the fix passed review and changed nothing; the test was therefore run with and without the fix to prove it.
3. **A possible race on connect:** a client can send its first event the moment it connects, before an asynchronous setup has put its socket into the chat rooms. The gateway now loads the user's chats during the handshake and joins the rooms synchronously when the connection is created.

### Deviations from the plan

- **`PresenceService` takes its grace period as an injectable value** (`PRESENCE_GRACE_MS`, default 5 s), so integration tests do not have to wait five seconds.
- **The handshake distinguishes `Unauthorized` from `Server error`.** A database failure while loading the user's chats is no longer reported as "unauthorized".
- **`scripts/ws-smoke.ts` became a checking tool** that exits non-zero on failure, instead of a script that only prints. The real coverage is in the integration tests; the script is for checking a _running_ server, including a deployed one.
- **No test for a custom zod validation pipe**, because Nest 12's built-in `StandardSchemaValidationPipe` is used (Step 7).
- **S3 requests have a 30 second timeout** (new `requestTimeoutMs` in the storage config).

## Steps 12-15: the web rewrite

Done on its own branch (`feat/web-rewrite`), because it touches nothing in the backend. Architecture and conventions are in [frontend.md](./frontend.md).

**Test status when these steps were finished**

| Suite                                           | Result                                                |
| ----------------------------------------------- | ----------------------------------------------------- |
| `pnpm test:repo`                                | 50 / 50                                               |
| `@chat/shared` unit tests                       | 65 / 65                                               |
| `@chat/api` unit tests                          | 122 / 122                                             |
| `@chat/api` integration tests (`pnpm test:int`) | 203 / 203 (unchanged: the backend was not touched)    |
| `@chat/web` tests                               | 260 / 260 in 37 files (the old UI's 7 tests are gone) |
| typecheck, lint, format check, web build        | clean                                                 |

### What was built

- **Step 12, foundation.** Tailwind v4 with shadcn/ui (Radix, the `nova` preset), 20 components, dark theme, `@` import alias, a Vite dev proxy for `/api` and `/socket.io`.
- **Step 13, data layer.** React Query for everything the server owns, four small Zustand stores for the rest, a typed axios client (token header, `401` logs out, readable error messages), a typed Socket.IO client whose commands are promises, and `useRealtime()` which turns server events into cache updates. Optimistic sending with a pending store, retry with the same `clientId`, `seq`-gap detection.
- **Step 14, UI.** Auth screen, sidebar with chat list and search (chats and people), create-chat, settings, profile and chat-info dialogs, header with typing and last-seen text, message bubbles (reply quote, images with a lightbox, ticks, context menu, inline edit, confirmed delete), composer (images, reply bar, typing signal), message list (reverse layout, infinite scroll upwards, "New messages" separator, read tracking), join bar for public groups, connection banner, responsive shell.
- **Step 15, tests.** 260 web tests next to the code, with a fake socket and a fake `IntersectionObserver` playing the server and the screen. The old antd/MobX UI, its stylesheets, `mobx`, `moment`, `jwt-decode`, `antd`, `@ant-design/icons` and the legacy lint override are deleted; repo tests guard that.

### Checked against the real backend

With Postgres, S3 and the api running (`pnpm infra:up`, `pnpm db:seed`) and the Vite dev server, in a real browser: log-in as the seeded `alice`; chat list with unread badges; opening a chat scrolls to the "New messages" separator and sends `chat:read`; a second client (a script playing `bob` over a real socket) was seen typing, sending a live message, and reading, which turned the ticks to double; edit and delete through the context menu; an image upload (S3 URL, "📷 Photo" preview in the list); stopping the api showed the reconnect banner, a send failed after the 8 s timeout as "Not sent", and after restarting the api the banner disappeared on its own and **Retry** delivered exactly one copy; the phone layout (list, chat, back button); search and "Message" from a profile.

### Bugs found by running it for real

Each is now covered by a test that was seen failing first.

1. **Two siblings with the same React key** in `ChatView` (list and composer both keyed by the chat id). It only warned in the console, and unit tests never looked at the console. A test now fails on any React warning while rendering a chat.
2. **"Edit" in the context menu left the input without focus.** The menu holds the focus while open and hands it back to the message when it closes, so the input's own autofocus lost. The bubble now focuses the input when the menu has closed.
3. **The search text stayed after "Message" in a profile opened a chat.** Opening any chat now ends the search.
4. **A test suite that depended on port 3000 being empty.** jsdom's address is `http://localhost:3000`, which is where the api runs in development. A test that forgot to mock `getMe` made a real request to the running api, got a real `401`, and the app logged out in the middle of the test. It passed for weeks because nothing was listening. `test/setup.ts` now makes every unmocked axios request fail loudly, and the suite was run with the api up to prove it.
5. Smaller ones found while writing the tests: a header that briefly asked for the wrong user before `me` was loaded; `userEvent.upload` silently honouring `accept`, which hid the "not an image" validation test; a "New messages" separator shown in a chat that had never been read (correct, and the test was wrong).

### Deviations from the plan

- **`cn` instead of `clsx` + `tailwind-merge`:** the current shadcn CLI generates `import { cn } from 'cn'` (a package) and `lib/utils.ts` re-exports it.
- **Pending messages live in their own store**, not in the query cache, so the cache only holds what the server has.
- **No date separators and no code splitting.** The production bundle is about 760 kB (240 kB gzipped); acceptable for this project, and `React.lazy` for the dialogs is the first thing to try if it matters.
- **The "New messages" separator is computed once per opened chat**, after the history is loaded and refetched, and stays put while reading.
- **Read marking only watches other people's messages**, only in a visible tab, and is debounced by 300 ms.

## Notes for upcoming steps

- **Ports:** `DATABASE_URL` in `apps/api/.env.example` uses port 5432. If you changed `POSTGRES_PORT`, change the URL to match.
- **Step 16:** the api Dockerfile must run `prisma migrate deploy`, and `prisma generate` needs a `DATABASE_URL` while building.
- **Step 17:** CI needs a Postgres service container and an S3-compatible service (or a SeaweedFS container, started with the identity file `docker/s3.json`) for `test:int` and `test:cov`. After a deployment, run `scripts/ws-smoke.ts` against it.
- **Step 16:** the web Dockerfile builds with `pnpm --filter @chat/web build`; the static files are served by Caddy, which also proxies `/api` and `/socket.io` (same origin, as in development).
