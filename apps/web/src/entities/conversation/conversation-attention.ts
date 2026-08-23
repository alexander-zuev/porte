import type { ConversationId, RelayActiveConversation } from '@porte/core/client'

import type { ConversationAttentionStatus, ConversationTurnStatus } from './conversation-list.ts'

/** Indexes the active projection for constant-time row lookup. */
export function indexActiveConversations(
  conversations: readonly RelayActiveConversation[],
): ReadonlyMap<ConversationId, RelayActiveConversation> {
  return new Map(conversations.map((conversation) => [conversation.conversationId, conversation]))
}

/** Finds completed conversations that produced an assistant message. */
export function completedAssistantConversations(
  previous: ReadonlyMap<ConversationId, RelayActiveConversation>,
  next: ReadonlyMap<ConversationId, RelayActiveConversation>,
): readonly ConversationId[] {
  return [...previous.values()].flatMap((conversation) =>
    conversation.hasAssistantMessage && !next.has(conversation.conversationId)
      ? [conversation.conversationId]
      : [],
  )
}

/** Adds completed conversations that this browser opened and does not show now. */
export function addUnseenConversations(
  current: ReadonlySet<ConversationId>,
  completed: readonly ConversationId[],
  openedConversationIds: ReadonlySet<ConversationId>,
  visibleConversationId: ConversationId | null,
): ReadonlySet<ConversationId> {
  const additions = completed.filter(
    (conversationId) =>
      openedConversationIds.has(conversationId) && conversationId !== visibleConversationId,
  )
  if (additions.length === 0) return current
  return new Set([...current, ...additions])
}

/** Removes one conversation after this browser opens it. */
export function markConversationSeen(
  current: ReadonlySet<ConversationId>,
  conversationId: ConversationId,
): ReadonlySet<ConversationId> {
  if (!current.has(conversationId)) return current
  const next = new Set(current)
  next.delete(conversationId)
  return next
}

/** Derives whether one conversation owns an active turn. */
export function conversationTurnStatus(
  conversationId: ConversationId,
  activeConversationIds: ReadonlySet<ConversationId>,
): ConversationTurnStatus {
  return activeConversationIds.has(conversationId) ? 'running' : 'idle'
}

/** Derives whether one completed assistant message needs attention. */
export function conversationAttentionStatus(
  conversationId: ConversationId,
  unseenConversationIds: ReadonlySet<ConversationId>,
): ConversationAttentionStatus {
  return unseenConversationIds.has(conversationId) ? 'unseen' : 'none'
}
