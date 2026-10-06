# Chat App: Improvement Plan

The plan has three parts:

1. **Codebase review**: what's there now and what's broken.
2. **Investigations**: the decisions you asked me to make.
3. **Implementation plan**: 19 steps. Each step is one logical block and ends with a "Done when" check and a suggested conventional commit.

Versions aren't pinned. Install the latest of everything (`pnpm add x@latest`), except where a step says otherwise.

> **Revision 2.** Message security (§2.3), the WebSocket-or-SSE question (§2.8), read tracking (§2.9) and WebSocket hardening (§2.10) were investigated. Steps 4, 6, 7, 8, 10, 11, 13, 14, 15, 16, 18 and 19 changed as a result.
> The biggest design change: **all message commands (send, edit, delete, read, typing) now go over the socket with acknowledgements; REST keeps history, uploads and everything non-realtime.** Read state is one integer cursor per member.

---

## Part 1: Codebase review

### Current state

| Area | Now |
|---|---|
| Layout | Two unrelated npm projects (`client/`, `server/`), each with its own `package-lock.json`. Nothing is shared. |
| Frontend | CRA (`react-scripts`, deprecated), React 18, antd 5, MobX, moment, axios, plain CSS files, Jest + Babel. |
| Backend | NestJS 10, Mongoose, class-validator, JWT through a hand-written `AuthGuard`. `JwtStrategy` and Passport are registered but never used. |
| DB | MongoDB with 3 collections. Chat `history` is an embedded array of every message. Images are stored as binary `Buffer`s inside Mongo. |
| Tooling | ESLint + Prettier on the server only. No CI/CD, no Docker, boilerplate READMEs. |

### Bugs and problems found

**Security (critical)**
- **Socket identity is trusted from the client.** `io(..., { query: { user: JSON.stringify(user) } })`, and the gateway reads `client.handshake.query.user`, so anyone can claim to be any user. The socket has no JWT check.
- **The gateway never checks chat membership.** Any socket can `joinChat` any chat id and receive its messages. It can also `deleteMessage` / `editMessage` any message in any chat. The "only author/owner can delete" rule lives only in the UI (`MessageOperations.tsx`).
- **`sentBy` / `sentByName` come from the client payload**, so a user can send messages as somebody else.
- **The JWT carries the whole user document** (friends, chats, settings). A new token is signed after every change (`check`, `joinToChat`, `addFriend`, `updateUser`).
- **Search builds `new RegExp(userInput)`** (`chat.service.ts`, `user.service.ts`). That allows regex injection and ReDoS.
- **CORS is open.** It's `origin: "*"`, and the gateway option `origin: 'http://localhost:3000'` has no effect because it should be `cors: { origin }`.
- `GET /image?id=` returns any image to any logged-in user.

