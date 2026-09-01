import type { CommandHandler } from '@host/application/handlers/types.ts'
import type { CommandMap } from '@host/domain/messages/types.ts'

/** Switch the model, and with it the effort; the relay learns both from `conversation.configuration.updated`. */
export const setModel: CommandHandler<CommandMap['SetModel'], void> = async (command, deps) => {
  const conversation = deps.conversations.get(command.conversationId)
  const events = await deps.codingAgent.setModel(
    command.conversationId,
    command.modelId,
    command.reasoningEffort,
  )
  conversation.applyAgentEvents(events)
  deps.conversations.save(conversation)
}
