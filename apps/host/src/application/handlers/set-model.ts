import type { CommandHandler } from '@host/application/handlers/types.ts'
import type { CommandMap } from '@host/domain/messages/types.ts'

/** Switch the agent model; the relay learns the new value from `conversation.configuration.updated`. */
export const setModel: CommandHandler<CommandMap['SetModel'], void> = async (command, deps) => {
  const conversation = deps.conversations.get(command.conversationId)
  const events = await deps.codingAgent.setModel(command.conversationId, command.modelId)
  conversation.applyAgentEvents(events)
  deps.conversations.save(conversation)
}
