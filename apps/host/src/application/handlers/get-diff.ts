import type { QueryHandler } from '@host/application/handlers/types.ts'
import type { QueryMap } from '@host/domain/messages/types.ts'
import type { FileDiff } from '@porte/core/client'

/** One changed file's diff, read from git in the conversation's repository. */
export const getDiff: QueryHandler<QueryMap['GetDiff'], FileDiff> = (query, deps) =>
  deps.workingTree.diff(deps.conversations.get(query.conversationId).gitRoot, query.path)
