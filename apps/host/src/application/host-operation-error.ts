import type { ConversationCreationConflictError } from '@host/application/commands/create-conversation.command.ts'
import type { CodingAgentError } from '@host/application/ports/coding-agent.ts'
import type { ConversationCreationStoreError } from '@host/application/ports/conversation-creation-store.ts'
import type { StaleConversationCursorError } from '@host/domain/conversation/conversation-catalog.ts'

/** Every expected error returned by a Host application operation. */
export type HostOperationError =
  | CodingAgentError
  | ConversationCreationStoreError
  | ConversationCreationConflictError
  | StaleConversationCursorError
