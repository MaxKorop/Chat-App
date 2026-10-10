# Frontend

The web app (`apps/web`) is a React 19 single-page app built with Vite. It talks to the backend through REST ([api.md](./api.md)) for history, profiles and uploads, and through one Socket.IO connection ([realtime.md](./realtime.md)) for everything live. Why these choices: improvement plan, §2.

## Stack

| Concern         | Library                                                          |
| --------------- | ---------------------------------------------------------------- |
| UI components   | Tailwind CSS v4 and shadcn/ui (Radix), icons from `lucide-react` |
| Server data     | TanStack Query (React Query) v5                                  |
| Client-only UI  | Zustand 5                                                        |
| Forms           | react-hook-form with the shared zod schemas                      |
| Toasts          | sonner                                                           |
| HTTP / realtime | axios, socket.io-client                                          |
| Tests           | Vitest (jsdom) and Testing Library                               |

The app has a light and a dark theme (see "Theme and brand" below). shadcn components live in `src/components/ui/` and are generated code: they are excluded from the linter and changed only by re-running the shadcn CLI.

## Folder layout

```
src/
  app/providers.tsx     query client, tooltips, toaster
  App.tsx               log-in screen without a session, the app with one
  components/
    ui/                 shadcn components (generated)
    layout/             AppShell, Sidebar, ConnectionBanner
  features/
    auth/               log-in and sign-up
    users/              profiles, settings, friends
    chats/              chat list, search, create, header, info, join
    messages/           history, bubbles, composer, pending messages
    (each feature: api.ts = REST calls, queries.ts = React Query hooks, then components)
  stores/               Zustand stores
  hooks/                useRealtime, debounce helpers
  lib/                  api client, socket, query client and keys, formatting
  test/                 test helpers and fakes
```

A feature's `api.ts` only calls the network and returns typed data; components never call axios themselves. A repo test fails if the web app calls a route that `docs/api.md` does not document, or never calls one that it does.

## Theme and brand

The app has a light and a dark theme, and follows the device's setting until the user chooses (Settings → Appearance).

