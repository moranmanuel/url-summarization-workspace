import type { StreamEvent } from './types';
import { readSSE } from './sse';
export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers);
  if (!headers.has('Content-Type'))
    headers.set('Content-Type', 'application/json');
  const response = await fetch(path, { ...options, headers });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(
      body?.error ||
        'The server could not complete this request. Please try again.',
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export async function consume(
  path: string,
  body: object,
  onEvent: (event: StreamEvent) => void,
  signal: AbortSignal,
) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(
      data?.error || 'Could not start the response. Please try again.',
    );
  }
  if (!response.body)
    throw new Error('The server returned an empty response. Please retry.');
  let terminal = false;
  for await (const raw of readSSE(response.body)) {
    const event = JSON.parse(raw) as StreamEvent;
    onEvent(event);
    if (event.type === 'done' || event.type === 'error') terminal = true;
  }
  if (!terminal)
    throw new Error(
      'The connection was interrupted. Your partial text is saved; reopen the session to check its status.',
    );
}
