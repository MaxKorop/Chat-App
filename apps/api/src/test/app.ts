import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';

import { AppModule } from '../app.module';
import { configureApp } from '../app.setup';
import type { Prisma, User } from '../generated/prisma/client';
import { EncryptionService } from '../modules/crypto/encryption.service';
import { PRESENCE_GRACE_MS } from '../modules/presence/presence.service';
import { StorageService } from '../modules/storage/storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { resetDb } from './db';
import { emptyTestBucket } from './s3';

export const TEST_PASSWORD = 'password123';
// cost 4 keeps the suite fast; production uses 10
const passwordHash = bcrypt.hash(TEST_PASSWORD, 4);

export type TestApp = Awaited<ReturnType<typeof createTestApp>>;

/** A fully wired application on an empty test database. Close it in `afterEach`. */
export async function createTestApp(
  options: { trustProxy?: boolean; presenceGraceMs?: number } = {},
) {
  const builder = Test.createTestingModule({ imports: [AppModule] });
  // WebSocket tests do not want to wait 5 seconds to see somebody go offline
  if (options.presenceGraceMs !== undefined)
    builder.overrideProvider(PRESENCE_GRACE_MS).useValue(options.presenceGraceMs);
  const moduleRef = await builder.compile();
  const app: INestApplication = moduleRef.createNestApplication();
  configureApp(app, { trustProxy: options.trustProxy ?? false });
  await app.init();

  const prisma = app.get(PrismaService);
  await resetDb(prisma);
  await emptyTestBucket();
  const storage = app.get(StorageService);
  const jwt = app.get(JwtService);
  return {
    app,
    prisma,
    storage,
    jwt,
    http: () => request(app.getHttpServer()),
    /** starts a real server on a free port (needed for WebSockets) and returns its address */
    async listen() {
      await app.listen(0, '127.0.0.1');
      const address = app.getHttpServer().address() as { port: number };
      return `http://127.0.0.1:${address.port}`;
    },
    /** an Authorization header for `user`, signed like the real log-in does */
    auth: (user: Pick<User, 'id' | 'username'>) => ({
      Authorization: `Bearer ${jwt.sign({ sub: user.id, username: user.username })}`,
    }),
  };
}

let counter = 0;
export async function createUser(
  prisma: PrismaService,
  overrides: Partial<Prisma.UserUncheckedCreateInput> = {},
) {
  counter += 1;
  return prisma.user.create({
    data: {
      username: `user${counter}`,
      email: `user${counter}@example.com`,
      passwordHash: await passwordHash,
      ...overrides,
    },
  });
}

export const befriend = (prisma: PrismaService, a: string, b: string) =>
  prisma.friendship.createMany({
    data: [
      { userId: a, friendId: b },
      { userId: b, friendId: a },
    ],
  });

/** A DIRECT chat between two users, written the way ChatsService does. */
export const createDirectChat = (prisma: PrismaService, a: User, b: User) =>
  prisma.chat.create({
    data: {
      type: 'DIRECT',
      directKey: [a.id, b.id].toSorted().join(':'),
      members: { create: [{ userId: a.id }, { userId: b.id }] },
    },
  });

export const createGroup = (
  prisma: PrismaService,
  owner: User,
  members: User[] = [],
  overrides: Partial<Prisma.ChatUncheckedCreateInput> = {},
) =>
  prisma.chat.create({
    data: {
      type: 'GROUP',
      name: 'Study group',
      createdById: owner.id,
      members: {
        create: [{ userId: owner.id, role: 'OWNER' }, ...members.map((m) => ({ userId: m.id }))],
      },
      ...overrides,
    },
  });

/** Appends an encrypted message, taking the next seq like MessagesService does. */
export async function addMessage(
  t: TestApp,
  chatId: string,
  senderId: string | null,
  content: string | null,
) {
  const { lastSeq } = await t.prisma.chat.update({
    where: { id: chatId },
    data: { lastSeq: { increment: 1 }, lastMessageAt: new Date() },
    select: { lastSeq: true },
  });
  const id = randomUUID();
  return t.prisma.message.create({
    data: {
      id,
      chatId,
      seq: lastSeq,
      senderId,
      content: content === null ? null : t.app.get(EncryptionService).encrypt(content, chatId, id),
    },
  });
}
