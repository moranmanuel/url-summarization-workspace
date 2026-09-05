/** Parses SSE across arbitrary network and UTF-8 boundaries. Shared by provider and client. */
export async function* readSSE(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let data: string[] = [];
  const line = (value: string): string | undefined => {
    if (value === '') {
      if (!data.length) return;
      const event = data.join('\n');
      data = [];
      return event;
    }
    if (value.startsWith('data:')) data.push(value.slice(5).replace(/^ /, ''));
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += done
        ? decoder.decode()
        : decoder.decode(value, { stream: true });
      // CRLF can be split over chunks; retain a trailing CR until the next read.
      let match: RegExpExecArray | null;
      while ((match = /\r\n|\n|\r(?!$)/.exec(buffer))) {
        const result = line(buffer.slice(0, match.index));
        buffer = buffer.slice(match.index + match[0].length);
        if (result !== undefined) yield result;
      }
      if (done) {
        if (buffer) {
          const result = line(buffer.replace(/\r$/, ''));
          if (result !== undefined) yield result;
        }
        if (data.length) yield data.join('\n');
        break;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
