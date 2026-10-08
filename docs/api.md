# REST API

Base path: `/api`. All bodies are JSON, except file uploads (`multipart/form-data`). Request and response shapes are defined once, as zod schemas, in [`packages/shared`](../packages/shared/src), and both the api and the web app use them.

Real-time operations (sending, editing and deleting messages, read cursors, typing, presence) are **not** REST. They go over one authenticated Socket.IO connection; they are documented in `docs/realtime.md`, which is written together with the gateway in Step 10.

## Conventions

**Authentication.** Everything except sign-up and log-in needs `Authorization: Bearer <accessToken>`. The token carries only the user id and name (`sub`, `username`), is valid for `JWT_EXPIRES_IN` (7 days by default), and is **not** renewed when the profile changes. A token for a deleted account is rejected.

**Validation.** Bodies, query strings and ids are validated with the shared zod schemas. Unknown body fields are ignored, so nobody can set internal columns. Ids in paths must be UUIDs.

**Errors** have one shape:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": [
    "email: Invalid email address",
    "password: Too small: expected string to have >=8 characters"
  ]
}
```

`message` is a list of `field: problem` entries for validation errors (400) and a single sentence for everything else.

| Status | Meaning here                                                                                 |
| ------ | -------------------------------------------------------------------------------------------- |
| 400    | invalid body, query or id; or a business rule such as "cannot add yourself as a friend"      |
| 401    | missing, invalid or expired token; wrong username or password                                |
| 403    | the action is not allowed: not a member of the chat, not the author, not friends, not public |
| 404    | the user, chat or message does not exist                                                     |
| 409    | the username or e-mail is already taken                                                      |
| 413    | an uploaded file is larger than 5 MB                                                         |
| 415    | an uploaded file is not a PNG, JPEG, GIF or WebP image                                       |
| 429    | too many requests                                                                            |

**Rate limits.** 100 requests per minute and client in general; **5 per minute** for `sign-up` and `log-in`. The client is identified by IP address, taken from `X-Forwarded-For` only when the api runs behind the production reverse proxy.

**Security headers** (helmet) are set on every response.

## Auth

| Route                    | Body                            | Returns                              | Notes                                                                                                             |
| ------------------------ | ------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `POST /api/auth/sign-up` | `{ email, username, password }` | `201` `{ accessToken, user: MeDto }` | The e-mail is stored lower-cased. `409` for a taken username or e-mail.                                           |
| `POST /api/auth/log-in`  | `{ username, password }`        | `200` `{ accessToken, user: MeDto }` | The same `401` for a wrong password and for an unknown user, and it takes the same time (no account enumeration). |
| `GET /api/auth/me`       | n/a                             | `MeDto`                              | Use it on page load to restore the session. `401` if the account no longer exists.                                |

## Users

| Route                          | Body / query                                                                      | Returns               | Notes                                                                                                                                              |
| ------------------------------ | --------------------------------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/users/search`        | `?q=` (up to 100 characters)                                                      | `PublicUserDto[]`     | Plain-text, case-insensitive "contains". At most 20 results, never yourself, never users who hid themselves from search. A blank `q` returns `[]`. |
| `GET /api/users/:id`           | n/a                                                                               | `PublicUserDto`       | `isOnline` is live. `lastSeenAt` is `null` if the user hides it.                                                                                   |
| `PATCH /api/users/me`          | any of `username`, `about`, `hideLastSeen`, `hideInSearch`, `allowFriendRequests` | `MeDto`               | E-mail and password cannot be changed here. `409` if the username is taken.                                                                        |
| `GET /api/users/me/friends`    | n/a                                                                               | `PublicUserDto[]`     | Alphabetical.                                                                                                                                      |
| `POST /api/users/:id/friend`   | n/a                                                                               | `201` `PublicUserDto` | Instant and mutual. Adding the same person again is fine. `400` for yourself, `403` if they do not accept requests.                                |
| `DELETE /api/users/:id/friend` | n/a                                                                               | `204`                 | Removes both directions. Harmless if you were not friends.                                                                                         |

