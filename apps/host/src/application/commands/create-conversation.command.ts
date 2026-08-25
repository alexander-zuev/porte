import { ConversationCatalog } from '@host/application/conversation-catalog.ts'
import type { ConversationCreationStore } from '@host/application/ports/conversation-creation-store.ts'
import type { SessionSupervisor } from '@host/application/session-supervisor.ts'
import {
  OperationConflictError,
  type Conversation,
  type HostControlMethodMap,
} from '@porte/core/client'

/** Create one conversation with durable repeat safety. */
export async function createConversation(
  sessions: Pick<SessionSupervisor, 'createConversation'>,
  creations: ConversationCreationStore,
  catalog: ConversationCatalog,
  command: HostControlMethodMap['conversation.create']['params'],
): Promise<Conversation> {
  const claim = await creations.claim(command.creationId, command.cwd)
  if (claim.status === 'completed') {
    if (claim.record.cwd === command.cwd) return claim.record.conversation
    throw new OperationConflictError()
  }
  if (claim.status === 'pending') throw new OperationConflictError()

  const created = await sessions.createConversation(command.cwd)
  await creations.complete({ ...command, conversation: created })
  catalog.add(created)
  return created
}
