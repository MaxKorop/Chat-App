import {
  canDeleteMessage,
  canEditMessage,
  type ChatDetailsDto,
  formatTime,
  isReadBy,
  type MessageDto,
} from '@chat/shared';
import { Check, CheckCheck, CornerUpLeft, Pencil, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useChatUiStore } from '@/stores/chat-ui-store';

import { useDeleteMessage, useEditMessage } from './queries';

type Props = { message: MessageDto; chat: ChatDetailsDto; myId: string };

/** One message: text, images, the quoted message, time and (for my own) delivery ticks, with a context menu. */
export function MessageBubble({ message, chat, myId }: Props) {
  const mine = message.sender?.id === myId;
  const myRole = chat.members.find((m) => m.userId === myId)?.role ?? 'MEMBER';
  const canEdit = canEditMessage(myId, message.sender?.id ?? null) && !!message.content;
  const canDelete = canDeleteMessage({
    chatType: chat.type,
    myRole,
    myId,
    senderId: message.sender?.id ?? null,
  });

  const setReplyTo = useChatUiStore((state) => state.setReplyTo);
  const setEditing = useChatUiStore((state) => state.setEditing);
  const editingId = useChatUiStore((state) => state.editingMessageId);
  const [wantsToEdit, setWantsToEdit] = useState(false);
  const editBox = useRef<HTMLTextAreaElement>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [openImage, setOpenImage] = useState<MessageDto['attachments'][number] | null>(null);
  const editMessage = useEditMessage();
  const deleteMessage = useDeleteMessage();

  // The store makes sure only one message is edited at a time: starting another one closes this editor.
  const editing = wantsToEdit && editingId === message.id;
  const stopEditing = () => {
    setWantsToEdit(false);
    setEditing(null);
  };

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            id={`message-${message.id}`}
            className={cn('flex flex-col', mine ? 'items-end' : 'items-start')}
          >
            <div
              className={cn(
                'max-w-[85%] rounded-2xl px-3 py-1.5 sm:max-w-[70%]',
                mine
                  ? 'rounded-br-sm bg-primary text-primary-foreground'
                  : 'rounded-bl-sm bg-muted',
              )}
            >
              {!mine && chat.type === 'GROUP' && (
                <p className="text-primary text-xs font-semibold">
                  {message.sender?.username ?? 'Deleted user'}
                </p>
              )}
              {!mine && chat.type === 'DIRECT' && !message.sender && (
                <p className="text-xs font-semibold">Deleted user</p>
              )}

              {message.replyTo && <ReplyQuote reply={message.replyTo} mine={mine} />}

              {message.attachments.length > 0 && (
                <div
                  className={cn('my-1 grid gap-1', message.attachments.length > 1 && 'grid-cols-2')}
                >
                  {message.attachments.map((attachment) => (
                    <button
                      key={attachment.id}
                      type="button"
                      aria-label={`Open ${attachment.fileName}`}
                      onClick={() => setOpenImage(attachment)}
                      className="focus-visible:ring-ring overflow-hidden rounded-lg focus-visible:ring-2 focus-visible:outline-none"
                    >
                      <img
                        src={attachment.url}
                        alt={attachment.fileName}
                        loading="lazy"
                        className="max-h-72 w-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}

              {editing ? (
                <EditBox
                  ref={editBox}
                  initial={message.content ?? ''}
                  onCancel={stopEditing}
                  onSave={(content) => {
                    stopEditing();
                    editMessage.mutate({ messageId: message.id, content });
                  }}
                />
              ) : (
                message.content && (
                  <p className="break-words whitespace-pre-wrap">{message.content}</p>
                )
              )}

              <div
                className={cn(
                  'mt-0.5 flex items-center justify-end gap-1 text-[11px]',
                  mine ? 'text-primary-foreground/70' : 'text-muted-foreground',
                )}
              >
                {message.editedAt && <span>edited</span>}
                <span>{formatTime(message.createdAt)}</span>
                {mine && <Ticks message={message} chat={chat} myId={myId} />}
              </div>
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent
          // While the menu is open it holds the focus, and closing it would hand the focus back to the
          // message. When "Edit" was chosen, the input that replaced the text gets it instead.
          onCloseAutoFocus={(event) => {
            if (!wantsToEdit) return;
            event.preventDefault();
            const box = editBox.current;
            box?.focus();
            box?.setSelectionRange(box.value.length, box.value.length);
          }}
        >
          <ContextMenuItem onSelect={() => setReplyTo(message)}>
            <CornerUpLeft />
            Reply
          </ContextMenuItem>
          {canEdit && (
            <ContextMenuItem
              onSelect={() => {
                setEditing(message.id);
                setWantsToEdit(true);
              }}
            >
              <Pencil />
              Edit
            </ContextMenuItem>
          )}
          {canDelete && (
            <ContextMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
              <Trash2 />
              Delete
            </ContextMenuItem>
          )}
        </ContextMenuContent>
      </ContextMenu>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this message?</AlertDialogTitle>
            <AlertDialogDescription>
              It disappears for everyone in the chat. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => deleteMessage.mutate({ messageId: message.id })}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!openImage} onOpenChange={(open) => !open && setOpenImage(null)}>
        <DialogContent className="max-w-3xl p-2">
          <DialogTitle className="sr-only">{openImage?.fileName}</DialogTitle>
          <DialogDescription className="sr-only">Full-size image</DialogDescription>
          {openImage && (
            <img
              src={openImage.url}
              alt={openImage.fileName}
              className="max-h-[80dvh] w-full rounded-lg object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ReplyQuote({ reply, mine }: { reply: NonNullable<MessageDto['replyTo']>; mine: boolean }) {
  const author = reply.senderUsername ?? 'Deleted user';
  return (
    <button
      type="button"
      aria-label={`Reply to ${author}: ${reply.preview}`}
      onClick={() =>
        document
          .getElementById(`message-${reply.id}`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
      className={cn(
        'mb-1 block w-full rounded-md border-l-2 px-2 py-1 text-left text-xs',
        mine
          ? 'border-primary-foreground/60 bg-primary-foreground/10'
          : 'border-primary bg-background/60',
      )}
    >
      <span className="block font-semibold">{author}</span>
      <span className="line-clamp-2 opacity-80">{reply.preview}</span>
    </button>
  );
}

/** The text of a message turned into an input: Enter saves, Shift+Enter is a new line, Escape cancels. */
function EditBox({
  initial,
  onSave,
  onCancel,
  ref,
}: {
  initial: string;
  onSave: (content: string) => void;
  onCancel: () => void;
  ref: React.Ref<HTMLTextAreaElement>;
}) {
  const [value, setValue] = useState(initial);
  return (
    <Textarea
      ref={ref}
      aria-label="Edit message"
      value={value}
      rows={Math.min(6, value.split('\n').length)}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') return onCancel();
        if (event.key !== 'Enter' || event.shiftKey) return;
        event.preventDefault();
        const content = value.trim();
        if (!content) return; // an empty message is a delete, which has its own button
        if (content === initial) return onCancel();
        onSave(content);
      }}
      className="bg-background text-foreground min-h-0 w-full min-w-48 resize-none"
    />
  );
}

/** One tick: stored. Two ticks: somebody has read it. In a group, hovering says how many. */
function Ticks({ message, chat, myId }: Props) {
  const others = chat.members.filter((m) => m.userId !== myId);
  const readBy = others.filter((m) => isReadBy(message.seq, m)).length;
  const read = readBy > 0;
  const Icon = read ? CheckCheck : Check;
  const hint =
    chat.type === 'GROUP' ? `Read by ${readBy} of ${others.length}` : read ? 'Read' : 'Sent';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span role="img" aria-label={read ? 'Read' : 'Sent'} className="inline-flex">
          <Icon className="size-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  );
}
