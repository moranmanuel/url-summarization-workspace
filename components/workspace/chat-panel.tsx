'use client';
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
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
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const dragStartY = useRef<number | null>(null);
  const isMobile = useIsMobile();
  useEffect(() => {
    if (pinned.current && scroller.current)
      scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [session.messages]);

  function startDrawerDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!isMobile) return;
    if (
      event.target instanceof Element &&
      event.target.closest('button, input, textarea, select, a')
    ) {
      return;
    }

    event.preventDefault();
    dragStartY.current = event.clientY;
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrawerDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragStartY.current === null) return;

    setDragOffset(Math.max(0, event.clientY - dragStartY.current));
  }

  function endDrawerDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragStartY.current === null) return;

    const distance = Math.max(0, event.clientY - dragStartY.current);
    dragStartY.current = null;
    setIsDragging(false);

    if (distance > 120) {
      setDragOffset(0);
      onOpenChange(false);
      return;
    }

    setDragOffset(0);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={isMobile}>
      <SheetContent 
        side={isMobile ? 'bottom' : 'right'}
        className={`chat-sheet ${isDragging ? 'is-dragging' : ''}`}
        showCloseButton={false}
        overlayClassName="chat-overlay"
        style={isMobile ? { transform: `translateY(${dragOffset}px)` } : undefined}
      >
        <div
          className="chat-drawer-content"
          onPointerDown={startDrawerDrag}
          onPointerMove={moveDrawerDrag}
          onPointerUp={endDrawerDrag}
          onPointerCancel={endDrawerDrag}
        >
          <div className="chat-drag-handle">
            <span />
          </div>
          <SheetHeader className="chat-header">
            <SheetTitle>
              <MessageCircle size={16} />
              Chat
            </SheetTitle>
            <button
              className='icon-button sidebar-icon-button text-white!'
              type="button"
              aria-label="Close chat"
              onClick={() => onOpenChange(false)}
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
                <span className="ask-summary">Ask summary</span>
              </Empty>
            )}
            {session.messages.map((message) => (
              <div
                key={message.id}
                className={`flex w-full ${
                  message.role === 'assistant' ? 'justify-start' : 'justify-end'
                }`}
              >
                <div className={`chat-message ${message.role}`}>
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
              </div>
            ))}
          </div>
          <div className='sidechat-prompt-container'>
            <PromptComposer
              type="sidechat"
              placeholder="Ask me about this summary…"
              busy={busy}
              onSubmit={async (text) => {
                pinned.current = true;
                return onSend(text);
              }}
              onStop={onStop}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
