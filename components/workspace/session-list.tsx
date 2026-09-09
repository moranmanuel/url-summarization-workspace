'use client';
import {
  Link,
  Plus,
  Search,
  Layers,
  LoaderCircle,
  MoreHorizontal,
  Copy,
  Download,
  Trash2,
} from 'lucide-react';
import type { Session } from '@/lib/types';
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { Empty, EmptyDescription } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
export function SessionList({
  sessions,
  selected,
  query,
  setQuery,
  loading,
  disabled,
  onSelect,
  onNew,
  onCopy,
  onDownload,
  onDelete,
}: {
  sessions: Session[];
  selected: string | null;
  query: string;
  setQuery: (value: string) => void;
  loading: boolean;
  disabled: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onCopy: (session: Session) => void;
  onDownload: (session: Session) => void;
  onDelete: (session: Session) => void;
}) {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = !isMobile && state === 'collapsed';
  return (
    <Sidebar className="sessions-sidebar">
      <SidebarHeader className={`sidebar-top ${collapsed ? 'is-collapsed' : ''}`}>
        {!collapsed && 
          <span
          className="brand"
          aria-label="URL Workspace"
          title="URL Workspace"
          >
          <img src='/profound.svg' alt='profound' />
        </span>
        }
        <SidebarTrigger aria-label="collapsed ? 'Expand sidebar' : 'Collapse sidebar'" />
      </SidebarHeader>

      {!collapsed && (
        <>
          <SidebarContent>
            <label className="search-box">
              <Search size={15} />
              <input
                placeholder="Search summaries"
                aria-label="Search summaries"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button
                  className="clear-search"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}
            </label>
            {loading ? (
              <div className="list-skeleton" aria-label="Loading sessions">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : sessions.length ? (
              <nav className="session-list" aria-label="Saved sessions">
                {sessions.map((session) => (
                  <div
                    className={`session-card ${selected === session.id ? 'selected' : ''}`}
                    key={session.id}
                  >
                    <button
                      className="session-select"
                      onClick={() => {
                        onSelect(session.id);
                        setOpenMobile(false);
                      }}
                      aria-current={selected === session.id ? 'page' : undefined}
                    >
                      <span className="session-url">
                        <Link size={12} />
                        <span>{session.url.replace(/^https?:\/\//, '')}</span>
                      </span>
                      <span className="session-title">{session.title}</span>
                      <span className="session-excerpt">
                        {session.summary?.replace(/[#*`]/g, '').slice(0, 115) ||
                          session.excerpt ||
                          'Preparing your summary…'}
                      </span>
                      {session.status !== 'complete' && (
                        <span
                          className={`session-state ${session.status === 'error' ? 'failed' : ''}`}
                        >
                          {session.status === 'error' ? (
                            'Interrupted — retry available'
                          ) : (
                            <>
                              <LoaderCircle size={11} className="spin" />
                              {session.status === 'fetching'
                                ? 'Reading webpage'
                                : 'Summarizing'}
                            </>
                          )}
                        </span>
                      )}
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        className="session-options icon-button"
                        aria-label={`Actions for ${session.title}`}
                      >
                        <MoreHorizontal size={16} />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="start"
                        side="right"
                        className="session-menu"
                      >
                        <DropdownMenuItem
                          disabled={!session.summary}
                          onClick={() => onCopy(session)}
                        >
                          <Copy />
                          Copy summary
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={!session.summary}
                          onClick={() => onDownload(session)}
                        >
                          <Download />
                          Download Markdown
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          disabled={disabled}
                          onClick={() => onDelete(session)}
                        >
                          <Trash2 />
                          Delete session
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
              </nav>
            ) : (
              <Empty className="session-empty">
                <EmptyDescription>
                  {query ? 'No matching summaries' : 'No summaries yet'}
                </EmptyDescription>
              </Empty>
            )}
          </SidebarContent>
          <SidebarFooter>
            <button
              className="glass-button"
              onClick={() => {
                onNew();
                setOpenMobile(false);
              }}
              disabled={disabled}
            >
              <Plus size={15} />
              New summary
            </button>
          </SidebarFooter>
        </>
      )}
    </Sidebar>
  );
}
