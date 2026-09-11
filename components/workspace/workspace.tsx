'use client';
import { useState } from 'react';
import {
  ArrowUpRight,
  Link,
  ExternalLink,
  Copy,
  Download,
  MessageCircle,
  LoaderCircle,
  RotateCcw,
  Square,
  X,
  Check,
  KeyRound,
} from 'lucide-react';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { useWorkspace } from '@/hooks/use-workspace';
import { useWorkspaceTools } from '@/hooks/use-workspace-tools';
import type { Session } from '@/lib/types';
import { SessionList } from './session-list';
import { ChatPanel } from './chat-panel';
import { Markdown } from './markdown';

export function Workspace() {
  const app = useWorkspace();
  useWorkspaceTools(app);
  const [url, setUrl] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const [deleting, setDeleting] = useState<Session | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const session = app.detail;
  const streaming =
    session?.status === 'fetching' || session?.status === 'streaming';
  async function copy(s: Session) {
    try {
      await navigator.clipboard.writeText(s.summary);
      app.setNotice('Summary copied');
    } catch {
      app.setError('Clipboard access is unavailable. Use Download instead.');
    }
  }
  function download(s: Session) {
    const text = `# ${s.title}\n\nSource: ${s.url}\nSaved: ${new Date(s.createdAt).toISOString()}\nStatus: ${s.status}\n\n${s.summary}\n`;
    const href = URL.createObjectURL(
      new Blob([text], { type: 'text/markdown;charset=utf-8' }),
    );
    const a = document.createElement('a');
    a.href = href;
    a.download = `${s.title.replace(/[^a-z0-9]+/gi, '-').slice(0, 80) || 'summary'}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
    app.setNotice('Summary downloaded');
  }
  return (
    <SidebarProvider
      className="workspace"
      style={{
        '--sidebar-width': '320px',
        '--sidebar-width-icon': '64px'
      } as React.CSSProperties}
    >
      <SessionList
        sessions={app.sessions}
        selected={app.selected}
        query={app.query}
        setQuery={app.setQuery}
        loading={app.loading}
        disabled={!!app.busy}
        onSelect={(id) => {
          setChatOpen(false);
          void app.select(id);
        }}
        onNew={() => {
          setChatOpen(false);
          void app.select(null);
          setUrl('');
        }}
        onCopy={(s) => void copy(s)}
        onDownload={download}
        onDelete={setDeleting}
      />
      <main
        className={`main-surface ${chatOpen && session ? 'chat-open' : ''}`}
      >
        <header className="workspace-header">
          <SidebarTrigger className="mobile-menu-trigger border-0 h-8 w-8" aria-label="Open sidebar" />
          {app.notice && (
            <output className="save-notice">
              <Check size={13} />
              {app.notice}
            </output>
          )}
        </header>
        {app.error && (
          <div className="error-banner" role="alert">
            <span>{app.error}</span>
            <button
              className="icon-button"
              aria-label="Dismiss error"
              onClick={() => app.setError('')}
            >
              <X size={15} />
            </button>
          </div>
        )}
        {app.detailLoading && !session ? (
          <div className="reading-skeleton" aria-label="Loading summary">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-1/3" />
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-28 w-full" />
            ))}
          </div>
        ) : !app.selected ? (
          <section className="welcome">
            <div className="welcome-inner">
              <h1>Let’s get to it</h1>
              <p>Paste a URL to summarize and understand any content instantly</p>
              <form
                className="url-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (url.trim()) void app.create(url);
                }}
              >
                <label className="url-input">
                  <Link size={16} />
                  <input
                    aria-label="Webpage URL"
                    inputMode="url"
                    autoComplete="url"
                    placeholder="https://example.com…"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    disabled={!!app.busy}
                    maxLength={2048}
                  />
                </label>
                <button
                  className="glass-button"
                  type="submit"
                  disabled={!url.trim() || !!app.busy}
                >
                  {app.busy ? (
                    <LoaderCircle className="spin" size={16} />
                  ) : ("Summarize")}
                </button>
              </form>
              {app.config && !app.config.configured && (
                <div className="setup-note">
                  <KeyRound size={15} />
                  <span>
                    Connect Gemini to create your first summary.
                    <br />
                    <a
                      href="https://aistudio.google.com/apikey"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Get an API key
                      <ExternalLink size={11} />
                    </a>
                    <span className="setup-detail">
                      Add it as <code>GEMINI_API_KEY</code> in your server’s
                      environment.
                    </span>
                  </span>
                </div>
              )}
            </div>
          </section>
        ) : session ? (
          <>
            <div className="reading-scroll">
              <article className="summary-article">
                <div className="article-source">
                  <Link size={13} />
                  <a
                    href={session.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {session.url.replace(/^https?:\/\//, '')}
                  </a>
                  <ExternalLink size={12} />
                </div>
                <h1>{session.title}</h1>
                <div className="article-meta">
                  <span>
                    {new Date(session.createdAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                  {session.wordCount > 0 && (
                    <>
                      <span>·</span>
                      <span>
                        {session.wordCount.toLocaleString()} source words
                      </span>
                    </>
                  )}
                  <span>·</span>
                  <span className={`status-label ${session.status}`}>
                    {session.status === 'complete'
                      ? 'Summary saved'
                      : session.status === 'error'
                        ? 'Incomplete'
                        : session.status === 'fetching'
                          ? 'Reading webpage'
                          : 'Writing summary'}
                  </span>
                </div>
                {session.sourceTruncated && (
                  <p className="source-note">
                    This is a long page. The summary uses its first 60,000
                    characters.
                  </p>
                )}
                {session.summary ? (
                  <>
                    <Markdown content={session.summary} />
                    {streaming && <span className="stream-cursor" />}
                  </>
                ) : streaming ? (
                  <output className="generation-state">
                    <LoaderCircle size={21} className="spin" />
                    <p>
                      {session.status === 'fetching'
                        ? 'Reading the webpage…'
                        : 'Finding what matters…'}
                    </p>
                    <span>Your summary will appear here as it’s written.</span>
                  </output>
                ) : null}
                {session.status === 'error' && (
                  <div className="retry-card">
                    <p>{session.error}</p>
                    {session.summary && (
                      <span>
                        The partial summary above is saved. Retrying replaces it
                        only once new text arrives.
                      </span>
                    )}
                    <button
                      className="glass-button"
                      disabled={!!app.busy}
                      onClick={() => void app.retry(session.id)}
                    >
                      <RotateCcw size={14} />
                      Retry summary
                    </button>
                  </div>
                )}
                {session.summary && (
                  <div className="article-actions">
                    <button
                      className="text-button"
                      onClick={() => void copy(session)}
                    >
                      <Copy size={14} />
                      Copy
                    </button>
                    <button
                      className="text-button"
                      onClick={() => download(session)}
                    >
                      <Download size={14} />
                      Download
                    </button>
                  </div>
                )}
              </article>
            </div>
            <div className="reading-bottom">
              {streaming ? (
                <div className="source-pill">
                  <LoaderCircle size={13} className="spin" />
                  <span>
                    {session.status === 'fetching'
                      ? 'Reading source'
                      : 'Generating summary'}
                  </span>
                  {app.busy?.id === session.id && (
                    <button
                      className="icon-button"
                      aria-label="Stop summary"
                      onClick={app.stop}
                    >
                      <Square size={11} />
                    </button>
                  )}
                </div>
              ) : session.summary && !chatOpen ? (
                <button
                  className="open-composer"
                  onClick={() => setChatOpen(true)}
                >
                  <MessageCircle size={16} />
                  <span>Ask me about this summary…</span>
                  <span className="send-button">
                    <ArrowUpRight size={16} />
                  </span>
                </button>
              ) : null}
            </div>
          </>
        ) : (
          <div className="unavailable">
            <p>This session is unavailable.</p>
            <button
              className="glass-button"
              onClick={() => void app.select(null)}
            >
              New summary
            </button>
          </div>
        )}
      </main>
      {session && (
        <ChatPanel
          key={session.id}
          session={session}
          open={chatOpen}
          onOpenChange={setChatOpen}
          busy={!!app.busy}
          onSend={(text) => app.chat(session.id, text)}
          onStop={app.stop}
        />
      )}
      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open && !deleteBusy) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this session?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleting?.title}” and its chat history will be permanently
              removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>
              Keep session
            </AlertDialogCancel>
            <button
              className="delete-button"
              disabled={deleteBusy}
              onClick={async () => {
                if (!deleting) return;
                setDeleteBusy(true);
                if (await app.remove(deleting.id)) setDeleting(null);
                setDeleteBusy(false);
              }}
            >
              {deleteBusy ? 'Deleting…' : 'Delete session'}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  );
}
