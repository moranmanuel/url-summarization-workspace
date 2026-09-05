import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    url: text('url').notNull(),
    title: text('title').notNull(),
    summary: text('summary').notNull().default(''),
    excerpt: text('excerpt').notNull().default(''),
    source: text('source').notNull().default(''),
    status: text('status').notNull(),
    error: text('error'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    wordCount: integer('word_count').notNull().default(0),
    sourceTruncated: integer('source_truncated').notNull().default(0),
    runId: text('run_id'),
    leaseUntil: integer('lease_until').notNull().default(0),
  },
  (table) => [
    index('idx_sessions_owner_created').on(table.ownerId, table.createdAt),
  ],
);
export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    content: text('content').notNull().default(''),
    status: text('status').notNull(),
    error: text('error'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('idx_messages_session_created').on(table.sessionId, table.createdAt),
  ],
);
