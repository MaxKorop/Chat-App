/** "<smallerId>:<biggerId>": the unique key that prevents duplicate DMs */
export const directKey = (a: string, b: string) => [a, b].toSorted().join(':');

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
