import type { QueryHandler } from '@host/application/handlers/types.ts'
import type { QueryMap } from '@host/domain/messages/types.ts'
import type { ChangePatch } from '@porte/core/client'

/** One changed file's diff, read from git in the conversation's repository. */
export const getWorkspaceChange: QueryHandler<QueryMap['GetWorkspaceChange'], ChangePatch> = (
  query,
  deps,
) => deps.workspaceChanges.get(deps.conversations.get(query.conversationId).gitRoot, query.path)
