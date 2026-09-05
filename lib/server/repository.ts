import { env } from 'cloudflare:workers';
import type { Session, Message } from '../types';
import { AppError } from './errors';
export type StoredSession = Session & {
  ownerId: string;
  source: string;
  runId: string | null;
  leaseUntil: number;
};
const SESSION_COLUMNS = `id, owner_id AS ownerId, url, title, summary, excerpt, source, status, error, created_at AS createdAt, updated_at AS updatedAt, word_count AS wordCount, source_truncated AS sourceTruncated, run_id AS runId, lease_until AS leaseUntil`;
const MESSAGE_COLUMNS = `id, session_id AS sessionId, role, content, status, error, created_at AS createdAt`;
const db = () => env.DB;
export function publicSession(row: StoredSession): Session {
  const {
    id,
    url,
    title,
    summary,
    excerpt,
    status,
    error,
    createdAt,
    updatedAt,
    wordCount,
    sourceTruncated,
  } = row;
  return {
    id,
    url,
    title,
    summary,
    excerpt,
    status,
    error,
    createdAt,
    updatedAt,
    wordCount,
    sourceTruncated: !!sourceTruncated,
  };
}
export async function recover(ownerId: string) {
  const now = Date.now();
  const interrupted =
    'The connection ended before completion. Your partial text is saved. Please retry.';
  await db().batch([
    db()
      .prepare(
        `UPDATE messages SET status='error',error=? WHERE status='streaming' AND session_id IN (SELECT id FROM sessions WHERE owner_id=? AND lease_until<?)`,
      )
      .bind(interrupted, ownerId, now),
    db()
      .prepare(
        `UPDATE sessions SET status=CASE WHEN status IN ('fetching','streaming') THEN 'error' ELSE status END, error=CASE WHEN status IN ('fetching','streaming') THEN ? ELSE error END,run_id=NULL,lease_until=0 WHERE owner_id=? AND run_id IS NOT NULL AND lease_until<?`,
      )
      .bind(interrupted, ownerId, now),
  ]);
}
export async function list(ownerId: string, query = ''): Promise<Session[]> {
  await recover(ownerId);
  const q = query.trim().slice(0, 200);
  const rows = await db()
    .prepare(
      `SELECT ${SESSION_COLUMNS} FROM sessions WHERE owner_id=? AND (?='' OR instr(lower(url),lower(?))>0 OR instr(lower(title),lower(?))>0 OR instr(lower(summary),lower(?))>0 OR instr(lower(source),lower(?))>0) ORDER BY created_at DESC LIMIT 100`,
    )
    .bind(ownerId, q, q, q, q, q)
    .all<StoredSession>();
  return rows.results.map(publicSession);
}
export async function get(ownerId: string, id: string): Promise<StoredSession> {
  const row = await db()
    .prepare(
      `SELECT ${SESSION_COLUMNS} FROM sessions WHERE id=? AND owner_id=?`,
    )
    .bind(id, ownerId)
    .first<StoredSession>();
  if (!row) throw new AppError('This session could not be found.', 404);
  return row;
}
export async function getMessages(sessionId: string): Promise<Message[]> {
  return (
    await db()
      .prepare(
        `SELECT ${MESSAGE_COLUMNS} FROM messages WHERE session_id=? ORDER BY created_at ASC,id ASC`,
      )
      .bind(sessionId)
      .all<Message>()
  ).results;
}
export async function create(
  ownerId: string,
  url: string,
): Promise<StoredSession> {
  const id = crypto.randomUUID(),
    now = Date.now(),
    runId = crypto.randomUUID();
  // Atomic limit check prevents parallel requests from exceeding the workspace cap.
  const result = await db()
    .prepare(
      `INSERT INTO sessions(id,owner_id,url,title,status,created_at,updated_at,run_id,lease_until) SELECT ?,?,?,?,'fetching',?,?,?,? WHERE (SELECT count(*) FROM sessions WHERE owner_id=?)<100`,
    )
    .bind(
      id,
      ownerId,
      url,
      new URL(url).hostname,
      now,
      now,
      runId,
      now + 180000,
      ownerId,
    )
    .run();
  if (!result.meta.changes)
    throw new AppError(
      'Your workspace has 100 sessions. Delete one before adding another.',
      409,
    );
  return get(ownerId, id);
}
export async function acquire(row: StoredSession): Promise<string> {
  const runId = crypto.randomUUID(),
    now = Date.now();
  const result = await db()
    .prepare(
      `UPDATE sessions SET run_id=?,lease_until=? WHERE id=? AND owner_id=? AND (run_id IS NULL OR lease_until<?)`,
    )
    .bind(runId, now + 180000, row.id, row.ownerId, now)
    .run();
  if (!result.meta.changes)
    throw new AppError(
      'This session is still generating a response. Wait for it to finish.',
      409,
    );
  return runId;
}
export async function save(row: StoredSession, runId: string, release = false) {
  const result = await db()
    .prepare(
      `UPDATE sessions SET url=?,title=?,summary=?,excerpt=?,source=?,status=?,error=?,updated_at=?,word_count=?,source_truncated=?,run_id=?,lease_until=? WHERE id=? AND owner_id=? AND run_id=?`,
    )
    .bind(
      row.url,
      row.title,
      row.summary,
      row.excerpt,
      row.source,
      row.status,
      row.error,
      Date.now(),
      row.wordCount,
      Number(row.sourceTruncated),
      release ? null : runId,
      release ? 0 : Date.now() + 180000,
      row.id,
      row.ownerId,
      runId,
    )
    .run();
  if (!result.meta.changes)
    throw new AppError(
      'This session changed while the response was generating. Reload it to continue.',
      409,
    );
}
export async function release(row: StoredSession, runId: string) {
  await db()
    .prepare(
      'UPDATE sessions SET run_id=NULL,lease_until=0 WHERE id=? AND owner_id=? AND run_id=?',
    )
    .bind(row.id, row.ownerId, runId)
    .run();
}
export async function remove(ownerId: string, id: string) {
  await recover(ownerId);
  await get(ownerId, id);
  const result = await db()
    .prepare(
      'DELETE FROM sessions WHERE id=? AND owner_id=? AND run_id IS NULL',
    )
    .bind(id, ownerId)
    .run();
  if (!result.meta.changes)
    throw new AppError(
      'Wait for this session’s response to finish before deleting it.',
      409,
    );
}
export async function insertMessages(user: Message, assistant: Message) {
  const count = await db()
    .prepare('SELECT count(*) AS count FROM messages WHERE session_id=?')
    .bind(user.sessionId)
    .first<{ count: number }>();
  if ((count?.count ?? 0) >= 100)
    throw new AppError(
      'This session has reached 50 questions. Start a new summary to continue.',
      409,
    );
  await db().batch(
    [user, assistant].map((m) =>
      db()
        .prepare(
          'INSERT INTO messages(id,session_id,role,content,status,error,created_at) VALUES(?,?,?,?,?,?,?)',
        )
        .bind(
          m.id,
          m.sessionId,
          m.role,
          m.content,
          m.status,
          m.error,
          m.createdAt,
        ),
    ),
  );
}
export async function saveMessage(message: Message) {
  await db()
    .prepare(
      'UPDATE messages SET content=?,status=?,error=? WHERE id=? AND session_id=?',
    )
    .bind(
      message.content,
      message.status,
      message.error,
      message.id,
      message.sessionId,
    )
    .run();
}
