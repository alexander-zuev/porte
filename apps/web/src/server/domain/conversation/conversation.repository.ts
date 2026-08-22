import type {
  ConversationId,
  ConversationPage,
  ConversationPageQuery,
  ConversationSummary,
} from '@porte/core'

/**
 * The relay's copy of one Mac's conversations.
 *
 * Synchronous on purpose: this is a Durable Object's own SQLite, which answers
 * in the same tick. Nothing here waits, so reading a page never makes a caller
 * async for a store that was never remote.
 *
 * Every write carries the sync run that made it. The Mac reports its list
 * across many frames, so rows are stamped as they arrive and the run that
 * finishes sweeps away whatever it did not send.
 */
export interface ConversationRepository {
  /** One page, newest first. */
  findPage(query: ConversationPageQuery): ConversationPage

  /**
   * The run every current row carries, so a write between syncs survives the next sweep.
   *
   * Read from the rows rather than stored beside them: after a sweep they all
   * agree, so a second copy could only ever disagree.
   */
  currentSyncRunId(): string | null

  save(conversation: ConversationSummary, syncRunId: string): void
  saveAll(conversations: readonly ConversationSummary[], syncRunId: string): void

  delete(conversationId: ConversationId): void

  /** The sweep. Drops every row an earlier run wrote, which is how a deletion propagates. */
  deleteOtherThan(syncRunId: string): void

  /** Keeps the newest rows only. A safety valve against a pathological history, not a product limit. */
  deleteBeyond(maxRows: number): void

  deleteAll(): void
}