**Functional bugs**
- **`updateUser` saves the token without the `Bearer ` prefix** (`userAPI.ts`). After a profile update, every authenticated request fails.
- **The image upload is lost.** `Input.tsx` `sendMessage` is a `useCallback` with deps `[message, setMessage]`, so `imagesToDisplay` is stale. The service also writes `miemtype` (typo), so the stored mimetype is `undefined`.
- **The New Messages divider can crash.** `ChatContent.tsx` reads `history[index - 1].readBy` while `index === 0`. If the first message is unread, `history[-1]` is `undefined` and it throws.
- `Message.tsx` `prevMessage` finds the message itself, not the previous one.
- `CreateChatDto`: `this.public = publicChat || true` is always `true`. The pipe also reads `value.publicChat` while the client sends `public`.
- The duplicate private-chat check `{ users: chatDto.users }` depends on array order, so A→B and B→A create two DMs.
- `ChatItem.tsx` calls hooks inside `if` (rules-of-hooks violation).
- `Chat.tsx` creates a new `ResizeObserver` on every render.
- `ChatInfoModal` appends user names on every `store.chat` change, which duplicates the list. It also makes N requests (`getOneUser` per user, and per chat item in the side panel).
- `deleteMessage` / `editMessage` / `readMessage` use Mongo transactions. Those fail on a standalone (non-replica-set) MongoDB.
- `chat.save()` isn't awaited in several places.
- Online status is a DB boolean. With two tabs open, closing one marks the user offline.
- The gateway re-emits the whole chat document (with full history) on every `readMessage`.
- `client/src/types/types.ts` types `Message.readBy` as `string` (it's an array). It also mixes types with UI helpers (`errorMessage`, `toBase64`).

**Structural problems**
- **Embedded `history` array**: every chat load sends the entire history. The document grows without limit (Mongo's 16 MB limit) and there's no pagination.
- Types are duplicated 3–4 times per entity (`*.type.ts`, `*.schema.ts`, DTO, client `types.ts`) and have already drifted apart.
- `strictNullChecks: false` on the server.
- `JwtModule.register` is copied in 3 modules. There are unused deps (`passport-local`, `mongodb`, `jsonwebtoken`, `@nestjs/mapped-types`, `uuid` once Postgres generates ids).
- The URL is hard-coded to `ws://localhost:5000`. Copy-pasted `try/catch + messageApi` sits in every component.
- `moment` is in maintenance mode, and CRA is deprecated.

Most of these bugs disappear by design in the steps below rather than through separate fixes.

---

## Part 2: Investigations

### 2.1 Microservices or monolith → **modular monolith**

Keep one NestJS app, organised as clean modules (`auth`, `users`, `chats`, `messages`, `attachments`, `realtime`, plus infrastructure modules `prisma`, `storage`, `crypto`).

Why:
- **Load and team size**: one developer and low load. Microservices solve scaling and team-autonomy problems you don't have.
- **Cost of splitting**: you'd also need a message broker (Socket.IO across services needs a Redis adapter), auth duplicated or a gateway service, per-service databases or a shared-DB anti-pattern, N Dockerfiles, N pipelines and N deploy targets. That roughly triples the CI/CD and AWS work.
- **Transactions**: sending a message touches `messages`, `attachments`, `chats` and `chat_members` in one transaction. Across services that becomes a saga.
- **For the defence**: clear module boundaries (each module owns its tables and talks to others only through exported services) give you a good architectural answer. Each module could later become a service.

### 2.2 Prisma vs TypeORM → **Prisma 7**

| | Prisma 7 | TypeORM |
|---|---|---|
| Type safety | Fully generated types for every query, including `select`/`include` shapes | Entity classes. Relations and partial selects are typed loosely. |
| Schema | One `schema.prisma` file that doubles as ERD documentation for the thesis | Spread across decorated classes |
| Migrations | `prisma migrate dev` generates SQL from the schema diff and is reliable | Generation works but is fragile, and many teams write migrations by hand |
| Runtime | Prisma 7 replaced the Rust engine with a TS query engine plus the `pg` driver adapter: no binaries and small Docker images | Plain JS |
| Maintenance | Very active | Slower release cadence and a large issue backlog |
| Performance | At this scale both are far below any bottleneck. Prisma 7's TS engine removed most of the old overhead. | Same |

The one gotcha: Prisma 7 generates ESM by default and NestJS is CommonJS. Set `moduleFormat = "cjs"` in the generator (shown in Step 6).

### 2.3 Message security without E2E → **TLS + strict access control + app-level encryption at rest**

"Without end-to-end encryption" means the server can read messages (it has to, to store and deliver them). So the goal is: **nobody except the running server can read a message, and nobody can read or inject messages they have no right to.** That splits into seven cheap layers:

| # | Threat | Defence | Step |
|---|---|---|---|
| 1 | Someone sniffs the network (public Wi-Fi, MITM) | **TLS everywhere**: HTTPS + WSS, terminated by Caddy with automatic Let's Encrypt certificates, plus an HSTS header. The socket token travels in the handshake `auth` payload, never in the URL (URLs end up in logs). | 10, 16, 18 |
| 2 | A user reads, edits or deletes messages of chats they're not in, or sends as someone else | **Authorisation on the server for every operation**, over REST *and* WebSocket: the socket is authenticated at handshake; the sender id always comes from the verified JWT, never from the payload; every service call re-checks chat membership and role (`assertMember`, `canDeleteMessage`); all payloads are validated with zod; per-socket rate limit. | 7, 8, 10 |
| 3 | Database leak: SQL injection, stolen dump, leaked backup or EBS snapshot, curious DB admin | **Application-level encryption of message text** (AES-256-GCM) before it reaches Postgres. The key is not in the DB or in the repo. EBS volume encryption on top. | 8, 18 |
| 4 | Key theft, or no way to change keys | A key ring with key ids (rotation = add a key and switch the current id; old messages still decrypt). Keys live in **SSM Parameter Store (SecureString)** and are injected at deploy, never committed or baked into images. | 8, 18 |
| 5 | Leaked attachment | Private bucket, random object keys, SSE-S3, MIME allow-list and size limit, **short-lived presigned URLs** handed out only after a membership check, objects deleted together with the message. | 9 |
| 6 | XSS steals the token or injects markup | Messages are rendered as text (React escapes it; never `dangerouslySetInnerHTML`), `Content-Security-Policy` and `nosniff` headers from Caddy, `helmet` on the API. | 16 |
| 7 | Plaintext leaks through logs; brute-forced logins | Never log message content or socket payloads (ids only); Prisma query logging off in production; throttling on log-in/sign-up; bcrypt. | 7, 10 |

**How the encryption works (layers 3 and 4)**
1. A master key (32 random bytes, base64) sits in a key ring: `MESSAGE_KEYS="1:<base64>"`, `MESSAGE_KEY_ID=1`.
2. For every chat a **per-chat key** is derived: `HKDF-SHA256(master, info = chatId)`. Each key then encrypts only one chat's messages, which keeps it far below AES-GCM's safe limit for random IVs, and one leaked derived key doesn't reveal other chats.
3. Each message gets a fresh random 12-byte IV and is encrypted with AES-256-GCM. The **AAD** (authenticated, not secret) is `chatId:messageId`, so a ciphertext copied into another chat or onto another message fails authentication instead of decrypting.
4. The stored string is `<keyId>.<iv>.<authTag>.<ciphertext>`. The key id is what makes rotation possible.
5. Decryption happens in `MessageMapper`, right before a DTO leaves the server.

**Say these limits openly in the thesis**
- It protects data **at rest**. The running server, and anyone who takes control of it or of the key, sees plaintext. Real E2E removes that, which is why it's listed as future work.
- Server-side search over message text isn't possible. The app doesn't have it, so this costs nothing today. Chat titles and usernames stay plaintext because they are searched.
- Attachment file names and sizes are stored as plain metadata.

**Not chosen: true end-to-end encryption.** Each device would need key pairs, per-chat keys wrapped for every group member, re-keying when members join or leave, and key recovery for new browsers. That's a thesis by itself.

### 2.4 Local S3 → **SeaweedFS**, not MinIO

MinIO stopped publishing Docker images in Oct 2025, went into maintenance mode, and the repo was archived in Apr 2026. **SeaweedFS** (Apache-2.0, actively maintained) runs as a single container with `server -s3`. The app uses the standard `@aws-sdk/client-s3`, so the same code talks to SeaweedFS locally and to AWS S3 in production. Only the endpoint env var differs.

### 2.5 "Migrate to Vite"

Vite is a frontend tool, so the **frontend** moves from CRA to Vite. The **backend** keeps the Nest CLI build but gets **Vitest** (Vite-based) for tests, so the whole repo uses one test runner.

### 2.6 oxlint + oxfmt → **yes, both**

- oxlint covers TypeScript, React (including `rules-of-hooks` / `exhaustive-deps`), import, a11y and vitest rules.
- oxfmt is Prettier-compatible, ships stable weekly releases, and has built-in import sorting and Tailwind class sorting. That means `prettier-plugin-tailwindcss` isn't needed either.

### 2.7 Monorepo tooling → **plain pnpm workspaces** (no Turborepo or Nx)

`pnpm -r <script>` already runs in dependency (topological) order. Caching tools aren't worth the extra config for 3 packages.

### 2.8 Transport: WebSocket or SSE → **Socket.IO (WebSocket) for all messaging, REST for everything else**

Your instinct is right for the design I had before. If messages are *sent* with REST and only *received* over a socket, the socket is a one-way pipe, and SSE would be the better fit (plain HTTP, built-in reconnect, nothing to configure in Caddy). The better answer is to make the socket earn its place.

| | SSE + REST | Socket.IO (WebSocket) |
|---|---|---|
| Direction | server → client only; everything else is a separate HTTP request | full duplex on one connection |
| Typing indicator, "read up to here" | a `POST` per burst; works, but chatty | a tiny volatile event |
| Delivery confirmation | the HTTP response of the POST | an **acknowledgement** on the same connection |
| Auth | `EventSource` can't send an `Authorization` header: you need a cookie, a token in the URL (leaks into logs) or a fetch-based polyfill | token in the handshake `auth` payload |
| Reconnect | built in (`Last-Event-ID`) | built in (backoff); we resync through React Query |
| Rooms / targeted push | build it yourself | rooms, `socketsJoin`, typed events |
| Connection limit | 6 per origin on HTTP/1.1, none on HTTP/2 | none |
| Infra | simplest | just as simple behind Caddy (`reverse_proxy` handles the upgrade) |
| Cost | lowest | you hand-roll validation, error handling and rate limiting that Nest gives HTTP routes for free (about 40 lines, Step 10) |

**Decision:** one authenticated Socket.IO connection carries *every message operation*, in both directions. `message:send`, `message:edit`, `message:delete`, `chat:read` and `typing` go up. `message:created`, `message:updated`, `message:deleted`, `chat:read`, `typing`, `chat:changed` and `presence:changed` come down. Commands use an acknowledgement (`{ ok, data | error }`), which is what lets the UI show "sending… / sent / failed". Acks plus ephemeral client→server signals are exactly what SSE can't give you.

What stays on REST (request/response by nature, or unsuited to a socket): sign-up/log-in, profile, friends, chat list/search/create/join/details, **message history** (cursor pagination) and **file upload** (multipart; keeping binary out of the socket lets `maxHttpBufferSize` stay at 100 KB).

One rule keeps the cost of this choice small: **services know nothing about sockets.** `MessagesService.send()` is a plain method that throws normal Nest exceptions and publishes a domain event. The gateway is a thin adapter (validate → call service → wrap in ack) plus a listener that broadcasts domain events. If you ever want a REST endpoint for sending, it's a 5-line controller.

If you dropped typing indicators and acks, SSE + REST would be enough and simpler. That's worth one sentence in the thesis.

### 2.9 Read tracking → **one read cursor per member (`last_read_seq`), no per-message read data**

The array `readBy: userId[]` on every message is rewritten once per message per reader and grows with chat size. Plan v1 already replaced it with a per-member watermark (`last_read_at`). After investigating, the watermark works better as an **integer cursor**:

- Each message gets a **per-chat sequence number** `seq` (1, 2, 3, …, gap-free). It's assigned in the same transaction that inserts the message, by incrementing `chats.last_seq`.
- Each member has `last_read_seq`: "I have read everything up to and including this seq".

| | `readBy[]` per message (old) | `last_read_at` timestamp (plan v1) | **`last_read_seq` cursor** |
|---|---|---|---|
| Writes when you read 50 messages | 50 updates | 1 | **1** |
| Unread badge | scan all messages | `count(created_at > t)` | `count(seq > cursor)`, an index range scan |
| Read receipt for a message | search the array | compare timestamps | `member.last_read_seq >= message.seq` |
| Ties / clock issues | n/a | same-millisecond ties possible | none, integers |
| Pagination cursor | uuid | uuid | **`seq`** (`WHERE seq < :before`) |
| Client detects a missed message | no | no | **yes**: an incoming `seq` must be `newest + 1`, otherwise refetch |
| Event on the wire | one per message | one per read | one tiny `{chatId, userId, seq}` |

Rules:
- The cursor only moves forward (`UPDATE … WHERE last_read_seq < :seq`), is clamped to `chats.last_seq`, and unread counts ignore your own messages.
- A new member of a public group starts with the cursor at the current `last_seq`, so old history isn't "unread".
- On the client, one `IntersectionObserver` in the message list tracks the highest `seq` the user has actually *seen* (only while the tab is visible) and emits one debounced `chat:read`.
- Read receipts in the UI are derived from `members[].lastReadSeq`, which `chat:read` events keep up to date in the cache.

### 2.10 What was "beginner-level" in the old WebSocket code, and what replaces it

| Old | New |
|---|---|
| Identity from `handshake.query.user`, a JSON the browser writes | JWT in the handshake `auth` payload, verified by a Socket.IO middleware; token expiry enforced on every packet |
| No authorisation: any socket can join, edit or delete anything | Services check membership and role on every call (the same code path REST would use); rooms are joined only from the DB's memberships |
| `sentBy` and `sentByName` taken from the payload | Taken from `socket.data` (the verified token) |
| Free-form payloads | zod schemas from `@chat/shared` + typed `ClientToServerEvents` / `ServerToClientEvents` |
| Errors emitted as a separate `error` event; no result for the sender | Every command returns an ack: `{ ok: true, data } \| { ok: false, error }` |
| Whole chat document (all history) re-emitted on each read | Small DTOs only (`MessageDto`, `{ chatId, userId, seq }`) |
| `polling` + `websocket` transports | `websocket` only on both sides: no sticky-session issues, one round trip less |
| `online` boolean written to Mongo; closing one tab = offline | In-memory presence with a connection counter and a 5 s grace period (a page refresh doesn't flicker); `last_seen_at` written when the user really goes offline; presence is sent only to the rooms of the user's chats |
| Gateway injected the Mongoose model and held business logic | Gateway is a thin adapter. Services emit **domain events** (`@nestjs/event-emitter`); the gateway listens and broadcasts. No circular modules. |
| Lost connection = silently stale UI | On every reconnect the client invalidates its React Query caches; a `seq` gap also triggers a refetch; a "Reconnecting…" banner shows the state |
| Double-click or retry = duplicate message | Client-generated `clientId` + unique index make sends idempotent |
| No limits | 30 events / 10 s per socket, `maxHttpBufferSize` 100 KB, message length 4000 |
| Nothing ephemeral | **Typing indicators** (volatile events, authorised by room membership, no DB hit) |

Deliberately *not* done (not worth it here):
- **Redis adapter**: only needed with more than one API instance.
- **Socket.IO connection-state recovery**: it doesn't survive a server restart, and every deploy restarts the server, so refetch-on-reconnect is needed anyway.
- Refresh tokens and a message queue.


---

## Part 3: Implementation plan

### Target structure

```
chat-app/
├── apps/
│   ├── api/                      # NestJS (modular monolith)
│   │   ├── prisma/               # schema.prisma, migrations/, seed.ts
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── config/env.ts
│   │   │   ├── common/           # zod pipe, guards, decorators, domain events
│   │   │   ├── prisma/           # PrismaModule / PrismaService
│   │   │   ├── generated/prisma/ # Prisma client (gitignored)
│   │   │   └── modules/
│   │   │       ├── auth/  users/  chats/  messages/  attachments/
│   │   │       ├── realtime/     # thin socket gateway: acks, typing, packet guard
│   │   │       ├── presence/     # in-memory online state (global)
│   │   │       ├── storage/      # S3 wrapper
│   │   │       └── crypto/       # message encryption (key ring)
│   │   ├── Dockerfile
│   │   └── vitest.config.ts
│   └── web/                      # Vite + React
│       ├── src/
│       │   ├── main.tsx  App.tsx
│       │   ├── components/ui/    # shadcn (generated)
│       │   ├── components/layout/
│       │   ├── features/
│       │   │   ├── auth/  chats/  messages/  users/
│       │   │   │   └── (components/, api.ts, queries.ts)
│       │   ├── lib/              # api-client, socket, query-client, utils
│       │   ├── stores/           # zustand
│       │   └── hooks/
│       ├── Caddyfile  Dockerfile  vite.config.ts  components.json
├── packages/
│   └── shared/                   # zod schemas, DTO types, socket contracts, utils
├── docs/                         # ERD, realtime events, sequence diagram, this plan
├── .github/workflows/            # ci.yml, pr-source.yml, cd.yml
├── docker-compose.yml            # local: postgres + seaweedfs (+ optional apps)
├── deploy/                       # docker-compose.prod.yml, deploy.sh
├── pnpm-workspace.yaml  package.json  tsconfig.base.json
├── .oxlintrc.json  .oxfmtrc.json  commitlint.config.mjs  lefthook.yml
├── .nvmrc  .editorconfig  .gitignore
└── README.md
```

### Branching (set up before Step 1)

```bash
git tag v1-mongo
```
```bash
git switch -c develop && git push -u origin develop
```

From here on, work in `feat/*` branches, open a PR into `develop`, and release with a PR from `develop` into `main` (that PR triggers CD). Steps 6–14 change the API contract, so the app stays broken between them. Do them on one long-lived branch, or accept a broken `develop` for a while.

Data: there's no production data, so **no Mongo → Postgres data migration**. A Prisma seed script provides demo data instead.

---

### Step 1: Convert to a pnpm monorepo

**1.1 Move the projects with git history kept**
```bash
mkdir -p apps docs
```
```bash
git mv client apps/web && git mv server apps/api && git mv sequence-diagram.puml docs/
```
```bash
rm apps/web/package-lock.json apps/api/package-lock.json apps/web/README.md apps/api/README.md
```

**1.2 Root files**

`pnpm-workspace.yaml`:
```yaml
packages:
  - apps/*
  - packages/*

# one version of shared deps across the repo
catalog:
  typescript: ^5.9.0
  zod: ^4.1.0
  vitest: ^4.0.0
  '@types/node': ^24.0.0

# needed by `pnpm deploy` in the api Dockerfile
injectWorkspacePackages: true
```
Check the latest majors when you write the catalog. Packages then use `"zod": "catalog:"`.

Root `package.json` (`pnpm init`, then edit):
```json
{
  "name": "chat-app",
  "private": true,
  "packageManager": "pnpm@<output of pnpm -v>",
  "engines": { "node": ">=24" },
  "scripts": {
    "dev": "pnpm --filter @chat/shared build && pnpm -r --parallel dev",
    "build": "pnpm -r build",
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "lint": "oxlint",
    "lint:fix": "oxlint --fix",
    "format": "oxfmt",
    "format:check": "oxfmt --check",
    "infra:up": "docker compose up -d",
    "infra:down": "docker compose down",
    "db:migrate": "pnpm --filter @chat/api db:migrate",
    "db:seed": "pnpm --filter @chat/api db:seed",
    "prepare": "lefthook install"
  }
}
```

Rename the apps: in `apps/web/package.json` set `"name": "@chat/web"`, and in `apps/api/package.json` set `"name": "@chat/api"`.

Add `.nvmrc` containing `24`, plus `.editorconfig`.

Write a root `.gitignore` that merges the two existing ones (`node_modules`, `dist`, `coverage`, `.env`, `.env.*`, `!.env.example`, `apps/api/src/generated`, `.DS_Store`, `.idea`, `.vscode/*`) and delete the per-app ones.

**1.3 Install**
```bash
pnpm install
```
If pnpm asks about build scripts (`@swc/core`, `esbuild`, `prisma`…), run `pnpm approve-builds` and allow them. The approvals are saved in `pnpm-workspace.yaml`.

**Done when** `pnpm --filter @chat/api start:dev` and `pnpm --filter @chat/web start` run the old app as before.
**Commit:** `chore(repo): convert to pnpm workspace monorepo`

---

### Step 2: Shared tooling (TypeScript base, oxlint, oxfmt, commits)

**2.1 Remove the old tooling**

Run this in `apps/api`:
```bash
pnpm remove eslint prettier eslint-config-prettier eslint-plugin-prettier @typescript-eslint/eslint-plugin @typescript-eslint/parser
```
Then delete `apps/api/.eslintrc.js`, `apps/api/.prettierrc`, and the `eslintConfig` block in `apps/web/package.json`.

**2.2 Root dev deps**
```bash
pnpm add -Dw oxlint oxfmt typescript @commitlint/cli @commitlint/config-conventional lefthook
```

**2.3 `tsconfig.base.json`**
```json
{
  "compilerOptions": {
    "target": "ES2023",
    "strict": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  }
}
```
Every package's `tsconfig.json` uses `"extends": "../../tsconfig.base.json"`. The api inherits `strict: true`, which turns `strictNullChecks` back on. That's intended; the api rewrite in Steps 7–10 is written strict from the start.

**2.4 `.oxlintrc.json`**
```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["typescript", "unicorn", "oxc", "import", "react", "jsx-a11y", "vitest"],
  "categories": { "correctness": "error", "suspicious": "warn" },
  "env": { "browser": true, "node": true, "es2024": true },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/exhaustive-deps": "warn",
    "typescript/no-explicit-any": "warn",
    "no-console": ["warn", { "allow": ["warn", "error"] }]
  },
  "ignorePatterns": ["**/dist/**", "**/generated/**", "**/coverage/**", "apps/web/src/components/ui/**"]
}
```

**2.5 `.oxfmtrc.json`**

These settings follow the existing server `.prettierrc`:
```json
{
  "$schema": "./node_modules/oxfmt/configuration_schema.json",
  "printWidth": 100,
  "singleQuote": true,
  "trailingComma": "all",
  "sortImports": {},
  "sortTailwindcss": {},
  "ignorePatterns": ["pnpm-lock.yaml", "**/dist/**", "**/generated/**", "**/migrations/**"]
}
```

**2.6 Conventional commits**

`commitlint.config.mjs`:
```js
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [1, 'always', ['web', 'api', 'shared', 'db', 'infra', 'ci', 'deps', 'docs', 'repo']],
  },
};
```

`lefthook.yml`:
```yaml
pre-commit:
  parallel: true
  commands:
    format:
      glob: '*.{js,mjs,ts,tsx,json,css,md,yml,yaml}'
      run: pnpm oxfmt {staged_files}
      stage_fixed: true
    lint:
      glob: '*.{js,mjs,ts,tsx}'
      run: pnpm oxlint {staged_files}
commit-msg:
  commands:
    commitlint:
      run: pnpm commitlint --edit {1}
```

Then run:
```bash
pnpm install
```
This triggers the `prepare` script, which runs `lefthook install`. After that:
```bash
pnpm format
```
Commit the formatting change on its own, then add that commit's hash to `.git-blame-ignore-revs`.

**Done when** `pnpm lint` and `pnpm format:check` pass, and `git commit -m "bad message"` is rejected.
**Commits:** `chore(repo): add oxlint, oxfmt, commitlint and lefthook`, then `style(repo): format codebase with oxfmt`

---

### Step 3: Frontend on Vite + React 19 + Vitest

Do this before the UI rewrite so the rewrite happens on the new toolchain.

**3.1 Dependencies**

Run these in `apps/web`. First remove the old toolchain:
```bash
pnpm remove react-scripts web-vitals jest babel-jest jest-environment-jsdom @babel/preset-env @babel/preset-react @babel/preset-typescript @types/jest intersection-observer
```
Add the Vite toolchain:
```bash
pnpm add -D vite @vitejs/plugin-react vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom @types/react @types/react-dom
```
Upgrade React:
```bash
pnpm add react@latest react-dom@latest
```
Then delete `babel.config.js`, `jest.config.js`, `jest.setup.ts` and `__mocks__/`.

**3.2 Move `public/index.html` → `apps/web/index.html`**
```html
<!doctype html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Chat App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```
Rename `src/index.tsx` to `src/main.tsx` and `src/index.css` to `src/styles.css`.

**3.3 `vite.config.ts`**

The dev proxy means the frontend always calls relative `/api` and `/socket.io`. That's the same in production behind Caddy, so the dev server needs no CORS and the client code needs no hard-coded URLs.
```ts
/// <reference types="vitest/config" />
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/socket.io': { target: 'http://localhost:3000', ws: true },
    },
  },
  test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test/setup.ts'] },
});
```
Create `src/test/setup.ts` containing `import '@testing-library/jest-dom/vitest';`.

**3.4 `tsconfig.json`**

Extend the base, then add:
`"module": "ESNext"`, `"moduleResolution": "bundler"`, `"jsx": "react-jsx"`, `"lib": ["ES2023","DOM","DOM.Iterable"]`, `"types": ["vite/client","vitest/globals"]`, `"noEmit": true`, `"paths": { "@/*": ["./src/*"] }`.

**3.5 Scripts**

`"dev": "vite"`, `"build": "tsc --noEmit && vite build"`, `"preview": "vite preview"`, `"typecheck": "tsc --noEmit"`, `"test": "vitest run"`, `"test:watch": "vitest"`.

**3.6 Code changes**

Replace `process.env.REACT_APP_API_URL` with `'/api'`. Replace `io("ws://localhost:5000", …)` with `io(…)` (same origin). Change the api port to 3000 in `main.ts`. In the old tests, replace `jest.fn()` with `vi.fn()`. They get rewritten in Step 15 anyway.

**Done when** `pnpm --filter @chat/web dev` serves the old UI on :5173, and `pnpm --filter @chat/web build` and `test` pass.
**Commit:** `build(web): migrate from CRA to Vite, React 19 and Vitest`

---

### Step 4: `packages/shared` (zod schemas, DTO types, socket contracts, utilities)

This package is the **single source of truth** for everything that crosses the network, REST *and* WebSocket. The api (validation) and the web app (forms, types, socket typing) both import it.

**4.1 Package setup**
```bash
mkdir -p packages/shared/src && cd packages/shared && pnpm init
```
```bash
pnpm add zod@catalog: date-fns
```
```bash
pnpm add -D tsdown typescript@catalog: vitest@catalog:
```

`package.json`. The output is built twice because Vite consumes ESM and Nest consumes CJS:
```json
{
  "name": "@chat/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "import": { "types": "./dist/index.d.mts", "default": "./dist/index.mjs" },
      "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" }
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsdown",
    "dev": "tsdown --watch",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

`tsdown.config.ts`:
```ts
import { defineConfig } from 'tsdown';
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  fixedExtension: true, // .mjs/.cjs + .d.mts/.d.cts, matches "exports"
});
```

Add the package to both apps:
```bash
pnpm --filter @chat/api --filter @chat/web add @chat/shared@workspace:*
```

**4.2 File layout**
```
packages/shared/src/
├── index.ts               # re-exports everything
├── constants.ts           # LIMITS
├── schemas/
│   ├── auth.ts
│   ├── user.ts
│   ├── chat.ts            # + chat:read / typing event payloads
│   ├── message.ts         # + message:send / edit / delete event payloads
│   └── attachment.ts
├── socket-events.ts       # typed Socket.IO contracts + Ack<T>
└── utils/
    ├── date.ts            # replaces moment
    ├── chat.ts            # permissions, directKey, read helpers
    └── text.ts
```

**4.3 Key contents**

Use zod 4 syntax throughout.

`constants.ts`:
```ts
export const LIMITS = {
  USERNAME_MIN: 2,
  USERNAME_MAX: 25,
  PASSWORD_MIN: 8,
  ABOUT_MAX: 100,
  CHAT_NAME_MIN: 3,
  CHAT_NAME_MAX: 50,
  CHAT_DESCRIPTION_MAX: 255,
  MESSAGE_MAX: 4000,
  ATTACHMENTS_PER_MESSAGE: 10,
  ATTACHMENT_MAX_BYTES: 5 * 1024 * 1024,
  MESSAGES_PAGE_SIZE: 50,
} as const;
export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;
```

`schemas/auth.ts`:
```ts
export const usernameSchema = z
  .string()
  .trim()
  .min(LIMITS.USERNAME_MIN)
  .max(LIMITS.USERNAME_MAX)
  .regex(/^[a-zA-Z0-9_.]+$/, 'Only letters, digits, "_" and "."');
export const signUpSchema = z.object({
  email: z.email(),
  username: usernameSchema,
  password: z.string().min(LIMITS.PASSWORD_MIN).max(72),
});
export const logInSchema = z.object({ username: usernameSchema, password: z.string().min(1) });
export type SignUpInput = z.infer<typeof signUpSchema>;
export type LogInInput = z.infer<typeof logInSchema>;
```

`schemas/user.ts`:
```ts
export const publicUserSchema = z.object({
  id: z.uuid(),
  username: z.string(),
  about: z.string(),
  isOnline: z.boolean(),
  lastSeenAt: z.iso.datetime().nullable(), // null when the user hides it
  isFriend: z.boolean(),
  allowFriendRequests: z.boolean(),
});
export const meSchema = publicUserSchema
  .omit({ isOnline: true, isFriend: true })
  .extend({ email: z.email(), hideLastSeen: z.boolean(), hideInSearch: z.boolean() });
export const updateMeSchema = z
  .object({
    username: usernameSchema,
    about: z.string().max(LIMITS.ABOUT_MAX),
    hideLastSeen: z.boolean(),
    hideInSearch: z.boolean(),
    allowFriendRequests: z.boolean(),
  })
  .partial();
export type PublicUserDto = z.infer<typeof publicUserSchema>;
export type MeDto = z.infer<typeof meSchema>;
export type UpdateMeInput = z.infer<typeof updateMeSchema>;
```

`schemas/chat.ts`. A discriminated union replaces the old `privateChat`/`public` flag confusion, and the member carries the **read cursor** (§2.9):
```ts
export const chatTypeSchema = z.enum(['DIRECT', 'GROUP']);
export const chatRoleSchema = z.enum(['OWNER', 'MEMBER']);

export const createChatSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('DIRECT'), userId: z.uuid() }),
  z.object({
    type: z.literal('GROUP'),
    name: z.string().trim().min(LIMITS.CHAT_NAME_MIN).max(LIMITS.CHAT_NAME_MAX),
    description: z.string().trim().max(LIMITS.CHAT_DESCRIPTION_MAX).optional(),
    isPublic: z.boolean(),
    memberIds: z.array(z.uuid()).max(100),
  }),
]);
export const chatMemberSchema = z.object({
  userId: z.uuid(),
  username: z.string(),
  role: chatRoleSchema,
  lastReadSeq: z.number().int(), // "has read everything up to and including this seq"
});
export const chatSummarySchema = z.object({
  id: z.uuid(),
  type: chatTypeSchema,
  title: z.string(), // group name or the other user's username, resolved on the server
  isPublic: z.boolean(),
  isMember: z.boolean(),
  unreadCount: z.number().int(),
  lastMessage: z.object({ preview: z.string(), createdAt: z.iso.datetime() }).nullable(),
});
export const chatDetailsSchema = chatSummarySchema.extend({
  description: z.string().nullable(),
  createdAt: z.iso.datetime(),
  members: z.array(chatMemberSchema),
});

