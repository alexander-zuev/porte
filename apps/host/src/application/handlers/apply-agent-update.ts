import type { CommandHandler } from '@host/application/handlers/types.ts'
import type { CommandMap } from '@host/domain/messages/types.ts'

/**
 * Record what Grok streamed. The aggregate opens and closes turns from the
 * stream and drops late events for a turn it already ended; a conversation
 * closed meanwhile has nothing to record. Activity and idle eviction follow
 * from the raised turn events (`trackTurnActivity`).
 */
export const applyAgentUpdate: CommandHandler<CommandMap['ApplyAgentUpdate'], void> = async (
  command,
  deps,
) => {
  const conversation = deps.conversations.find(command.conversationId)
  if (conversation === null) return
  conversation.applyAgentEvents(command.events)
  deps.conversations.save(conversation)
}
