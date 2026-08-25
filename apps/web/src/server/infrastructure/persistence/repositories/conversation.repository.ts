import type {
  Conversation,
  ConversationId,
  IsoDateTime,
  ListConversationsParams,
  ListConversationsResult,
} from '@porte/core'
import { ConversationCursorSchema } from '@porte/core'
import type { RelayDb } from '@server/infrastructure/persistence/relay/connection.ts'
import {
  conversation,
  type DbConversation,
} from '@server/infrastructure/persistence/relay/schema/conversation.schema.ts'
import { and, desc, eq, getTableColumns, lt, or, sql } from 'drizzle-orm'

/** What one statement may bind on Durable Object SQLite. */
const MAX_BOUND_PARAMETERS = 100

/**
 * Rows one insert may carry, read from the table rather than written down.
 *
 * A sixth column would otherwise put a hardcoded twenty rows back over the cap,
 * and the failure lands on the socket that was carrying the sync.
 */
const ROWS_PER_INSERT = Math.floor(
  MAX_BOUND_PARAMETERS / Object.keys(getTableColumns(conversation)).length,
)

/**
 * Map a stored row into the shape the browser reads.
 *
 * No validation. Every row was written from a daemon frame the socket already
 * parsed, and re-checking here would turn one stale row into a failed page.
 */
function toConversation(row: DbConversation): Conversation {
  return {
    // SAFETY: the column is written from a parsed daemon frame, so it already
    // holds an id of ours. Nothing else can put a row here.
    id: row.id as ConversationId,
    cwd: row.cwd,
    gitRoot: row.gitRoot,
    title: row.title,
    // SAFETY: `toISOString` is an ISO datetime by construction, so the brand
    // describes what this already is rather than something to check.
    updatedAt: row.updatedAt.toISOString() as IsoDateTime,
  }
}

/** The relay's conversations, over its Durable Object's SQLite. */
export class DrizzleConversationRepository {
  constructor(private readonly db: RelayDb) {}

  /**
   * Asks for one row more than the caller wanted.
   *
   * That extra row is the only way to know a next page exists without counting
   * a collection that has none.
   */
  findList(query: ListConversationsParams): ListConversationsResult {
    const after = decodeCursor(query.cursor)
    const order = [desc(conversation.updatedAt), desc(conversation.id)]

    const rows = this.db
      .select()
      .from(conversation)
      .where(
        after === null
          ? undefined
          : or(
              lt(conversation.updatedAt, after.updatedAt),
              and(eq(conversation.updatedAt, after.updatedAt), lt(conversation.id, after.id)),
            ),
      )
      .orderBy(...order)
      .limit(query.limit + 1)
      .all()

    const page = rows.slice(0, query.limit)
    const hasMore = rows.length > query.limit
    const last = page.at(-1)

    const conversations = page.map(toConversation)
    return hasMore && last !== undefined
      ? { conversations, next: encodeCursor(last) }
      : { conversations }
  }

  find(conversationId: ConversationId): Conversation | undefined {
    const row = this.db.select().from(conversation).where(eq(conversation.id, conversationId)).get()
    return row === undefined ? undefined : toConversation(row)
  }

  save(toSave: Conversation): void {
    this.saveAll([toSave])
  }

  /** Split across statements: one insert holding every row would outrun the parameter cap. */
  saveAll(conversations: readonly Conversation[]): void {
    for (let start = 0; start < conversations.length; start += ROWS_PER_INSERT) {
      this.insertRows(conversations.slice(start, start + ROWS_PER_INSERT))
    }
  }

  private insertRows(conversations: readonly Conversation[]): void {
    if (conversations.length === 0) return

    const rows = conversations.map((one) => ({
      id: one.id,
      cwd: one.cwd,
      gitRoot: one.gitRoot,
      title: one.title,
      updatedAt: new Date(one.updatedAt),
    }))

    this.db
      .insert(conversation)
      .values(rows)
      .onConflictDoUpdate({
        target: conversation.id,
        set: {
          cwd: sql`excluded.cwd`,
          gitRoot: sql`excluded.git_root`,
          title: sql`excluded.title`,
          updatedAt: sql`excluded.updated_at`,
        },
      })
      .run()
  }

  delete(conversationId: ConversationId): void {
    this.db.delete(conversation).where(eq(conversation.id, conversationId)).run()
  }

  /** Replace the complete cache only after the Host list traversal succeeds. */
  replaceAll(conversations: readonly Conversation[]): void {
    this.db.transaction((transaction) => {
      const repository = new DrizzleConversationRepository(transaction)
      repository.deleteAll()
      repository.saveAll(conversations)
    })
  }

  deleteAll(): void {
    this.db.delete(conversation).run()
  }
}

/** Opaque on purpose: a caller that reads a cursor starts depending on the sort. */
function encodeCursor(row: DbConversation) {
  return ConversationCursorSchema.parse(btoa(`${String(row.updatedAt.getTime())}:${row.id}`))
}

/** A cursor we did not mint reads as the first page. Nobody typed it, so nobody can fix it. */
function decodeCursor(cursor: string | undefined): { updatedAt: Date; id: string } | null {
  if (cursor === undefined) return null

  const decoded = decodeBase64(cursor)
  if (decoded === null) return null

  const separator = decoded.indexOf(':')
  if (separator <= 0) return null

  const updatedAt = Number(decoded.slice(0, separator))
  return Number.isFinite(updatedAt)
    ? { updatedAt: new Date(updatedAt), id: decoded.slice(separator + 1) }
    : null
}

function decodeBase64(value: string): string | null {
  try {
    return atob(value)
  } catch {
    return null
  }
}