// WebSocket payloads
export const markReadEventSchema = z.object({ chatId: z.uuid(), seq: z.number().int().min(0) });
export const typingEventSchema = z.object({ chatId: z.uuid(), isTyping: z.boolean() });

export type CreateChatInput = z.infer<typeof createChatSchema>;
export type ChatMemberDto = z.infer<typeof chatMemberSchema>;
export type ChatSummaryDto = z.infer<typeof chatSummarySchema>;
export type ChatDetailsDto = z.infer<typeof chatDetailsSchema>;
export type MarkReadEventInput = z.infer<typeof markReadEventSchema>;
export type TypingEventInput = z.infer<typeof typingEventSchema>;
```
Resolving `title` on the server removes the N+1 `getOneUser` calls the UI makes today.

`schemas/attachment.ts`:
```ts
export const attachmentSchema = z.object({
  id: z.uuid(),
  fileName: z.string(),
  mimeType: z.string(),
  size: z.number().int(),
  url: z.url(),
});
export type AttachmentDto = z.infer<typeof attachmentSchema>;
```

`schemas/message.ts`. The refine rule is a plain function, and the event schema extends the *unrefined* base object (extending a refined schema is a zod footgun):
```ts
const sendMessageBase = z.object({
  content: z.string().trim().max(LIMITS.MESSAGE_MAX).optional(),
  replyToId: z.uuid().optional(),
  attachmentIds: z.array(z.uuid()).max(LIMITS.ATTACHMENTS_PER_MESSAGE).default([]),
});
const hasContentOrFiles = (m: { content?: string; attachmentIds: string[] }) =>
  !!m.content || m.attachmentIds.length > 0;
const EMPTY_MESSAGE = 'Message cannot be empty';

/** composer form */
export const sendMessageSchema = sendMessageBase.refine(hasContentOrFiles, EMPTY_MESSAGE);

// WebSocket payloads (`clientId` makes a retried send idempotent)
export const sendMessageEventSchema = sendMessageBase
  .extend({ chatId: z.uuid(), clientId: z.uuid() })
  .refine(hasContentOrFiles, EMPTY_MESSAGE);
export const editMessageEventSchema = z.object({
  messageId: z.uuid(),
  content: z.string().trim().min(1).max(LIMITS.MESSAGE_MAX),
});
export const deleteMessageEventSchema = z.object({ messageId: z.uuid() });

// REST: history
export const messagesQuerySchema = z.object({
  before: z.coerce.number().int().positive().optional(), // seq of the oldest message you already have
  limit: z.coerce.number().int().min(1).max(100).default(LIMITS.MESSAGES_PAGE_SIZE),
});

export const messageSchema = z.object({
  id: z.uuid(),
  chatId: z.uuid(),
  seq: z.number().int(), // per-chat, gap-free, drives ordering, pagination and read cursors
  clientId: z.uuid().nullable(),
  sender: z.object({ id: z.uuid(), username: z.string() }).nullable(),
  content: z.string().nullable(),
  replyTo: z
    .object({ id: z.uuid(), senderUsername: z.string().nullable(), preview: z.string() })
    .nullable(),
  attachments: z.array(attachmentSchema),
  createdAt: z.iso.datetime(),
  editedAt: z.iso.datetime().nullable(),
});
export const messagesPageSchema = z.object({
  items: z.array(messageSchema), // newest first
  nextBefore: z.number().int().nullable(), // pass as `before` to load older; null = no more
});

export type MessageDto = z.infer<typeof messageSchema>;
export type MessagesPage = z.infer<typeof messagesPageSchema>;
export type SendMessageEventInput = z.input<typeof sendMessageEventSchema>;
export type SendMessageEventOutput = z.output<typeof sendMessageEventSchema>; // what the service receives after parsing
export type EditMessageEventInput = z.infer<typeof editMessageEventSchema>;
export type DeleteMessageEventInput = z.infer<typeof deleteMessageEventSchema>;
```

`socket-events.ts`. This file is the whole realtime contract. The server's gateway and the client's socket both use it as generics:
```ts
export type Ack<T = void> = { ok: true; data: T } | { ok: false; error: string };
type AckFn<T = void> = (response: Ack<T>) => void;

export interface ClientToServerEvents {
  'message:send': (input: SendMessageEventInput, ack: AckFn<MessageDto>) => void;
  'message:edit': (input: EditMessageEventInput, ack: AckFn<MessageDto>) => void;
  'message:delete': (input: DeleteMessageEventInput, ack: AckFn) => void;
  'chat:read': (input: MarkReadEventInput) => void; // fire-and-forget
  typing: (input: TypingEventInput) => void; // fire-and-forget, volatile
}

export interface ServerToClientEvents {
  'message:created': (message: MessageDto) => void;
  'message:updated': (message: MessageDto) => void;
  'message:deleted': (payload: { chatId: string; messageId: string }) => void;
  'chat:read': (payload: { chatId: string; userId: string; seq: number }) => void;
  typing: (payload: { chatId: string; userId: string; username: string; isTyping: boolean }) => void;
  'chat:changed': (payload: { chatId: string }) => void; // created / someone joined → refetch lists
  'presence:changed': (payload: { userId: string; isOnline: boolean }) => void;
}
```

`utils/chat.ts`. Pure rules used by the **api (enforcement) and the web app (showing or hiding buttons)**, so the two can't drift apart:
```ts
/** "<smallerId>:<biggerId>", the unique key that prevents duplicate DMs */
export const directKey = (a: string, b: string) => [a, b].sort().join(':');

export const canEditMessage = (myId: string, senderId: string | null) => senderId === myId;

export function canDeleteMessage(args: {
  chatType: 'DIRECT' | 'GROUP';
  myRole: 'OWNER' | 'MEMBER';
  myId: string;
  senderId: string | null;
}) {
  if (args.senderId === args.myId) return true;
  return args.chatType === 'DIRECT' || args.myRole === 'OWNER';
}

export const isReadBy = (messageSeq: number, member: { lastReadSeq: number }) =>
  member.lastReadSeq >= messageSeq;
```

`utils/date.ts` (date-fns replaces moment):
```ts
export const formatTime = (iso: string) => format(new Date(iso), 'HH:mm');
export const formatDateTime = (iso: string) => format(new Date(iso), 'dd.MM.yyyy HH:mm');
export const formatLastSeen = (u: { isOnline: boolean; lastSeenAt: string | null }) =>
  u.isOnline
    ? 'online'
    : u.lastSeenAt
      ? `last seen ${formatDistanceToNow(new Date(u.lastSeenAt), { addSuffix: true })}`
      : 'last seen recently';
```

`utils/text.ts`: `getInitials(name)` and `truncate(text, max)` (used for reply and chat-list previews).

**4.4 Tests**

Add `src/**/*.test.ts` covering:
- `signUpSchema`, `createChatSchema` and `sendMessageSchema` (empty message rejected, attachments-only accepted).
- `sendMessageEventSchema` (non-uuid `clientId` rejected).
- `canDeleteMessage` (author, DIRECT member, group owner → true; plain group member → false).
- `formatLastSeen` and `truncate`.

**Done when** `pnpm --filter @chat/shared build test` passes and `dist/` contains `.mjs`, `.cjs`, `.d.mts` and `.d.cts`.
**Commit:** `feat(shared): add shared zod schemas, socket contracts and utils`

---

### Step 5: Local infrastructure (`docker-compose.yml`)

Root `docker-compose.yml`:
```yaml
name: chat-app

services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: chat
      POSTGRES_PASSWORD: chat
      POSTGRES_DB: chat
    ports: ['5432:5432']
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U chat -d chat']
      interval: 5s
      retries: 10

  s3:
    image: chrislusf/seaweedfs:latest
    command: server -dir=/data -s3 -s3.port=8333
    ports: ['8333:8333']
    volumes: [s3data:/data]

  # Optional: run the whole stack in containers → `docker compose --profile full up --build`
  api:
    profiles: [full]
    build: { context: ., dockerfile: apps/api/Dockerfile }
    env_file: apps/api/.env
    environment:
      DATABASE_URL: postgresql://chat:chat@postgres:5432/chat
      S3_ENDPOINT: http://s3:8333
      S3_PUBLIC_ENDPOINT: http://localhost:8333
    depends_on:
      postgres: { condition: service_healthy }
      s3: { condition: service_started }

  web:
    profiles: [full]
    build: { context: ., dockerfile: apps/web/Dockerfile }
    environment: { SITE_ADDRESS: ':80' }
    ports: ['8080:80']
    depends_on: [api]

volumes:
  pgdata:
  s3data:
```

`apps/api/.env.example` (copy it to `.env`):
```bash
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://chat:chat@localhost:5432/chat
JWT_SECRET=change-me-to-a-long-random-string-at-least-32-chars
JWT_EXPIRES_IN=7d
# key ring "<id>:<base64 of 32 random bytes>[,<id>:<...>]". Generate: echo "1:$(openssl rand -base64 32)"
MESSAGE_KEYS=
# which key id encrypts new messages
MESSAGE_KEY_ID=1
S3_BUCKET=chat-attachments
S3_REGION=us-east-1
S3_ENDPOINT=http://localhost:8333
S3_PUBLIC_ENDPOINT=http://localhost:8333
S3_ACCESS_KEY_ID=dev
S3_SECRET_ACCESS_KEY=dev
```
SeaweedFS has no identities configured, so it accepts any credentials in dev. In production, leave out `S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT` and both key variables; the SDK then uses the EC2 instance role.

**Done when** `pnpm infra:up` starts both containers and `curl localhost:8333` answers.
**Commit:** `chore(infra): add docker compose with postgres and seaweedfs`

---

### Step 6: Database schema with Prisma (PostgreSQL)

**6.1 Data model**

What changes versus the Mongo model, and why:

| Old (Mongo) | New (Postgres) | Why |
|---|---|---|
| `chat.history[]` embedded | `messages` table with a per-chat `seq`, unique on `(chat_id, seq)` | Pagination, no 16 MB document limit, no loading the whole history |
| `message.readBy[]` per message | `chat_members.last_read_seq` (integer cursor) | One number per member. Unread count = `count(seq > cursor)`. Read receipt = `member.last_read_seq ≥ message.seq`. See §2.9. |
| (new) | `messages.seq` + `chats.last_seq` | A gap-free per-chat counter, incremented in the send transaction. It gives ordering, pagination and read cursors, and lets the client detect a missed message. |
| (new) | `messages.client_id`, unique with `sender_id` | Makes a retried send idempotent (no duplicates when an ack is lost) |
| `user.chats[]` and `chat.users[]` (two-way, duplicated) | `chat_members` join table with `role` | Single source of truth. `OWNER` replaces "`users[0]` is the creator". |
| `user.friends[]` on both docs | `friendships` table (two symmetric rows per pair) | Simple `WHERE user_id = me` queries. Behaviour stays "instant mutual add". |
| `private` / `public` booleans | `type: DIRECT \| GROUP` + `is_public` | Clear meaning. `direct_key` (unique) blocks duplicate DMs no matter who started them. |
| `user.online` boolean | In-memory presence (Step 10) + `last_seen_at` column | Works with multiple tabs and needs no DB writes per connection |
| `message.sentByName` | Join to `users` | No stale names after a username change |
| `message.status`, `type`, `translatedFrom`, `modified` | Dropped; `edited_at` replaces `modified` | Unused or derivable |
| `images` collection holding binary | `attachments` table: metadata + `storage_key`; bytes live in S3 | Your requirement |

**6.2 Install**

Run these in `apps/api`:
```bash
pnpm remove @nestjs/mongoose mongoose mongodb
```
```bash
pnpm add @prisma/client @prisma/adapter-pg pg prisma dotenv
```
```bash
pnpm add -D @types/pg tsx
```
`prisma` goes in `dependencies` (not dev) because the container runs `prisma migrate deploy`.

**6.3 `apps/api/prisma.config.ts`**
```ts
import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' },
  datasource: { url: env('DATABASE_URL') },
});
```

**6.4 `apps/api/prisma/schema.prisma`**
```prisma
generator client {
  provider     = "prisma-client"
  output       = "../src/generated/prisma"
  moduleFormat = "cjs"
}

datasource db {
  provider = "postgresql"
}

enum ChatType {
  DIRECT
  GROUP
}

enum ChatRole {
  OWNER
  MEMBER
}

model User {
  id                  String   @id @default(uuid()) @db.Uuid
  username            String   @unique @db.VarChar(25)
  email               String   @unique @db.VarChar(255)
  passwordHash        String   @map("password_hash")
  about               String   @default("") @db.VarChar(100)
  lastSeenAt          DateTime @default(now()) @map("last_seen_at")
  hideLastSeen        Boolean  @default(false) @map("hide_last_seen")
  hideInSearch        Boolean  @default(false) @map("hide_in_search")
  allowFriendRequests Boolean  @default(true) @map("allow_friend_requests")
  createdAt           DateTime @default(now()) @map("created_at")
  updatedAt           DateTime @updatedAt @map("updated_at")

  memberships  ChatMember[]
  messages     Message[]
  attachments  Attachment[]
  createdChats Chat[]
  friendships  Friendship[] @relation("UserFriendships")
  friendOf     Friendship[] @relation("FriendOfUser")

  @@map("users")
}