- **Tokens.** All colours are CSS variables in `src/styles.css`: `:root` is the light theme and `.dark` overrides it. Besides the shadcn tokens there are `--brand` (the lagoon teal of the logo), `--chat-background` and the message bubble tokens (`--bubble-own`, `--bubble-own-foreground`, `--bubble-own-muted`, `--bubble-other`, `--bubble-other-foreground`). Components use them as Tailwind classes (`bg-bubble-own`, `bg-chat-background`), never raw colours.
- **Readability is tested.** `styles.test.ts` reads the tokens from the stylesheet and checks the WCAG contrast (4.5:1) of every text/background pair in both themes, so a palette change that hurts readability fails the build. The dark theme is dark slate, not black; a test pins its minimum lightness.
- **No flash on load.** `public/theme-init.js` runs synchronously in `<head>`, reads the saved choice (`localStorage` key `theme`, written by `theme-store`) and sets the `dark` class before the first paint. It is a file, not an inline script, because the production Content-Security-Policy forbids inline scripts. Its colours and storage format must match `lib/theme.ts` and `stores/theme-store.ts`; `theme-init.test.ts` checks it.
- **Browser bar.** `<meta name="theme-color">` is updated with the theme (`THEME_COLORS` equals each theme's `--background`, also tested).
- **Hooks.** `useResolvedTheme()` is the theme in effect (it follows `prefers-color-scheme` while the choice is `system`); `useApplyTheme()` is mounted once in the providers and keeps the page in step. The toaster reads the same hook. (`next-themes` was dropped: it injects an inline script.)

Icons live in `apps/web/public/` (`favicon.svg`, `favicon.ico`, the PNG icons and `manifest.webmanifest`). The PNG and ICO files are generated from `favicon.svg` by `node tooling/make-icons.mjs` (headless Chrome) and committed; run it after changing the logo. `BrandMark` is the same logo as a React component.

## Where state lives

The rule: **anything the server owns is in React Query; anything only this browser knows is in Zustand.**

| Store           | Holds                                                                                                              | Persisted |
| --------------- | ------------------------------------------------------------------------------------------------------------------ | --------- |
| `auth-store`    | the access token; `logout()` also clears the query cache and the other stores                                      | yes       |
| `chat-ui-store` | open chat, reply target, message being edited, open dialog, shown profile, connection state                        | no        |
| `pending-store` | messages sent but not yet confirmed by the server (kept outside the query cache, which only holds stored messages) | no        |
| `typing-store`  | who is typing in which chat; an entry expires 5 seconds after the last `typing` event                              | no        |
| `theme-store`   | the theme choice: `light`, `dark` or `system`                                                                      | yes       |

Query keys are defined in one place (`lib/query-keys.ts`), so cache updates from socket events and invalidations after mutations cannot drift apart.

## The realtime layer

`useRealtime()` (mounted only while there is a verified session) connects the singleton socket in `lib/socket.ts` and turns server events into cache updates:

| Event                         | Effect                                                                                                      |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `message:created`             | upsert into the chat's history (de-duplicated, a `seq` gap triggers a refetch) and refresh the chat list    |
| `message:updated`             | replace the message in the history                                                                          |
| `message:deleted`             | remove it from the history and refresh the chat list                                                        |
| `chat:read`                   | move the reader's cursor in the chat details (drives ticks); refresh the list when it was me (unread badge) |
| `typing`                      | `typing-store`                                                                                              |
| `chat:changed`                | refetch the chat list (and everything under it)                                                             |
| `presence:changed`            | refetch that user's profile                                                                                 |
| `connect` after the first one | refetch every chat query and every user query: missed events are not replayed                               |
| `disconnect`                  | show the banner; if the server closed the socket, connect again                                             |
| `connect_error: Unauthorized` | log out                                                                                                     |

The chat query keys share the prefix `['chats']`, so one invalidation after a reconnect refreshes the list, the open chat and its history.

Commands (`message:send`, `edit`, `delete`) are acknowledgements turned into promises by `call()` in `lib/socket.ts`, with an 8 second timeout, so they plug into React Query mutations.

## Sending a message

1. `useSendMessage` generates a `clientId` and puts a **pending** message into `pending-store` (the bubble appears at once, with a clock).
2. Images are uploaded over REST first; the returned ids are saved on the pending message, so a retry does not upload again.
3. `message:send` is emitted and awaited. On success the stored message is upserted into the cache and the pending one removed. The broadcast `message:created` arrives too; the upsert de-duplicates by id, so the order of the two does not matter.
4. On failure the pending message stays, marked failed, with **Retry** (same `clientId`, so the server treats it as the same message) and **Discard**.

## Reading and unread

- `MessageList` is laid out with `flex-col-reverse` and the newest message first in the DOM, so the browser keeps the view at the bottom and older pages can be added above without jumping.
- An `IntersectionObserver` watches the messages of _other people_. The newest one that was really on screen is reported with `chat:read`, 300 ms after the last change, never from a background tab, and never twice for the same `seq`.
- The **New messages** separator is placed once, when the chat is opened, before the oldest message from somebody else that was past the read cursor. It does not move while reading; the view scrolls to it.
- Ticks: one tick means stored, two mean somebody else has read it; in a group, hovering shows "Read by N of M".

## Layout

From the `md` breakpoint up the sidebar and the chat sit side by side. On a phone only one is shown: the list when no chat is open, the chat (with a back button) otherwise. The connection banner appears above everything while the socket is down.

## Testing the frontend

Tests sit next to the code (`*.test.tsx`). The helpers in `src/test/`:

- `FakeSocket` (`fake-socket.ts`) plays the server: `receive(event, …)` delivers an event, `ackResponder` answers commands, `sent(event)` returns what the client emitted. Install it with `vi.mock('socket.io-client', …)`.
- `FakeIntersectionObserver` lets a test decide what is on screen.
- `renderWithProviders`, `renderHookWithProviders` and `loginAs` give a test a fresh query client, tooltips and a signed-in user. Cached data counts as fresh, so seeding the cache does not trigger a request.
- `factories.ts` builds DTOs.
- **No test may reach a real server.** `test/setup.ts` makes every axios request fail with "Unexpected request in a test" unless the test mocks the feature's `api` module or installs its own adapter (see [testing.md](./testing.md) for why).
