import type { QueryHandler } from '@host/application/handlers/types.ts'
import type { QueryMap } from '@host/domain/messages/types.ts'
import type { UncommittedChanges } from '@porte/core/client'

/** The uncommitted changes, read from git in the conversation's repository. */
export const listChanges: QueryHandler<QueryMap['ListChanges'], UncommittedChanges> = (
  query,
  deps,
) => deps.workingTree.changes(deps.conversations.get(query.conversationId).gitRoot)
