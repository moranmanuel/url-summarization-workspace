import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { env } from './cloudflare';
import { readSSE } from '../lib/sse';
import type { StreamEvent } from '../lib/types';
import { AppError } from '../lib/server/errors';
import * as sessions from '../app/api/sessions/route';
import * as detail from '../app/api/sessions/[id]/route';
import * as retry from '../app/api/sessions/[id]/retry/route';
import * as chat from '../app/api/sessions/[id]/chat/route';
const fixture = vi.hoisted(() => ({ fail: false, noTokens: false }));
vi.mock('../lib/server/webpage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/server/webpage')>()),
  fetchWebpage: vi.fn(async () => ({
    title: 'An article about cities',
    url: 'https://example.com/article',
    source: 'Reliable source material about walkable cities. '.repeat(20),
    wordCount: 140,
    sourceTruncated: false,
    excerpt: 'Reliable source material about walkable cities.',
  })),
}));
vi.mock('../lib/server/llm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/server/llm')>()),
  generate: async function* () {
    if (fixture.noTokens) throw new AppError('Provider unavailable', 502);
    yield 'First paragraph. ';
    if (fixture.fail) throw new AppError('Provider disconnected', 502);
    yield 'Second paragraph.';
  },
}));
let sqlite: DatabaseSync;
const ownerA = 'a'.repeat(64),
  ownerB = 'b'.repeat(64);
function request(path: string, method = 'GET', body?: object, owner = ownerA) {
  return new Request(`https://workspace.test/api/${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Cookie: `url_workspace=${owner}`,
      Origin: 'https://workspace.test',
    },
    ...(method !== 'GET' && body ? { body: JSON.stringify(body) } : {}),
  });
}
const context = (id: string) => ({ params: Promise.resolve({ id }) });
async function events(response: Response) {
  expect(response.status).toBe(200);
  const result: StreamEvent[] = [];
  for await (const event of readSSE(response.body!))
    result.push(JSON.parse(event));
  return result;
}
async function create() {
  const result = await events(
    await sessions.POST(
      request('sessions', 'POST', { url: 'https://example.com/article' }),
    ),
  );
  const first = result.find((e) => e.type === 'session');
  if (first?.type !== 'session') throw Error('missing session');
  return { id: first.session.id, events: result };
}
beforeEach(() => {
  fixture.fail = false;
  fixture.noTokens = false;
  env.GEMINI_API_KEY = 'test-only-not-a-real-key';
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON;');
  sqlite.exec(
    readFileSync(
      new URL('../drizzle/0000_futuristic_hedge_knight.sql', import.meta.url),
      'utf8',
    ),
  );
  function prepare(sql: string, params: unknown[] = []): unknown {
    return {
      bind: (...values: unknown[]) => prepare(sql, values),
      first: async () => sqlite.prepare(sql).get(...(params as never[])),
      all: async () => ({
        results: sqlite.prepare(sql).all(...(params as never[])),
      }),
      run: async () => {
        const r = sqlite.prepare(sql).run(...(params as never[]));
        return { meta: { changes: Number(r.changes) } };
      },
    };
  }
  env.DB = {
    prepare: (sql: string) => prepare(sql),
    batch: async (statements: { run: () => Promise<unknown> }[]) => {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    },
  } as unknown as D1Database;
});
afterEach(() => sqlite.close());
describe('session API with a real SQLite database and test-only provider fixture', () => {
  it('streams deltas, persists, searches case-insensitively, isolates owners, and deletes with chat cascade', async () => {
    const { id, events: stream } = await create();
    expect(stream.filter((e) => e.type === 'delta')).toHaveLength(2);
    expect(stream.at(-1)?.type).toBe('done');
    const saved = (await (
      await detail.GET(request(`sessions/${id}`), context(id))
    ).json()) as { summary: string; status: string };
    expect(saved.summary).toBe('First paragraph. Second paragraph.');
    expect(saved.status).toBe('complete');
    const found = (await (
      await sessions.GET(request('sessions?q=WALKABLE'))
    ).json()) as { sessions: unknown[] };
    expect(found.sessions).toHaveLength(1);
    expect(
      (
        await detail.GET(
          request(`sessions/${id}`, 'GET', undefined, ownerB),
          context(id),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await detail.DELETE(
          request(`sessions/${id}`, 'DELETE', undefined, ownerB),
          context(id),
        )
      ).status,
    ).toBe(404);
    const reply = await events(
      await chat.POST(
        request(`sessions/${id}/chat`, 'POST', {
          content: 'What matters most?',
        }),
        context(id),
      ),
    );
    expect(reply.at(-1)?.type).toBe('done');
    expect(sqlite.prepare('SELECT count(*) AS n FROM messages').get()?.n).toBe(
      2,
    );
    expect(
      (await detail.DELETE(request(`sessions/${id}`, 'DELETE'), context(id)))
        .status,
    ).toBe(204);
    expect(sqlite.prepare('SELECT count(*) AS n FROM messages').get()?.n).toBe(
      0,
    );
  });
  it('preserves interrupted text and keeps it when retry fails before its first token', async () => {
    fixture.fail = true;
    const { id } = await create();
    let row = sqlite
      .prepare('SELECT summary,status FROM sessions WHERE id=?')
      .get(id);
    expect(row?.summary).toBe('First paragraph. ');
    expect(row?.status).toBe('error');
    fixture.noTokens = true;
    await events(
      await retry.POST(request(`sessions/${id}/retry`, 'POST'), context(id)),
    );
    row = sqlite
      .prepare('SELECT summary,status FROM sessions WHERE id=?')
      .get(id);
    expect(row?.summary).toBe('First paragraph. ');
    expect(row?.status).toBe('error');
    fixture.fail = false;
    fixture.noTokens = false;
    await events(
      await retry.POST(request(`sessions/${id}/retry`, 'POST'), context(id)),
    );
    expect(
      sqlite.prepare('SELECT status FROM sessions WHERE id=?').get(id)?.status,
    ).toBe('complete');
  });
  it('recovers expired generation leases after reload', async () => {
    const { id } = await create();
    sqlite
      .prepare(
        "UPDATE sessions SET status='streaming',run_id='old',lease_until=1 WHERE id=?",
      )
      .run(id);
    const result = (await (
      await detail.GET(request(`sessions/${id}`), context(id))
    ).json()) as { status: string; summary: string };
    expect(result.status).toBe('error');
    expect(result.summary).toContain('First paragraph');
  });
  it('rejects a missing key before creating a misleading empty session', async () => {
    env.GEMINI_API_KEY = '';
    expect(
      (
        await sessions.POST(
          request('sessions', 'POST', { url: 'https://example.com' }),
        )
      ).status,
    ).toBe(503);
    expect(sqlite.prepare('SELECT count(*) AS n FROM sessions').get()?.n).toBe(
      0,
    );
  });
  it('rejects cross-origin writes', async () => {
    const r = new Request('https://workspace.test/api/sessions', {
      method: 'POST',
      headers: {
        Origin: 'https://other.test',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: 'https://example.com' }),
    });
    expect((await sessions.POST(r)).status).toBe(403);
  });
});
