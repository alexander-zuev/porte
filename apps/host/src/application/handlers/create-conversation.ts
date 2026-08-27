import type { CommandHandler } from '@host/application/handlers/types.ts'
import { Conversation } from '@host/domain/conversation/conversation.ts'
import type { CommandMap } from '@host/domain/messages/types.ts'
import { findGitRoot } from '@host/infrastructure/grok/git-root.ts'
import {
  WorkspaceNotAllowedError,
  makeConversationSummary,
  type ConversationSummary,
} from '@porte/core/client'

/** Create one coding-agent session in a git workspace and open it on this process. */
export const createConversation: CommandHandler<
  CommandMap['CreateConversation'],
  ConversationSummary
> = async (command, deps) => {
  const gitRoot = findGitRoot(command.cwd)
  if (gitRoot === undefined) throw new WorkspaceNotAllowedError()

  const session = await deps.codingAgent.createSession(command)
  const conversation = Conversation.create({
    id: session.id,
    cwd: command.cwd,
    gitRoot,
    now: deps.now(),
  })
  conversation.applyAgentEvents(session.events)
  deps.conversations.insert(conversation)
  return makeConversationSummary(conversation)
}
