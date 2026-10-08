import { ALLOWED_IMAGE_TYPES, LIMITS } from '@chat/shared';
import { Paperclip, SendHorizontal, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { sendTyping } from '@/lib/socket';
import { useChatUiStore } from '@/stores/chat-ui-store';

import { useSendMessage } from './queries';

/** how often "typing" is repeated while the user keeps typing; the receiving side forgets it after 5 s */
const TYPING_EVERY_MS = 3_000;

const MAX_MB = LIMITS.ATTACHMENT_MAX_BYTES / (1024 * 1024);
const isImage = (file: File) => (ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type);

/** The box under the messages: text, images, the reply bar, and the typing signal. */
export function MessageComposer({ chatId }: { chatId: string }) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const replyTo = useChatUiStore((state) => state.replyTo);
  const setReplyTo = useChatUiStore((state) => state.setReplyTo);
  const send = useSendMessage(chatId);

  const lastTypingAt = useRef<number | null>(null); // null: the others currently see no "typing"
  const stopTyping = () => {
    if (lastTypingAt.current === null) return;
    lastTypingAt.current = null;
    sendTyping(chatId, false);
  };
  const stopTypingOnLeave = useRef(stopTyping);
  useEffect(() => {
    stopTypingOnLeave.current = stopTyping;
  });
  useEffect(() => () => stopTypingOnLeave.current(), []);

  const changeText = (value: string) => {
    setText(value);
    if (!value.trim()) return stopTyping();
    const now = Date.now();
    if (lastTypingAt.current === null || now - lastTypingAt.current >= TYPING_EVERY_MS) {
      lastTypingAt.current = now;
      sendTyping(chatId, true);
    }
  };

  const addFiles = (chosen: File[]) => {
    const accepted: File[] = [];
    for (const file of chosen) {
      if (!isImage(file))
        toast.error(`${file.name}: only PNG, JPEG, GIF and WebP images can be attached`);
      else if (file.size > LIMITS.ATTACHMENT_MAX_BYTES)
        toast.error(`${file.name} is larger than ${MAX_MB} MB`);
      else accepted.push(file);
    }
    const room = LIMITS.ATTACHMENTS_PER_MESSAGE - files.length;
    if (accepted.length > room)
      toast.error(`You can attach at most ${LIMITS.ATTACHMENTS_PER_MESSAGE} images to a message`);
    setFiles([...files, ...accepted.slice(0, Math.max(room, 0))]);
  };

  const content = text.trim();
  const canSend = content.length > 0 || files.length > 0;

  const submit = () => {
    if (!canSend) return;
    // The message shows up in the list at once (as "sending"), so the box is free again right away.
    send.mutate({ content: content || undefined, replyToId: replyTo?.id, files });
    setText('');
    setFiles([]);
    setReplyTo(null);
    stopTyping();
  };

  return (
    <div className="bg-background border-t p-3">
      {replyTo && (
        <div className="border-primary bg-muted mb-2 flex items-center gap-2 rounded-lg border-l-2 px-3 py-1.5 text-sm">
          <div className="min-w-0 flex-1">
            <p className="font-medium">Replying to {replyTo.sender?.username ?? 'Deleted user'}</p>
            <p className="text-muted-foreground truncate">{replyTo.content ?? 'Image'}</p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Cancel reply"
            onClick={() => setReplyTo(null)}
          >
            <X />
          </Button>
        </div>
      )}

      {files.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2">
          {files.map((file, index) => (
            <Thumbnail
              key={`${file.name}-${index}`}
              file={file}
              onRemove={() => setFiles(files.filter((_, i) => i !== index))}
            />
          ))}
        </ul>
      )}

      <div className="flex items-end gap-2">
        <input
          ref={fileInput}
          type="file"
          hidden
          multiple
          accept={ALLOWED_IMAGE_TYPES.join(',')}
          aria-label="Choose images"
          onChange={(event) => {
            addFiles([...(event.target.files ?? [])]);
            event.target.value = ''; // so choosing the same file again works
          }}
        />
        <Button
          variant="ghost"
          size="icon-lg"
          aria-label="Attach images"
          onClick={() => fileInput.current?.click()}
        >
          <Paperclip />
        </Button>
        <Textarea
          aria-label="Message"
          placeholder="Write a message…"
          rows={1}
          value={text}
          onChange={(event) => changeText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
            event.preventDefault();
            submit();
          }}
          className="max-h-40 min-h-9 resize-none py-1.5"
        />
        <Button size="icon-lg" aria-label="Send message" disabled={!canSend} onClick={submit}>
          <SendHorizontal />
        </Button>
      </div>
    </div>
  );
}

function Thumbnail({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file); // a browser resource, so it is created and released here
    // oxlint-disable-next-line react/set-state-in-effect
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return (
    <li className="relative">
      {url && <img src={url} alt={file.name} className="size-16 rounded-lg object-cover" />}
      <Button
        variant="secondary"
        size="icon-xs"
        aria-label={`Remove ${file.name}`}
        onClick={onRemove}
        className="absolute -top-1.5 -right-1.5 rounded-full shadow"
      >
        <X />
      </Button>
    </li>
  );
}