model Friendship {
  userId    String   @map("user_id") @db.Uuid
  friendId  String   @map("friend_id") @db.Uuid
  createdAt DateTime @default(now()) @map("created_at")

  user   User @relation("UserFriendships", fields: [userId], references: [id], onDelete: Cascade)
  friend User @relation("FriendOfUser", fields: [friendId], references: [id], onDelete: Cascade)

  @@id([userId, friendId])
  @@map("friendships")
}

model Chat {
  id            String    @id @default(uuid()) @db.Uuid
  type          ChatType
  name          String?   @db.VarChar(50)
  description   String?   @db.VarChar(255)
  isPublic      Boolean   @default(false) @map("is_public")
  /// "<smallerUserId>:<biggerUserId>" for DIRECT chats; prevents duplicate DMs
  directKey     String?   @unique @map("direct_key")
  createdById   String?   @map("created_by_id") @db.Uuid
  lastMessageAt DateTime? @map("last_message_at")
  /// seq of the newest message; the next message gets lastSeq + 1
  lastSeq       Int       @default(0) @map("last_seq")
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")

  createdBy User?        @relation(fields: [createdById], references: [id], onDelete: SetNull)
  members   ChatMember[]
  messages  Message[]

  @@index([isPublic, name])
  @@map("chats")
}

model ChatMember {
  chatId     String   @map("chat_id") @db.Uuid
  userId     String   @map("user_id") @db.Uuid
  role       ChatRole @default(MEMBER)
  joinedAt   DateTime @default(now()) @map("joined_at")
  /// "has read everything up to and including this seq"; only ever moves forward
  lastReadSeq Int      @default(0) @map("last_read_seq")

  chat Chat @relation(fields: [chatId], references: [id], onDelete: Cascade)
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([chatId, userId])
  @@index([userId])
  @@map("chat_members")
}

model Message {
  /// generated by the app (randomUUID), because it is part of the encryption AAD
  id        String    @id @default(uuid()) @db.Uuid
  chatId    String    @map("chat_id") @db.Uuid
  /// per-chat sequence number, 1, 2, 3 …
  seq       Int
  /// client-generated uuid; (sender_id, client_id) is unique → idempotent sends
  clientId  String?   @map("client_id") @db.Uuid
  senderId  String?   @map("sender_id") @db.Uuid
  /// AES-256-GCM ciphertext "<keyId>.<iv>.<tag>.<data>" (base64 parts); null for attachment-only messages
  content   String?
  replyToId String?   @map("reply_to_id") @db.Uuid
  createdAt DateTime  @default(now()) @map("created_at")
  editedAt  DateTime? @map("edited_at")

  chat        Chat         @relation(fields: [chatId], references: [id], onDelete: Cascade)
  sender      User?        @relation(fields: [senderId], references: [id], onDelete: SetNull)
  replyTo     Message?     @relation("Replies", fields: [replyToId], references: [id], onDelete: SetNull)
  replies     Message[]    @relation("Replies")
  attachments Attachment[]

  @@unique([chatId, seq]) // also serves history queries: WHERE chat_id AND seq < :before ORDER BY seq DESC
  @@unique([senderId, clientId])
  @@map("messages")
}

model Attachment {
  id         String   @id @default(uuid()) @db.Uuid
  uploaderId String   @map("uploader_id") @db.Uuid
  /// null until the message is sent
  messageId  String?  @map("message_id") @db.Uuid
  storageKey String   @unique @map("storage_key")
  fileName   String   @map("file_name") @db.VarChar(255)
  mimeType   String   @map("mime_type") @db.VarChar(100)
  size       Int
  createdAt  DateTime @default(now()) @map("created_at")

  uploader User     @relation(fields: [uploaderId], references: [id], onDelete: Cascade)
  message  Message? @relation(fields: [messageId], references: [id], onDelete: Cascade)

  @@index([messageId])
  @@map("attachments")
}
```

**6.5 Scripts in `apps/api/package.json`**
```json
"db:generate": "prisma generate",
"db:migrate": "prisma migrate dev",
"db:deploy": "prisma migrate deploy",
"db:seed": "prisma db seed",
"db:studio": "prisma studio",
"postinstall": "prisma generate"
```
Then run:
```bash
pnpm db:migrate --name init
```

**6.6 `prisma/seed.ts`**

Create 3 users (`alice`, `bob`, `carol`, password `password123`, hashed with bcryptjs), make them friends, and add one DM plus one public group with a few messages. Messages must be encrypted with the same helper as Step 8: import `encrypt` from `src/modules/crypto/encryption.ts`, build the key ring from `env`, generate each message id with `randomUUID()` first, and set `seq` 1, 2, 3… per chat (and `chats.last_seq` to match).

**6.7 Docs**

Write `docs/database.md` with a Mermaid `erDiagram` of the 6 tables. GitHub renders it, and it's ready for the thesis.

**Done when** the migration applies, `pnpm db:seed` works, and Prisma Studio shows the data.
**Commit:** `feat(db): replace MongoDB with PostgreSQL and Prisma schema`

---

### Step 7: Backend foundation (config, Prisma, validation, auth, users)

**7.1 Dependencies**
```bash
pnpm add @nestjs/common@latest @nestjs/core@latest @nestjs/platform-express@latest @nestjs/platform-socket.io@latest @nestjs/websockets@latest @nestjs/jwt@latest @nestjs/throttler @nestjs/event-emitter helmet bcryptjs zod@catalog:
```
```bash
pnpm add -D @nestjs/cli@latest @nestjs/testing@latest
```
```bash
pnpm remove @nestjs/config @nestjs/passport @nestjs/mapped-types passport passport-jwt passport-local jsonwebtoken class-validator class-transformer bcrypt uuid @types/bcrypt @types/passport-jwt @types/passport-local @types/uuid
```

- **NestJS 10 → 11** comes with Express 5. Path wildcards change syntax, which isn't an issue for these routes.
- **`bcryptjs` replaces `bcrypt`**: pure JS, so there's no native build in Docker or pnpm.
- **`@nestjs/event-emitter` stays**, with a new job: services publish *domain events* and the gateway listens (Step 8/10), so services never import socket code and modules have no circular dependencies.
- `uuid` is gone because `node:crypto`'s `randomUUID()` does the same.

**7.2 `tsconfig.json`**

Extend the base, then add:
`"module": "nodenext"`, `"moduleResolution": "nodenext"`, `"emitDecoratorMetadata": true`, `"experimentalDecorators": true`, `"outDir": "./dist"`, `"sourceMap": true`, `"incremental": true`, `"types": ["node", "vitest/globals"]`.

**7.3 Delete the old code**

Delete `src/chat`, `src/image`, `src/user`, `src/pipes`, `src/guards` and `src/strategies`, then rebuild the modules following the target structure. The old logic is small, and rewriting is cleaner than editing it.

**7.4 `src/config/env.ts`**

This validates environment variables once at startup and fails fast:
```ts
import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.url(),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),
  MESSAGE_KEYS: z.string().transform((raw, ctx) => {
    try {
      return parseKeyring(raw); // "1:<base64>,2:<base64>" → Map<number, Buffer>, each key must be 32 bytes
    } catch (e) {
      ctx.addIssue({ code: 'custom', message: (e as Error).message });
      return z.NEVER;
    }
  }),
  MESSAGE_KEY_ID: z.coerce.number().int(),
  S3_BUCKET: z.string().min(1),
  S3_REGION: z.string().default('us-east-1'),
  S3_ENDPOINT: z.url().optional(),
  S3_PUBLIC_ENDPOINT: z.url().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
});

export const env = envSchema
  .refine((e) => e.MESSAGE_KEYS.has(e.MESSAGE_KEY_ID), { message: 'MESSAGE_KEY_ID is not in MESSAGE_KEYS' })
  .parse(process.env);
```
`parseKeyring` lives in `src/config/keyring.ts`: split on `,`, then on the first `:`; the id must be digits and `Buffer.from(key, 'base64').length` must be 32, otherwise throw `MESSAGE_KEYS must look like "1:<base64 of 32 bytes>"`.

**7.5 `src/prisma/prisma.service.ts`**

Wrap it in a `@Global()` `PrismaModule` that exports the service:
```ts
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../config/env';
import { PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });
  }
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

**7.6 `src/common/` (replaces the class-validator DTOs and custom pipes)**

`zod-validation.pipe.ts`:
```ts
@Injectable()
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform {
  constructor(private readonly schema: T) {}
  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: result.error.issues[0]?.message ?? 'Validation failed',
        issues: result.error.issues,
      });
    }
    return result.data;
  }
}
```

`auth/jwt-auth.guard.ts`:
- Register it as a global `APP_GUARD`.
- **Return `true` immediately when `context.getType() !== 'http'`.** Global guards also run for WebSocket gateway handlers, and a socket has no `Authorization` header. The socket is authenticated by the handshake middleware in Step 10 instead.
- Skip routes marked `@Public()`, detected with `Reflector`.
- Verify `Authorization: Bearer <token>` and set `request.user = { id: payload.sub, username: payload.username }`.

`auth/current-user.decorator.ts`:
```ts
export type AuthUser = { id: string; username: string };
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);
```

**7.7 `main.ts`**
```ts
const app = await NestFactory.create(AppModule);
app.use(helmet());
app.setGlobalPrefix('api');
app.enableShutdownHooks();
await app.listen(env.PORT);
```
There's no CORS: in dev the Vite proxy forwards requests, and in production Caddy serves everything from one origin.

Logging: use Nest's `Logger` with ids only, **never message content or request bodies**, and leave Prisma query logging off in production (queries and params would contain ciphertext, but keep the habit).

**7.8 `AppModule`**
```ts
@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: env.JWT_SECRET,
      signOptions: { expiresIn: env.JWT_EXPIRES_IN },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    EventEmitterModule.forRoot(),
    PrismaModule, PresenceModule, CryptoModule, StorageModule, RealtimeModule,
    AuthModule, UsersModule, ChatsModule, MessagesModule, AttachmentsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: HttpThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
```
Registering `JwtModule` once with `global: true` replaces the 3 copies. Add `@Throttle({ default: { limit: 5, ttl: 60_000 } })` on log-in and sign-up.

`HttpThrottlerGuard` is `ThrottlerGuard` limited to HTTP, because the stock guard doesn't understand socket contexts:
```ts
@Injectable()
export class HttpThrottlerGuard extends ThrottlerGuard {
  canActivate(context: ExecutionContext) {
    return context.getType() === 'http' ? super.canActivate(context) : Promise.resolve(true);
  }
}
```
Sockets get their own limiter in Step 10.

**7.9 `modules/auth`**

| Route | Body | Returns |
|---|---|---|
| `POST /api/auth/sign-up` `@Public()` | `signUpSchema` | `{ accessToken, user: MeDto }` |
| `POST /api/auth/log-in` `@Public()` | `logInSchema` | `{ accessToken, user: MeDto }` |
| `GET /api/auth/me` | none | `MeDto` |

- The JWT payload is **only** `{ sub: user.id, username }`. Tokens are never re-issued after profile or chat changes; the client just refetches `me`. This replaces `POST /user/check`.
- Sign-up checks that the username and email are unique. Map Prisma error `P2002` to a `409 Conflict`.
- Hash with `bcryptjs.hash(pw, 10)`.

**7.10 `modules/users`**

| Route | Notes |
|---|---|
| `GET /api/users/search?q=` | `username: { contains: q, mode: 'insensitive' }` (plain text, no regex), `hideInSearch: false`, `id: { not: me }`, `take: 20` |
| `GET /api/users/:id` | `PublicUserDto`. `isOnline` comes from `PresenceService`. `lastSeenAt: null` if `hideLastSeen`. |
| `PATCH /api/users/me` | `updateMeSchema`, then return `MeDto` |
| `GET /api/users/me/friends` | `PublicUserDto[]` |
| `POST /api/users/:id/friend` | Check `allowFriendRequests`. Create both `friendships` rows in one `$transaction` (`skipDuplicates`). |
| `DELETE /api/users/:id/friend` | Delete both rows |

Put a `toPublicUser(user, { isOnline, isFriend })` mapper in `users.mapper.ts`.

**Done when**
- `pnpm --filter @chat/api build` passes with `strict: true`.
- You can sign up, log in and call `GET /api/auth/me` with the token (curl or a `.http` file).
- Invalid bodies return a 400 that includes the zod issues.

**Commit:** `feat(api): rebuild auth and users on prisma with zod validation`

---

### Step 8: Chats, messages, read cursors and message encryption

Everything in this step is **transport-agnostic**. Services take a user id and plain input, throw normal Nest exceptions (`ForbiddenException`, …) and publish *domain events*. They never import socket code. The gateway (Step 10) is the only place that knows about sockets; REST controllers expose only the non-realtime parts.

**8.1 Domain events: `src/common/domain-events.ts`**
```ts
export const DomainEvents = {
  MessageCreated: 'message.created', // payload: MessageDto
  MessageUpdated: 'message.updated', // payload: MessageDto
  MessageDeleted: 'message.deleted', // payload: { chatId, messageId }
  ChatRead: 'chat.read', // payload: { chatId, userId, seq }
  ChatMembersChanged: 'chat.members-changed', // payload: { chatId, userIds } (chat created / someone joined)
} as const;
```
Services inject `EventEmitter2` and call `this.events.emit(DomainEvents.X, payload)`.

**8.2 Encryption: `modules/crypto/encryption.ts`** (design in §2.3)

These are plain functions so the seed script can reuse them. `EncryptionService` wraps them with the key ring from `env`; `CryptoModule` is `@Global()`.
```ts
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

export interface Keyring {
  keys: Map<number, Buffer>; // keyId → 32-byte master key
  currentId: number; // used for new encryptions
}

// one derived key per chat: domain separation, and each key only ever sees one chat's messages
const deriveKey = (master: Buffer, chatId: string) =>
  Buffer.from(hkdfSync('sha256', master, 'chat-app/messages', chatId, 32));

const aad = (chatId: string, messageId: string) => Buffer.from(`${chatId}:${messageId}`);

export function encrypt(plain: string, ring: Keyring, chatId: string, messageId: string): string {
  const master = ring.keys.get(ring.currentId)!;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(master, chatId), iv);
  cipher.setAAD(aad(chatId, messageId)); // binds the ciphertext to this chat and this message
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [ring.currentId, iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join('.');
}

export function decrypt(payload: string, ring: Keyring, chatId: string, messageId: string): string {
  const [keyId, iv, tag, data] = payload.split('.');
  const master = ring.keys.get(Number(keyId));
  if (!master || !iv || !tag || !data) throw new Error('Unreadable ciphertext');
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(master, chatId), Buffer.from(iv, 'base64'));
  decipher.setAAD(aad(chatId, messageId));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}
```
`EncryptionService.encrypt(text, chatId, messageId)` and `.decrypt(...)` pass `{ keys: env.MESSAGE_KEYS, currentId: env.MESSAGE_KEY_ID }`.

**Key rotation** is: generate a new key, append `,2:<base64>` to `MESSAGE_KEYS`, set `MESSAGE_KEY_ID=2`, redeploy. Old messages keep decrypting (the key id is in the ciphertext) and edited messages get re-encrypted with the new key. A `scripts/reencrypt.ts` that loops over old rows is optional.

**8.3 `modules/chats`**

