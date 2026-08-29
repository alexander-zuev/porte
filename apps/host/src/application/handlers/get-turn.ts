import type { QueryHandler } from '@host/application/handlers/types.ts'
import type { QueryMap } from '@host/domain/messages/types.ts'
import { notYetImplemented, type ConversationTurn } from '@porte/core/client'

/** One turn's items and tools, so the relay can write the finished turn under stable ids. */
export const getTurn: QueryHandler<QueryMap['GetTurn'], ConversationTurn> = async (query) => {
  // TODO(step 2): `deps.conversations.get(query.conversationId).turnTranscript(query.turnId)`, with unpersistable content omitted.
  void query
  return notYetImplemented('step 2')
}
