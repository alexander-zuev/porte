import type { CodingAgent, CodingAgentError } from '@host/application/ports/coding-agent.ts'
import type {
  ConversationCreationStore,
  ConversationCreationStoreError,
} from '@host/application/ports/conversation-creation-store.ts'
import { ConversationCatalog } from '@host/domain/conversation/conversation-catalog.ts'
import type { Conversation, FailureClassification, HostControlMethodMap } from '@porte/core/client'
import { Result, TaggedError, type Result as ResultType } from 'better-result'

/** A creation identifier cannot describe this new creation operation. */
export class ConversationCreationConflictError extends TaggedError(
  'ConversationCreationConflictError',
)<{
  message: string
  classification: FailureClassification
}> {
  constructor(args: { message: string }) {
    super({ ...args, classification: 'terminal' })
  }
}

/** Create one conversation with durable repeat safety. */
export async function createConversation(
  agent: Pick<CodingAgent, 'createConversation'>,
  creations: ConversationCreationStore,
  catalog: ConversationCatalog,
  command: HostControlMethodMap['conversation.create']['params'],
): Promise<
  ResultType<
    Conversation,
    CodingAgentError | ConversationCreationStoreError | ConversationCreationConflictError
  >
> {
  const claim = await creations.claim(command.creationId, command.cwd)
  if (claim.isErr()) return claim
  if (claim.value.status === 'completed') {
    return claim.value.record.cwd === command.cwd
      ? Result.ok(claim.value.record.conversation)
      : conflict('Creation identifier is already in use.')
  }
  if (claim.value.status === 'pending') {
    return conflict(
      claim.value.cwd === command.cwd
        ? 'Conversation creation is already in progress.'
        : 'Creation identifier is already in use.',
    )
  }

  const created = await agent.createConversation({ cwd: command.cwd })
  if (created.isErr()) return created
  const saved = await creations.complete({ ...command, conversation: created.value })
  if (saved.isErr()) return saved
  catalog.add(created.value)
  return created
}

function conflict(message: string): ResultType<never, ConversationCreationConflictError> {
  return Result.err(new ConversationCreationConflictError({ message }))
}