| Route | Notes |
|---|---|
| `GET /api/chats` | The user's chats ordered by `lastMessageAt desc nulls last`. Each `ChatSummaryDto` has a `title`; a decrypted `lastMessage.preview` (`findFirst` ordered by `seq desc`, attachment-only → `"📷 Photo"`); and `unreadCount = message.count({ where: { chatId, seq: { gt: member.lastReadSeq }, senderId: { not: me } } })`, run per chat in `Promise.all` (an index range scan, fine at this scale). |
| `GET /api/chats/search?q=` | `type: GROUP`, `isPublic: true`, `name contains q (insensitive)`, `take: 20`. Not-yet-joined chats have `isMember: false`, `unreadCount: 0`. |
| `POST /api/chats` | Body is `createChatSchema`. **DIRECT**: `directKey(me, userId)` from `@chat/shared`; if the chat exists, return it (better UX than an error). **GROUP**: the creator gets `OWNER`, `memberIds` must be friends of the creator, and everything is created in one `create` with nested `members.createMany`. Then emit `ChatMembersChanged { chatId, userIds }`. |
| `GET /api/chats/:id` | `ChatDetailsDto` with `members[].lastReadSeq`. Members only, or anyone if it's a public group (needed for the "Join" preview). |
| `POST /api/chats/:id/join` | Public groups only. Create the membership with **`lastReadSeq = chat.lastSeq`** (old history isn't "unread"), then emit `ChatMembersChanged { chatId, userIds: [me] }`. |

There is no REST route for reading, because read cursors go over the socket. The service methods the gateway (Step 10) and `MessagesService` need are exported from `ChatsModule`:

```ts
/** returns the member row or throws 403 */
assertMember(chatId: string, userId: string): Promise<ChatMember>;

getMemberChatIds(userId: string): Promise<string[]>;

/** Move my read cursor forward. Monotonic and atomic: a stale or duplicate call is a no-op. */
async markRead(userId: string, chatId: string, seq: number) {
  const chat = await this.prisma.chat.findUnique({ where: { id: chatId }, select: { lastSeq: true } });
  if (!chat) throw new NotFoundException('Chat not found');
  const target = Math.min(seq, chat.lastSeq); // can't read the future
  const { count } = await this.prisma.chatMember.updateMany({
    where: { chatId, userId, lastReadSeq: { lt: target } }, // also guarantees I'm a member
    data: { lastReadSeq: target },
  });
  if (count) this.events.emit(DomainEvents.ChatRead, { chatId, userId, seq: target });
}
```

**8.4 `modules/messages`**

REST exposes **only history**:

| Route | Notes |
|---|---|
| `GET /api/chats/:chatId/messages?before&limit` | Members only. Query validated by `messagesQuerySchema`. `where: { chatId, seq: { lt: before } }`, `orderBy: { seq: 'desc' }`, `take: limit + 1`. Returns `{ items, nextBefore }`, where `nextBefore` is the oldest returned `seq`, or `null` when there are no older messages. |

Commands are plain service methods, called by the gateway in Step 10:
```ts
async send(userId: string, input: SendMessageEventOutput): Promise<MessageDto> {
  const { chatId, clientId } = input;
  await this.chats.assertMember(chatId, userId);

  // Idempotency: a retried send (the ack was lost) returns the stored message instead of a duplicate
  const existing = await this.findByClientId(userId, clientId);
  if (existing) return existing;
  if (input.replyToId) await this.assertMessageInChat(input.replyToId, chatId);

  const id = randomUUID(); // generated here because it is bound into the ciphertext (AAD)
  let message;
  try {
    message = await this.prisma.$transaction(async (tx) => {
      // One statement bumps the per-chat counter and locks the chat row, so concurrent sends
      // get distinct, gap-free seq values (a rolled-back send rolls the counter back too).
      const { lastSeq } = await tx.chat.update({
        where: { id: chatId },
        data: { lastSeq: { increment: 1 }, lastMessageAt: new Date() },
        select: { lastSeq: true },
      });
      await tx.message.create({
        data: {
          id, chatId, seq: lastSeq, clientId, senderId: userId, replyToId: input.replyToId,
          content: input.content ? this.crypto.encrypt(input.content, chatId, id) : null,
        },
      });
      if (input.attachmentIds.length) {
        const { count } = await tx.attachment.updateMany({
          where: { id: { in: input.attachmentIds }, uploaderId: userId, messageId: null },
          data: { messageId: id },
        });
        if (count !== input.attachmentIds.length) throw new BadRequestException('Invalid attachments');
      }
      return tx.message.findUniqueOrThrow({ where: { id }, include: messageInclude });
    });
  } catch (e) {
    // two identical sends raced past the check above: the unique index decided, return the winner
    if (isUniqueViolation(e)) return (await this.findByClientId(userId, clientId))!;
    throw e;
  }

  const dto = await this.mapper.toDto(message); // decrypts + presigns attachment URLs
  this.events.emit(DomainEvents.MessageCreated, dto);
  return dto;
}
```
Note that **sending doesn't touch the sender's read cursor**. Unread counts already ignore your own messages, so nothing needs to be advanced.

- `edit(userId, { messageId, content })`:
  1. Load `{ chatId, senderId }`; 404 if the message is missing.
  2. `assertMember`, then `canEditMessage` (author only) or 403.
  3. Update with the content re-encrypted by `encrypt(...)` and `editedAt = now()`.
  4. Emit `MessageUpdated` and return the DTO.
- `delete(userId, { messageId })`:
  1. Load the message with its attachments, then `assertMember` (it returns the member's role) and `canDeleteMessage({ chatType, myRole, myId, senderId })` or 403. These are the same rules the old UI had, now **enforced on the server**.
  2. Delete the row. Attachment rows cascade, and the `reply_to` of replies becomes `null`.
  3. `storage.deleteMany(keys)`.
  4. Emit `MessageDeleted { chatId, messageId }`.

`MessageMapper.toDto(row)`:
- Decrypts `content` and `replyTo.content` (the preview is `truncate(…, 80)`). If decryption throws (tampered or unknown key id), return `"[message can't be decrypted]"` and log the **message id only**, so one bad row doesn't break a whole page.
- Resolves attachment URLs through `StorageService.getUrl`, and adds `seq` and `clientId`.

`messageInclude` is `{ sender: { select: { id, username } }, replyTo: { include: { sender: { select: { username } } } }, attachments: true }`.

**Done when**
- `pnpm --filter @chat/api build` passes under `strict: true`.
- A DM can be created through curl and `GET /api/chats/:id/messages` returns an empty page.
- Sending is verified end-to-end at the end of Step 10, and the unit tests follow in Step 11.
- After a send, Prisma Studio shows `content` as `1.…` ciphertext only.

**Commit:** `feat(api): add chats and messages services with read cursors and at-rest encryption`

---

### Step 9: File storage on S3 (metadata only in the DB)

Install it:
```bash
pnpm add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

**9.1 `modules/storage/storage.service.ts`**

The module is `@Global()`.
```ts
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly client = this.createClient(env.S3_ENDPOINT);
  // URLs must be signed with the host the *browser* can reach (differs from the container host locally)
  private readonly signer = this.createClient(env.S3_PUBLIC_ENDPOINT ?? env.S3_ENDPOINT);

  private createClient(endpoint?: string) {
    return new S3Client({
      region: env.S3_REGION,
      endpoint,
      forcePathStyle: !!endpoint,
      credentials: env.S3_ACCESS_KEY_ID
        ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? '' }
        : undefined, // prod: EC2 instance role
    });
  }

  async onModuleInit() {
    if (env.NODE_ENV === 'production') return; // bucket is created once in AWS
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: env.S3_BUCKET }));
    }
  }

  upload(key: string, body: Buffer, contentType: string) {
    return this.client.send(
      new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, Body: body, ContentType: contentType }),
    );
  }

  getUrl(key: string) {
    return getSignedUrl(this.signer, new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }), {
      expiresIn: 3600,
    });
  }

  async deleteMany(keys: string[]) {
    if (!keys.length) return;
    await this.client.send(
      new DeleteObjectsCommand({
        Bucket: env.S3_BUCKET,
        Delete: { Objects: keys.map((Key) => ({ Key })) },
      }),
    );
  }
}
```

**9.2 `modules/attachments`**

`POST /api/attachments` (multipart field `files`):
```ts
@Post()
@UseInterceptors(FilesInterceptor('files', LIMITS.ATTACHMENTS_PER_MESSAGE, {
  limits: { fileSize: LIMITS.ATTACHMENT_MAX_BYTES },
}))
upload(@CurrentUser() user: AuthUser, @UploadedFiles() files: Express.Multer.File[]) {
  return this.attachments.upload(user.id, files);
}
```
The service:
1. Validates each `file.mimetype` against `ALLOWED_IMAGE_TYPES` (or uses Nest's `FileTypeValidator` in a `ParseFilePipe`, which checks magic bytes).
2. Builds `key = attachments/${userId}/${randomUUID()}${extname(file.originalname)}`.
3. Calls `storage.upload`, then `prisma.attachment.create`.
4. Returns `AttachmentDto[]` with presigned URLs.

The client uploads first (REST, multipart) and then sends the message over the socket with the returned `attachmentIds` (`message:send`, linked in `MessagesService.send`, Step 8). Attachment URLs are presigned for 1 hour and are generated only when a message is returned to a verified chat member (history or the send/broadcast path), so a URL is never handed to a non-member. Upload-then-never-send leaves orphan rows with `message_id = null`; a cleanup job for them is a possible extension, not needed for the thesis.

The old `ImageModule`, `GET /image` and base64 handling are removed completely.

**Done when** uploading an image through curl puts an object in SeaweedFS (`http://localhost:8333/chat-attachments/...` via the presigned URL), and the `attachments` row contains only metadata.
**Commit:** `feat(api): store attachments in S3-compatible storage`

---

### Step 10: Realtime gateway (authenticated Socket.IO, acks, typing, presence)

The gateway is a thin adapter. It authenticates the socket, turns acked commands into service calls, and broadcasts domain events. **No business rules live here.** The old Mongoose logic is gone.

**10.1 Modules**
- `PresenceModule` is `@Global()` and exports `PresenceService` (used by `users`, `chats` and the gateway).
- `RealtimeModule` imports `ChatsModule` and `MessagesModule` (they must export their services) and provides `RealtimeGateway`.
- Dependencies point one way: realtime → chats / messages → prisma. Services never import realtime, so there are no circular imports.
- Add `EventEmitterModule.forRoot()` to `AppModule` (Step 7.8).

**10.2 `presence/presence.service.ts`**

In memory, which is fine for a single instance. A reconnect within the grace period (a page refresh, a flaky network) never shows as offline:
```ts
const GRACE_MS = 5_000;

@Injectable()
export class PresenceService {
  private readonly sockets = new Map<string, number>(); // userId → open sockets (all tabs)
  private readonly timers = new Map<string, NodeJS.Timeout>();

  /** @returns true if the user just came online (was not online before) */
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

  /** `onOffline` runs only if the user is still gone after the grace period */
  disconnect(userId: string, onOffline: () => void): void {
    const left = (this.sockets.get(userId) ?? 1) - 1;
    this.sockets.set(userId, left);
    if (left > 0) return;
    this.timers.set(
      userId,
      setTimeout(() => {
        this.timers.delete(userId);
        this.sockets.delete(userId);
        onOffline();
      }, GRACE_MS),
    );
  }

  isOnline(userId: string): boolean {
    return this.sockets.has(userId);
  }
}
```

**10.3 `realtime/packet-guard.ts`**

A Socket.IO packet middleware that runs before *every* incoming event. It enforces token expiry and a simple per-socket rate limit:
```ts
export function createPacketGuard(socket: AppSocket, max = 30, windowMs = 10_000) {
  let windowStart = Date.now();
  let count = 0;
  return (_packet: unknown[], next: (err?: Error) => void) => {
    const now = Date.now();
    if (now >= socket.data.exp * 1000) return void socket.disconnect(true); // token expired
    if (now - windowStart > windowMs) {
      windowStart = now;
      count = 0;
    }
    if (++count > max) return next(new Error('Rate limit exceeded')); // handler is skipped
    next();
  };
}
```
When the guard rejects a packet the handler never runs and no ack is sent. The client sees an ack **timeout**, which the UI shows as "failed, retry" (Step 13).

**10.4 `realtime/realtime.gateway.ts`**
```ts
export interface SocketData { userId: string; username: string; exp: number }
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
export type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

const chatRoom = (chatId: string) => `chat:${chatId}`;
const userRoom = (userId: string) => `user:${userId}`;

@WebSocketGateway({
  transports: ['websocket'], // no long-polling: no sticky sessions, one round trip less
  maxHttpBufferSize: 100_000, // only text goes over the socket; files go through REST
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);
  @WebSocketServer() private server!: AppServer;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
    private readonly chats: ChatsService,
    private readonly messages: MessagesService,
  ) {}

  // ── connection lifecycle ───────────────────────────────────────────────

  afterInit(server: AppServer) {
    // Authenticate once per connection. The token comes from the handshake `auth` payload (never the URL).
    server.use(async (socket, next) => {
      try {
        const p = await this.jwt.verifyAsync<{ sub: string; username: string; exp: number }>(
          socket.handshake.auth.token,
        );
        socket.data = { userId: p.sub, username: p.username, exp: p.exp };
        next();
      } catch {
        next(new Error('Unauthorized'));
      }
    });
  }

  async handleConnection(socket: AppSocket) {
    const { userId } = socket.data;
    socket.use(createPacketGuard(socket));
    socket.on('error', (e) => this.logger.warn(`socket ${socket.id}: ${e.message}`));

    // Rooms come from the DB, never from the client
    const chatIds = await this.chats.getMemberChatIds(userId);
    await socket.join([userRoom(userId), ...chatIds.map(chatRoom)]);

    if (this.presence.connect(userId)) this.emitPresence(userId, chatIds, true);
  }

  handleDisconnect(socket: AppSocket) {
    const { userId } = socket.data;
    if (!userId) return;
    this.presence.disconnect(userId, async () => {
      await this.prisma.user.update({ where: { id: userId }, data: { lastSeenAt: new Date() } });
      this.emitPresence(userId, await this.chats.getMemberChatIds(userId), false);
    });
  }

  private emitPresence(userId: string, chatIds: string[], isOnline: boolean) {
    // NB: `to([])` with no rooms would broadcast to EVERYONE, so guard the empty case
    if (chatIds.length) this.server.to(chatIds.map(chatRoom)).emit('presence:changed', { userId, isOnline });
  }

  // ── commands (acked) ───────────────────────────────────────────────────

  @SubscribeMessage('message:send')
  send(@ConnectedSocket() socket: AppSocket, @MessageBody() body: unknown) {
    return this.handle('message:send', sendMessageEventSchema, body, (input) =>
      this.messages.send(socket.data.userId, input),
    );
  }

  @SubscribeMessage('message:edit')
  edit(@ConnectedSocket() socket: AppSocket, @MessageBody() body: unknown) {
    return this.handle('message:edit', editMessageEventSchema, body, (input) =>
      this.messages.edit(socket.data.userId, input),
    );
  }

  @SubscribeMessage('message:delete')
  remove(@ConnectedSocket() socket: AppSocket, @MessageBody() body: unknown) {
    return this.handle('message:delete', deleteMessageEventSchema, body, (input) =>
      this.messages.delete(socket.data.userId, input),
    );
  }

  // ── fire-and-forget ────────────────────────────────────────────────────

  @SubscribeMessage('chat:read')
  async read(@ConnectedSocket() socket: AppSocket, @MessageBody() body: unknown) {
    await this.handle('chat:read', markReadEventSchema, body, (i) =>
      this.chats.markRead(socket.data.userId, i.chatId, i.seq),
    ); // returns nothing, so no ack is sent
  }

  @SubscribeMessage('typing')
  typing(@ConnectedSocket() socket: AppSocket, @MessageBody() body: unknown) {
    const parsed = typingEventSchema.safeParse(body);
    // Room membership is the authorization: rooms were filled from the DB, so no query is needed
    if (!parsed.success || !socket.rooms.has(chatRoom(parsed.data.chatId))) return;
    const { chatId, isTyping } = parsed.data;
    socket.to(chatRoom(chatId)).volatile.emit('typing', {
      chatId, userId: socket.data.userId, username: socket.data.username, isTyping,
    });
  }

  // ── domain events → broadcasts ─────────────────────────────────────────

  @OnEvent(DomainEvents.MessageCreated)
  onCreated(m: MessageDto) { this.server.to(chatRoom(m.chatId)).emit('message:created', m); }

  @OnEvent(DomainEvents.MessageUpdated)
  onUpdated(m: MessageDto) { this.server.to(chatRoom(m.chatId)).emit('message:updated', m); }

  @OnEvent(DomainEvents.MessageDeleted)
  onDeleted(p: { chatId: string; messageId: string }) { this.server.to(chatRoom(p.chatId)).emit('message:deleted', p); }

  @OnEvent(DomainEvents.ChatRead)
  onRead(p: { chatId: string; userId: string; seq: number }) { this.server.to(chatRoom(p.chatId)).emit('chat:read', p); }

  @OnEvent(DomainEvents.ChatMembersChanged)
  onMembersChanged({ chatId, userIds }: { chatId: string; userIds: string[] }) {
    if (!userIds.length) return;
    const rooms = userIds.map(userRoom);
    this.server.in(rooms).socketsJoin(chatRoom(chatId)); // their open sockets start receiving this chat
    this.server.to(rooms).emit('chat:changed', { chatId }); // and refetch their chat list
  }

  // ── the ~15 lines Nest gives HTTP routes for free ──────────────────────

  private async handle<S extends z.ZodType, R>(
    event: string,
    schema: S,
    body: unknown,
    run: (input: z.output<S>) => Promise<R>,
  ): Promise<Ack<R>> {
    const parsed = schema.safeParse(body);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid payload' };
    try {
      return { ok: true, data: await run(parsed.data) };
    } catch (error) {
      if (error instanceof HttpException) return { ok: false, error: error.message }; // 403, 404, …
      this.logger.error(`${event} failed`, (error as Error).stack); // stack only, never the payload
      return { ok: false, error: 'Internal error' };
    }
  }
}
```
Notes:
- In Nest's Socket.IO adapter the **return value of a handler is the acknowledgement**, if the client passed a callback.
- Global guards also run for gateway handlers, which is why Step 7.6/7.8 make `JwtAuthGuard` and the throttler skip non-HTTP contexts. The socket is authenticated by the handshake middleware instead.
- Because services throw `HttpException`s, the **same** `ForbiddenException('…')` becomes a 403 over REST and `{ ok: false, error: '…' }` over the socket.
- A message sent by Alice reaches her through two paths, the ack and the `message:created` broadcast. The client dedupes by `id` (Step 13).

