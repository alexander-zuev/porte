import type {
  ConversationId,
  ConversationPage,
  ConversationPageQuery,
  ConversationSummary,
  IsoDateTime,
} from '@porte/core'
import type { ConversationRepository } from '@server/domain/conversation/conversation.repository.ts'
import type { RelayDb } from '@server/infrastructure/persistence/relay/connection.ts'
import {
  conversation,
  type DbConversation,
} from '@server/infrastructure/persistence/relay/schema/conversation.schema.ts'
import { and, desc, eq, lt, ne, notInArray, or, sql } from 'drizzle-orm'

/**
 * Map a stored row into the shape the browser reads.
 *
 * No validation. Every row was written from a daemon frame the socket already
 * parsed, and re-checking here would turn one stale row into a failed page.
 */
function toConversation(row: DbConversation): ConversationSummary {
  return {
    // SAFETY: the column is written from a parsed daemon frame, so it already
    // holds an id of ours. Nothing else can put a row here.
    id: row.id as ConversationId,
    cwd: row.cwd,
    title: row.title,
    // SAFETY: `toISOString` is an ISO datetime by construction, so the brand
    // describes what this already is rather than something to check.
    updatedAt: row.updatedAt.toISOString() as IsoDateTime,
  }
}

/** The relay's conversations, over its Durable Object's SQLite. */
export class DrizzleConversationRepository implements ConversationRepository {
  constructor(private readonly db: RelayDb) {}

  /**
   * Asks for one row more than the caller wanted.
   *
   * That extra row is the only way to know a next page exists without counting
   * a collection that has none.
   */
  findPage(query: ConversationPageQuery): ConversationPage {
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

    return {
      conversations: page.map(toConversation),
      next: hasMore && last !== undefined ? encodeCursor(last) : null,
    }
  }

  currentSyncRunId(): string | null {
    const row = this.db
      .select({ syncRunId: conversation.syncRunId })
      .from(conversation)
      .limit(1)
      .get()
    return row?.syncRunId ?? null
  }

  save(toSave: ConversationSummary, syncRunId: string): void {
    this.saveAll([toSave], syncRunId)
  }

  saveAll(conversations: readonly ConversationSummary[], syncRunId: string): void {
    if (conversations.length === 0) return

    const rows = conversations.map((one) => ({
      id: one.id,
      cwd: one.cwd,
      title: one.title,
      updatedAt: new Date(one.updatedAt),
      syncRunId,
    }))

    this.db
      .insert(conversation)
      .values(rows)
      .onConflictDoUpdate({
        target: conversation.id,
        set: {
          cwd: sql`excluded.cwd`,
          title: sql`excluded.title`,
          updatedAt: sql`excluded.updated_at`,
          syncRunId: sql`excluded.sync_run_id`,
        },
      })
      .run()
  }

  delete(conversationId: ConversationId): void {
    this.db.delete(conversation).where(eq(conversation.id, conversationId)).run()
  }

  deleteOtherThan(syncRunId: string): void {
    this.db.delete(conversation).where(ne(conversation.syncRunId, syncRunId)).run()
  }

  deleteBeyond(maxRows: number): void {
    const keep = this.db
      .select({ id: conversation.id })
      .from(conversation)
      .orderBy(desc(conversation.updatedAt), desc(conversation.id))
      .limit(maxRows)
      .all()

    if (keep.length < maxRows) return

    this.db
      .delete(conversation)
      .where(
        notInArray(
          conversation.id,
          keep.map((row) => row.id),
        ),
      )
      .run()
  }

  deleteAll(): void {
    this.db.delete(conversation).run()
  }
}

/** Opaque on purpose: a caller that reads a cursor starts depending on the sort. */
function encodeCursor(row: DbConversation): string {
  return btoa(`${String(row.updatedAt.getTime())}:${row.id}`)
}

/** A cursor we did not mint reads as the first page. Nobody typed it, so nobody can fix it. */
function decodeCursor(cursor: string | null | undefined): { updatedAt: Date; id: string } | null {
  if (cursor === null || cursor === undefined) return null

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
