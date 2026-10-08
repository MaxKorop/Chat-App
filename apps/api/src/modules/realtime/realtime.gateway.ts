import {
  type Ack,
  type ClientToServerEvents,
  deleteMessageEventSchema,
  editMessageEventSchema,
  markReadEventSchema,
  type MessageDto,
  sendMessageEventSchema,
  type ServerToClientEvents,
  typingEventSchema,
} from '@chat/shared';
import { HttpException, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { z } from 'zod';

import {
  type ChatMembersChangedEvent,
  type ChatReadEvent,
  DomainEvents,
  type MessageDeletedEvent,
} from '../../common/domain-events';
import { PrismaService } from '../../prisma/prisma.service';
import { ChatsService } from '../chats/chats.service';
import { MessagesService } from '../messages/messages.service';
import { PresenceService } from '../presence/presence.service';
import { createPacketGuard } from './packet-guard';

export interface SocketData {
  userId: string;
  username: string;
  /** when the token expires, seconds since 1970 */
  exp: number;
  /** the chats the user belonged to at the moment of the handshake */
  chatIds: string[];
}
type AppServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;
export type AppSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

const chatRoom = (chatId: string) => `chat:${chatId}`;
const userRoom = (userId: string) => `user:${userId}`;

/**
 * A thin adapter between Socket.IO and the services: it authenticates the socket, turns each
 * command into a service call, and broadcasts the domain events the services publish.
 * No business rules live here.
 */
@WebSocketGateway({
  transports: ['websocket'], // no long-polling: no sticky sessions, one round trip less
  maxHttpBufferSize: 100_000, // only text travels over the socket; files go through REST
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
    // Runs once per connection, before it is established. The token comes from the handshake
    // `auth` payload, never from the URL (URLs end up in logs), and who the socket is comes from
    // the verified token, never from anything the client claims.
    server.use(async (socket, next) => {
      let payload: { sub: string; username: string; exp: number };
      try {
        const token = socket.handshake.auth?.token;
        if (typeof token !== 'string') throw new Error('no token');
        payload = await this.jwt.verifyAsync(token);
        if (!payload.sub || !payload.username || typeof payload.exp !== 'number')
          throw new Error('incomplete token');
      } catch {
        return next(new Error('Unauthorized'));
      }
      try {
        // Loaded here, so that the rooms can be joined the moment the connection exists.
        socket.data = {
          userId: payload.sub,
          username: payload.username,
          exp: payload.exp,
          chatIds: await this.chats.getMemberChatIds(payload.sub),
        };
      } catch (error) {
        this.logger.error(
          `Could not load the chats of a connecting user: ${(error as Error).message}`,
        );
        return next(new Error('Server error'));
      }
      next();
    });
  }

  handleConnection(socket: AppSocket) {
    const { userId, chatIds } = socket.data;
    socket.use(createPacketGuard(socket));
    socket.on('error', (error) => this.logger.warn(`socket ${socket.id}: ${error.message}`));

    // Synchronous on purpose: the client may send its first event right after it connects, and
    // the rooms must be in place by then. They come from the database, never from the client.
    void socket.join([userRoom(userId), ...chatIds.map(chatRoom)]);

    // announced FROM this socket, which leaves the user out: nobody needs a notice about themselves
    if (this.presence.connect(userId)) this.emitPresence(userId, chatIds, true, socket);
  }

  handleDisconnect(socket: AppSocket) {
    const { userId } = socket.data;
    if (!userId) return;
    this.presence.disconnect(userId, () => void this.goOffline(userId));
  }

  private async goOffline(userId: string) {
    try {
      await this.prisma.user.update({ where: { id: userId }, data: { lastSeenAt: new Date() } });
      this.emitPresence(userId, await this.chats.getMemberChatIds(userId), false);
    } catch (error) {
      this.logger.error(`Could not record that a user went offline: ${(error as Error).message}`);
    }
  }

  private emitPresence(userId: string, chatIds: string[], isOnline: boolean, from?: AppSocket) {
    // `to([])` would mean "everybody" to Socket.IO, so never call it without rooms.
    if (!chatIds.length) return;
    const rooms = chatIds.map(chatRoom);
    const event = { userId, isOnline };
    if (from) from.to(rooms).emit('presence:changed', event);
    else this.server.to(rooms).emit('presence:changed', event);
  }

  // ── commands: each returns an acknowledgement ──────────────────────────

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

  // ── fire and forget: no acknowledgement ────────────────────────────────

  @SubscribeMessage('chat:read')
  async read(@ConnectedSocket() socket: AppSocket, @MessageBody() body: unknown): Promise<void> {
    await this.handle('chat:read', markReadEventSchema, body, (input) =>
      this.chats.markRead(socket.data.userId, input.chatId, input.seq),
    );
  }

  @SubscribeMessage('typing')
  typing(@ConnectedSocket() socket: AppSocket, @MessageBody() body: unknown): void {
    const parsed = typingEventSchema.safeParse(body);
    // Being in the room is the permission: rooms were filled from the database, so no query is needed.
    if (!parsed.success || !socket.rooms.has(chatRoom(parsed.data.chatId))) return;
    const { chatId, isTyping } = parsed.data;
    socket.to(chatRoom(chatId)).volatile.emit('typing', {
      chatId,
      userId: socket.data.userId,
      username: socket.data.username,
      isTyping,
    });
  }

  // ── domain events → broadcasts ─────────────────────────────────────────

  @OnEvent(DomainEvents.MessageCreated)
  onCreated(message: MessageDto) {
    this.server.to(chatRoom(message.chatId)).emit('message:created', message);
  }

  @OnEvent(DomainEvents.MessageUpdated)
  onUpdated(message: MessageDto) {
    this.server.to(chatRoom(message.chatId)).emit('message:updated', message);
  }

  @OnEvent(DomainEvents.MessageDeleted)
  onDeleted(event: MessageDeletedEvent) {
    this.server.to(chatRoom(event.chatId)).emit('message:deleted', event);
  }

  @OnEvent(DomainEvents.ChatRead)
  onRead(event: ChatReadEvent) {
    this.server.to(chatRoom(event.chatId)).emit('chat:read', event);
  }

  @OnEvent(DomainEvents.ChatMembersChanged)
  onMembersChanged({ chatId, userIds }: ChatMembersChangedEvent) {
    if (!userIds.length) return;
    const rooms = userIds.map(userRoom);
    this.server.in(rooms).socketsJoin(chatRoom(chatId)); // their open sockets start receiving this chat
    this.server.to(rooms).emit('chat:changed', { chatId }); // and refetch their chat list
  }

  // ── what Nest gives HTTP routes for free ───────────────────────────────

  /** Validates the payload, runs the service call and turns the outcome into an acknowledgement. */
  private async handle<S extends z.ZodType, R>(
    event: string,
    schema: S,
    body: unknown,
    run: (input: z.output<S>) => Promise<R>,
  ): Promise<Ack<R>> {
    const parsed = schema.safeParse(body);
    if (!parsed.success)
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid payload' };
    try {
      return { ok: true, data: await run(parsed.data) };
    } catch (error) {
      if (error instanceof HttpException) return { ok: false, error: error.message }; // 403, 404, …
      this.logger.error(`${event} failed`, (error as Error).stack); // the stack, never the payload
      return { ok: false, error: 'Internal error' }; // and nothing about the cause
    }
  }
}