**10.5 Event reference** (copy it into `docs/realtime.md`)

| Event | Direction | Payload | Ack | Delivered to |
|---|---|---|---|---|
| `message:send` | client → server | `{ chatId, clientId, content?, replyToId?, attachmentIds }` | `Ack<MessageDto>` | n/a |
| `message:edit` | client → server | `{ messageId, content }` | `Ack<MessageDto>` | n/a |
| `message:delete` | client → server | `{ messageId }` | `Ack` | n/a |
| `chat:read` | client → server | `{ chatId, seq }` | none | n/a |
| `typing` | client → server | `{ chatId, isTyping }` | none | n/a |
| `message:created`, `message:updated` | server → client | `MessageDto` | n/a | room `chat:<id>` |
| `message:deleted` | server → client | `{ chatId, messageId }` | n/a | room `chat:<id>` |
| `chat:read` | server → client | `{ chatId, userId, seq }` | n/a | room `chat:<id>` |
| `typing` | server → client | `{ chatId, userId, username, isTyping }` | n/a | room `chat:<id>`, except the sender |
| `chat:changed` | server → client | `{ chatId }` | n/a | rooms `user:<id>` of the affected users |
| `presence:changed` | server → client | `{ userId, isOnline }` | n/a | rooms of the user's chats |

**10.6 Smoke test: `apps/api/scripts/ws-smoke.ts`**

Add the dependency first:
```bash
pnpm --filter @chat/api add -D socket.io-client
```
Run it with `pnpm --filter @chat/api exec tsx scripts/ws-smoke.ts` while the api is running and the DB is seeded:
```ts
import { io, type Socket } from 'socket.io-client';

const base = 'http://localhost:3000';
const authHeader = (t: string) => ({ authorization: `Bearer ${t}` });
const login = async (username: string): Promise<string> =>
  (await fetch(`${base}/api/auth/log-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password: 'password123' }),
  }).then((r) => r.json())).accessToken;
const open = (token?: string) =>
  new Promise<Socket>((resolve, reject) => {
    const s = io(base, { transports: ['websocket'], auth: { token } });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });

async function main() {
  const [alice, bob, carol] = await Promise.all(['alice', 'bob', 'carol'].map(login));

  await open().then(
    () => console.log('FAIL: anonymous socket connected'),
    (e) => console.log('ok: anonymous rejected:', e.message),
  );

  const chats = await fetch(`${base}/api/chats`, { headers: authHeader(alice) }).then((r) => r.json());
  const dm = chats.find((c: { type: string }) => c.type === 'DIRECT');
  const [sa, sb, sc] = await Promise.all([open(alice), open(bob), open(carol)]);
  sb.on('message:created', (m) => console.log('ok: bob received seq', m.seq, m.content));
  sc.on('message:created', () => console.log('FAIL: carol received a message from a chat she is not in'));

  const input = { chatId: dm.id, clientId: crypto.randomUUID(), content: 'hello from the smoke test', attachmentIds: [] };
  console.log('ack:', await sa.emitWithAck('message:send', input));
  console.log('ack (same clientId → same message, no duplicate):', await sa.emitWithAck('message:send', input));
  console.log('ack (carol, not a member → forbidden):', await sc.emitWithAck('message:send', { ...input, clientId: crypto.randomUUID() }));
  setTimeout(() => process.exit(0), 500);
}
main();
```

**Done when**
- The smoke test prints "anonymous rejected", bob receives the message with `seq`, the retry returns the same message, and carol gets `ok: false` and no broadcast.
- `message.seq` increments without gaps in Prisma Studio.

**Commit:** `feat(api): add authenticated realtime gateway with acks, typing and presence`

---

### Step 11: Backend tests with Vitest

Install the test dependencies:
```bash
pnpm add -D vitest@catalog: unplugin-swc @swc/core @vitest/coverage-v8 supertest @types/supertest
```
Then remove the old `jest`, `ts-jest` and `@types/jest`, plus the `"jest"` block in `package.json`.

`apps/api/vitest.config.ts`. SWC emits the decorator metadata Nest's dependency injection needs:
```ts
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  oxc: false, // Vite 8+: stop oxc from stripping decorator metadata
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    // env.ts validates on import, so tests need values (no real DB/S3 is touched)
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      JWT_SECRET: 'test-secret-test-secret-test-secret-123',
      MESSAGE_KEYS: `1:${Buffer.alloc(32, 1).toString('base64')}`,
      MESSAGE_KEY_ID: '1',
      S3_BUCKET: 'test',
    },
  },
});
```
Scripts: `"test": "vitest run"`, `"test:watch": "vitest"`, `"test:cov": "vitest run --coverage"`.

Keep the tests minimal but meaningful. Prisma, Storage and `EventEmitter2` are mocked with `vi.fn()`:
- `crypto/encryption.spec.ts`:
  - the round trip works, and two encryptions of the same text differ;
  - a wrong `chatId` or a wrong `messageId` (AAD) throws;
  - a tampered ciphertext throws;
  - a message encrypted under key 1 still decrypts after the ring's current id switches to 2 (**rotation**).
- `common/zod-validation.pipe.spec.ts`: valid input passes; invalid input throws `BadRequestException` with the issues.
- `messages/messages.service.spec.ts`:
  - a non-member gets 403;
  - `send` emits `MessageCreated`, and the stored `content` is ciphertext;
  - **the same `clientId` twice returns the first message and creates no second row**;
  - a non-author can't edit;
  - delete rules: the author, a DM member and a group owner can; a plain group member can't (403).
- `chats/chats.service.spec.ts`:
  - `directKey(a, b) === directKey(b, a)`, and an existing DM is returned instead of a duplicate;
  - `markRead` is **monotonic**: a lower `seq` is a no-op with no event, a higher one moves the cursor and emits `ChatRead`, and `seq` above `lastSeq` is clamped;
  - `join` starts the cursor at `lastSeq`.
- `presence/presence.service.spec.ts` (fake timers):
  - with two sockets, one disconnect leaves the user online;
  - after the last disconnect the user is still online during the grace period, and `onOffline` fires once after 5 s;
  - a reconnect inside the grace period cancels it.
- `realtime/packet-guard.spec.ts`: the 31st packet in a window gets an error; an expired token disconnects the socket.
- `realtime/realtime.gateway.spec.ts` (call handlers directly with a fake socket):
  - an invalid payload → `{ ok: false, error }`;
  - a service `ForbiddenException` → `{ ok: false }` with its message;
  - an unknown error → `{ ok: false, error: 'Internal error' }` (no leak);
  - a typing event from a socket not in the room is ignored.

**Done when** `pnpm --filter @chat/api test` is green.
**Commit:** `test(api): migrate to vitest and cover core services`

---

### Step 12: Frontend foundation (Tailwind v4 + shadcn/ui on Radix)

Run these in `apps/web`:
```bash
pnpm add tailwindcss @tailwindcss/vite
```
```bash
pnpm dlx shadcn@latest init
```
During `shadcn init`, pick the Radix base and the neutral (or zinc) base color, and keep CSS variables on. Add `tailwindcss()` to the `plugins` array in `vite.config.ts`.

`init` creates:
- `components.json`
- `src/lib/utils.ts` (`cn()`)
- the theme tokens in `styles.css`
- the `lucide-react`, `radix-ui`, `class-variance-authority`, `clsx` and `tailwind-merge` dependencies

Since `<html class="dark">` was set in Step 3, the app stays dark like it is now.

Add the components you need:
```bash
pnpm dlx shadcn@latest add button input textarea label field dialog alert-dialog context-menu dropdown-menu popover tooltip avatar badge switch checkbox separator scroll-area sonner tabs skeleton
```

Mapping from antd:

| antd / old | shadcn / new |
|---|---|
| `Modal` | `Dialog` (`AlertDialog` for delete confirmation) |
| `Popover trigger="contextMenu"` (message actions) | `ContextMenu` |
| `message.useMessage()` + `errorMessage()` | `sonner` `toast.error()`, wired globally in Step 13 |
| `Input`, `Input.Password`, `TextArea` | `Input`, `Input type="password"`, `Textarea` |
| `Switch`, `Tooltip`, `Avatar`, `Badge` | same names in shadcn |
| `Select mode="multiple"` (friends picker) | Checkbox list inside a `ScrollArea` |
| `List` | Plain `ul` + Tailwind |
| `Divider` "New Messages" | `Separator` with a label |
| `Upload` | Hidden `<input type="file" multiple accept="image/*">` + `Button` |
| `Image` (preview) | `<img>` + `Dialog` for full size |
| `@ant-design/icons` | `lucide-react` |
| `Typography.Title` | `<h2 className="text-xl font-semibold">` |

Tailwind's preflight will make the antd screens look slightly off until Step 14. That's expected.

**Done when** a `<Button>` from shadcn renders correctly next to the old UI.
**Commit:** `feat(web): set up tailwind v4 and shadcn/ui`

---

### Step 13: Frontend data layer (Zustand + React Query + typed socket)

Install the new data-layer dependencies:
```bash
pnpm add zustand @tanstack/react-query @tanstack/react-query-devtools react-hook-form @hookform/resolvers zod@catalog:
```
Then remove the old ones:
```bash
pnpm remove mobx mobx-react-lite moment jwt-decode
```
Delete `src/store/*`, `src/http/*` and `src/types/*`; types now come from `@chat/shared`.

**Where each kind of state lives**

| State | Home |
|---|---|
| Server data (chats, messages, users, friends) | **React Query** cache. The socket keeps it fresh by writing into the cache. |
| Auth token | Zustand `auth-store` (persisted) |
| UI state (active chat, dialogs, reply/edit target, connection status) | Zustand `chat-ui-store` |
| Messages not yet acknowledged by the server | Zustand `pending-store` |
| Who is typing | Zustand `typing-store` |

**13.1 `src/stores/auth-store.ts`**
```ts
type AuthState = { token: string | null; setToken: (t: string) => void; logout: () => void };

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      setToken: (token) => set({ token }),
      logout: () => {
        set({ token: null });
        queryClient.clear();
        useChatUiStore.getState().reset();
        usePendingStore.getState().reset();
      },
    }),
    { name: 'auth' },
  ),
);
```

**13.2 `src/stores/chat-ui-store.ts`**

This holds only client and UI state. Server data never goes in Zustand.
```ts
type Dialog = 'createChat' | 'settings' | 'chatInfo' | null;
type ChatUiState = {
  activeChatId: string | null;
  replyTo: MessageDto | null;
  editingMessageId: string | null;
  dialog: Dialog;
  profileUserId: string | null;
  connection: 'connecting' | 'online' | 'offline';
  openChat: (id: string | null) => void;
  setReplyTo: (m: MessageDto | null) => void;
  setEditing: (id: string | null) => void;
  setDialog: (d: Dialog) => void;
  showProfile: (userId: string | null) => void;
  setConnection: (c: ChatUiState['connection']) => void;
  reset: () => void;
};
```
`openChat` also clears `replyTo` and `editingMessageId`.

`src/stores/pending-store.ts`. Optimistic bubbles live **outside** the React Query cache, so the cache only ever contains server-confirmed messages:
```ts
export type PendingMessage = {
  clientId: string;
  chatId: string;
  content?: string;
  replyToId?: string;
  files: File[];
  attachmentIds?: string[]; // filled after the upload, so a retry doesn't upload twice
  status: 'sending' | 'failed';
  error?: string;
  createdAt: string;
};
// state: byChat: Record<string, PendingMessage[]>; actions: upsert(p), patch(clientId, partial), remove(clientId), reset()
```

`src/stores/typing-store.ts`: `byChat: Record<chatId, Record<userId, username>>` plus `set(chatId, userId, username, isTyping)`. Every `isTyping: true` starts (or restarts) a **5 s timeout** (timers kept in a module-level `Map`) that removes the entry. This also covers a user who just closes the tab. Expose `useTypingNames(chatId)`.

**13.3 `src/lib/api-client.ts`**

Keep axios, which you already know. It is used for REST only:
```ts
export const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(undefined, (error: AxiosError<{ message?: string }>) => {
  if (error.response?.status === 401) useAuthStore.getState().logout();
  return Promise.reject(new Error(error.response?.data?.message ?? 'Something went wrong'));
});
```

**13.4 `src/lib/query-client.ts`**

Error toasts are global, which replaces every copy-pasted `try/catch + messageApi`:
```ts
export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
  queryCache: new QueryCache({ onError: (e) => toast.error(e.message) }),
  mutationCache: new MutationCache({ onError: (e) => toast.error(e.message) }),
});
```

**13.5 `src/lib/socket.ts`: one typed socket, promise-based commands**
```ts
export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export const socket: AppSocket = io({
  autoConnect: false, // connected by useRealtime() once there is a token
  transports: ['websocket'], // must match the server: no long-polling
  auth: (cb) => cb({ token: useAuthStore.getState().token }), // re-evaluated on every (re)connect
});

const ACK_TIMEOUT_MS = 8_000;

/** turns an ack into a resolved/rejected promise, so commands plug into React Query mutations */
async function call<T>(request: Promise<Ack<T>>): Promise<T> {
  let res: Ack<T>;
  try {
    res = await request;
  } catch {
    throw new Error('No connection to the server. Message not delivered.'); // ack timeout / disconnected
  }
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

export const sendMessageOverSocket = (input: SendMessageEventInput) =>
  call(socket.timeout(ACK_TIMEOUT_MS).emitWithAck('message:send', input));
export const editMessageOverSocket = (input: EditMessageEventInput) =>
  call(socket.timeout(ACK_TIMEOUT_MS).emitWithAck('message:edit', input));
export const deleteMessageOverSocket = (input: DeleteMessageEventInput) =>
  call(socket.timeout(ACK_TIMEOUT_MS).emitWithAck('message:delete', input));
```
Fire-and-forget helpers (`markRead(chatId, seq)` and `sendTyping(chatId, isTyping)`) just call `socket.emit(...)`. There are **no hidden automatic retries**. A failed send is shown to the user and retried explicitly, with the same `clientId`, which is safe because sending is idempotent on the server.

**13.6 Feature API and queries**

Each feature has an `api.ts` with plain REST functions and a `queries.ts` with hooks. Key overview:

| Key | Hook |
|---|---|
| `['me']` | `useMe()` (enabled when there's a token) |
| `['chats']` | `useChats()` |
| `['chats', id]` | `useChat(id)` (details + `members[].lastReadSeq`) |
| `['chats', id, 'messages']` | `useMessages(id)` (infinite) |
| `['chats', 'search', q]` | `useChatSearch(q)` |
| `['users', 'search', q]` | `useUserSearch(q)` |
| `['users', id]` | `useUser(id)` |
| `['friends']` | `useFriends()` |

```ts
export const chatKeys = {
  list: ['chats'] as const,
  detail: (id: string) => ['chats', id] as const,
  messages: (id: string) => ['chats', id, 'messages'] as const,
};

export const useMessages = (chatId: string) =>
  useInfiniteQuery({
    queryKey: chatKeys.messages(chatId),
    queryFn: ({ pageParam, signal }) => getMessages(chatId, pageParam, signal), // GET …/messages?before=
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  });
```
- Search uses a `useDebouncedValue(q, 300)` hook. React Query passes `signal` to axios, so stale requests are cancelled and the broken shared `AbortController` goes away.
- REST mutations: `useLogIn` and `useSignUp` (`setToken` + `setQueryData(['me'])`), `useUpdateMe`, `useAddFriend`, `useCreateChat`, `useJoinChat`, each invalidating the related keys in `onSuccess`.

**Message commands over the socket** (`features/messages/queries.ts`):
```ts
type Draft = { content?: string; replyToId?: string; files: File[]; clientId?: string; attachmentIds?: string[] };

export const useSendMessage = (chatId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: Draft) => {
      const clientId = draft.clientId ?? crypto.randomUUID(); // a retry passes the same one
      const pending = usePendingStore.getState();
      pending.upsert({ ...draft, clientId, chatId, status: 'sending', createdAt: new Date().toISOString() });
      try {
        let attachmentIds = draft.attachmentIds;
        if (!attachmentIds) {
          attachmentIds = draft.files.length ? (await uploadAttachments(draft.files)).map((a) => a.id) : []; // REST multipart
          pending.patch(clientId, { attachmentIds });
        }
        const message = await sendMessageOverSocket({ chatId, clientId, content: draft.content, replyToId: draft.replyToId, attachmentIds });
        upsertMessage(qc, message); // same upsert as the broadcast, so the order doesn't matter
        pending.remove(clientId);
      } catch (error) {
        pending.patch(clientId, { status: 'failed', error: (error as Error).message });
        throw error; // the global mutationCache shows the toast
      }
    },
  });
};

