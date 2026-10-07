# Development guide

How to work in this repository. The _why_ behind each decision is in [IMPROVEMENT_PLAN.md](./IMPROVEMENT_PLAN.md); what has been built so far is in [implementation-log.md](./implementation-log.md).

## Prerequisites

- **Node 24** (`.nvmrc`; `nvm use`)
- **pnpm 12** (the exact version is pinned in `package.json` → `packageManager`)
- Docker (Postgres and S3-compatible storage)

```bash
pnpm install
```

## Repository layout

```
apps/web       React + Vite frontend                  (@chat/web)
apps/api       NestJS backend                         (@chat/api)
packages/shared  zod schemas, DTO types, socket contract, utilities   (@chat/shared)
tooling/       repo-level tests (node:test)
docs/          plan, this guide, implementation log, diagrams
```

## Everyday commands (run from the repo root)

| Command                              | What it does                                                                  |
| ------------------------------------ | ----------------------------------------------------------------------------- |
| `pnpm dev`                           | starts every app in watch mode (`vite` for web, `nest start --watch` for api) |
| `pnpm build`                         | builds every package                                                          |
| `pnpm test`                          | repo tests (`tooling/`) + every package's tests                               |
| `pnpm test:repo`                     | only the repo-level tests                                                     |
| `pnpm typecheck`                     | `tsc --noEmit` in every package                                               |
| `pnpm lint` / `pnpm lint:fix`        | oxlint                                                                        |
| `pnpm format` / `pnpm format:check`  | oxfmt (writes / only checks)                                                  |
| `pnpm --filter @chat/web test:watch` | Vitest in watch mode while developing the UI                                  |

Run a command for one package with `pnpm --filter @chat/web <script>`.

### Local infrastructure (Postgres + S3)

```bash
cp .env.example .env
```

```bash
pnpm infra:up
```

```bash
pnpm infra:down
```

Postgres listens on `127.0.0.1:5432` (user, password and database are all `chat`). An S3-compatible store (SeaweedFS) listens on `127.0.0.1:8333`; it requires the credentials `dev` / `dev`, like AWS requires signed requests. Both bind to localhost only.

If a port is taken (check with `lsof -nP -iTCP:5432 -sTCP:LISTEN`), set a different one in the root `.env`, for example `POSTGRES_PORT=5433`, and use the same port in `DATABASE_URL` in `apps/api/.env`. `docker compose down -v` also deletes the data volumes.

Everything in containers, including the apps (needs the Dockerfiles from Step 16):

```bash
docker compose --profile full up --build
```

### The shared package must be built

`@chat/shared` is consumed through its built output (`packages/shared/dist`). The root `dev`, `typecheck` and `test` scripts build it first. If you run a single package's script by hand and see "cannot find module '@chat/shared'", build it:

```bash
pnpm --filter @chat/shared build
```

### The frontend talks to the backend through a proxy

The web app always calls the relative URLs `/api` and `/socket.io`. In development, Vite forwards them to `http://localhost:3000`; in production Caddy does the same job. That means no CORS configuration and no hard-coded URLs.

If port 3000 is already taken on your machine (for example by a Docker container), pick another port for both sides:

```bash
PORT=4000 pnpm --filter @chat/api dev
```

```bash
API_URL=http://localhost:4000 pnpm --filter @chat/web dev
```

## Test-first workflow (TDD)

Every change starts with a failing test.

1. **Red**: write the test that describes the behaviour and run it. Confirm it fails _for the right reason_ (a missing feature, not a typo).
2. **Green**: write the smallest implementation that makes it pass.
3. **Refactor**: clean up while the tests stay green.

Where tests live:

| What                             | Where                              | Runner                           |
| -------------------------------- | ---------------------------------- | -------------------------------- |
| Repo structure, tooling, commits | `tooling/*.test.mjs`               | `node --test` (no dependencies)  |
| Frontend components, stores      | `apps/web/src/**/*.test.tsx`       | Vitest + Testing Library (jsdom) |
| Backend services (from Step 11)  | `apps/api/src/**/*.spec.ts`        | Vitest                           |
| Shared schemas (from Step 4)     | `packages/shared/src/**/*.test.ts` | Vitest                           |

`tooling/repo.test.mjs` is the executable form of Steps 1-3 of the plan: if someone reintroduces `package-lock.json`, ESLint, Jest or a CRA variable, it fails.

## Code style

- **oxlint** lints, **oxfmt** formats (config: `.oxlintrc.json`, `.oxfmtrc.json`). Git hooks run both on staged files, so formatting is never a review topic.
- `docs/IMPROVEMENT_PLAN.md` is excluded from formatting on purpose, so the historical plan keeps a readable diff.
- The `overrides` block in `.oxlintrc.json` downgrades some rules **only for legacy code** (the old Mongo api and antd/MobX UI). It is deleted together with that code (api: Step 7, web: Step 14). New code gets the strict rules.

## Commits and branches

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/), enforced by commitlint in a `commit-msg` hook:

```
feat(web): add typing indicator
fix(api): reject empty messages
chore(repo): convert to pnpm workspace monorepo
```

Allowed scopes: `web`, `api`, `shared`, `db`, `infra`, `ci`, `deps`, `docs`, `repo`.

Branch flow: `feat/*` → pull request into `develop` → pull request from `develop` into `main` (which deploys, from Step 18).

The git hooks are installed by `pnpm install` (the `prepare` script runs `lefthook install`). If they ever go missing, run `pnpm exec lefthook install`.

## pnpm specifics worth knowing

- **Install scripts are blocked by default.** A dependency may only run its `postinstall` if it is listed under `allowBuilds` in `pnpm-workspace.yaml`. Allow a new one with `pnpm approve-builds <package>` and review what it does first.
- **Shared versions** live in the `catalog:` section of `pnpm-workspace.yaml`. A package says `"typescript": "catalog:"` instead of repeating a version.
- `pnpm add <existing-package>` keeps the existing version range. To upgrade, ask for it: `pnpm add <package>@latest`.
