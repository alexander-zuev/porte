import {
  IsoDateTimeSchema,
  type ConversationId,
  type ConversationPage,
  type ConversationPageQuery,
  type ConversationSummary,
} from '@porte/core'

/** Where the run that last swept this table is remembered, between syncs. */
const EPOCH_KEY = 'sync_epoch'

/**
 * Most rows one relay keeps.
 *
 * A safety valve against a Mac with a pathological history, not a product
 * limit: a person is expected to page through all of theirs.
 */
const MAX_ROWS = 10_000

type Row = {
  id: string
  cwd: string
  title: string
  updated_at: number
}

/**
 * Every conversation summary one Mac has, in its relay's own SQLite.
 *
 * A replica of the list and nothing else: no message, no turn, and no file is
 * stored here. It is the only thing the browser reads, so a person can page
 * through their history while the Mac is asleep.
 *
 * Row shapes are not validated on the way out. The daemon frame that produced
 * them was parsed at the socket, which is the boundary; validating again here
 * would turn a stale row into a thrown error on page load. Only the identifiers
 * are branded, at the edge where columns become domain values.
 */
export class DurableObjectConversations {
  constructor(private readonly storage: DurableObjectStorage) {}

  /** Called once under `blockConcurrencyWhile`, which is what that is for. */
  ensureSchema(): void {
    this.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id         TEXT    PRIMARY KEY,
        cwd        TEXT    NOT NULL,
        title      TEXT    NOT NULL,
        updated_at INTEGER NOT NULL,
        sync_epoch TEXT    NOT NULL
      )
    `)
    this.storage.sql.exec(`
      CREATE INDEX IF NOT EXISTS conversations_recent
        ON conversations (updated_at DESC, id DESC)
    `)
  }

  /**
   * One page, newest first.
   *
   * Asks for one row more than the caller wanted. That extra row is the only
   * way to know a next page exists without counting a collection that has none.
   */
  page(query: ConversationPageQuery): ConversationPage {
    const after = decodeCursor(query.cursor)
    const probe = query.limit + 1

    // Written out rather than as a row-value comparison, which older SQLite
    // builds do not accept.
    const rows =
      after === null
        ? this.storage.sql
            .exec<Row>(
              `SELECT id, cwd, title, updated_at FROM conversations
               ORDER BY updated_at DESC, id DESC LIMIT ?`,
              probe,
            )
            .toArray()
        : this.storage.sql
            .exec<Row>(
              `SELECT id, cwd, title, updated_at FROM conversations
               WHERE updated_at < ? OR (updated_at = ? AND id < ?)
               ORDER BY updated_at DESC, id DESC LIMIT ?`,
              after.updatedAt,
              after.updatedAt,
              after.id,
              probe,
            )
            .toArray()

    const page = rows.slice(0, query.limit)
    const hasMore = rows.length > query.limit
    const last = page.at(-1)

    return {
      conversations: page.map(toSummary),
      next: hasMore && last !== undefined ? encodeCursor(last) : null,
    }
  }

  /** One chunk of a full sync. Stamped, so the sweep can tell it from a stale row. */
  writeChunk(epoch: string, conversations: readonly ConversationSummary[]): void {
    for (const conversation of conversations) this.upsertRow(conversation, epoch)
  }

  /**
   * Finish a sync: drop whatever the Mac did not send this time.
   *
   * This is what makes a deletion on the Mac reach the browser. Upserts alone
   * only ever add, so a conversation removed there would live here forever.
   */
  async finishSync(epoch: string): Promise<void> {
    this.storage.sql.exec(`DELETE FROM conversations WHERE sync_epoch != ?`, epoch)
    this.storage.sql.exec(
      `DELETE FROM conversations WHERE id NOT IN (
         SELECT id FROM conversations ORDER BY updated_at DESC, id DESC LIMIT ?
       )`,
      MAX_ROWS,
    )
    await this.storage.put(EPOCH_KEY, epoch)
  }

  /** One conversation changed between syncs. Carries the live epoch so no sweep takes it. */
  async upsert(conversation: ConversationSummary): Promise<void> {
    const epoch = (await this.storage.get<string>(EPOCH_KEY)) ?? 'unsynced'
    this.upsertRow(conversation, epoch)
  }

  remove(conversationId: ConversationId): void {
    this.storage.sql.exec(`DELETE FROM conversations WHERE id = ?`, conversationId)
  }

  /** Drops the rows only. Expiring them, and emptying the relay, belong to the relay. */
  async forget(): Promise<void> {
    this.storage.sql.exec(`DELETE FROM conversations`)
    await this.storage.delete(EPOCH_KEY)
  }

  private upsertRow(conversation: ConversationSummary, epoch: string): void {
    this.storage.sql.exec(
      `INSERT INTO conversations (id, cwd, title, updated_at, sync_epoch)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         cwd = excluded.cwd,
         title = excluded.title,
         updated_at = excluded.updated_at,
         sync_epoch = excluded.sync_epoch`,
      conversation.id,
      conversation.cwd,
      conversation.title,
      Date.parse(conversation.updatedAt),
      epoch,
    )
  }
}

function toSummary(row: Row): ConversationSummary {
  return {
    // SAFETY: every row was written from a daemon frame that the socket parsed,
    // so this column already holds an id of ours. Re-parsing here is what the
    // class comment rules out: it would turn one stale row into a failed page.
    id: row.id as ConversationId,
    cwd: row.cwd,
    title: row.title,
    updatedAt: IsoDateTimeSchema.parse(new Date(row.updated_at).toISOString()),
  }
}

/** Opaque on purpose: a caller that reads a cursor starts depending on the sort. */
function encodeCursor(row: Row): string {
  return btoa(`${row.updated_at}:${row.id}`)
}

/** A cursor we did not mint reads as the first page. Nobody typed it, so nobody can fix it. */
function decodeCursor(cursor: string | null | undefined): { updatedAt: number; id: string } | null {
  if (cursor === null || cursor === undefined) return null

  const decoded = decodeBase64(cursor)
  if (decoded === null) return null

  const separator = decoded.indexOf(':')
  if (separator <= 0) return null

  const updatedAt = Number(decoded.slice(0, separator))
  return Number.isFinite(updatedAt) ? { updatedAt, id: decoded.slice(separator + 1) } : null
}

function decodeBase64(value: string): string | null {
  try {
    return atob(value)
  } catch {
    return null
  }
}
