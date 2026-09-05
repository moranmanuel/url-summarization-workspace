import { describe, it, expect } from 'vitest';
import { readSSE } from '../lib/sse';
async function collect(text: string, chunkSize: number) {
  const bytes = new TextEncoder().encode(text);
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      for (let i = 0; i < bytes.length; i += chunkSize)
        c.enqueue(bytes.slice(i, i + chunkSize));
      c.close();
    },
  });
  const events = [];
  for await (const event of readSSE(stream)) events.push(event);
  return events;
}
describe('SSE transport', () => {
  it('preserves multi-byte text and CRLF even when every byte arrives separately', async () => {
    expect(
      await collect(
        ': ping\r\ndata: {"text":"café 🚀"}\r\n\r\ndata: next\r\n\r\n',
        1,
      ),
    ).toEqual(['{"text":"café 🚀"}', 'next']);
  });
  it('joins multiline data, ignores comments, and flushes final events', async () => {
    expect(
      await collect(
        'event: token\ndata: first\ndata: second\n\n:keepalive\n\ndata: last',
        7,
      ),
    ).toEqual(['first\nsecond', 'last']);
  });
});
