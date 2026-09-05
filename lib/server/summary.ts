import type { StreamEvent } from '../types';
import * as repository from './repository';
import { fetchWebpage } from './webpage';
import { generate, SUMMARY_SYSTEM } from './llm';
import { errorMessage } from './errors';
export async function summarize(
  row: repository.StoredSession,
  runId: string,
  send: (event: StreamEvent) => void,
  signal: AbortSignal,
) {
  try {
    row.status = row.source ? 'streaming' : 'fetching';
    row.error = null;
    await repository.save(row, runId);
    send({ type: 'session', session: repository.publicSession(row) });
    if (!row.source) {
      Object.assign(row, await fetchWebpage(row.url, signal));
      row.status = 'streaming';
      await repository.save(row, runId);
      send({ type: 'session', session: repository.publicSession(row) });
    }
    let summary = '',
      checkpoint = Date.now(),
      started = false;
    for await (const text of generate(
      SUMMARY_SYSTEM,
      [
        {
          role: 'user',
          parts: [
            {
              text: `Summarize this webpage.\nTitle: ${row.title}\nURL: ${row.url}\n\nSOURCE:\n${row.source}`,
            },
          ],
        },
      ],
      signal,
    )) {
      // Keep the previous partial result until the retry actually produces text.
      if (!started) {
        started = true;
        row.summary = '';
        send({ type: 'session', session: repository.publicSession(row) });
      }
      summary += text;
      row.summary = summary;
      send({ type: 'delta', text });
      if (Date.now() - checkpoint > 800) {
        await repository.save(row, runId);
        checkpoint = Date.now();
      }
    }
    row.status = 'complete';
    row.error = null;
    await repository.save(row, runId, true);
    send({ type: 'done', session: repository.publicSession(row) });
  } catch (error) {
    row.status = 'error';
    row.error = errorMessage(error);
    await repository.save(row, runId, true);
    send({
      type: 'error',
      message: row.error,
      session: repository.publicSession(row),
    });
  }
}
