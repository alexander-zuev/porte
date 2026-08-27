import { closeConversation } from '@host/application/handlers/close-conversation.ts'
import type { CommandHandler } from '@host/application/handlers/types.ts'
import { createCommand } from '@host/domain/messages/types.ts'
import type { CommandMap } from '@host/domain/messages/types.ts'

/** Shutdown: close every open conversation, then stop the agent process. */
export const closeAllConversations: CommandHandler<
  CommandMap['CloseAllConversations'],
  void
> = async (_command, deps) => {
  for (const conversation of deps.conversations.all()) {
    // oxlint-disable-next-line no-await-in-loop -- one agent, one session at a time.
    await closeConversation(
      createCommand('CloseConversation', { conversationId: conversation.id }),
      deps,
    )
  }
  await deps.codingAgent.stop()
}