export const useEditMessage = () =>
  useMutation({ mutationFn: (v: EditMessageEventInput) => editMessageOverSocket(v) });
export const useDeleteMessage = () =>
  useMutation({ mutationFn: (v: DeleteMessageEventInput) => deleteMessageOverSocket(v) });
// no onSuccess for edit/delete: the server's broadcast updates the cache for everyone, including the sender
```

**Cache helpers: `features/messages/cache.ts`**

Small, pure and unit-tested (Step 15):
```ts
type Pages = InfiniteData<MessagesPage, number | undefined>;

export function upsertMessage(qc: QueryClient, m: MessageDto) {
  const key = chatKeys.messages(m.chatId);
  const data = qc.getQueryData<Pages>(key);
  if (!data) return; // chat not opened yet: it will load fresh when it is
  const all = data.pages.flatMap((p) => p.items);

  if (all.some((x) => x.id === m.id)) return replaceMessage(qc, m); // ack + broadcast = same message twice

  const newest = all[0];
  if (newest && m.seq !== newest.seq + 1) {
    return void qc.invalidateQueries({ queryKey: key }); // a seq gap: we missed something, refetch
  }
  qc.setQueryData<Pages>(key, {
    ...data,
    pages: data.pages.map((p, i) => (i === 0 ? { ...p, items: [m, ...p.items] } : p)),
  });
}
// replaceMessage(qc, m) and removeMessage(qc, chatId, messageId): map/filter over data.pages
```

**13.7 `src/hooks/use-realtime.ts`**

This is the only place that touches socket lifecycle:
```ts
export function useRealtime() {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();

  useEffect(() => {
    if (!token) return;
    const ui = useChatUiStore.getState();
    const meId = () => qc.getQueryData<MeDto>(['me'])?.id;
    let connectedBefore = false;

    socket.on('connect', () => {
      ui.setConnection('online');
      // Anything could have happened while offline (or while the server was redeploying): refetch.
      if (connectedBefore) {
        qc.invalidateQueries({ queryKey: chatKeys.list });
        qc.invalidateQueries({ queryKey: ['users'] });
      }
      connectedBefore = true;
    });
    socket.on('disconnect', (reason) => {
      ui.setConnection('offline');
      if (reason === 'io server disconnect') socket.connect(); // the server kicked us (e.g. expired token): try again
    });
    socket.on('connect_error', (err) => {
      ui.setConnection('offline');
      if (err.message === 'Unauthorized') useAuthStore.getState().logout();
    });

    socket.on('message:created', (m) => {
      upsertMessage(qc, m);
      qc.invalidateQueries({ queryKey: chatKeys.list, exact: true }); // preview + unread badge
    });
    socket.on('message:updated', (m) => replaceMessage(qc, m));
    socket.on('message:deleted', ({ chatId, messageId }) => {
      removeMessage(qc, chatId, messageId);
      qc.invalidateQueries({ queryKey: chatKeys.list, exact: true });
    });
    socket.on('chat:read', ({ chatId, userId, seq }) => {
      qc.setQueryData<ChatDetailsDto>(chatKeys.detail(chatId), (c) =>
        c && { ...c, members: c.members.map((m) => (m.userId === userId ? { ...m, lastReadSeq: Math.max(m.lastReadSeq, seq) } : m)) },
      );
      if (userId === meId()) qc.invalidateQueries({ queryKey: chatKeys.list, exact: true }); // my unread badge
    });
    socket.on('typing', (p) => useTypingStore.getState().set(p.chatId, p.userId, p.username, p.isTyping));
    socket.on('chat:changed', () => qc.invalidateQueries({ queryKey: chatKeys.list }));
    socket.on('presence:changed', ({ userId }) => qc.invalidateQueries({ queryKey: ['users', userId] }));

    ui.setConnection('connecting');
    socket.connect();
    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [token, qc]);
}
```

**13.8 `src/app/providers.tsx`**

Wrap the app in `QueryClientProvider`, add `<Toaster />` from sonner, and `<ReactQueryDevtools />` in dev only. Call `useRealtime()` once in `App.tsx`.

**Done when** the data layer type-checks against `@chat/shared` types. The UI is wired in the next step.
**Commit:** `feat(web): replace mobx with zustand, react-query and a typed socket layer`

---

### Step 14: Rebuild the UI with shadcn + Tailwind (remove antd and CSS files)

Work feature by feature. After the last one, run:
```bash
pnpm remove antd @ant-design/icons
```
Then delete every `*.css` file except `styles.css`.

**Layout (`App.tsx`)**

`token ? <AppShell/> : <AuthScreen/>`. `AppShell` is a `div.flex.h-dvh` holding `<Sidebar className="w-80 border-r" />` and `<ChatView className="flex-1" />`. `<ConnectionBanner />` sits at the top of `AppShell`: a thin bar reading "Reconnecting…" while `chat-ui-store.connection !== 'online'` (hidden until the first successful connect).

**`features/auth`**
- `AuthScreen` is a centered card with `Tabs` (Log in / Sign up). It replaces the always-open modal and fixes the old "Sign Up" link label on the sign-up form.
- `LogInForm` and `SignUpForm` use `useForm({ resolver: zodResolver(logInSchema) })` with shadcn `Field`. They use **the same zod schemas the api validates with**, which makes a good thesis point.

**`features/chats`**
- `Sidebar`: a header with a search `Input` and a `+` button (opens `CreateChatDialog`). Below it a `ScrollArea` showing either `ChatList` (`useChats`) or `SearchResults` while searching (`Tabs`: Chats / Users). A footer holds the current user's avatar and a settings button.
- `ChatListItem`:
  - shows `Avatar` (initials), `title`, `lastMessage.preview` (truncated) and time;
  - shows `Badge` with `unreadCount`, plus a `Globe` icon for public groups;
  - highlights the active chat with `bg-accent`;
  - shows "typing…" instead of the preview while someone types (`useTypingNames`).
- `CreateChatDialog`:
  - a `Tabs` toggle for Direct / Group;
  - Direct: pick one friend → `createChat({ type: 'DIRECT', userId })`;
  - Group: name, description, `Switch` for "Public", checkbox list of friends;
  - form validated with `createChatSchema`.
- `ChatHeader`: title plus subtitle:
  - while someone is typing: "alice is typing…" (or "alice and bob are typing…");
  - otherwise `formatLastSeen` for DMs, "N members" for groups.
  - Clicking it opens `ChatInfoDialog`, which shows the creation date, description and member list from `useChat(id).members`, with no N requests.
- `JoinChatBar`: shown when `!chat.isMember`; a full-width `Button` calling `useJoinChat`.

**`features/messages`**
- **`MessageList`**:
  - A container with `flex flex-col-reverse overflow-y-auto`, rendering items **newest-first exactly as the API returns them**, with this chat's pending messages (`pending-store`) in front. A pending message is hidden as soon as a loaded message has the same `clientId` (the broadcast can win the race against the ack). The browser keeps the scroll pinned to the bottom, so `ResizeObserver` and the manual scroll math go away.
  - A sentinel `div` at the visual top, watched by an `IntersectionObserver`, calls `fetchNextPage()` to load older messages.
  - **"New messages" separator** (`Separator` with a label):
    - When the chat opens, snapshot *my* `lastReadSeq` from `useChat(id).members` into `readMarkerSeq`. It must not follow later updates, or the separator would vanish while you read.
    - Render the separator right before the oldest message with `seq > readMarkerSeq` and `sender.id !== me`. In the reversed DOM that element comes **after** that message.
    - If a separator exists on open, `scrollIntoView({ block: 'center' })` to it; otherwise stay at the bottom.
  - **Mark as read** (the §2.9 cursor):
    - One `IntersectionObserver` (threshold 0.6, root = the scroll container) watches other people's messages (`data-seq` on each bubble) and maintains the `Set` of seqs currently visible.
    - A debounced (300 ms) `flush()` runs on every observer callback and on `visibilitychange`. If `document.visibilityState === 'visible'` and the highest visible seq is above the cursor I last sent, it calls `markRead(chatId, thatSeq)`.
    - The cursor therefore moves only for messages that were actually on screen in a visible tab, and it sends one tiny event instead of one per message.
- **`MessageBubble`**:
  - Own messages are right-aligned with `bg-primary text-primary-foreground`; others are `bg-muted`.
  - Shows the sender name (groups only, not own), `ReplyQuote` (click → `document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' })` plus a short `animate-pulse` highlight; this replaces the EventEmitter `replyClick`), an image grid (click → full-size `Dialog`), the content, the time (`formatTime`, with a `Tooltip` showing `formatDateTime`), and "edited".
  - **Delivery and read status on own messages**:
    - a `Clock` icon while pending;
    - a red "Failed to send" with **Retry** (`send.mutate(pendingMessage)`, same `clientId`) and **Delete** (`pending.remove`) when failed;
    - `Check` once confirmed;
    - `CheckCheck` when read. In a DM that's `isReadBy(message.seq, otherMember)`; in a group, a `Tooltip` shows "Read by N" (`members.filter(m => m.userId !== me && isReadBy(...))`).
    - These come from `useChat(id).members[].lastReadSeq`, which `chat:read` events keep current.
  - Wrapped in **`ContextMenu`**: Reply / Edit (`canEditMessage`) / Delete (`canDeleteMessage` from `@chat/shared`, confirmed with `AlertDialog`). These are the same rules the server enforces; the UI only hides what would be rejected.
  - Inline edit: when `editingMessageId === id`, show a `Textarea` (Enter saves via `useEditMessage`, Esc cancels).
- **`MessageComposer`**:
  - `ReplyPreview` bar when `replyTo` is set (with an `X` to clear).
  - Attachment thumbnails (`URL.createObjectURL`, removable).
  - An attach `Button` that opens the hidden file input; an auto-growing `Textarea` (Enter sends, Shift+Enter adds a newline); a Send `Button`.
  - On send, validate locally with `sendMessageSchema`, call `useSendMessage(chatId).mutate({ content, replyToId, files })` and clear the input **immediately**. The pending bubble appears at once and the ack replaces it. Revoke the object URLs.
  - **Typing**: on change, if the text is non-empty and more than 3 s have passed since the last emit, `sendTyping(chatId, true)`. When the input is emptied, on send, and on unmount, `sendTyping(chatId, false)`.

**`features/users`**
- `UserProfileDialog` (when `profileUserId` is set): avatar with an online dot, username, about, `formatLastSeen`, and an "Add friend" or "Message" button (`createChat DIRECT`, then `openChat`).
- `SettingsDialog`: an editable form (username, about, 3 privacy `Switch`es) using `updateMeSchema`, a `FriendsList`, and "Log out" (`useAuthStore.logout()`).

**Done when**
- `antd`, `@ant-design/icons`, `mobx`, `moment` and every old `.css` file are gone (`grep -r "antd\|mobx" apps/web/src` returns nothing).
- The full flow works in two browsers: sign up → add friend → DM → group → public search and join → send, reply, edit, delete → images → unread badges and the "New messages" separator → read ticks → typing indicator → online status.
- Stopping the api shows the "Reconnecting…" banner, and on restart the app catches up without a refresh.
- Sending while the api is down shows a failed bubble, and Retry works after the api is back, with no duplicate.

**Commits:** one per feature, for example `feat(web): rebuild auth screen with shadcn`, `feat(web): rebuild chat list and sidebar`, `feat(web): rebuild message list and composer`, `feat(web): rebuild settings and profile dialogs`, `chore(web): remove antd and css files`

---

### Step 15: Frontend tests (Vitest + Testing Library)

Rewrite the 2 old test files for the new components, then add a few more. Keep it to roughly 8 meaningful tests:
- `features/messages/cache.test.ts` (pure functions with a real `QueryClient`):
  - `upsertMessage` puts a message with `seq = newest + 1` at the front of the first page;
  - the same message twice (ack + broadcast) doesn't duplicate it;
  - a **seq gap** invalidates the query instead of inserting;
  - `replaceMessage` and `removeMessage` work.
- `MessageBubble.test.tsx`: renders the content; shows "edited"; hides the sender name for own messages; shows `CheckCheck` only when the other member's `lastReadSeq >= seq`.
- `MessageComposer.test.tsx`:
  - Enter calls the send mutation (mock the module with `vi.mock('../queries')`);
  - an empty message is blocked;
  - Shift+Enter doesn't send;
  - typing emits `typing` at most once per 3 s (mock `@/lib/socket`, use fake timers).
- `LogInForm.test.tsx`: shows a zod error for a short username; submits valid data.
- `stores/chat-ui-store.test.ts`: `openChat` resets `replyTo` and `editingMessageId`.
- `stores/typing-store.test.ts` (fake timers): an entry expires after 5 s unless refreshed.

Add a `renderWithProviders()` helper in `src/test/utils.tsx` that wraps components in a fresh `QueryClientProvider`.

**Done when** `pnpm test` at the root runs shared, api and web tests, all green.
**Commit:** `test(web): add component, cache and store tests with vitest`

---

### Step 16: Dockerfiles

Add a root `.dockerignore`:
```
**/node_modules
**/dist
**/coverage
**/.env
.git
apps/api/src/generated
```

**`apps/api/Dockerfile`**
```dockerfile
FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /repo
# prisma.config.ts requires DATABASE_URL even for `prisma generate`; a dummy value is enough at build time
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
COPY . .
RUN pnpm install --frozen-lockfile
# builds @chat/shared first, then the api (postinstall already ran prisma generate)
RUN pnpm --filter "@chat/api..." build
RUN pnpm --filter @chat/api deploy --prod /out

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /out .
EXPOSE 3000
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node dist/main.js"]
```
In `apps/api/package.json`, add `"files": ["dist", "prisma", "prisma.config.ts"]` so `pnpm deploy` copies the build output, migrations and Prisma config.

**`apps/web/Caddyfile`**

Caddy serves the SPA, proxies the api and websockets, handles TLS automatically when `SITE_ADDRESS` is a domain, and adds the security headers from §2.3 (layers 1 and 6). `style-src 'unsafe-inline'` is needed by the Radix/sonner inline styles. Once deployed, tighten `img-src` to your bucket's hostname and drop the `localhost:8333` entry.
```
{$SITE_ADDRESS::80} {
	encode zstd gzip
	header {
		Strict-Transport-Security "max-age=31536000"
		X-Content-Type-Options nosniff
		X-Frame-Options DENY
		Referrer-Policy no-referrer
		Content-Security-Policy "default-src 'self'; img-src 'self' data: blob: https: http://localhost:8333; connect-src 'self' ws: wss:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'"
	}
	handle /api/* {
		reverse_proxy api:3000
	}
	handle /socket.io/* {
		reverse_proxy api:3000
	}
	handle {
		root * /srv
		try_files {path} /index.html
		file_server
	}
}
```

**`apps/web/Dockerfile`**
```dockerfile
FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter "@chat/web..." build

FROM caddy:2-alpine
COPY apps/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/web/dist /srv
```

**Done when** this command serves the app on `http://localhost:8080` against the containerised api, Postgres and SeaweedFS:
```bash
docker compose --profile full up --build
```
**Commit:** `build(infra): add dockerfiles for api and web`

---

### Step 17: CI (GitHub Actions)

Pin each action to its current major when you write the files.

**`.github/workflows/ci.yml`**
```yaml
name: CI

on:
  pull_request:
    branches: [develop, main]
  push:
    branches: [develop]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

env:
  DATABASE_URL: postgresql://ci:ci@localhost:5432/ci # only for `prisma generate`; unit tests don't hit a DB

jobs:
  checks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: pnpm/action-setup@v4 # reads "packageManager" from package.json
      - uses: actions/setup-node@v5
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm format:check
      - run: pnpm lint
      - run: pnpm build
      - run: pnpm typecheck
      - run: pnpm test

  commits:
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v5
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: >
          pnpm commitlint
          --from ${{ github.event.pull_request.base.sha }}
          --to ${{ github.event.pull_request.head.sha }}
          --verbose

  docker:
    needs: checks
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - run: docker build -f apps/api/Dockerfile -t chat-api:ci .
      - run: docker build -f apps/web/Dockerfile -t chat-web:ci .
```

**`.github/workflows/pr-source.yml`** (only `develop` may merge into `main`):
```yaml
name: PR source

on:
  pull_request:
    branches: [main]

jobs:
  from-develop:
    runs-on: ubuntu-latest
    steps:
      - if: github.head_ref != 'develop'
        run: |
          echo "::error::PRs into main must come from develop (got '${{ github.head_ref }}')"
          exit 1
```

**GitHub settings** (Settings → Rules → Rulesets):
- **`main`**: require a PR; require the status checks `checks`, `commits`, `docker` and `from-develop`; block force pushes.
- **`develop`**: require a PR plus `checks` and `commits`.
- **Merge method**: use "Create a merge commit" or "Rebase" so the conventional commits survive. If you prefer squash, also require a conventional PR title.

**Done when** a PR with a non-conventional commit or failing lint is blocked, and a PR from a `feat/*` branch into `main` is blocked.
**Commit:** `ci: add checks, commit lint and main source guard`

---

### Step 18: CD to AWS (basic: ECR + one EC2 with Docker Compose)

Architecture: GitHub Actions builds the images, pushes them to ECR, then runs a deploy over SSM on an EC2 instance. On the instance, Caddy (web) handles HTTPS, `/api` and `/socket.io` go to the api, Postgres runs in a container on the same instance, and files go to an S3 bucket. That's one VM, no Kubernetes or ECS, and no long-lived AWS keys in GitHub (OIDC).

**18.1 One-time AWS setup (console)**

1. **ECR**: create the repositories `chat-app-api` and `chat-app-web`.
2. **S3**: create the bucket `chat-app-attachments-<random>` in your region. Keep *Block all public access* **on**; presigned URLs still work, and default encryption (SSE-S3) is on.
3. **IAM role for EC2** (`chat-app-ec2`) with:
   - `AmazonSSMManagedInstanceCore`;
   - `AmazonEC2ContainerRegistryReadOnly`;
   - an inline policy allowing `s3:GetObject`, `s3:PutObject` and `s3:DeleteObject` on `arn:aws:s3:::<bucket>/*`, plus `s3:ListBucket` on the bucket;
   - an inline policy allowing `ssm:GetParametersByPath` on `arn:aws:ssm:<region>:<account-id>:parameter/chat-app/prod/*` (for the default `aws/ssm` key no extra KMS permission is needed).
4. **EC2**:
   - Amazon Linux 2023, `t3.small` (x86, so it matches the images GitHub builds), 20 GB disk, the role above.
   - **Tick "Encrypted" on the volume** (EBS encryption): disks and snapshots, including the Postgres data, are encrypted at rest.
   - Security group: inbound 80 and 443 only. No SSH needed, because SSM handles access.
   - **Set "Metadata response hop limit" to 2** (Advanced details). Without it, containers can't reach the instance role and S3 calls fail.
   - Optional: an Elastic IP, plus a DNS `A` record if you have a domain.
5. **Secrets in SSM Parameter Store** (§2.3, layer 4). Run these from your laptop, not from the repo:
   ```bash
   aws ssm put-parameter --type SecureString --name /chat-app/prod/JWT_SECRET --value "$(openssl rand -base64 48)"
   aws ssm put-parameter --type SecureString --name /chat-app/prod/MESSAGE_KEYS --value "1:$(openssl rand -base64 32)"
   aws ssm put-parameter --type SecureString --name /chat-app/prod/POSTGRES_PASSWORD --value "<choose a strong password>"
   aws ssm put-parameter --type SecureString --name /chat-app/prod/DATABASE_URL --value "postgresql://chat:<same password>@postgres:5432/chat"
   ```
   **Back up `MESSAGE_KEYS` somewhere safe** (a password manager). If it's lost, every stored message is unreadable.
6. On the instance (connect with Session Manager):
   ```bash
   sudo dnf install -y docker && sudo systemctl enable --now docker
   ```
   Then install the Docker Compose plugin, using the commands from the Docker docs for Amazon Linux.
   ```bash
   sudo mkdir -p /opt/chat-app
   ```
   Copy `deploy/docker-compose.prod.yml`, `deploy/deploy.sh` and a filled-in `.env` (non-secret values only, see 18.2) into `/opt/chat-app`.
7. **GitHub OIDC**:
   - In IAM, add the identity provider `token.actions.githubusercontent.com` (audience `sts.amazonaws.com`).
   - Create the role `chat-app-github-deploy` with the trust condition `token.actions.githubusercontent.com:sub = repo:MaxKorop/Chat-App:ref:refs/heads/main`.
   - Its permissions: ECR push to the 2 repositories, plus `ecr:GetAuthorizationToken`, `ssm:SendCommand` on the instance and `AWS-RunShellScript`, and `ssm:GetCommandInvocation`.
8. **GitHub repository settings**:
   - Secret: `AWS_DEPLOY_ROLE_ARN`.
   - Variables: `AWS_REGION`, `EC2_INSTANCE_ID`.
   - Create an environment named `production`.

**18.2 `deploy/docker-compose.prod.yml`**
```yaml
name: chat-app

services:
  web:
    image: ${ECR_REGISTRY}/chat-app-web:${IMAGE_TAG:-latest}
    restart: unless-stopped
    ports: ['80:80', '443:443']
    environment:
      SITE_ADDRESS: ${SITE_ADDRESS:-:80}
    volumes: [caddy_data:/data]
    depends_on: [api]

  api:
    image: ${ECR_REGISTRY}/chat-app-api:${IMAGE_TAG:-latest}
    restart: unless-stopped
    env_file: [.env, .env.secrets]
    depends_on:
      postgres: { condition: service_healthy }

  postgres:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: chat
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: chat
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U chat -d chat']
      interval: 5s
      retries: 10

volumes:
  pgdata:
  caddy_data:
```
Two env files sit next to the compose file:
- **`.env`** (non-secret, you create it once): `ECR_REGISTRY`, `SITE_ADDRESS` (your domain, or `:80`), `NODE_ENV=production`, `MESSAGE_KEY_ID=1`, `S3_BUCKET`, `S3_REGION`. It has no S3 keys, because the SDK uses the instance role.
- **`.env.secrets`** (generated by `deploy.sh` from SSM on every deploy; never committed, never in an image): `JWT_SECRET`, `MESSAGE_KEYS`, `POSTGRES_PASSWORD`, `DATABASE_URL`.

**18.3 `deploy/deploy.sh`**
```bash
#!/usr/bin/env sh
set -eu
cd /opt/chat-app
export IMAGE_TAG="$1"
. ./.env

# secrets: SSM Parameter Store → .env.secrets (readable by root only)
umask 077
aws ssm get-parameters-by-path --path /chat-app/prod/ --with-decryption --region "$S3_REGION" \
  --query 'Parameters[].[Name,Value]' --output text \
  | while read -r name value; do echo "${name##*/}=$value"; done > .env.secrets

COMPOSE="docker compose --env-file .env --env-file .env.secrets -f docker-compose.prod.yml"
aws ecr get-login-password --region "$S3_REGION" | docker login --username AWS --password-stdin "$ECR_REGISTRY"
$COMPOSE pull
$COMPOSE up -d
docker image prune -f
```
This assumes the ECR region equals `S3_REGION`. If they differ, add an `AWS_REGION` variable.

**18.4 `.github/workflows/cd.yml`**
```yaml
name: CD

on:
  push:
    branches: [main] # main only changes via PRs from develop (Step 17)
  workflow_dispatch:

permissions:
  id-token: write
  contents: read

concurrency: deploy-production

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v5

      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_DEPLOY_ROLE_ARN }}
          aws-region: ${{ vars.AWS_REGION }}

      - id: ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build and push images
        env:
          REGISTRY: ${{ steps.ecr.outputs.registry }}
          TAG: ${{ github.sha }}
        run: |
          for app in api web; do
            docker build -f apps/$app/Dockerfile -t $REGISTRY/chat-app-$app:$TAG -t $REGISTRY/chat-app-$app:latest .
            docker push --all-tags $REGISTRY/chat-app-$app
          done

      - name: Deploy on EC2 via SSM
        run: |
          CMD_ID=$(aws ssm send-command \
            --instance-ids "${{ vars.EC2_INSTANCE_ID }}" \
            --document-name AWS-RunShellScript \
            --parameters 'commands=["sh /opt/chat-app/deploy.sh ${{ github.sha }}"]' \
            --query Command.CommandId --output text)
          aws ssm wait command-executed --command-id "$CMD_ID" --instance-id "${{ vars.EC2_INSTANCE_ID }}"
```
Migrations run automatically when the api container starts (`prisma migrate deploy`). To roll back, re-run the CD workflow on an older commit, or run `deploy.sh <old-sha>` on the instance.

**Done when** merging a `develop → main` PR deploys, and the app works on the instance's IP or domain over HTTPS (if you have a domain), with uploaded images stored in the S3 bucket.
**Commit:** `ci: add AWS deployment workflow and production compose`

---

### Step 19: README and docs

Root `README.md` sections:
1. **About**: a one-paragraph description plus a screenshot.
2. **Features**: DMs, groups, public search, replies, edit and delete, images, unread counts, read receipts, typing indicators, presence, optimistic sending with retry, at-rest encryption.
3. **Tech stack**: a table for web, api, shared, DB, storage and infra.
4. **Architecture**: a Mermaid diagram (browser → Caddy → NestJS → Postgres / S3, plus Socket.IO).
5. **Repository structure**: the tree from this plan.
6. **Getting started**:
   1. Prerequisites: Node 24, pnpm, Docker.
   2. Set up:
      ```bash
      pnpm install
      ```
      ```bash
      cp apps/api/.env.example apps/api/.env
      ```
      Generate a key and paste the output into `MESSAGE_KEYS` in `apps/api/.env` (`MESSAGE_KEY_ID` is already `1`):
      ```bash
      echo "1:$(openssl rand -base64 32)"
      ```
      ```bash
      pnpm infra:up
      ```
      ```bash
      pnpm db:migrate
      ```
      ```bash
      pnpm db:seed
      ```
      ```bash
      pnpm dev
      ```
      Open http://localhost:5173 and log in as `alice` / `password123`.
   3. Everything in Docker: `docker compose --profile full up --build`.
7. **Scripts**: a table of the root scripts.
8. **Testing, linting, formatting**.
9. **Security**: the 7 layers from §2.3 in short form (TLS, server-side authorisation on REST and WebSocket, AES-256-GCM encryption at rest with per-chat keys and a key ring, key storage, private attachments, CSP and XSS hygiene, rate limits), plus the honest limits (the server can read messages; real E2E is future work).
10. **Realtime**: a link to `docs/realtime.md`, and two sentences on why WebSocket (acks, typing, one authenticated channel) and why REST for history and uploads (§2.8).
11. **Contributing**: branch flow `feat/*` → `develop` → `main`, plus conventional commits.
12. **Deployment**: a summary of Step 18.

`docs/`:
- `database.md` (ERD, from Step 6).
- `realtime.md` (the event table from Step 10, the ack format, and the reconnect rule: invalidate caches on every reconnect).
- `sequence-diagram.puml`, updated: participants become `Web`, `API`, `PostgreSQL`, `S3`, `Socket.IO`. Show the new send flow (`message:send` over the socket → validate → membership check → `seq` increment + encrypt + insert in one transaction → ack to the sender, `message:created` broadcast to the chat room), the read flow (visible messages → debounced `chat:read` → cursor update → `chat:read` broadcast) and the upload flow (POST /attachments → S3 → metadata row → ids sent with the message).
- `architecture.md`, optional: the decisions from Part 2, useful for the thesis text.

**Commit:** `docs: add README, ERD and updated sequence diagram`

---

## Order and dependencies at a glance

```
1 monorepo → 2 tooling → 3 vite
                              ↘
4 shared → 5 infra → 6 prisma → 7 api core → 8 chats/messages → 9 S3 → 10 realtime → 11 api tests
                                                                                         ↓
                              12 tailwind/shadcn → 13 zustand/react-query → 14 UI → 15 web tests
                                                                                         ↓
                                                         16 docker → 17 CI → 18 CD → 19 README
```
Steps 12 and 17 can be done earlier if you want: CI is useful from Step 2 onward, as long as you drop the `docker` job until Step 16.
