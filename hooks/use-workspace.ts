'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, consume } from '@/lib/client';
import type { Session, SessionDetail, Message, StreamEvent } from '@/lib/types';
export function useWorkspace() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState<{
    kind: 'summary' | 'chat';
    id: string | null;
  } | null>(null);
  const [config, setConfig] = useState<{
    configured: boolean;
    provider: string;
    model: string;
  } | null>(null);
  const active = useRef<typeof busy>(null);
  const selectedRef = useRef(selected);
  const queryRef = useRef(query);
  useEffect(() => {
    queryRef.current = query;
  }, [query]);
  const controller = useRef<AbortController | null>(null);
  const listSequence = useRef(0);
  const detailSequence = useRef(0);
  const cache = useRef(new Map<string, SessionDetail>());
  const refresh = useCallback(async () => {
    const sequence = ++listSequence.current;
    try {
      const data = await api<{ sessions: Session[] }>(
        `/api/sessions?q=${encodeURIComponent(queryRef.current)}`,
      );
      if (sequence === listSequence.current) setSessions(data.sessions);
    } catch (e) {
      if (sequence === listSequence.current) setError((e as Error).message);
    } finally {
      if (sequence === listSequence.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 200);
    return () => clearTimeout(timer);
  }, [query, refresh]);
  useEffect(() => {
    void api<typeof config>('/api/config')
      .then(setConfig)
      .catch(() =>
        setError(
          'Could not check the AI connection. Reload the page to try again.',
        ),
      );
    return () => controller.current?.abort();
  }, []);
  const updateSession = useCallback((session: Session) => {
    const existing = cache.current.get(session.id);
    const next = { ...session, messages: existing?.messages ?? [] };
    cache.current.set(session.id, next);
    setSessions((items) => {
      const found = items.some((s) => s.id === session.id);
      return found
        ? items.map((s) => (s.id === session.id ? session : s))
        : [session, ...items];
    });
    if (selectedRef.current === session.id) setDetail(next);
  }, []);
  const updateMessage = useCallback((message: Message) => {
    const session = cache.current.get(message.sessionId);
    if (!session) return;
    const messages = session.messages.some((m) => m.id === message.id)
      ? session.messages.map((m) => (m.id === message.id ? message : m))
      : [...session.messages, message];
    const next = { ...session, messages };
    cache.current.set(session.id, next);
    if (selectedRef.current === session.id) setDetail(next);
  }, []);
  const select = useCallback(async (id: string | null) => {
    const sequence = ++detailSequence.current;
    selectedRef.current = id;
    setSelected(id);
    setError('');
    setDetail(id ? (cache.current.get(id) ?? null) : null);
    if (!id) {
      setDetailLoading(false);
      return;
    }
    if (active.current?.id === id) {
      setDetailLoading(false);
      return;
    }
    setDetailLoading(true);
    try {
      const next = await api<SessionDetail>(`/api/sessions/${id}`);
      cache.current.set(id, next);
      if (sequence === detailSequence.current) setDetail(next);
    } catch (e) {
      if (sequence === detailSequence.current) setError((e as Error).message);
    } finally {
      if (sequence === detailSequence.current) setDetailLoading(false);
    }
  }, []);
  // Recover work started in a different tab or interrupted by reload, without overwriting this tab's stream.
  useEffect(() => {
    if (
      !detail ||
      active.current?.id === detail.id ||
      !(
        detail.status === 'fetching' ||
        detail.status === 'streaming' ||
        detail.messages.some((m) => m.status === 'streaming')
      )
    )
      return;
    const timer = setInterval(() => void select(detail.id), 4000);
    return () => clearInterval(timer);
  }, [detail, select]);
  const run = async (
    kind: 'summary' | 'chat',
    id: string | null,
    path: string,
    body: object,
  ) => {
    if (active.current) return false;
    active.current = { kind, id };
    setBusy(active.current);
    setError('');
    setNotice('');
    const abort = new AbortController();
    controller.current = abort;
    let currentId = id,
      assistant: Message | undefined,
      success = true;
    try {
      await consume(
        path,
        body,
        (event: StreamEvent) => {
          if (event.type === 'session') {
            if (!currentId) {
              currentId = event.session.id;
              selectedRef.current = currentId;
              setSelected(currentId);
              ++detailSequence.current;
              setDetailLoading(false);
            }
            active.current = { kind, id: currentId };
            setBusy(active.current);
            updateSession(event.session);
          } else if (event.type === 'message') {
            updateMessage(event.message);
            if (event.message.role === 'assistant') assistant = event.message;
          } else if (event.type === 'delta') {
            if (kind === 'summary' && currentId) {
              const previous = cache.current.get(currentId);
              if (previous)
                updateSession({
                  ...previous,
                  summary: previous.summary + event.text,
                });
            } else if (assistant) {
              assistant = {
                ...assistant,
                content: assistant.content + event.text,
              };
              updateMessage(assistant);
            }
          } else if (event.type === 'done') {
            if (event.session) updateSession(event.session);
            if (event.message) updateMessage(event.message);
            setNotice(kind === 'summary' ? 'Summary saved' : 'Reply saved');
          } else if (event.type === 'error') {
            success = false;
            if (event.session) updateSession(event.session);
            if (event.chatMessage) updateMessage(event.chatMessage);
            setError(event.message);
          }
        },
        abort.signal,
      );
    } catch (e) {
      success = false;
      setError(
        (e as Error).name === 'AbortError'
          ? 'Response stopped. Any partial text will be saved.'
          : (e as Error).message,
      );
    } finally {
      active.current = null;
      setBusy(null);
      controller.current = null;
      void refresh();
      if (currentId && selectedRef.current === currentId) {
        try {
          const next = await api<SessionDetail>(`/api/sessions/${currentId}`);
          cache.current.set(currentId, next);
          if (selectedRef.current === currentId) setDetail(next);
        } catch {
          /* Keep the last visible partial result if offline. */
        }
      }
    }
    return success;
  };
  const create = (url: string) =>
    run('summary', null, '/api/sessions', { url });
  const retry = (id: string) =>
    run('summary', id, `/api/sessions/${id}/retry`, {});
  const chat = (id: string, content: string) =>
    run('chat', id, `/api/sessions/${id}/chat`, { content });
  const remove = async (id: string) => {
    try {
      await api(`/api/sessions/${id}`, { method: 'DELETE' });
      cache.current.delete(id);
      setSessions((items) => items.filter((s) => s.id !== id));
      if (selectedRef.current === id) void select(null);
      setNotice('Session deleted');
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  };
  return {
    sessions,
    selected,
    detail,
    query,
    setQuery,
    loading,
    detailLoading,
    error,
    setError,
    notice,
    setNotice,
    busy,
    config,
    select,
    create,
    retry,
    chat,
    remove,
    refresh,
    stop: () => controller.current?.abort(),
  };
}