## Chats

| Route                      | Body / query                                                                                 | Returns                | Notes                                                                                                                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/chats`           | n/a                                                                                          | `ChatSummaryDto[]`     | My chats, the one with the newest message first. Each has a `title` (group name, or the other person for a direct chat), `unreadCount` and a decrypted `lastMessage` preview.      |
| `GET /api/chats/search`    | `?q=`                                                                                        | `ChatSummaryDto[]`     | **Public groups** only, by part of the name. At most 20. `isMember` says whether I am already in.                                                                                  |
| `POST /api/chats`          | `{ type: 'DIRECT', userId }` or `{ type: 'GROUP', name, description?, isPublic, memberIds }` | `201` `ChatDetailsDto` | A direct chat needs a **friend**; asking for one that exists returns it with `200`. In a group, the creator becomes `OWNER` and `memberIds` must all be friends (`403` otherwise). |
| `GET /api/chats/:id`       | n/a                                                                                          | `ChatDetailsDto`       | Members see the member list with their **read cursors** (`lastReadSeq`). Non-members can preview a public group, but get `members: []` and no messages. `403` for private chats.   |
| `POST /api/chats/:id/join` | n/a                                                                                          | `201` `ChatDetailsDto` | Public groups only (`403` otherwise). The read cursor starts at the end, so old history is not "unread". Joining twice changes nothing.                                            |

## Messages

| Route                             | Query                                           | Returns        | Notes                                                                                                                                                                                                  |
| --------------------------------- | ----------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/chats/:chatId/messages` | `before` (a `seq`), `limit` (1-100, default 50) | `MessagesPage` | History, **newest first**. `before` is the `seq` of the oldest message you already have; `nextBefore` in the answer is what to pass next, or `null` when there is nothing older. Members only (`403`). |

A message has a per-chat number, `seq` (1, 2, 3, …). It defines the order, is the pagination cursor, and is what read cursors refer to. Deleting a message leaves a gap in the numbers; that is expected.

Message text is stored encrypted and is decrypted only when a message is returned. If a stored message cannot be decrypted (for example its key was removed), `content` is `"[message can't be decrypted]"` instead of the whole request failing.

## Attachments

| Route                   | Body                                                  | Returns                 | Notes                                                                                                                                                                                            |
| ----------------------- | ----------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /api/attachments` | `multipart/form-data`, field `files` (up to 10 files) | `201` `AttachmentDto[]` | Images only, up to 5 MB each. The type is decided from the **content** of the file, never from its name or `Content-Type`. SVG and HTML are refused. All files are checked before any is stored. |

Upload first, then send a message that references the returned ids (`attachmentIds`). Each `url` is a signed link to the private S3 object, valid for one hour; the bare object address returns `403`. A file can be attached to one message of the person who uploaded it. Files that are uploaded but never sent stay unattached.

## Data shapes

Defined in `packages/shared/src/schemas/`:

| Shape            | Where           | Notes                                                                                |
| ---------------- | --------------- | ------------------------------------------------------------------------------------ |
| `MeDto`          | `user.ts`       | the current user, with e-mail and privacy settings                                   |
| `PublicUserDto`  | `user.ts`       | what other users see: no e-mail, `lastSeenAt` hidden on request                      |
| `ChatSummaryDto` | `chat.ts`       | an entry of the chat list                                                            |
| `ChatDetailsDto` | `chat.ts`       | a summary plus description, creation time and members                                |
| `MessageDto`     | `message.ts`    | `seq`, `clientId`, sender, decrypted `content`, `replyTo`, `attachments`, timestamps |
| `MessagesPage`   | `message.ts`    | `{ items, nextBefore }`                                                              |
| `AttachmentDto`  | `attachment.ts` | id, file name, type, size and the signed `url`                                       |
