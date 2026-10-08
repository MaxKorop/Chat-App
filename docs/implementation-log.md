# Implementation log

What has been implemented from [IMPROVEMENT_PLAN.md](./IMPROVEMENT_PLAN.md), how each step was verified, and where reality differed from the plan. The plan is never edited to hide a deviation; this log is where deviations are recorded.

| Step | Title                                   | Status |
| ---- | --------------------------------------- | ------ |
| 1    | pnpm monorepo                           | done   |
| 2    | Shared tooling (oxlint, oxfmt, commits) | done   |
| 3    | Frontend on Vite + React 19 + Vitest    | done   |
| 4    | `packages/shared`                       | done   |
| 5    | Local infrastructure (docker compose)   | done   |
| 6-19 | everything else                         | todo   |

Working branches: `feat/monorepo-tooling-vite` (Steps 1-3, committed) and `feat/shared-and-infra` (Steps 4-5), branched in sequence from `develop` / `main`. The old MongoDB version is tagged `v1-mongo`. Nothing has been pushed.

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

## Notes for upcoming steps

- **Step 6:** `DATABASE_URL` in `apps/api/.env.example` uses port 5432. If you changed `POSTGRES_PORT`, change the URL to match.
- **Step 9:** the local S3 requires the `dev` / `dev` credentials, so `StorageService` must pass them to the SDK in development. Creating the bucket on startup works with them (verified with the AWS CLI).
- **Step 7:** NestJS is now at v12 and TypeScript at v7 (the plan assumed Nest 11). Check peer ranges and decorator-metadata support before choosing versions, then remove the api's legacy tsconfig relaxations and the api part of the oxlint override.
- **Step 11:** replace `jest --passWithNoTests` with Vitest.
- **Step 14:** delete the web part of the oxlint override, antd and the `.css` files.
