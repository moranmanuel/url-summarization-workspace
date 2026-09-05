import type { StreamEvent } from '../types';
import { responseHeaders } from './http';
import { errorMessage } from './errors';
/** A disconnected tab stops the LLM, but the producer still persists its partial result. */
export function streamResponse(
  request: Request,
  cookie: string | undefined,
  produce: (
    send: (event: StreamEvent) => void,
    signal: AbortSignal,
  ) => Promise<void>,
) {
  const abort = new AbortController();
  const signal = AbortSignal.any([
    abort.signal,
    request.signal,
    AbortSignal.timeout(120000),
  ]);
  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: StreamEvent) => {
        if (!closed) {
          try {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
            );
          } catch {
            closed = true;
            abort.abort();
          }
        }
      };
      const heartbeat = setInterval(() => {
        if (!closed) {
          try {
            controller.enqueue(encoder.encode(': keepalive\n\n'));
          } catch {
            closed = true;
            abort.abort();
          }
        }
      }, 10000);
      try {
        await produce(send, signal);
      } catch (error) {
        send({ type: 'error', message: errorMessage(error) });
      } finally {
        clearInterval(heartbeat);
        if (!closed) {
          closed = true;
          controller.close();
        }
      }
    },
    cancel() {
      closed = true;
      abort.abort();
    },
  });
  const headers = responseHeaders(cookie);
  headers.set('Content-Type', 'text/event-stream; charset=utf-8');
  headers.set('X-Accel-Buffering', 'no');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(stream, { headers });
}
