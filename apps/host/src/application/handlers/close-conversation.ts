import type { CommandHandler } from '@host/application/handlers/types.ts'
import type { CommandMap } from '@host/domain/messages/types.ts'
import { ConversationNotFoundError } from '@porte/core/client'

/**
 * Drop one conversation from this process. Unknown ids are a no-op. The Grok
 * session is untouched: it is shared with the terminal, and a running turn
 * there is not this Host's to stop. A `turn.start` still waiting for its echo
 * fails now rather than never.
 */
export const closeConversation: CommandHandler<CommandMap['CloseConversation'], void> = async (
  command,
  deps,
) => {
  const conversation = deps.conversations.find(command.conversationId)
  if (conversation === null) return
  const pending = conversation.pendingAttemptId
  if (pending !== undefined) deps.attempts.failed(pending, new ConversationNotFoundError())
  conversation.close()
  deps.conversations.delete(conversation)
  await deps.codingAgent.closeSession(conversation.id)
}
