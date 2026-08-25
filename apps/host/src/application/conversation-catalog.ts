import {
  ConversationCursorSchema,
  ValidationError,
  type Conversation,
  type ConversationCursor,
  type ConversationEvent,
  type ConversationId,
  type ListConversationsResult,
} from '@porte/core/client'

type Snapshot = {
  readonly id: string
  readonly conversations: readonly Conversation[]
}

/** Owns the active conversation snapshot and its metadata projection. */
export class ConversationCatalog {
  private snapshot: Snapshot | undefined
  private conversations = new Map<ConversationId, Conversation>()

  /** Replace the snapshot and return its first page. */
  start(
    snapshotId: string,
    conversations: readonly Conversation[],
    limit: number,
  ): ListConversationsResult {
    this.snapshot = { id: snapshotId, conversations }
    this.conversations = new Map(
      conversations.map((conversation) => [conversation.id, conversation]),
    )
    return page(this.snapshot, 0, limit)
  }

  /** Return a page from the active snapshot. */
  continue(cursor: ConversationCursor, limit: number): ListConversationsResult {
    const position = parseCursor(cursor)
    if (position === undefined || this.snapshot?.id !== position.snapshotId) {
      throw new ValidationError([
        { path: ['cursor'], message: 'Start the conversation list again.' },
      ])
    }
    return page(this.snapshot, position.start, limit)
  }

  /** Add one conversation to the metadata projection. */
  add(conversation: Conversation): void {
    this.conversations.set(conversation.id, conversation)
  }

  /** Apply a metadata event and return the changed conversation. */
  updateMetadata(
    conversationId: ConversationId,
    event: ConversationEvent,
  ): Conversation | undefined {
    if (event.type !== 'conversation.metadata.updated') return undefined
    const current = this.conversations.get(conversationId)
    if (current === undefined) return undefined

    const conversation = {
      ...current,
      title: event.update.title ?? current.title,
      updatedAt: event.update.updatedAt ?? current.updatedAt,
    }
    this.conversations.set(conversationId, conversation)
    return conversation
  }
}

function page(snapshot: Snapshot, start: number, limit: number): ListConversationsResult {
  const conversations = snapshot.conversations.slice(start, start + limit)
  const nextStart = start + conversations.length
  if (nextStart >= snapshot.conversations.length) return { conversations }

  const next = ConversationCursorSchema.parse(`${snapshot.id}:${String(nextStart)}`)
  return { conversations, next }
}

function parseCursor(
  cursor: ConversationCursor,
): { readonly snapshotId: string; readonly start: number } | undefined {
  const separator = cursor.lastIndexOf(':')
  const snapshotId = cursor.slice(0, separator)
  const start = Number(cursor.slice(separator + 1))
  if (separator <= 0 || !Number.isSafeInteger(start) || start < 0) return undefined
  return { snapshotId, start }
}
