import { AlertCircle, Clock } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { usePendingStore, type PendingMessage } from '@/stores/pending-store';

import { useSendMessage } from './queries';

/** My message that the server has not confirmed yet: a clock while sending, Retry / Discard if it failed. */
export function PendingBubble({ message }: { message: PendingMessage }) {
  const send = useSendMessage(message.chatId);
  const discard = usePendingStore((state) => state.remove);
  const failed = message.status === 'failed';
  const images = message.files.length;

  return (
    <div className="flex flex-col items-end gap-1">
      <div
        className={
          failed
            ? 'bg-destructive/10 max-w-[85%] rounded-2xl rounded-br-sm px-3 py-1.5 sm:max-w-[70%]'
            : 'bg-primary/70 text-primary-foreground max-w-[85%] rounded-2xl rounded-br-sm px-3 py-1.5 sm:max-w-[70%]'
        }
      >
        {images > 0 && (
          <p className="text-sm italic">{images === 1 ? '1 image' : `${images} images`}</p>
        )}
        {message.content && <p className="break-words whitespace-pre-wrap">{message.content}</p>}
        {!failed && (
          <div className="mt-0.5 flex justify-end">
            <span role="img" aria-label="Sending">
              <Clock className="size-3" />
            </span>
          </div>
        )}
      </div>
      {failed && (
        <div className="text-destructive flex max-w-[85%] flex-wrap items-center justify-end gap-x-2 text-xs">
          <AlertCircle className="size-3.5" />
          <span className="font-medium">Not sent</span>
          <span className="text-muted-foreground">{message.error}</span>
          <Button
            variant="ghost"
            size="xs"
            onClick={() =>
              send.mutate({
                content: message.content,
                replyToId: message.replyToId,
                files: message.files,
                clientId: message.clientId,
                attachmentIds: message.attachmentIds,
              })
            }
          >
            Retry
          </Button>
          <Button variant="ghost" size="xs" onClick={() => discard(message.clientId)}>
            Discard
          </Button>
        </div>
      )}
    </div>
  );
}
