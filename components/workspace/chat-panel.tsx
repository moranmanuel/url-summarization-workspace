'use client';
import { useEffect, useRef, useState } from 'react';
import {
  LoaderCircle,
  MessageCircle,
  XIcon
} from 'lucide-react';
import type { SessionDetail } from '@/lib/types';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Empty, EmptyDescription } from '@/components/ui/empty';
import { useIsMobile } from '@/hooks/use-mobile';
import { Markdown } from './markdown';
import { PromptComposer } from './prompt-composer';
export function ChatPanel({
  session,
  open,
  onOpenChange,
  busy,
  onSend,
  onStop,
}: {
  session: SessionDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  onSend: (content: string) => Promise<boolean>;
  onStop: () => void;
}) {
  const [suggestedDraft, setSuggestedDraft] = useState('');
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const isMobile = useIsMobile();
  useEffect(() => {
    if (pinned.current && scroller.current)
      scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [session.messages]);
  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={isMobile}>
      <SheetContent className="chat-sheet" showCloseButton={false}>
        <SheetHeader className="chat-header">
          <SheetTitle>
            <MessageCircle size={16} />
            Chat
          </SheetTitle>
          <button
            className='icon-button sidebar-icon-button text-white!' 
            onClick={() => onOpenChange(!open)}
          >
            <XIcon size={16}/>
          </button>
        </SheetHeader>
        <div
          className="chat-messages"
          ref={scroller}
          onScroll={() => {
            const el = scroller.current;
            if (el)
              pinned.current =
                el.scrollHeight - el.scrollTop - el.clientHeight < 100;
          }}
        >
          {!session.messages.length && (
            <Empty className="chat-empty">
              <MessageCircle size={23} />
              <EmptyDescription>
                Go a little deeper.
                <br />
                Ask anything about this page.
              </EmptyDescription>
              <button
                className="suggestion"
                onClick={() =>
                  setSuggestedDraft('What are the most important takeaways?')
                }
              >
                What are the key takeaways?
              </button>
            </Empty>
          )}
          {session.messages.map((message) => (
            <div key={message.id} className={`chat-message ${message.role}`}>
              <span className="message-role">
                {message.role === 'user' ? 'You' : 'Assistant'}
              </span>
              {message.content ? (
                <Markdown content={message.content} />
              ) : message.status === 'streaming' ? (
                <span className="thinking">
                  <LoaderCircle className="spin" size={14} />
                  Thinking…
                </span>
              ) : null}
              {message.status === 'streaming' && message.content && (
                <span className="stream-cursor" />
              )}
              {message.error && (
                <output className="message-error">{message.error}</output>
              )}
            </div>
          ))}
        </div>
        <div className='sidechat-prompt-container'>
          <PromptComposer
            type="sidechat"
            placeholder="Ask me about this summary…"
            busy={busy}
            suggestedDraft={suggestedDraft}
            onSubmit={async (text) => {
              pinned.current = true;
              return onSend(text);
            }}
            onStop={onStop}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
