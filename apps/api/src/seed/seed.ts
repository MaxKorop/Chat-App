import { randomUUID } from 'node:crypto';

import * as bcrypt from 'bcryptjs';

import type { Prisma, PrismaClient } from '../generated/prisma/client';
import { encrypt, type Keyring } from '../modules/crypto/encryption';

export const DEMO_PASSWORD = 'password123';

/** Fixed ids, so running the seed again replaces exactly the demo data and nothing else. */
export const DEMO_IDS = {
  alice: '00000000-0000-4000-8000-00000000a11c',
  bob: '00000000-0000-4000-8000-0000000000b0',
  carol: '00000000-0000-4000-8000-00000000ca01',
  dm: '00000000-0000-4000-8000-0000000000d1',
  studyGroup: '00000000-0000-4000-8000-0000000006a1',
  projectX: '00000000-0000-4000-8000-0000000006a2',
  openSource: '00000000-0000-4000-8000-0000000006a3',
} as const;

type DemoUser = 'alice' | 'bob' | 'carol';
type DemoMessage = {
  from: DemoUser;
  text: string;
  /** seq of an earlier message in the same chat */
  replyTo?: number;
  edited?: boolean;
};
type DemoChat = {
  id: string;
  data: Prisma.ChatUncheckedCreateInput;
  members: { user: DemoUser; role?: 'OWNER'; readUpTo: number }[];
  messages: DemoMessage[];
};

const MINUTE = 60_000;

/**
 * Demo data for development and for showing the app: three users who are friends, a direct chat,
 * public and private groups, replies, an edited message and some unread messages.
 * Messages are encrypted exactly like the application encrypts them.
 */
export async function seedDatabase(
  prisma: PrismaClient,
  ring: Keyring,
  options: { production?: boolean } = {},
): Promise<void> {
  if (options.production ?? process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed demo data in production');
  }
  const { alice, bob, carol } = DEMO_IDS;

  const chats: DemoChat[] = [
    {
      id: DEMO_IDS.dm,
      data: { type: 'DIRECT', directKey: [alice, bob].toSorted().join(':'), createdById: alice },
      members: [
        { user: 'alice', readUpTo: 3 },
        { user: 'bob', readUpTo: 3 },
      ],
      messages: [
        { from: 'alice', text: 'Hi Bob! Did you see the lecture notes?' },
        { from: 'bob', text: 'Yes, just finished chapter 3.' },
        { from: 'alice', text: 'Great, want to compare answers tomorrow?' },
        { from: 'bob', text: 'Sure, 10:00 at the library?', replyTo: 3 },
      ],
    },
    {
      id: DEMO_IDS.studyGroup,
      data: {
        type: 'GROUP',
        name: 'Study group',
        description: 'Exam prep for the databases course',
        isPublic: true,
        createdById: alice,
      },
      members: [
        { user: 'alice', role: 'OWNER', readUpTo: 5 },
        { user: 'bob', readUpTo: 5 },
        { user: 'carol', readUpTo: 2 },
      ],
      messages: [
        { from: 'alice', text: 'Welcome to the study group!' },
        { from: 'bob', text: 'Thanks for creating it.' },
        { from: 'carol', text: 'Who has the slides from Monday?' },
        { from: 'bob', text: "I'll upload them tonight.", replyTo: 3 },
        { from: 'alice', text: 'Great, thanks everyone!', edited: true },
      ],
    },
    {
      id: DEMO_IDS.projectX,
      data: {
        type: 'GROUP',
        name: 'Project X',
        description: 'Private team chat',
        isPublic: false,
        createdById: bob,
      },
      members: [
        { user: 'bob', role: 'OWNER', readUpTo: 3 },
        { user: 'alice', readUpTo: 2 },
      ],
      messages: [
        { from: 'bob', text: 'Kick-off is on Friday.' },
        { from: 'alice', text: 'Sounds good, I will prepare the slides.' },
        { from: 'bob', text: 'Agenda coming soon.' },
      ],
    },
    {
      id: DEMO_IDS.openSource,
      data: {
        type: 'GROUP',
        name: 'Open Source Club',
        description: 'Anyone can join',
        isPublic: true,
        createdById: carol,
      },
      members: [{ user: 'carol', role: 'OWNER', readUpTo: 1 }],
      messages: [{ from: 'carol', text: 'Anyone interested in contributing to Prisma?' }],
    },
  ];

  // Start clean: only the demo rows are removed (messages go with their chat).
  await prisma.chat.deleteMany({ where: { id: { in: chats.map((chat) => chat.id) } } });
  await prisma.user.deleteMany({ where: { id: { in: [alice, bob, carol] } } });

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const person = (id: string, username: string, about: string) => ({
    id,
    username,
    email: `${username}@example.com`,
    passwordHash,
    about,
  });
  await prisma.user.createMany({
    data: [
      person(alice, 'alice', 'Loves TypeScript'),
      person(bob, 'bob', 'Database nerd'),
      person(carol, 'carol', 'Open source fan'),
    ],
  });
  await prisma.friendship.createMany({
    data: [
      { userId: alice, friendId: bob },
      { userId: bob, friendId: alice },
      { userId: alice, friendId: carol },
      { userId: carol, friendId: alice },
    ],
  });

  const start = Date.now() - 24 * 60 * MINUTE; // the conversations happened over the last day
  let minute = 0;
  for (const chat of chats) {
    await prisma.chat.create({
      data: {
        ...chat.data,
        id: chat.id,
        members: {
          create: chat.members.map((m) => ({
            userId: DEMO_IDS[m.user],
            role: m.role ?? 'MEMBER',
            lastReadSeq: m.readUpTo,
          })),
        },
      },
    });

    const ids: string[] = [];
    for (const [index, message] of chat.messages.entries()) {
      const seq = index + 1;
      const id = randomUUID();
      ids.push(id);
      minute += 7;
      const createdAt = new Date(start + minute * MINUTE);
      await prisma.message.create({
        data: {
          id,
          chatId: chat.id,
          seq,
          senderId: DEMO_IDS[message.from],
          content: encrypt(message.text, ring, chat.id, id),
          replyToId: message.replyTo ? ids[message.replyTo - 1] : null,
          createdAt,
          editedAt: message.edited ? new Date(createdAt.getTime() + MINUTE) : null,
        },
      });
    }
    await prisma.chat.update({
      where: { id: chat.id },
      data: { lastSeq: chat.messages.length, lastMessageAt: new Date(start + minute * MINUTE) },
    });
  }
}
