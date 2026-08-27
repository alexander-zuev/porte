import type { CommandHandler } from '@host/application/handlers/types.ts'
import { Conversation } from '@host/domain/conversation/conversation.ts'
import type { CommandMap } from '@host/domain/messages/types.ts'
import { findGitRoot } from '@host/infrastructure/grok/git-root.ts'
import { IsoDateTimeSchema, WorkspaceNotAllowedError } from '@porte/core/client'

/**
 * Load an existing session onto this process and fold its history. Runs on
 * every conversation socket open; a conversation that is already open stays as is.
 */
export const openConversation: CommandHandler<CommandMap['OpenConversation'], void> = async (
  command,
  deps,
) => {
  if (deps.conversations.find(command.conversationId) !== null) return
  const gitRoot = findGitRoot(command.cwd)
  if (gitRoot === undefined) throw new WorkspaceNotAllowedError()

  const loaded = await deps.codingAgent.loadSession(command.conversationId, command.cwd)
  const conversation = Conversation.restore({
    id: command.conversationId,
    cwd: command.cwd,
    gitRoot,
    title: loaded.title,
    updatedAt: IsoDateTimeSchema.parse(deps.now().toISOString()),
  })
  conversation.replay(loaded.events)
  deps.conversations.insert(conversation)
}
