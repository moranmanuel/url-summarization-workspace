'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowUp, MessageCircle, LoaderCircle, Square } from 'lucide-react';
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
  const [draft, setDraft] = useState('');
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const isMobile = useIsMobile();
  useEffect(() => {
    if (pinned.current && scroller.current)
      scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [session.messages]);
  async function submit() {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft('');
    pinned.current = true;
    const success = await onSend(text);
    if (!success) setDraft(text);
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={isMobile}>
      <SheetContent className="chat-sheet" showCloseButton>
        <SheetHeader className="chat-header">
          <SheetTitle>
            <MessageCircle size={16} />
            Chat
          </SheetTitle>
          <SheetDescription className="chat-source">
            {session.title}
          </SheetDescription>
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
                  setDraft('What are the most important takeaways?')
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
        <form
          className="chat-composer"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <textarea
            aria-label="Ask about this summary"
            placeholder="Ask me about this summary…"
            value={draft}
            maxLength={6000}
            rows={2}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === 'Enter' &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                void submit();
              }
            }}
          />
          <div className="composer-bottom">
            <span>Grounded in this webpage</span>
            {busy ? (
              <button
                className="send-button"
                type="button"
                aria-label="Stop response"
                onClick={onStop}
              >
                <Square size={12} />
              </button>
            ) : (
              <button
                className="send-button"
                aria-label="Send question"
                disabled={!draft.trim()}
              >
                <ArrowUp size={17} />
              </button>
            )}
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
