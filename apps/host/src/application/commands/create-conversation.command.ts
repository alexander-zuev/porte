import type { CodingAgent } from '@host/application/ports/coding-agent.ts'
import { Conversation } from '@host/domain/conversation/conversation.ts'
import { findGitRoot } from '@host/infrastructure/grok/git-root.ts'
import {
  WorkspaceNotAllowedError,
  makeConversationSummary,
  type ConversationSummary,
  type HostControlMethodMap,
} from '@porte/core/client'

/** Create one coding-agent conversation in a git workspace. */
export async function createConversation(
  codingAgent: Pick<CodingAgent, 'createSession' | 'hold'>,
  command: HostControlMethodMap['conversation.create']['params'],
): Promise<ConversationSummary> {
  const gitRoot = findGitRoot(command.cwd)
  if (gitRoot === undefined) throw new WorkspaceNotAllowedError()

  const session = await codingAgent.createSession(command)
  const conversation = Conversation.create({
    id: session.id,
    cwd: command.cwd,
    gitRoot,
    now: new Date(),
  })
  codingAgent.hold(conversation)
  return makeConversationSummary({
    id: conversation.id,
    cwd: conversation.cwd,
    gitRoot: conversation.gitRoot,
    title: conversation.title,
    updatedAt: conversation.updatedAt,
  })
}
