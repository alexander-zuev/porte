import type { QueryHandler } from '@host/application/handlers/types.ts'
import type { QueryMap } from '@host/domain/messages/types.ts'
import type { WorkspaceChanges } from '@porte/core/client'

/** The working tree's changed files, read from git in the conversation's repository. */
export const listWorkspaceChanges: QueryHandler<
  QueryMap['ListWorkspaceChanges'],
  WorkspaceChanges
> = (query, deps) =>
  deps.workspaceChanges.list(deps.conversations.get(query.conversationId).gitRoot)
