'use client';
import { useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { api } from '@/lib/client';
import type { Session, SessionDetail } from '@/lib/types';
import type { useWorkspace } from './use-workspace';
type ModelTool = {
  name: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => Promise<unknown>;
};
type ModelContext = {
  registerTool: (
    tool: ModelTool,
    options: { signal: AbortSignal },
  ) => void | Promise<void>;
};
function stringField(
  input: unknown,
  key: string,
  max: number,
  required = true,
) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Expected an object.');
  const value = (input as Record<string, unknown>)[key];
  if (value === undefined && !required) return '';
  if (
    typeof value !== 'string' ||
    (required && !value.trim()) ||
    value.length > max
  )
    throw new Error(`Invalid ${key}.`);
  return value.trim();
}
export function useWorkspaceTools(app: ReturnType<typeof useWorkspace>) {
  const latest = useRef(app);
  useEffect(() => {
    latest.current = app;
  }, [app]);
  useEffect(() => {
    const context = (document as Document & { modelContext?: ModelContext })
      .modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const tools: ModelTool[] = [
      {
        name: 'list_saved_summaries',
        description:
          'Read saved webpage summaries in this browser’s workspace, optionally searching source text, URL, title, or summary.',
        inputSchema: {
          type: 'object',
          properties: { query: { type: 'string', maxLength: 200 } },
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        async execute(input) {
          const query = stringField(input, 'query', 200, false);
          const { sessions } = await api<{ sessions: Session[] }>(
            `/api/sessions?q=${encodeURIComponent(query)}`,
          );
          return {
            sessions: sessions.map(({ id, title, url, status }) => ({
              id,
              title,
              url,
              status,
            })),
          };
        },
      },
      {
        name: 'open_saved_summary',
        description:
          'Open an existing saved summary in the visible workspace. Does not generate content.',
        inputSchema: {
          type: 'object',
          properties: { sessionId: { type: 'string' } },
          required: ['sessionId'],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: true },
        async execute(input) {
          const id = stringField(input, 'sessionId', 64);
          const session = await api<SessionDetail>(
            `/api/sessions/${encodeURIComponent(id)}`,
          );
          await latest.current.select(id);
          flushSync(() => {});
          return {
            id: session.id,
            title: session.title,
            status: session.status,
          };
        },
      },
      {
        name: 'create_webpage_summary',
        description:
          'Fetch a public webpage, generate an actual AI summary, persist it, and open it in the visible workspace. Uses the server-configured Gemini API account.',
        inputSchema: {
          type: 'object',
          properties: { url: { type: 'string', maxLength: 2048 } },
          required: ['url'],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: true },
        async execute(input) {
          const url = stringField(input, 'url', 2048);
          if (latest.current.busy)
            throw new Error('A response is already running.');
          const success = await latest.current.create(url);
          flushSync(() => {});
          if (!success)
            throw new Error(
              'Summary creation did not complete. Check the visible error for details.',
            );
          return { status: 'saved' };
        },
      },
    ];
    for (const tool of tools) {
      try {
        void Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {
        /* Optional progressive enhancement. */
      }
    }
    return () => lifecycle.abort();
  }, []);
}
